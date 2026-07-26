// ==========================================================================
// Snake Entity & Particle FX System
// ==========================================================================

export class Snake {
  constructor(id, name, startX, startY, colorConfig = 'neon-cyan', isBot = false) {
    this.id = id;
    this.name = name;
    this.isBot = isBot;
    this.skin = colorConfig;
    this.isDead = false;
    
    // Position/Movement state
    // Start with 4 segments
    this.body = [
      { x: startX, y: startY },
      { x: startX - 1, y: startY },
      { x: startX - 2, y: startY },
      { x: startX - 3, y: startY }
    ];
    this.dir = { x: 1, y: 0 };
    this.nextDir = { x: 1, y: 0 };
    
    // Power-up states (in ticks or milliseconds)
    this.shieldTime = 0; // shield duration remaining
    this.speedTime = 0;  // speed boost duration remaining
    
    // Visual effects
    this.particles = [];
  }

  // Set next direction, ignoring direct 180-degree turns
  setDirection(newDir) {
    if (this.dir.x + newDir.x === 0 && this.dir.y + newDir.y === 0) return;
    this.nextDir = newDir;
  }

  update(gridWidth, gridHeight, shouldGrow, wrapBoundaries = false) {
    if (this.isDead) return;

    // Apply active direction
    this.dir = { ...this.nextDir };

    // Calculate new head position
    let nextX = this.body[0].x + this.dir.x;
    let nextY = this.body[0].y + this.dir.y;

    // Handle border wrapping vs hard wall boundaries
    if (wrapBoundaries) {
      nextX = (nextX + gridWidth) % gridWidth;
      nextY = (nextY + gridHeight) % gridHeight;
    }

    // Add new head segment
    this.body.unshift({ x: nextX, y: nextY });

    // Handle trailing particle generation
    if (Math.random() < 0.3) {
      const tail = this.body[this.body.length - 1];
      this.addParticle(tail.x, tail.y);
    }

    // Remove tail unless growing
    if (!shouldGrow) {
      this.body.pop();
    }

    // Tick down powerup timers
    if (this.shieldTime > 0) this.shieldTime--;
    if (this.speedTime > 0) this.speedTime--;

    // Update trail particles
    this.updateParticles();
  }

  // Particle trailing helper
  addParticle(gridX, gridY) {
    let color = '#00f2fe';
    if (this.skin === 'neon-magenta') color = '#f355da';
    if (this.skin === 'fire') color = '#ff3f00';
    if (this.skin === 'matrix') color = '#39ff14';
    if (this.skin === 'rainbow') color = `hsl(${Math.random() * 360}, 100%, 50%)`;

    this.particles.push({
      x: gridX,
      y: gridY,
      size: Math.random() * 4 + 2,
      alpha: 1,
      decay: Math.random() * 0.05 + 0.04,
      vx: (Math.random() - 0.5) * 0.05,
      vy: (Math.random() - 0.5) * 0.05
    });
  }

  updateParticles() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= p.decay;
      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  // Draw snake and its particles
  draw(ctx, cellSize) {
    if (this.isDead) return;

    const now = Date.now();

    // 1. Draw Tail Particles first (so they are layered behind the snake)
    this.particles.forEach(p => {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color || this.getSkinPrimaryColor(now);
      ctx.shadowBlur = 8;
      ctx.shadowColor = ctx.fillStyle;
      ctx.beginPath();
      ctx.arc(
        p.x * cellSize + cellSize / 2,
        p.y * cellSize + cellSize / 2,
        p.size,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.restore();
    });

    // 2. Draw Body Segments (tail to head-1)
    for (let i = this.body.length - 1; i > 0; i--) {
      const curr = this.body[i];
      const next = this.body[i - 1];
      
      ctx.save();
      
      // Calculate color for this specific segment (gradients & rainbow effects)
      ctx.fillStyle = this.getSegmentColor(i, this.body.length, now);
      
      // Add glowing neon shadow
      ctx.shadowBlur = 10;
      ctx.shadowColor = ctx.fillStyle;
      
      // Draw smooth connected segments (pill shape)
      const x1 = curr.x * cellSize + cellSize / 2;
      const y1 = curr.y * cellSize + cellSize / 2;
      const x2 = next.x * cellSize + cellSize / 2;
      const y2 = next.y * cellSize + cellSize / 2;
      
      ctx.beginPath();
      ctx.lineCap = 'round';
      ctx.lineWidth = cellSize * 0.82;
      ctx.strokeStyle = ctx.fillStyle;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.restore();
    }

    // 3. Draw Snake Head
    const head = this.body[0];
    const hX = head.x * cellSize + cellSize / 2;
    const hY = head.y * cellSize + cellSize / 2;
    const radius = cellSize * 0.52;

    ctx.save();
    ctx.fillStyle = this.getSkinPrimaryColor(now);
    ctx.shadowBlur = 15;
    ctx.shadowColor = ctx.fillStyle;

    // Base head circle
    ctx.beginPath();
    ctx.arc(hX, hY, radius, 0, Math.PI * 2);
    ctx.fill();

    // Draw active power-up visual indicators (e.g. shield shield ring)
    if (this.shieldTime > 0) {
      ctx.strokeStyle = '#00f2fe';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#00f2fe';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(hX, hY, radius * 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    
    if (this.speedTime > 0) {
      ctx.strokeStyle = '#f355da';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.shadowColor = '#f355da';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(hX, hY, radius * 1.35, now / 50, now / 50 + Math.PI * 2);
      ctx.stroke();
    }

    // Draw Eyes (based on heading direction)
    ctx.fillStyle = '#fff';
    ctx.shadowBlur = 0; // turn off shadow for eyes
    const eyeOffset = radius * 0.35;
    const eyeRadius = radius * 0.18;
    
    let leftEye = { x: 0, y: 0 };
    let rightEye = { x: 0, y: 0 };

    if (this.dir.x === 1) { // Moving Right
      leftEye = { x: hX + eyeOffset, y: hY - eyeOffset };
      rightEye = { x: hX + eyeOffset, y: hY + eyeOffset };
    } else if (this.dir.x === -1) { // Moving Left
      leftEye = { x: hX - eyeOffset, y: hY + eyeOffset };
      rightEye = { x: hX - eyeOffset, y: hY - eyeOffset };
    } else if (this.dir.y === 1) { // Moving Down
      leftEye = { x: hX + eyeOffset, y: hY + eyeOffset };
      rightEye = { x: hX - eyeOffset, y: hY + eyeOffset };
    } else if (this.dir.y === -1) { // Moving Up
      leftEye = { x: hX - eyeOffset, y: hY - eyeOffset };
      rightEye = { x: hX + eyeOffset, y: hY - eyeOffset };
    }

    ctx.beginPath();
    ctx.arc(leftEye.x, leftEye.y, eyeRadius, 0, Math.PI * 2);
    ctx.arc(rightEye.x, rightEye.y, eyeRadius, 0, Math.PI * 2);
    ctx.fill();

    // Small pupils looking forward
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(leftEye.x + this.dir.x * 0.5, leftEye.y + this.dir.y * 0.5, eyeRadius * 0.5, 0, Math.PI * 2);
    ctx.arc(rightEye.x + this.dir.x * 0.5, rightEye.y + this.dir.y * 0.5, eyeRadius * 0.5, 0, Math.PI * 2);
    ctx.fill();

    // 4. Render Pilot Name Plate (for multiplayer bots / local opponent, or just user identifier)
    ctx.restore();
    ctx.save();
    ctx.font = 'bold 10px Outfit, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 3;
    ctx.fillText(this.name, hX, hY - radius * 1.8);
    ctx.restore();
  }

  // Retrieve base color of skin
  getSkinPrimaryColor(now = Date.now()) {
    switch (this.skin) {
      case 'neon-magenta': return '#f355da';
      case 'fire': return '#ff3f00';
      case 'matrix': return '#39ff14';
      case 'rainbow': return `hsl(${(now / 15) % 360}, 100%, 55%)`;
      case 'neon-cyan':
      default: return '#00f2fe';
    }
  }

  // Retrieve specific color for a body segment
  getSegmentColor(index, totalSegments, now) {
    const ratio = index / totalSegments;
    
    switch (this.skin) {
      case 'neon-cyan':
        // Cyan-to-blue gradient
        return `hsl(${180 + ratio * 40}, 100%, ${50 - ratio * 15}%)`;
      case 'neon-magenta':
        // Magenta-to-purple gradient
        return `hsl(${310 + ratio * 45}, 100%, ${50 - ratio * 15}%)`;
      case 'fire':
        // Red to yellow flame gradient
        return `rgb(255, ${Math.floor(63 + (150 * (1 - ratio)))}, 0)`;
      case 'matrix':
        // Matrix fading green
        return `rgba(57, 255, 20, ${0.9 - ratio * 0.7})`;
      case 'rainbow':
        // Scrolling rainbow pattern
        return `hsl(${((now / 15) + (index * 12)) % 360}, 100%, 50%)`;
      default:
        return '#00f2fe';
    }
  }
}
