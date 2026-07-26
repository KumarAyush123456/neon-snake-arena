# ==========================================================================
# Terraform Infrastructure as Code for Scalable AWS Deployment
# ==========================================================================

terraform {
  required_version = ">= 1.2.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# --- VARIABLES ---
variable "aws_region" {
  type        = string
  default     = "ap-south-1"
  description = "Target AWS region for resources"
}

variable "app_name" {
  type        = string
  default     = "neon-snake"
  description = "Application prefix for naming resource keys"
}

# --- NETWORKING (VPC) ---
data "aws_availability_zones" "available" {}

resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags = {
    Name = "${var.app_name}-vpc"
  }
}

# Public Subnets (For Load Balancer & NAT Gateway)
resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.${count.index}.0/24"
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true
  tags = {
    Name = "${var.app_name}-public-subnet-${count.index}"
  }
}

# Private Subnets (For Fargate Containers)
resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.${count.index + 10}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]
  tags = {
    Name = "${var.app_name}-private-subnet-${count.index}"
  }
}

resource "aws_internet_gateway" "gw" {
  vpc_id = aws_vpc.main.id
  tags = {
    Name = "${var.app_name}-igw"
  }
}

# Elastic IP for NAT
resource "aws_eip" "nat" {
  domain     = "vpc"
  depends_on = [aws_internet_gateway.gw]
}

# NAT Gateway to allow Fargate services to pull public Docker images safely
resource "aws_nat_gateway" "nat" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id
  tags = {
    Name = "${var.app_name}-nat-gateway"
  }
}

# Route Tables
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.gw.id
  }
  tags = {
    Name = "${var.app_name}-public-rt"
  }
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.nat.id
  }
  tags = {
    Name = "${var.app_name}-private-rt"
  }
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private" {
  count          = 2
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# --- STATIC SITE FRONTEND (S3 & CloudFront) ---

# S3 Bucket for Static Web Assets
resource "aws_s3_bucket" "frontend" {
  bucket        = "${var.app_name}-frontend-assets-${random_string.suffix.result}"
  force_destroy = true
}

resource "random_string" "suffix" {
  length  = 6
  special = false
  upper   = false
}

# S3 Static Website Configuration
resource "aws_s3_bucket_website_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "index.html"
  }
}

# CloudFront Origin Access Control for S3
resource "aws_cloudfront_origin_access_control" "oac" {
  name                              = "${var.app_name}-oac"
  description                       = "CloudFront Access Control to lock S3 public access"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# S3 Bucket Policy to allow access only from CloudFront
resource "aws_s3_bucket_policy" "allow_cloudfront" {
  bucket = aws_s3_bucket.frontend.id
  policy = data.aws_iam_policy_document.s3_policy.json
}

data "aws_iam_policy_document" "s3_policy" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.frontend.arn}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.cdn.arn]
    }
  }
}

# --- BACKEND COMPUTE (ECS Fargate & ALB) ---

# Application Load Balancer
resource "aws_lb" "alb" {
  name               = "${var.app_name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id
}

resource "aws_security_group" "alb" {
  name        = "${var.app_name}-alb-sg"
  description = "Allow public traffic to ALB"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# ALB Target Group pointing to ECS Container Ports
resource "aws_lb_target_group" "tg" {
  name        = "${var.app_name}-tg"
  port        = 3001
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  # Sticky sessions are crucial for WebSocket handshake routing
  stickiness {
    type            = "lb_cookie"
    cookie_duration = 86400
    enabled         = true
  }

  health_check {
    path                = "/health"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 3
    unhealthy_threshold = 3
  }
}

# ALB Port 80 Listener
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.alb.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.tg.arn
  }
}

# ECS Cluster
resource "aws_ecs_cluster" "main" {
  name = "${var.app_name}-cluster"
}

# ECS Task Definition
resource "aws_ecs_task_definition" "app" {
  family                   = "${var.app_name}-task"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([{
    name      = "${var.app_name}-server"
    image     = "${aws_ecr_repository.repo.repository_url}:latest"
    essential = true
    portMappings = [{
      containerPort = 3001
      hostPort      = 3001
    }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.ecs_logs.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "ecs"
      }
    }
  }])
}

# ECR Docker Registry Repository
resource "aws_ecr_repository" "repo" {
  name                 = "${var.app_name}-repo"
  image_tag_mutability = "MUTABLE"
  force_destroy        = true
}

resource "aws_cloudwatch_log_group" "ecs_logs" {
  name              = "/ecs/${var.app_name}-logs"
  retention_in_days = 7
}

# Security Group for ECS Fargate Container tasks (allows ingress only from ALB)
resource "aws_security_group" "ecs_tasks" {
  name   = "${var.app_name}-tasks-sg"
  vpc_id = aws_vpc.main.id

  ingress {
    from_port       = 3001
    to_port         = 3001
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# ECS Fargate Service Coordinator
resource "aws_ecs_service" "main" {
  name            = "${var.app_name}-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = 2
  launch_type     = "FARGATE"

  network_configuration {
    security_groups  = [aws_security_group.ecs_tasks.id]
    subnets          = aws_subnet.private[*].id
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.tg.arn
    container_name   = "${var.app_name}-server"
    container_port   = 3001
  }

  depends_on = [aws_lb_listener.http]
}

# --- AUTO SCALING FOR COMPUTING CONTAINERS ---
resource "aws_appautoscaling_target" "target" {
  max_capacity       = 10
  min_capacity       = 2
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.main.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "cpu" {
  name               = "${var.app_name}-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.target.resource_id
  scalable_dimension = aws_appautoscaling_target.target.scalable_dimension
  service_namespace  = aws_appautoscaling_target.target.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value = 70.0
  }
}

# --- CLOUDFRONT DISTRIBUTION INTEGRATION ---
# Maps static assets (S3) and dynamic sockets (ALB) under a single DNS endpoint
resource "aws_cloudfront_distribution" "cdn" {
  enabled             = true
  default_root_object = "index.html"

  # Origin 1: Static S3 site
  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "S3-StaticSite"
    origin_access_control_id = aws_cloudfront_origin_access_control.oac.id
  }

  # Origin 2: ALB WebSocket Backend
  origin {
    domain_name = aws_lb.alb.dns_name
    origin_id   = "ALB-WebSockets"

    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "http-only" # port 80 listener used on ALB
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_read_timeout      = 60 # Long timeout for WebSockets
      origin_keepalive_timeout = 60
    }
  }

  # S3 static hosting as default fallback behavior
  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-StaticSite"
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
    min_ttl     = 0
    default_ttl = 3600
    max_ttl     = 86400
  }

  # Route socket connections (`/socket.io/*` and `/health`) to ALB
  ordered_cache_behavior {
    path_pattern     = "/socket.io/*"
    allowed_methods  = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "ALB-WebSockets"

    # Turn off CloudFront caching for real-time WebSocket traffic
    default_ttl = 0
    max_ttl     = 0
    min_ttl     = 0

    forwarded_values {
      query_string = true
      headers      = ["*"] # Forward all headers (critical for WebSocket upgrade handshakes)
      cookies {
        forward = "all"
      }
    }

    viewer_protocol_policy = "allow-all"
  }

  ordered_cache_behavior {
    path_pattern     = "/health"
    allowed_methods  = ["GET", "HEAD"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "ALB-WebSockets"
    default_ttl      = 0
    max_ttl          = 0
    min_ttl          = 0
    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
    viewer_protocol_policy = "allow-all"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = {
    Environment = "production"
  }
}

# --- IAM ROLES & POLICIES ---

# Execution Role (for pulling images, starting Fargate tasks)
resource "aws_iam_role" "ecs_execution_role" {
  name = "${var.app_name}-ecs-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Task Role (for running containers inside the task)
resource "aws_iam_role" "ecs_task_role" {
  name = "${var.app_name}-ecs-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

# --- OUTPUTS ---
output "cloudfront_domain" {
  value       = aws_cloudfront_distribution.cdn.domain_name
  description = "The globally distributed CDN address of the Neon Snake Arena platform."
}

output "load_balancer_dns" {
  value       = aws_lb.alb.dns_name
  description = "Direct ingress address of the Application Load Balancer."
}
