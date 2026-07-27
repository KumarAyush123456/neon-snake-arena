// ==========================================================================
// Neon Militia - 2D Platformer Shooter Engine (Virtual coordinate scale: 800x500)
// ==========================================================================

import { audioSystem } from './audio.js';
import { store } from './store.js';
import { networkManager } from './network.js';

export class GameEngine {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');

    // Virtual resolution (physics matches this grid)
    this.virtualWidth = 800;
    this.virtualHeight = 500;
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;

    // Platform definitions
    this.platforms = [
      { x: 0, y: 460, w: 800, h: 40, isFloor: true }, // main floor
      { x: 80, y: 340, w: 200, h: 12 },
      { x: 520, y: 340, w: 200, h: 12 },
      { x: 280, y: 220, w: 240, h: 12 },
      { x: 50, y: 150, w: 140, h: 10 },
      { x: 610, y: 150, w: 140, h: 10 }
    ];

    // Core game state variables
    this.mode = 'classic'; // classic (practice), ai-battle, local-vs, online-arena
    this.localPlayer = null;
    this.remotePlayers = []; // other players / bots
    this.bullets = [];
    this.powerups = [];
    this.particles = [];
    this.popups = [];

    this.kills = 0;
    this.coinsGained = 0;
    this.isPaused = false;
    this.isGameOver = false;
    this.isRunning = false;
    
    // Physics configs
    this.gravity = 0.25;
    this.friction = 0.85;

    // Shooting controls state
    this.keys = {};
    this.mouse = { x: 0, y: 0 };
    this.isMouseDown = false;

    // Weapon profiles
    this.weapons = {
      rifle: { name: 'Assault Rifle', damage: 15, fireRate: 150, speed: 12, ammoMax: 30, spread: 0.05, count: 1 },
      shotgun: { name: 'Shotgun', damage: 12, fireRate: 700, speed: 10, ammoMax: 6, spread: 0.2, count: 4 },
      sniper: { name: 'Laser Sniper', damage: 65, fireRate: 1200, speed: 20, ammoMax: 3, spread: 0.0, count: 1 }
    };

    // Simulated bot names
    this.botNames = [
      'Byte_Hunter', 'GridRunner', 'ApexSlayer', 'Glitch_Master',
      'PixelMamba', 'CypherNode', 'Zero_Cool', 'RivalPilot',
      'NullPointer', 'LaserStrike', 'ShadowSnake', 'VaporGlider'
    ];

    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
    this.setupInputListeners();
  }

  resizeCanvas() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    
    this.scale = Math.min(this.canvas.width / this.virtualWidth, this.canvas.height / this.virtualHeight);
    this.offsetX = (this.canvas.width - (this.virtualWidth * this.scale)) / 2;
    this.offsetY = (this.canvas.height - (this.virtualHeight * this.scale)) / 2;
  }

  // Input event triggers
  setupInputListeners() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.key.toLowerCase()] = true;
      if (e.key === 'p' || e.key === 'Escape') {
        this.togglePause();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.key.toLowerCase()] = false;
    });

    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const canvasX = e.clientX - rect.left;
      const canvasY = e.clientY - rect.top;
      
      // Convert screen cursor to logical coordinates
      this.mouse.x = (canvasX - this.offsetX) / this.scale;
      this.mouse.y = (canvasY - this.offsetY) / this.scale;
    });

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.isMouseDown = true;
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.isMouseDown = false;
    });
  }

  setup(mode) {
    this.mode = mode;
    this.bullets = [];
    this.powerups = [];
    this.particles = [];
    this.popups = [];
    this.remotePlayers = [];

    this.kills = 0;
    this.coinsGained = 0;
    this.isPaused = false;
    this.isGameOver = false;

    // Reset controls
    this.keys = {};
    this.isMouseDown = false;

    const playerSkin = store.state.selectedSkin;
    const name = store.state.username || 'Pilot';

    // 1. Setup local player avatar
    this.localPlayer = {
      id: 'local-player',
      name: name,
      skin: playerSkin,
      x: 150,
      y: 300,
      vx: 0,
      vy: 0,
      w: 20,
      h: 32,
      health: 100,
      maxHealth: 100,
      fuel: 100,
      maxFuel: 100,
      isGrounded: false,
      isFacingRight: true,
      aimAngle: 0,
      currentWeapon: 'rifle',
      ammo: 30,
      lastFireTime: 0,
      score: 0,
      survivalTime: 0,
      totalShots: 0,
      hits: 0
    };

    // 2. Setup mode entities
    if (this.mode === 'classic' || this.mode === 'ai-battle') {
      // Single-player practice with bots
      this.spawnBots(3);
    } 
    else if (this.mode === 'local-vs') {
      // Local 1v1 same keyboard duel
      this.localPlayer.x = 150;
      this.localPlayer.name = 'P1 (WASD)';
      
      const p2 = {
        id: 'player-2',
        name: 'P2 (Arrows)',
        skin: 'neon-magenta',
        x: 650,
        y: 300,
        vx: 0,
        vy: 0,
        w: 20,
        h: 32,
        health: 100,
        maxHealth: 100,
        fuel: 100,
        maxFuel: 100,
        isGrounded: false,
        isFacingRight: false,
        aimAngle: Math.PI,
        currentWeapon: 'rifle',
        ammo: 30,
        lastFireTime: 0,
        score: 0
      };
      this.remotePlayers.push(p2);
    }
    
    // Spawn initial item powerups
    this.spawnPowerup('weapon', 250, 180);
    this.spawnPowerup('health', 550, 300);

    this.resizeCanvas();
    this.updateHUD();
  }

  spawnBots(count) {
    for (let i = 0; i < count; i++) {
      const id = 'bot-' + Math.random().toString(36).substr(2, 9);
      const botName = this.botNames[Math.floor(Math.random() * this.botNames.length)];
      const botSkins = ['neon-magenta', 'rainbow', 'matrix', 'fire'];
      const skin = botSkins[i % botSkins.length];
      
      // Random coordinates on platforms
      const platform = this.platforms[Math.floor(Math.random() * (this.platforms.length - 1)) + 1];
      const bot = {
        id,
        name: botName,
        skin: skin,
        isBot: true,
        x: platform.x + Math.random() * (platform.w - 20),
        y: platform.y - 35,
        vx: 0,
        vy: 0,
        w: 20,
        h: 32,
        health: 100,
        maxHealth: 100,
        fuel: 100,
        maxFuel: 100,
        isGrounded: false,
        isFacingRight: true,
        aimAngle: 0,
        currentWeapon: i % 2 === 0 ? 'rifle' : 'shotgun',
        ammo: 30,
        lastFireTime: 0,
        aiTimer: 0,
        aiState: 'patrol' // patrol, chase, hover
      };
      this.remotePlayers.push(bot);
    }
  }

  spawnPowerup(type, x, y) {
    this.powerups.push({
      type, // 'health' or 'weapon'
      x,
      y,
      w: 16,
      h: 16,
      pulse: 0
    });
  }

  // Updates from remote network server ticks
  updateNetworkState(state, socketId) {
    if (this.isGameOver || this.mode !== 'online-arena') return;

    // Map network player array to client render players
    const serverPlayers = state.players || {};
    const remoteList = [];

    Object.keys(serverPlayers).forEach(id => {
      const p = serverPlayers[id];
      if (id === socketId) {
        // Sync local stats
        this.localPlayer.health = p.health;
        this.localPlayer.fuel = p.fuel;
        this.localPlayer.ammo = p.ammo;
        this.localPlayer.currentWeapon = p.currentWeapon;
        this.localPlayer.x = p.x;
        this.localPlayer.y = p.y;
        this.localPlayer.isFacingRight = p.isFacingRight;
        
        this.kills = p.kills;
        this.coinsGained = p.coinsGained || 0;
        this.localPlayer.score = p.score;
      } else {
        // Build remote active list
        remoteList.push({
          id,
          name: p.name,
          skin: p.skin,
          x: p.x,
          y: p.y,
          w: p.w || 20,
          h: p.h || 32,
          health: p.health,
          maxHealth: 100,
          fuel: p.fuel,
          isFacingRight: p.isFacingRight,
          aimAngle: p.aimAngle || 0,
          currentWeapon: p.currentWeapon || 'rifle',
          isFlying: p.isFlying
        });
      }
    });

    this.remotePlayers = remoteList;

    // Sync remote spawned active bullets
    if (state.bullets) {
      this.bullets = state.bullets.map(b => ({
        x: b.x,
        y: b.y,
        vx: b.vx,
        vy: b.vy,
        ownerId: b.ownerId,
        color: b.color || '#00f2fe'
      }));
    }

    // Sync powerups
    if (state.powerups) {
      this.powerups = state.powerups;
    }

    this.updateHUD();
  }

  start() {
    this.isRunning = true;
    this.loop();
  }

  stop() {
    this.isRunning = false;
  }

  togglePause() {
    if (this.isGameOver || this.mode === 'online-arena') return;
    this.isPaused = !this.isPaused;
    
    const pauseMenu = document.getElementById('pauseOverlay');
    if (this.isPaused) {
      pauseMenu.classList.remove('hidden');
    } else {
      pauseMenu.classList.add('hidden');
    }
  }

  triggerGameOver(title, message) {
    this.isGameOver = true;
    
    // Save coins and statistics locally in store
    if (this.coinsGained > 0) {
      store.addCoins(this.coinsGained);
    }
    
    store.addMatchResult(this.localPlayer.score, this.kills, Math.floor(this.localPlayer.survivalTime));

    // Update overlay HUD
    document.getElementById('gameOverOverlay').classList.remove('hidden');
    document.getElementById('gameOverTitle').innerText = title || 'Neutralized';
    document.getElementById('gameOverMessage').innerText = message || 'Neutralized in action.';
    
    document.getElementById('summaryKills').innerText = this.kills;
    document.getElementById('summaryCoins').innerText = `+${this.coinsGained}`;
    
    const acc = this.localPlayer.totalShots > 0 
      ? Math.round((this.localPlayer.hits / this.localPlayer.totalShots) * 100) 
      : 100;
    document.getElementById('summaryAccuracy').innerText = `${acc}%`;
    document.getElementById('summaryTime').innerText = `${Math.floor(this.localPlayer.survivalTime)}s`;
  }

  updateHUD() {
    document.getElementById('hudPlayerName').innerText = this.localPlayer.name;
    document.getElementById('hudScore').innerText = this.kills;
    
    // Update bars
    document.getElementById('hudHealthBar').style.width = `${Math.max(0, this.localPlayer.health)}%`;
    document.getElementById('hudFuelBar').style.width = `${Math.max(0, this.localPlayer.fuel)}%`;
    
    // Update weapon label
    const wp = this.weapons[this.localPlayer.currentWeapon];
    document.getElementById('hudWeaponAmmo').innerText = `${wp.name}: ${this.localPlayer.ammo} / ${wp.ammoMax}`;
  }

  loop() {
    if (!this.isRunning) return;

    this.update();
    this.draw();

    requestAnimationFrame(() => this.loop());
  }

  update() {
    if (this.isPaused || this.isGameOver) return;

    if (this.mode !== 'online-arena') {
      // Standard Offline/Local engine updates
      this.updatePhysics();
    } else {
      // Multiplayer Online updates (networking emissions)
      this.updateOnlineControls();
    }
  }

  updatePhysics() {
    // 1. Increment survival timer
    this.localPlayer.survivalTime += 1 / 60;

    // 2. Update local player inputs & kinematics
    this.updatePlayerMovement(this.localPlayer, 'w', 'a', 'd', 's');

    // 3. Aim local player weapon
    const dx = this.mouse.x - (this.localPlayer.x + this.localPlayer.w / 2);
    const dy = this.mouse.y - (this.localPlayer.y + this.localPlayer.h / 2);
    this.localPlayer.aimAngle = Math.atan2(dy, dx);
    this.localPlayer.isFacingRight = dx >= 0;

    // 4. Update Weapon shoot trigger
    if (this.isMouseDown) {
      this.fireWeapon(this.localPlayer);
    }

    // 5. Update local P2 controls if in local VS mode
    const p2 = this.remotePlayers.find(p => p.id === 'player-2');
    if (p2) {
      this.updatePlayerMovement(p2, 'arrowup', 'arrowleft', 'arrowright', 'arrowdown');
      
      // Auto aim based on movement or default key commands
      p2.isFacingRight = p2.vx >= 0 ? (p2.vx > 0.1 ? true : p2.isFacingRight) : false;
      p2.aimAngle = p2.isFacingRight ? 0 : Math.PI;

      // P2 shoot using Keypad0 or Right Shift
      if (this.keys['0'] || this.keys['rightshift'] || this.keys['/']) {
        this.fireWeapon(p2);
      }
    }

    // 6. Update AI bots
    this.updateBotsAI();

    // 7. Update active bullets list
    this.updateBullets();

    // 8. Update floating popup effects and particles
    this.updateEffects();

    // 9. Update health & jetpack fuel HUD
    this.updateHUD();
  }

  updatePlayerMovement(player, upKey, leftKey, rightKey, downKey) {
    // Horizontal speeds
    if (this.keys[leftKey]) {
      player.vx = -4.2;
      player.isFacingRight = false;
    } else if (this.keys[rightKey]) {
      player.vx = 4.2;
      player.isFacingRight = true;
    } else {
      player.vx *= this.friction; // friction deceleration
    }

    // Jetpack fly controls
    player.isFlying = false;
    if (this.keys[upKey]) {
      if (player.fuel > 0) {
        player.vy -= 0.65; // countering gravity acceleration
        player.fuel = Math.max(0, player.fuel - 0.7);
        player.isFlying = true;
        
        // Spawn thruster sparks
        if (Math.random() < 0.3) {
          this.createJetpackParticle(player.x + (player.isFacingRight ? 2 : 18), player.y + 26);
        }
      }
    } else {
      // Recharge fuel on ground
      if (player.isGrounded) {
        player.fuel = Math.min(player.maxFuel, player.fuel + 0.8);
      }
    }

    // Kinematics calculations
    player.vy += this.gravity;
    player.x += player.vx;
    player.y += player.vy;

    // Platform collisions
    player.isGrounded = false;
    this.platforms.forEach(p => {
      // Check falling boundaries
      if (player.x + player.w >= p.x && player.x <= p.x + p.w) {
        const playerBottom = player.y + player.h;
        const prevPlayerBottom = playerBottom - player.vy;
        
        if (prevPlayerBottom <= p.y + 2 && playerBottom >= p.y && player.vy > 0) {
          player.y = p.y - player.h;
          player.vy = 0;
          player.isGrounded = true;
        }
      }
    });

    // Screen bounds limits
    if (player.x < 0) player.x = 0;
    if (player.x + player.w > this.virtualWidth) player.x = this.virtualWidth - player.w;
    if (player.y < 0) player.y = 0;
    if (player.y + player.h > this.virtualHeight) {
      player.y = this.virtualHeight - player.h;
      player.vy = 0;
      player.isGrounded = true;
    }
  }

  updateBotsAI() {
    this.remotePlayers.forEach(bot => {
      if (!bot.isBot) return;

      bot.aiTimer += 1;
      
      const target = this.localPlayer;
      const dx = target.x - bot.x;
      const dy = target.y - bot.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Rotate gun to local player
      bot.aimAngle = Math.atan2(dy, dx);
      bot.isFacingRight = dx >= 0;

      // Simple AI state machine
      if (bot.aiTimer > 90) {
        bot.aiTimer = 0;
        bot.aiState = dist > 320 ? 'chase' : (dist < 150 ? 'flee' : 'hover');
      }

      // Execute state
      if (bot.aiState === 'chase') {
        bot.vx = dx > 0 ? 2.5 : -2.5;
        if (dy < -20 && bot.fuel > 20) {
          bot.vy -= 0.55;
          bot.fuel -= 0.6;
        }
      } else if (bot.aiState === 'flee') {
        bot.vx = dx > 0 ? -2.5 : 2.5;
        if (bot.fuel > 10) {
          bot.vy -= 0.5;
          bot.fuel -= 0.5;
        }
      } else {
        bot.vx *= 0.9;
        // Hover at target y level
        if (dy < -10 && bot.fuel > 10) {
          bot.vy -= 0.6;
          bot.fuel -= 0.5;
        }
      }

      // Physics loop
      bot.vy += this.gravity;
      bot.x += bot.vx;
      bot.y += bot.vy;

      // Platform check
      bot.isGrounded = false;
      this.platforms.forEach(p => {
        if (bot.x + bot.w >= p.x && bot.x <= p.x + p.w) {
          if (bot.y + bot.h >= p.y && bot.y + bot.h - bot.vy <= p.y + 2 && bot.vy > 0) {
            bot.y = p.y - bot.h;
            bot.vy = 0;
            bot.isGrounded = true;
          }
        }
      });

      // Refuel
      if (bot.isGrounded) {
        bot.fuel = Math.min(bot.maxFuel, bot.fuel + 0.8);
      }

      // Shoot AI weapon
      if (dist < 350 && Math.random() < 0.05) {
        this.fireWeapon(bot);
      }
    });
  }

  fireWeapon(player) {
    const wp = this.weapons[player.currentWeapon];
    const now = performance.now();
    
    if (now - player.lastFireTime < wp.fireRate) return;
    if (player.ammo <= 0) {
      // Auto trigger reload sound/cooldown
      player.ammo = wp.ammoMax;
      player.lastFireTime = now + 1000; // 1s reload delay
      audioSystem.playExplosion(); // reload click sound proxy
      return;
    }

    player.ammo--;
    player.lastFireTime = now;
    
    // Play laser/firing sound
    audioSystem.playEat(); 

    if (player.id === 'local-player') {
      player.totalShots++;
    }

    // Spawn bullet projectiles
    const startX = player.x + player.w / 2 + Math.cos(player.aimAngle) * 16;
    const startY = player.y + player.h / 2 - 4 + Math.sin(player.aimAngle) * 16;

    for (let i = 0; i < wp.count; i++) {
      // Apply slight angle spreads
      const spreadAngle = player.aimAngle + (Math.random() * wp.spread - wp.spread / 2);
      
      this.bullets.push({
        ownerId: player.id,
        x: startX,
        y: startY,
        vx: Math.cos(spreadAngle) * wp.speed,
        vy: Math.sin(spreadAngle) * wp.speed,
        damage: wp.damage,
        color: player.id === 'local-player' ? '#00f2fe' : '#ff0055'
      });
    }
  }

  updateBullets() {
    const remainingBullets = [];

    this.bullets.forEach(b => {
      // Step bullet coordinates
      b.x += b.vx;
      b.y += b.vy;

      let hit = false;

      // 1. Boundary check
      if (b.x < 0 || b.x > this.virtualWidth || b.y < 0 || b.y > this.virtualHeight) {
        hit = true;
      }

      // 2. Platforms collision
      this.platforms.forEach(p => {
        if (!hit && b.x >= p.x && b.x <= p.x + p.w && b.y >= p.y && b.y <= p.y + p.h) {
          hit = true;
          this.createSparkExplosion(b.x, b.y, '#ffffff');
        }
      });

      // 3. Player hits check
      if (!hit) {
        if (b.ownerId !== 'local-player') {
          // Check collision on local player
          if (b.x >= this.localPlayer.x && b.x <= this.localPlayer.x + this.localPlayer.w &&
              b.y >= this.localPlayer.y && b.y <= this.localPlayer.y + this.localPlayer.h) {
            hit = true;
            this.damagePlayer(this.localPlayer, b.damage);
            this.createSparkExplosion(b.x, b.y, '#ff0055');
          }
        }

        // Check collision on remote players
        this.remotePlayers.forEach(p => {
          if (!hit && b.ownerId !== p.id) {
            if (b.x >= p.x && b.x <= p.x + p.w && b.y >= p.y && b.y <= p.y + p.h) {
              hit = true;
              this.damagePlayer(p, b.damage);
              this.createSparkExplosion(b.x, b.y, '#00f2fe');
              
              if (b.ownerId === 'local-player') {
                this.localPlayer.hits++;
              }
            }
          }
        });
      }

      if (!hit) {
        remainingBullets.push(b);
      }
    });

    this.bullets = remainingBullets;
  }

  damagePlayer(player, amount) {
    if (player.isDead) return;

    player.health = Math.max(0, player.health - amount);
    
    // Spawn floating damage text popup
    this.popups.push({
      text: `-${amount}`,
      x: player.x + player.w / 2,
      y: player.y - 10,
      vy: -0.8,
      alpha: 1,
      color: player.id === 'local-player' ? '#ff3366' : '#33ccff'
    });

    audioSystem.playPowerup(); // damage warning sound

    if (player.health <= 0) {
      player.isDead = true;
      
      // Explosion on death
      this.createDeathExplosion(player.x + player.w / 2, player.y + player.h / 2, player.skin);
      
      if (player.id === 'local-player') {
        this.triggerGameOver('Mission Failed', 'You were neutralized in action.');
      } else {
        // Local P1 killed this target
        this.kills++;
        this.localPlayer.score += 100;
        this.coinsGained += 15;
        
        // Remove from remote players
        this.remotePlayers = this.remotePlayers.filter(p => p.id !== player.id);
        
        // Spawn a replacement bot in single player
        if (this.mode === 'classic' || this.mode === 'ai-battle') {
          setTimeout(() => this.spawnBots(1), 3000);
        }
      }
    }
  }

  updateEffects() {
    // Ticks particles
    this.particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= p.decay || 0.02;
    });
    this.particles = this.particles.filter(p => p.alpha > 0);

    // Ticks popups
    this.popups.forEach(p => {
      p.y += p.vy;
      p.alpha -= 0.02;
    });
    this.popups = this.popups.filter(p => p.alpha > 0);
  }

  // Update inputs & emit events for Online Multiplayer
  updateOnlineControls() {
    this.localPlayer.survivalTime += 1 / 60;

    // Send control steering ticks & aim angles to AWS server
    const keysState = {
      left: this.keys['a'] || this.keys['arrowleft'] || false,
      right: this.keys['d'] || this.keys['arrowright'] || false,
      up: this.keys['w'] || this.keys['arrowup'] || this.keys[' '] || false
    };

    // Calculate aim angle
    const dx = this.mouse.x - (this.localPlayer.x + this.localPlayer.w / 2);
    const dy = this.mouse.y - (this.localPlayer.y + this.localPlayer.h / 2);
    const aimAngle = Math.atan2(dy, dx);

    // Emit controls ticks to backend Socket
    if (networkManager.socket) {
      networkManager.socket.emit('playerInputs', {
        keys: keysState,
        aimAngle,
        shoot: this.isMouseDown
      });
    }

    // Client-side predict updates (only simple frame movement)
    this.updatePlayerMovement(this.localPlayer, 'w', 'a', 'd', 's');
    
    // Ticks animations
    this.updateEffects();
  }

  // Effect generators
  createSparkExplosion(x, y, color) {
    for (let i = 0; i < 6; i++) {
      this.particles.push({
        x,
        y,
        vx: Math.random() * 4 - 2,
        vy: Math.random() * 4 - 2,
        alpha: 1,
        decay: 0.04,
        size: Math.random() * 3 + 1,
        color
      });
    }
  }

  createDeathExplosion(x, y, skin) {
    const skinColors = {
      'neon-cyan': '#00f2fe',
      'neon-magenta': '#ff0055',
      'rainbow': '#00ff66',
      'matrix': '#00ff00',
      'fire': '#ff7700'
    };
    const color = skinColors[skin] || '#ffffff';
    audioSystem.playExplosion();

    for (let i = 0; i < 20; i++) {
      this.particles.push({
        x,
        y,
        vx: Math.random() * 8 - 4,
        vy: Math.random() * 8 - 4,
        alpha: 1,
        decay: 0.02,
        size: Math.random() * 5 + 2,
        color
      });
    }
  }

  createJetpackParticle(x, y) {
    this.particles.push({
      x,
      y,
      vx: Math.random() * 1 - 0.5,
      vy: Math.random() * 2 + 1, // shoot downwards
      alpha: 1,
      decay: 0.07,
      size: Math.random() * 4 + 1,
      color: '#ff5500'
    });
  }

  // Draw cycles
  draw() {
    if (!this.canvas.width || !this.canvas.height) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Save context and translate offset/scales for logical resolution
    this.ctx.save();
    this.ctx.translate(this.offsetX, this.offsetY);
    this.ctx.scale(this.scale, this.scale);
    
    // Mask logical play sector
    this.ctx.beginPath();
    this.ctx.rect(0, 0, this.virtualWidth, this.virtualHeight);
    this.ctx.clip();

    // 1. Draw grid background
    this.ctx.fillStyle = '#0d0e15';
    this.ctx.fillRect(0, 0, this.virtualWidth, this.virtualHeight);
    
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
    this.ctx.lineWidth = 1;
    const size = 40;
    for (let x = 0; x < this.virtualWidth; x += size) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.virtualHeight);
      this.ctx.stroke();
    }
    for (let y = 0; y < this.virtualHeight; y += size) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.virtualWidth, y);
      this.ctx.stroke();
    }

    // 2. Draw platforms
    this.ctx.shadowBlur = 12;
    this.platforms.forEach(p => {
      this.ctx.fillStyle = p.isFloor ? '#1a1d29' : 'rgba(0, 242, 254, 0.15)';
      this.ctx.strokeStyle = p.isFloor ? '#333b52' : '#00f2fe';
      this.ctx.shadowColor = p.isFloor ? 'transparent' : '#00f2fe';
      this.ctx.lineWidth = p.isFloor ? 3 : 2;

      this.ctx.fillRect(p.x, p.y, p.w, p.h);
      this.ctx.strokeRect(p.x, p.y, p.w, p.h);
    });
    this.ctx.shadowBlur = 0; // disable shadow

    // 3. Draw powerups
    this.powerups.forEach(pow => {
      pow.pulse += 0.1;
      const sizeOffset = Math.sin(pow.pulse) * 2;
      this.ctx.fillStyle = pow.type === 'health' ? '#00ff66' : '#ff7700';
      this.ctx.shadowColor = this.ctx.fillStyle;
      this.ctx.shadowBlur = 10;
      this.ctx.fillRect(pow.x - sizeOffset/2, pow.y - sizeOffset/2, pow.w + sizeOffset, pow.h + sizeOffset);
    });
    this.ctx.shadowBlur = 0;

    // 4. Draw laser sight lines (local player)
    if (!this.localPlayer.isDead) {
      this.ctx.strokeStyle = 'rgba(0, 242, 254, 0.1)';
      this.ctx.setLineDash([5, 5]);
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(this.localPlayer.x + this.localPlayer.w / 2, this.localPlayer.y + this.localPlayer.h / 2 - 4);
      this.ctx.lineTo(
        this.localPlayer.x + this.localPlayer.w / 2 + Math.cos(this.localPlayer.aimAngle) * 500,
        this.localPlayer.y + this.localPlayer.h / 2 - 4 + Math.sin(this.localPlayer.aimAngle) * 500
      );
      this.ctx.stroke();
      this.ctx.setLineDash([]); // clear dash
    }

    // 5. Draw bullets
    this.bullets.forEach(b => {
      this.ctx.strokeStyle = b.color;
      this.ctx.shadowColor = b.color;
      this.ctx.shadowBlur = 8;
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();
      this.ctx.moveTo(b.x, b.y);
      this.ctx.lineTo(b.x - b.vx * 0.8, b.y - b.vy * 0.8);
      this.ctx.stroke();
    });
    this.ctx.shadowBlur = 0;

    // 6. Draw players
    this.drawPlayer(this.localPlayer);
    this.remotePlayers.forEach(p => this.drawPlayer(p));

    // 7. Draw particles
    this.particles.forEach(p => {
      this.ctx.fillStyle = p.color;
      this.ctx.globalAlpha = p.alpha;
      this.ctx.fillRect(p.x, p.y, p.size, p.size);
    });
    this.ctx.globalAlpha = 1;

    // 8. Draw popups
    this.popups.forEach(p => {
      this.ctx.fillStyle = p.color;
      this.ctx.globalAlpha = p.alpha;
      this.ctx.font = 'bold 12px var(--font-mono)';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(p.text, p.x, p.y);
    });
    this.ctx.globalAlpha = 1;

    this.ctx.restore();

    // Scale canvas elements
    this.drawBoundaries();
  }

  drawPlayer(p) {
    if (p.isDead) return;

    this.ctx.save();
    
    // Color palettes mapping
    const skins = {
      'neon-cyan': '#00f2fe',
      'neon-magenta': '#ff0055',
      'rainbow': '#00ff66',
      'matrix': '#00ff00',
      'fire': '#ff7700'
    };
    const accent = skins[p.skin] || '#00f2fe';

    // 1. Draw Player Avatar (Neon Soldier)
    this.ctx.fillStyle = '#1e2130';
    this.ctx.strokeStyle = accent;
    this.ctx.lineWidth = 2;
    this.ctx.shadowColor = accent;
    this.ctx.shadowBlur = 6;
    
    // Draw body box
    this.ctx.fillRect(p.x, p.y + 10, p.w, p.h - 10);
    this.ctx.strokeRect(p.x, p.y + 10, p.w, p.h - 10);

    // Draw helmet head
    this.ctx.beginPath();
    this.ctx.arc(p.x + p.w / 2, p.y + 8, 6, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.stroke();

    // Visor glow
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(p.x + p.w / 2 + (p.isFacingRight ? 1 : -5), p.y + 6, 4, 3);

    // Draw Jetpack thruster on the back
    this.ctx.fillStyle = '#2d334a';
    this.ctx.fillRect(p.x + (p.isFacingRight ? -6 : p.w), p.y + 12, 6, 14);

    // Active jetpack flame polygon
    if (p.isFlying) {
      this.ctx.fillStyle = '#ff7700';
      this.ctx.beginPath();
      this.ctx.moveTo(p.x + (p.isFacingRight ? -6 : p.w), p.y + 26);
      this.ctx.lineTo(p.x + (p.isFacingRight ? -3 : p.w + 3), p.y + 36 + Math.random() * 4);
      this.ctx.lineTo(p.x + (p.isFacingRight ? 0 : p.w + 6), p.y + 26);
      this.ctx.fill();
    }

    // 2. Draw rotating gun arm
    this.ctx.shadowBlur = 0;
    this.ctx.save();
    this.ctx.translate(p.x + p.w / 2, p.y + p.h / 2 - 4);
    this.ctx.rotate(p.aimAngle);
    
    // Metallic gun cylinder
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, -3, 14, 6);
    this.ctx.fillStyle = accent;
    this.ctx.fillRect(4, -2, 6, 4);
    this.ctx.restore();

    // 3. Draw Player HUD Text (HP, Name)
    this.ctx.font = 'bold 9px var(--font-primary)';
    this.ctx.fillStyle = '#ffffff';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(p.name, p.x + p.w / 2, p.y - 12);

    // HP Segment bar
    const hpBarW = 24;
    const hpBarH = 3;
    const hpX = p.x + p.w / 2 - hpBarW / 2;
    const hpY = p.y - 8;
    this.ctx.fillStyle = '#333b52';
    this.ctx.fillRect(hpX, hpY, hpBarW, hpBarH);
    this.ctx.fillStyle = p.health > 40 ? '#00ff66' : '#ff0055';
    this.ctx.fillRect(hpX, hpY, hpBarW * (p.health / 100), hpBarH);

    this.ctx.restore();
  }

  // Draw physical border outline constraints
  drawBoundaries() {
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    this.ctx.lineWidth = 4;
    this.ctx.strokeRect(this.offsetX, this.offsetY, this.virtualWidth * this.scale, this.virtualHeight * this.scale);
  }
}
