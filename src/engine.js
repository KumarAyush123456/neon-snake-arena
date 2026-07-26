// ==========================================================================
// Main HTML5 Canvas Game Engine
// ==========================================================================

import { Snake } from './snake.js';
import { BotController } from './bots.js';
import { audioSystem } from './audio.js';
import { store } from './store.js';

export class GameEngine {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    
    // Grid settings
    this.gridWidth = 40;
    this.gridHeight = 22;
    this.cellSize = 0; // Calculated on resize
    
    // Core game state
    this.mode = 'classic'; // classic, ai-battle, local-vs, online-arena
    this.snakes = [];
    this.food = [];
    this.particles = []; // explosion fx particles
    this.popups = []; // Floating text scores fx
    
    this.score = 0;
    this.coinsGained = 0;
    this.kills = 0;
    this.isPaused = false;
    this.isGameOver = false;
    this.isRunning = false;
    
    // Clock/Tick management
    this.lastTickTime = 0;
    this.tickInterval = 130; // base tick duration in ms
    this.gameTime = 0; // elapsed run duration in seconds
    this.secondAccumulator = 0;
    this.tickCount = 0;

    // Visual polish
    this.shakeIntensity = 0;
    this.shakeDecay = 0.9;
    
    // List of simulated names for bot spawns
    this.botNames = [
      'Byte_Hunter', 'GridRunner', 'ApexSlayer', 'Glitch_Master',
      'PixelMamba', 'CypherNode', 'Zero_Cool', 'RivalPilot',
      'NullPointer', 'LaserStrike', 'ShadowSnake', 'VaporGlider'
    ];
    
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  resizeCanvas() {
    // Keep aspect ratio 16:9 inside wrapper
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    
    // Cell size fits grid dimensions
    this.cellSize = Math.min(this.canvas.width / this.gridWidth, this.canvas.height / this.gridHeight);
    
    // Center the rendering context grid inside the canvas if there's spare space
    this.offsetX = (this.canvas.width - (this.gridWidth * this.cellSize)) / 2;
    this.offsetY = (this.canvas.height - (this.gridHeight * this.cellSize)) / 2;
  }

  setup(mode) {
    this.mode = mode;
    this.snakes = [];
    this.food = [];
    this.particles = [];
    this.popups = [];
    
    this.score = 0;
    this.coinsGained = 0;
    this.kills = 0;
    this.isPaused = false;
    this.isGameOver = false;
    this.gameTime = 0;
    this.secondAccumulator = 0;
    this.tickCount = 0;
    this.tickInterval = 130; // reset base speed

    // Setup entities based on mode
    const playerSkin = store.state.selectedSkin;
    
    if (mode === 'classic') {
      // 1. Single Player Classic
      this.snakes.push(new Snake('player', 'You', 10, 11, playerSkin, false));
      this.spawnFood('normal', 3);
      this.spawnFood('golden', 1);
    } 
    else if (mode === 'ai-battle') {
      // 2. 1v1 Battle vs AI
      this.snakes.push(new Snake('player', 'You', 8, 5, playerSkin, false));
      const bot = new Snake('bot-1', 'AI_Viper', 30, 16, 'neon-magenta', true);
      bot.setDirection({ x: -1, y: 0 });
      this.snakes.push(bot);
      
      this.spawnFood('normal', 4);
      this.spawnFood('golden', 1);
      this.spawnFood('speed', 1);
      this.spawnFood('shield', 1);
    } 
    else if (mode === 'local-vs') {
      // 3. Local 2-Player (WASD vs Arrows)
      this.snakes.push(new Snake('player1', 'P1 (WASD)', 10, 5, playerSkin, false));
      const p2 = new Snake('player2', 'P2 (Arrows)', 30, 16, 'neon-magenta', false);
      p2.setDirection({ x: -1, y: 0 });
      this.snakes.push(p2);
      
      this.spawnFood('normal', 4);
      this.spawnFood('golden', 1);
    } 
    else if (mode === 'online-arena') {
      // In real network multiplayer, entities are managed and synced by the server.
      // We start with an empty map and wait for the server ticks to populate.
      this.snakes = [];
      this.food = [];
    }

    this.resizeCanvas();
  }

  updateNetworkState(state, socketId) {
    if (this.isPaused || this.isGameOver) return;

    // 1. Sync remote snakes list
    this.snakes = state.snakes.map(s => {
      const snake = new Snake(s.id, s.name, 0, 0, s.skin, s.isBot);
      snake.body = s.body;
      snake.dir = s.dir;
      snake.shieldTime = s.shieldTime;
      snake.speedTime = s.speedTime;
      snake.isDead = s.isDead;
      return snake;
    });

    // 2. Sync food list
    this.food = state.food;

    // 3. Locate player snake inside packet to sync HUD
    const playerSnake = state.snakes.find(s => s.id === socketId);
    if (playerSnake) {
      this.score = playerSnake.score;
      this.kills = playerSnake.kills;
      this.coinsGained = playerSnake.coinsGained || 0;
      this.updateHUD();
    }
  }

  spawnBot() {
    const id = 'bot-' + Math.random().toString(36).substr(2, 9);
    const name = this.botNames[Math.floor(Math.random() * this.botNames.length)];
    
    // Choose random point far from center / other elements
    let x, y, attempts = 0;
    do {
      x = Math.floor(Math.random() * (this.gridWidth - 6)) + 3;
      y = Math.floor(Math.random() * (this.gridHeight - 6)) + 3;
      attempts++;
    } while (this.checkGridOccupied(x, y) && attempts < 20);

    const skins = ['neon-magenta', 'fire', 'matrix', 'rainbow'];
    const skin = skins[Math.floor(Math.random() * skins.length)];
    
    const bot = new Snake(id, name, x, y, skin, true);
    
    // Random direction
    const dirs = [{x:1,y:0}, {x:-1,y:0}, {x:0,y:1}, {x:0,y:-1}];
    bot.setDirection(dirs[Math.floor(Math.random() * dirs.length)]);
    this.snakes.push(bot);
  }

  start() {
    this.isRunning = true;
    this.lastTickTime = performance.now();
    this.loop();
    audioSystem.resume();
  }

  stop() {
    this.isRunning = false;
  }

  togglePause() {
    if (this.isGameOver) return;
    this.isPaused = !this.isPaused;
    if (!this.isPaused) {
      this.lastTickTime = performance.now();
    }
  }

  loop(currentTime = performance.now()) {
    if (!this.isRunning) return;

    requestAnimationFrame((time) => this.loop(time));

    if (this.isPaused || this.isGameOver) {
      this.render();
      return;
    }

    const elapsed = currentTime - this.lastTickTime;
    
    // Draw on every frame for fluid animations (particles, etc.)
    this.render();

    // Game logic steps run at fixed tick speed
    if (elapsed >= this.tickInterval) {
      this.tick();
      this.lastTickTime = currentTime - (elapsed % this.tickInterval);
      
      // Keep track of elapsed play time
      this.secondAccumulator += this.tickInterval;
      if (this.secondAccumulator >= 1000) {
        this.gameTime += 1;
        this.secondAccumulator -= 1000;
      }
    }
  }

  tick() {
    if (this.mode === 'online-arena') {
      // In online mode, physics updates are handled by the server.
      // We only update the floating popups and particles locally.
      this.updatePopups();
      return;
    }
    this.tickCount++;
    const wrapBoundaries = (this.mode === 'online-arena');

    // 1. Bot AI Calculations
    this.snakes.forEach(snake => {
      if (snake.isBot && !snake.isDead) {
        // Run AI decisions on every tick or alternate ticks to simulate reaction lag
        if (this.tickCount % 2 === 0 || this.mode === 'online-arena') {
          const aiDir = BotController.getNextDirection(
            snake,
            this.snakes,
            this.food,
            this.gridWidth,
            this.gridHeight,
            wrapBoundaries
          );
          snake.setDirection(aiDir);
        }
      }
    });

    // 2. Update Snake Positions
    this.snakes.forEach(snake => {
      if (snake.isDead) return;

      // Differential speeds:
      // If speedboost is active, move snake on every tick.
      // If normal speed, move snake on every tick except in Classic mode (in Classic, everyone moves at progressive base rate).
      // For online arena, let's say normal snakes move every tick, speed-boosted snakes update twice (handled below).
      let moveCount = 1;
      if (snake.speedTime > 0) {
        moveCount = 2; // move twice as fast!
      }

      for (let m = 0; m < moveCount; m++) {
        // Check if head eats food at prospective step
        const head = snake.body[0];
        const nextX = (head.x + snake.nextDir.x + this.gridWidth) % this.gridWidth;
        const nextY = (head.y + snake.nextDir.y + this.gridHeight) % this.gridHeight;
        
        let eatingIndex = -1;
        if (wrapBoundaries) {
          eatingIndex = this.food.findIndex(f => f.x === nextX && f.y === nextY);
        } else {
          // If hard wall, check bounds before looking up food coordinate
          const rawX = head.x + snake.nextDir.x;
          const rawY = head.y + snake.nextDir.y;
          eatingIndex = this.food.findIndex(f => f.x === rawX && f.y === rawY);
        }

        const shouldGrow = (eatingIndex !== -1);
        
        // Move segments
        snake.update(this.gridWidth, this.gridHeight, shouldGrow, wrapBoundaries);

        // Process food consumption effects
        if (shouldGrow) {
          const eatenFood = this.food[eatingIndex];
          this.food.splice(eatingIndex, 1);
          
          this.handleEatFood(snake, eatenFood);
          
          // Re-spawn new food item to keep counts consistent
          this.spawnFood(eatenFood.type, 1);
        }
      }
    });

    // 3. Collision Checks & Resolutions
    this.checkCollisions();

    // 4. Update floating visuals & FX
    this.updatePopups();
    
    // 5. Spawn new bots dynamically in online mode if below threshold
    if (this.mode === 'online-arena') {
      const activeBots = this.snakes.filter(s => s.isBot && !s.isDead);
      if (activeBots.length < 5 && Math.random() < 0.15) {
        this.spawnBot();
      }
    }
  }

  handleEatFood(snake, food) {
    let scoreGained = 10;
    let coinsGained = 1;

    // Apply specific power-up flags
    if (food.type === 'golden') {
      scoreGained = 30;
      coinsGained = 3;
      audioSystem.playEat();
    } else if (food.type === 'speed') {
      snake.speedTime = 60; // speed ticks
      scoreGained = 5;
      audioSystem.playPowerup();
    } else if (food.type === 'shield') {
      snake.shieldTime = 90; // shield ticks
      scoreGained = 5;
      audioSystem.playPowerup();
    } else {
      audioSystem.playEat();
    }

    // Apply multipliers depending on mode
    if (this.mode === 'ai-battle') {
      coinsGained *= 2;
    } else if (this.mode === 'online-arena') {
      coinsGained *= 3;
    }

    // Apply score and coin wallets for human player
    if (snake.id === 'player' || snake.id === 'player1') {
      this.score += scoreGained;
      this.coinsGained += coinsGained;
      this.createPopup(snake.body[0].x, snake.body[0].y, `+${scoreGained}`, '#00f2fe');
      
      // Update HUD interface immediately
      this.updateHUD();
      
      // Progressive difficulty in singleplayer
      if (this.mode === 'classic') {
        this.tickInterval = Math.max(70, 135 - Math.floor(this.score / 150) * 8);
      }
    } else if (snake.id === 'player2') {
      // Local VS Player 2 score tracking
      // We will show dual scores if needed, but local vs is primarily combat survival
      this.createPopup(snake.body[0].x, snake.body[0].y, `+${scoreGained}`, '#f355da');
    }
    
    // visual particle burst
    this.createExplosion(food.x, food.y, food.type === 'golden' ? '#ffb900' : '#39ff14', 8);
  }

  checkCollisions() {
    const wrapBoundaries = (this.mode === 'online-arena');
    
    for (let snake of this.snakes) {
      if (snake.isDead) continue;
      const head = snake.body[0];

      // 1. Boundary / Wall check
      if (!wrapBoundaries) {
        if (head.x < 0 || head.x >= this.gridWidth || head.y < 0 || head.y >= this.gridHeight) {
          this.handleSnakeDeath(snake, 'boundary');
          continue;
        }
      }

      // 2. Self Collision check
      for (let i = 1; i < snake.body.length; i++) {
        if (snake.body[i].x === head.x && snake.body[i].y === head.y) {
          if (snake.shieldTime > 0) continue; // Shield saves
          this.handleSnakeDeath(snake, 'self');
          break;
        }
      }
      
      if (snake.isDead) continue;

      // 3. Other Snakes Body Collision check (combat mechanics!)
      for (let other of this.snakes) {
        if (other.isDead || other.id === snake.id) continue;

        for (let segment of other.body) {
          if (segment.x === head.x && segment.y === head.y) {
            // Collision occurred!
            if (snake.shieldTime > 0) {
              // Shield bouncing: push head back or skip death, but segment remains blocked
              continue; 
            }
            
            this.handleSnakeDeath(snake, 'combat', other);
            break;
          }
        }
        if (snake.isDead) break;
      }
    }
  }

  handleSnakeDeath(snake, cause, killer = null) {
    snake.isDead = true;
    
    // visual camera shake on player death
    if (snake.id === 'player' || snake.id === 'player1' || snake.id === 'player2') {
      this.shakeIntensity = 10;
      audioSystem.playDie();
    } else {
      audioSystem.playKill();
    }

    // Explode snake body segments into glowing food particles
    snake.body.forEach(seg => {
      this.createExplosion(seg.x, seg.y, snake.getSkinPrimaryColor(), 4);
      
      // In online mode, segments turn into edible food drops
      if (this.mode === 'online-arena' && Math.random() < 0.4) {
        this.food.push({
          x: seg.x,
          y: seg.y,
          type: 'normal',
          value: 10
        });
      }
    });

    // Notify/Score rewards if someone killed this snake
    if (killer && (killer.id === 'player' || killer.id === 'player1')) {
      this.kills += 1;
      this.coinsGained += 25; // Large combat bounty!
      this.score += 150;
      this.createPopup(killer.body[0].x, killer.body[0].y, 'BOUNTY +150', '#ffb900');
      this.updateHUD();
      
      // Dispatch alert event for lobby feed
      const killEvent = new CustomEvent('arena_kill', {
        detail: { killer: killer.name, victim: snake.name }
      });
      window.dispatchEvent(killEvent);
    }

    // Check game over triggers
    if (this.mode === 'classic' && snake.id === 'player') {
      this.triggerGameOver('System Failure', 'Matrix grid crashed. Wall or self collision detected.');
    } 
    else if (this.mode === 'ai-battle') {
      if (snake.id === 'player') {
        this.triggerGameOver('Defeated', 'You crashed into Cyber Viper.');
      } else if (snake.id === 'bot-1') {
        this.triggerGameOver('Victory', 'You successfully deactivated the rogue program! Bounty acquired.', true);
      }
    } 
    else if (this.mode === 'local-vs') {
      if (snake.id === 'player1') {
        this.triggerGameOver('P2 Wins', 'Player 1 was neutralized.', true);
      } else if (snake.id === 'player2') {
        this.triggerGameOver('P1 Wins', 'Player 2 was neutralized.', true);
      }
    } 
    else if (this.mode === 'online-arena' && snake.id === 'player') {
      this.triggerGameOver('Neutralized', `Ranked: #${this.getLeaderboardRank()} in the Nexus Arena.`);
    }
  }

  getLeaderboardRank() {
    // Sort all alive snakes by body length
    const sorted = [...this.snakes]
      .filter(s => !s.isDead)
      .sort((a, b) => b.body.length - a.body.length);
    
    const rank = sorted.findIndex(s => s.id === 'player') + 1;
    return rank > 0 ? rank : 'Dead';
  }

  triggerGameOver(title, message, isVictory = false) {
    this.isGameOver = true;
    
    // Add coins to wallet
    store.addCoins(this.coinsGained);
    
    // Record stats
    const pLength = this.snakes.find(s => s.id === 'player' || s.id === 'player1')?.body.length || 0;
    store.recordMatch(this.score, pLength, this.kills, this.gameTime);

    // Show HTML overlays
    const goOverlay = document.getElementById('gameOverOverlay');
    document.getElementById('gameOverTitle').innerText = title;
    document.getElementById('gameOverTitle').className = isVictory ? 'text-glow-green' : 'text-glow-red';
    document.getElementById('gameOverMessage').innerText = message;
    
    document.getElementById('summaryScore').innerText = this.score;
    document.getElementById('summaryCoins').innerText = `+${this.coinsGained}`;
    document.getElementById('summaryLength').innerText = pLength;
    document.getElementById('summaryKills').innerText = this.kills;
    
    goOverlay.classList.remove('hidden');
    document.getElementById('canvasOverlay').classList.remove('hidden');
    document.getElementById('menuOverlay').classList.add('hidden');
  }

  // Spawning food items safely on unoccupied coordinates
  spawnFood(type, count) {
    for (let c = 0; c < count; c++) {
      let x, y, attempts = 0;
      do {
        x = Math.floor(Math.random() * this.gridWidth);
        y = Math.floor(Math.random() * this.gridHeight);
        attempts++;
      } while (this.checkGridOccupied(x, y) && attempts < 50);

      this.food.push({ x, y, type });
    }
  }

  checkGridOccupied(x, y) {
    // Check food items
    if (this.food.some(f => f.x === x && f.y === y)) return true;
    
    // Check active snakes
    for (let snake of this.snakes) {
      if (snake.isDead) continue;
      if (snake.body.some(seg => seg.x === x && seg.y === y)) return true;
    }
    
    return false;
  }

  // Visual Effects systems (Explosions and Floating Popups)
  createExplosion(gridX, gridY, color, count = 6) {
    const px = gridX * this.cellSize + this.cellSize / 2;
    const py = gridY * this.cellSize + this.cellSize / 2;
    
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 2.5 + 1.5;
      
      this.particles.push({
        x: px,
        y: py,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.random() * 3 + 1.5,
        color: color,
        alpha: 1,
        decay: Math.random() * 0.05 + 0.04
      });
    }
  }

  createPopup(gridX, gridY, text, color) {
    this.popups.push({
      x: gridX * this.cellSize + this.cellSize / 2,
      y: gridY * this.cellSize,
      text,
      color,
      alpha: 1,
      vy: -0.8 // float speed up
    });
  }

  updatePopups() {
    // Update float text popups
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const pop = this.popups[i];
      pop.y += pop.vy;
      pop.alpha -= 0.025;
      if (pop.alpha <= 0) {
        this.popups.splice(i, 1);
      }
    }

    // Update canvas screen particles
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

  updateHUD() {
    document.getElementById('hudScore').innerText = String(this.score).padStart(4, '0');
    document.getElementById('hudCoinsGained').innerText = `+${this.coinsGained}`;

    // Update powerups indicators
    const powerupsList = document.getElementById('hudPowerups');
    powerupsList.innerHTML = '';
    
    const player = this.snakes.find(s => s.id === 'player' || s.id === 'player1');
    if (player && (player.shieldTime > 0 || player.speedTime > 0)) {
      if (player.shieldTime > 0) {
        powerupsList.innerHTML += `<span class="powerup-icon-badge shield">SHIELD [${Math.ceil(player.shieldTime / 6)}]</span>`;
      }
      if (player.speedTime > 0) {
        powerupsList.innerHTML += `<span class="powerup-icon-badge speed">BOOST [${Math.ceil(player.speedTime / 6)}]</span>`;
      }
    } else {
      powerupsList.innerHTML = '<span class="no-powerups">None</span>';
    }
  }

  // Graphics Canvas Rendering
  render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Apply screen shake translate matrix if intensity is set
    this.ctx.save();
    if (this.shakeIntensity > 0.1) {
      const dx = (Math.random() - 0.5) * this.shakeIntensity;
      const dy = (Math.random() - 0.5) * this.shakeIntensity;
      this.ctx.translate(dx, dy);
      this.shakeIntensity *= this.shakeDecay;
    }

    // 1. Draw Grid Arena background
    this.drawGrid();

    // 2. Draw Food Items
    this.food.forEach(f => this.drawFoodItem(f));

    // 3. Draw Snakes
    this.snakes.forEach(s => s.draw(this.ctx, this.cellSize));

    // 4. Draw Particle Explosions
    this.particles.forEach(p => {
      this.ctx.save();
      this.ctx.globalAlpha = p.alpha;
      this.ctx.fillStyle = p.color;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    });

    // 5. Draw Float Score Popups
    this.ctx.font = 'bold 12px "JetBrains Mono", monospace';
    this.ctx.textAlign = 'center';
    this.popups.forEach(pop => {
      this.ctx.save();
      this.ctx.globalAlpha = pop.alpha;
      this.ctx.fillStyle = pop.color;
      this.ctx.fillText(pop.text, pop.x, pop.y);
      this.ctx.restore();
    });

    this.ctx.restore(); // restore translate screen shake matrix
  }

  drawGrid() {
    const width = this.gridWidth * this.cellSize;
    const height = this.gridHeight * this.cellSize;

    // Draw dark border boundary around map grid
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(0, 0, width, height);

    // Draw coordinate lines
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.015)';
    this.ctx.lineWidth = 1;
    
    // Vertical grid lines
    for (let x = 0; x <= this.gridWidth; x++) {
      this.ctx.beginPath();
      this.ctx.moveTo(x * this.cellSize, 0);
      this.ctx.lineTo(x * this.cellSize, height);
      this.ctx.stroke();
    }
    
    // Horizontal grid lines
    for (let y = 0; y <= this.gridHeight; y++) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y * this.cellSize);
      this.ctx.lineTo(width, y * this.cellSize);
      this.ctx.stroke();
    }
  }

  drawFoodItem(food) {
    const x = food.x * this.cellSize + this.cellSize / 2;
    const y = food.y * this.cellSize + this.cellSize / 2;
    const rad = this.cellSize * 0.38;

    this.ctx.save();
    
    if (food.type === 'normal') {
      // Lime green energy cells
      this.ctx.fillStyle = '#39ff14';
      this.ctx.shadowBlur = 10;
      this.ctx.shadowColor = '#39ff14';
      this.ctx.beginPath();
      this.ctx.arc(x, y, rad * 0.9, 0, Math.PI * 2);
      this.ctx.fill();
    } 
    else if (food.type === 'golden') {
      // Golden star cell
      this.ctx.fillStyle = '#ffb900';
      this.ctx.shadowBlur = 15;
      this.ctx.shadowColor = '#ffb900';
      
      // Draw diamond / star shape
      this.ctx.beginPath();
      this.ctx.moveTo(x, y - rad);
      this.ctx.lineTo(x + rad, y);
      this.ctx.lineTo(x, y + rad);
      this.ctx.lineTo(x - rad, y);
      this.ctx.closePath();
      this.ctx.fill();
    } 
    else if (food.type === 'speed') {
      // Speed pickup (Pink energy arrow)
      this.ctx.fillStyle = '#f355da';
      this.ctx.shadowBlur = 12;
      this.ctx.shadowColor = '#f355da';
      
      // Draw arrow / triangle pointing up
      this.ctx.beginPath();
      this.ctx.moveTo(x, y - rad);
      this.ctx.lineTo(x + rad, y + rad * 0.7);
      this.ctx.lineTo(x - rad, y + rad * 0.7);
      this.ctx.closePath();
      this.ctx.fill();
    } 
    else if (food.type === 'shield') {
      // Shield pickup (Cyan ring orb)
      this.ctx.strokeStyle = '#00f2fe';
      this.ctx.lineWidth = 3;
      this.ctx.shadowBlur = 12;
      this.ctx.shadowColor = '#00f2fe';
      
      this.ctx.beginPath();
      this.ctx.arc(x, y, rad * 0.9, 0, Math.PI * 2);
      this.ctx.stroke();
      
      this.ctx.fillStyle = 'rgba(0, 242, 254, 0.2)';
      this.ctx.beginPath();
      this.ctx.arc(x, y, rad * 0.5, 0, Math.PI * 2);
      this.ctx.fill();
    }

    this.ctx.restore();
  }
}
