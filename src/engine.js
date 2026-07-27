// ==========================================================================
// Mini Militia: Tactical War - 2D Platformer Engine (Virtual scale: 800x500)
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

    // Tactical Military Platform definitions
    this.platforms = [
      { x: 0, y: 450, w: 800, h: 50, isFloor: true }, // Main Ground
      { x: 70, y: 330, w: 210, h: 14 },
      { x: 520, y: 330, w: 210, h: 14 },
      { x: 270, y: 210, w: 260, h: 14 },
      { x: 40, y: 140, w: 150, h: 12 },
      { x: 610, y: 140, w: 150, h: 12 }
    ];

    // Core game state variables
    this.mode = 'classic'; // classic (practice), ai-battle, local-vs, online-arena
    this.localPlayer = null;
    this.remotePlayers = []; // other players / bots
    this.bullets = [];
    this.grenades = [];
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

    // Shooting & Grenade controls state
    this.keys = {};
    this.mouse = { x: 0, y: 0 };
    this.isMouseDown = false;

    // Weapon profiles
    this.weapons = {
      rifle: { name: 'AK-47', damage: 16, fireRate: 140, speed: 13, ammoMax: 30, spread: 0.06, count: 1 },
      shotgun: { name: 'Shotgun', damage: 14, fireRate: 650, speed: 11, ammoMax: 6, spread: 0.22, count: 5 },
      sniper: { name: 'Laser Sniper', damage: 70, fireRate: 1100, speed: 22, ammoMax: 3, spread: 0.0, count: 1 }
    };

    // Simulated bot names
    this.botNames = [
      'Sgt_Slayer', 'Apex_Commander', 'Glitch_Sniper',
      'Pixel_General', 'Cypher_Node', 'Zero_Cool', 'Rival_Pilot',
      'Vapor_Glider', 'Laser_Strike', 'Shadow_Commando'
    ];

    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
    this.setupInputListeners();
  }

  resizeCanvas() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const w = rect.width || window.innerWidth * 0.8 || 800;
    const h = rect.height || window.innerHeight * 0.7 || 500;

    this.canvas.width = w;
    this.canvas.height = h;

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
      if (e.key.toLowerCase() === 'g') {
        this.throwGrenade(this.localPlayer);
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
      if (e.button === 2) {
        this.throwGrenade(this.localPlayer);
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.isMouseDown = false;
    });

    // Prevent context menu on right click inside canvas
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  setup(mode) {
    this.mode = mode;
    this.bullets = [];
    this.grenades = [];
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
    const name = store.state.username || 'Sgt_Pilot';

    // 1. Setup local Doodle Soldier avatar
    this.localPlayer = {
      id: 'local-player',
      name: name,
      skin: playerSkin,
      x: 150,
      y: 300,
      vx: 0,
      vy: 0,
      w: 22,
      h: 34,
      health: 100,
      maxHealth: 100,
      fuel: 100,
      maxFuel: 100,
      isGrounded: false,
      isFacingRight: true,
      aimAngle: 0,
      currentWeapon: 'rifle',
      ammo: 30,
      grenades: 3,
      lastFireTime: 0,
      lastGrenadeTime: 0,
      muzzleFlashTimer: 0,
      score: 0,
      survivalTime: 0,
      totalShots: 0,
      hits: 0
    };

    // 2. Setup mode entities
    if (this.mode === 'classic' || this.mode === 'ai-battle') {
      this.spawnBots(3);
    } 
    else if (this.mode === 'local-vs') {
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
        w: 22,
        h: 34,
        health: 100,
        maxHealth: 100,
        fuel: 100,
        maxFuel: 100,
        grenades: 3,
        isGrounded: false,
        isFacingRight: false,
        aimAngle: Math.PI,
        currentWeapon: 'rifle',
        ammo: 30,
        lastFireTime: 0,
        lastGrenadeTime: 0,
        muzzleFlashTimer: 0,
        score: 0
      };
      this.remotePlayers.push(p2);
    }
    
    // Spawn initial supply crates
    this.spawnPowerup('weapon', 250, 175);
    this.spawnPowerup('health', 550, 295);

    this.resizeCanvas();
    this.updateHUD();
  }

  spawnBots(count) {
    for (let i = 0; i < count; i++) {
      const id = 'bot-' + Math.random().toString(36).substr(2, 9);
      const botName = this.botNames[Math.floor(Math.random() * this.botNames.length)];
      const botSkins = ['neon-magenta', 'rainbow', 'matrix', 'fire'];
      const skin = botSkins[i % botSkins.length];
      
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
        w: 22,
        h: 34,
        health: 100,
        maxHealth: 100,
        fuel: 100,
        maxFuel: 100,
        grenades: 2,
        isGrounded: false,
        isFacingRight: true,
        aimAngle: 0,
        currentWeapon: i % 2 === 0 ? 'rifle' : 'shotgun',
        ammo: 30,
        lastFireTime: 0,
        lastGrenadeTime: 0,
        muzzleFlashTimer: 0,
        aiTimer: 0,
        aiState: 'patrol'
      };
      this.remotePlayers.push(bot);
    }
  }

  spawnPowerup(type, x, y) {
    this.powerups.push({
      type, // 'health' or 'weapon'
      x,
      y,
      w: 20,
      h: 20,
      pulse: 0
    });
  }

  // Updates from remote network server ticks
  updateNetworkState(state, socketId) {
    if (this.isGameOver || this.mode !== 'online-arena') return;

    const serverPlayers = state.players || {};
    const remoteList = [];

    Object.keys(serverPlayers).forEach(id => {
      const p = serverPlayers[id];
      if (id === socketId) {
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
        remoteList.push({
          id,
          name: p.name,
          skin: p.skin,
          x: p.x,
          y: p.y,
          w: p.w || 22,
          h: p.h || 34,
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

    if (state.grenades) {
      this.grenades = state.grenades;
    }

    if (state.powerups) {
      this.powerups = state.powerups;
    }

    this.updateHUD();
  }

  start() {
    if (this.isRunning) return;
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
    
    if (this.coinsGained > 0) {
      store.addCoins(this.coinsGained);
    }
    
    store.addMatchResult(this.localPlayer ? this.localPlayer.score : 0, this.kills, Math.floor(this.localPlayer ? this.localPlayer.survivalTime : 0));

    document.getElementById('gameOverOverlay').classList.remove('hidden');
    document.getElementById('gameOverTitle').innerText = title || 'WASTED';
    document.getElementById('gameOverMessage').innerText = message || 'Neutralized in battle.';
    
    document.getElementById('summaryKills').innerText = this.kills;
    document.getElementById('summaryCoins').innerText = `+${this.coinsGained}`;
    
    const acc = (this.localPlayer && this.localPlayer.totalShots > 0)
      ? Math.round((this.localPlayer.hits / this.localPlayer.totalShots) * 100) 
      : 100;
    document.getElementById('summaryAccuracy').innerText = `${acc}%`;
    document.getElementById('summaryTime').innerText = `${Math.floor(this.localPlayer ? this.localPlayer.survivalTime : 0)}s`;
  }

  updateHUD() {
    if (!this.localPlayer) return;
    document.getElementById('hudPlayerName').innerText = this.localPlayer.name;
    document.getElementById('hudScore').innerText = this.kills;
    
    document.getElementById('hudHealthBar').style.width = `${Math.max(0, this.localPlayer.health)}%`;
    document.getElementById('hudFuelBar').style.width = `${Math.max(0, this.localPlayer.fuel)}%`;
    
    const wp = this.weapons[this.localPlayer.currentWeapon];
    if (wp) {
      document.getElementById('hudWeaponAmmo').innerText = `${wp.name}: ${this.localPlayer.ammo} / ${wp.ammoMax}`;
    }
    
    const grenEl = document.getElementById('hudGrenades');
    if (grenEl) {
      grenEl.innerText = `💣 x ${this.localPlayer.grenades}`;
    }
  }

  loop() {
    if (!this.isRunning) return;

    try {
      this.update();
      this.draw();
    } catch (e) {
      console.error("Game loop error:", e);
    }

    requestAnimationFrame(() => this.loop());
  }

  update() {
    if (this.isPaused || this.isGameOver) return;

    if (this.mode !== 'online-arena') {
      this.updatePhysics();
    } else {
      this.updateOnlineControls();
    }
  }

  updatePhysics() {
    this.localPlayer.survivalTime += 1 / 60;

    // 1. Update local player inputs & kinematics
    this.updatePlayerMovement(this.localPlayer, 'w', 'a', 'd', 's');

    // 2. Aim local player weapon towards cursor
    const dx = this.mouse.x - (this.localPlayer.x + this.localPlayer.w / 2);
    const dy = this.mouse.y - (this.localPlayer.y + this.localPlayer.h / 2);
    this.localPlayer.aimAngle = Math.atan2(dy, dx);
    this.localPlayer.isFacingRight = dx >= 0;

    // 3. Update Weapon shoot trigger
    if (this.isMouseDown) {
      this.fireWeapon(this.localPlayer);
    }

    // 4. Update local P2 controls if in local VS mode
    const p2 = this.remotePlayers.find(p => p.id === 'player-2');
    if (p2) {
      this.updatePlayerMovement(p2, 'arrowup', 'arrowleft', 'arrowright', 'arrowdown');
      p2.isFacingRight = p2.vx >= 0 ? (p2.vx > 0.1 ? true : p2.isFacingRight) : false;
      p2.aimAngle = p2.isFacingRight ? 0 : Math.PI;

      if (this.keys['0'] || this.keys['rightshift'] || this.keys['/']) {
        this.fireWeapon(p2);
      }
    }

    // 5. Update AI bots
    this.updateBotsAI();

    // 6. Update active bullets & grenades
    this.updateBullets();
    this.updateGrenades();

    // 7. Update particles and floating popups
    this.updateEffects();

    // 8. Update HUD
    this.updateHUD();
  }

  updatePlayerMovement(player, upKey, leftKey, rightKey, downKey) {
    if (this.keys[leftKey]) {
      player.vx = -4.2;
      player.isFacingRight = false;
    } else if (this.keys[rightKey]) {
      player.vx = 4.2;
      player.isFacingRight = true;
    } else {
      player.vx *= this.friction;
    }

    // Jetpack thruster flight
    player.isFlying = false;
    if (this.keys[upKey]) {
      if (player.fuel > 0) {
        player.vy -= 0.65;
        player.fuel = Math.max(0, player.fuel - 0.7);
        player.isFlying = true;
        
        // Jetpack particle smoke
        if (Math.random() < 0.4) {
          this.createJetpackParticle(player.x + (player.isFacingRight ? 2 : 18), player.y + 26);
        }
      }
    } else {
      if (player.isGrounded) {
        player.fuel = Math.min(player.maxFuel, player.fuel + 0.8);
      }
    }

    player.vy += this.gravity;
    player.x += player.vx;
    player.y += player.vy;

    // Platform collisions
    player.isGrounded = false;
    this.platforms.forEach(p => {
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

    if (player.x < 0) {
      player.x = 0;
      player.vx = 0;
    }
    if (player.x + player.w > this.virtualWidth) {
      player.x = this.virtualWidth - player.w;
      player.vx = 0;
    }
    if (player.y < 0) {
      player.y = 0;
      player.vy = Math.max(0, player.vy); // Stop upward momentum at ceiling
    }
    if (player.y + player.h > this.virtualHeight) {
      player.y = this.virtualHeight - player.h;
      player.vy = 0;
      player.isGrounded = true;
    }

    if (player.muzzleFlashTimer > 0) player.muzzleFlashTimer--;
  }

  updateBotsAI() {
    this.remotePlayers.forEach(bot => {
      if (!bot.isBot) return;

      bot.aiTimer += 1;
      
      const target = this.localPlayer;
      const dx = target.x - bot.x;
      const dy = target.y - bot.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      bot.aimAngle = Math.atan2(dy, dx);
      bot.isFacingRight = dx >= 0;

      if (bot.aiTimer > 80) {
        bot.aiTimer = 0;
        bot.aiState = dist > 300 ? 'chase' : (dist < 140 ? 'flee' : 'hover');
      }

      if (bot.aiState === 'chase') {
        bot.vx = dx > 0 ? 2.5 : -2.5;
        if (dy < -20 && bot.fuel > 20) {
          bot.vy -= 0.55;
          bot.fuel -= 0.6;
          bot.isFlying = true;
        }
      } else if (bot.aiState === 'flee') {
        bot.vx = dx > 0 ? -2.5 : 2.5;
        if (bot.fuel > 10) {
          bot.vy -= 0.5;
          bot.fuel -= 0.5;
          bot.isFlying = true;
        }
      } else {
        bot.vx *= 0.9;
        if (dy < -10 && bot.fuel > 10) {
          bot.vy -= 0.6;
          bot.fuel -= 0.5;
          bot.isFlying = true;
        }
      }

      bot.vy += this.gravity;
      bot.x += bot.vx;
      bot.y += bot.vy;

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

      if (bot.isGrounded) {
        bot.fuel = Math.min(bot.maxFuel, bot.fuel + 0.8);
      }

      // Bot shoot or grenade
      if (dist < 350 && Math.random() < 0.04) {
        this.fireWeapon(bot);
      }
      if (dist < 200 && Math.random() < 0.005) {
        this.throwGrenade(bot);
      }

      if (bot.muzzleFlashTimer > 0) bot.muzzleFlashTimer--;
    });
  }

  fireWeapon(player) {
    const wp = this.weapons[player.currentWeapon];
    const now = performance.now();
    
    if (now - player.lastFireTime < wp.fireRate) return;
    if (player.ammo <= 0) {
      player.ammo = wp.ammoMax;
      player.lastFireTime = now + 1000;
      audioSystem.playExplosion();
      return;
    }

    player.ammo--;
    player.lastFireTime = now;
    player.muzzleFlashTimer = 4; // 4 frames flash
    
    audioSystem.playEat(); 

    if (player.id === 'local-player') {
      player.totalShots++;
    }

    const startX = player.x + player.w / 2 + Math.cos(player.aimAngle) * 18;
    const startY = player.y + player.h / 2 - 4 + Math.sin(player.aimAngle) * 18;

    for (let i = 0; i < wp.count; i++) {
      const spreadAngle = player.aimAngle + (Math.random() * wp.spread - wp.spread / 2);
      
      this.bullets.push({
        ownerId: player.id,
        x: startX,
        y: startY,
        vx: Math.cos(spreadAngle) * wp.speed,
        vy: Math.sin(spreadAngle) * wp.speed,
        damage: wp.damage,
        color: player.id === 'local-player' ? '#84cc16' : '#ef4444'
      });
    }
  }

  throwGrenade(player) {
    if (!player || player.grenades <= 0) return;
    const now = performance.now();
    if (now - (player.lastGrenadeTime || 0) < 800) return;

    player.grenades--;
    player.lastGrenadeTime = now;

    const startX = player.x + player.w / 2;
    const startY = player.y + 10;

    const angle = player.aimAngle;
    const speed = 9;

    this.grenades.push({
      ownerId: player.id,
      x: startX,
      y: startY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2.5,
      fuse: 90, // ~1.5s fuse
      radius: 65,
      damage: 75
    });

    audioSystem.playPowerup();
    this.updateHUD();
  }

  updateBullets() {
    const remainingBullets = [];

    this.bullets.forEach(b => {
      b.x += b.vx;
      b.y += b.vy;

      let hit = false;

      if (b.x < 0 || b.x > this.virtualWidth || b.y < 0 || b.y > this.virtualHeight) {
        hit = true;
      }

      this.platforms.forEach(p => {
        if (!hit && b.x >= p.x && b.x <= p.x + p.w && b.y >= p.y && b.y <= p.y + p.h) {
          hit = true;
          this.createSparkExplosion(b.x, b.y, '#f59e0b');
        }
      });

      if (!hit) {
        if (b.ownerId !== 'local-player') {
          if (b.x >= this.localPlayer.x && b.x <= this.localPlayer.x + this.localPlayer.w &&
              b.y >= this.localPlayer.y && b.y <= this.localPlayer.y + this.localPlayer.h) {
            hit = true;
            this.damagePlayer(this.localPlayer, b.damage);
            this.createSparkExplosion(b.x, b.y, '#ef4444');
          }
        }

        this.remotePlayers.forEach(p => {
          if (!hit && b.ownerId !== p.id) {
            if (b.x >= p.x && b.x <= p.x + p.w && b.y >= p.y && b.y <= p.y + p.h) {
              hit = true;
              this.damagePlayer(p, b.damage);
              this.createSparkExplosion(b.x, b.y, '#84cc16');
              
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

  updateGrenades() {
    const activeGrenades = [];

    this.grenades.forEach(g => {
      g.vy += this.gravity;
      g.x += g.vx;
      g.y += g.vy;

      // Platform bounce
      this.platforms.forEach(p => {
        if (g.x >= p.x && g.x <= p.x + p.w && g.y >= p.y && g.y <= p.y + p.h) {
          g.vy = -g.vy * 0.6;
          g.vx *= 0.7;
          g.y = p.y - 4;
        }
      });

      g.fuse--;

      if (g.fuse <= 0) {
        // Trigger Grenade Explosion Blast!
        this.triggerGrenadeBlast(g);
      } else {
        activeGrenades.push(g);
      }
    });

    this.grenades = activeGrenades;
  }

  triggerGrenadeBlast(g) {
    audioSystem.playExplosion();

    // Create huge blast ring particles
    for (let i = 0; i < 30; i++) {
      const angle = (Math.PI * 2 / 30) * i;
      const spd = Math.random() * 6 + 2;
      this.particles.push({
        x: g.x,
        y: g.y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        alpha: 1,
        decay: 0.03,
        size: Math.random() * 6 + 2,
        color: i % 2 === 0 ? '#ef4444' : '#f59e0b'
      });
    }

    // Check damage radius to all players
    const allPlayers = [this.localPlayer, ...this.remotePlayers];
    allPlayers.forEach(p => {
      if (p.isDead) return;
      const dx = (p.x + p.w / 2) - g.x;
      const dy = (p.y + p.h / 2) - g.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= g.radius) {
        const dmg = Math.round(g.damage * (1 - dist / g.radius));
        this.damagePlayer(p, dmg);
      }
    });
  }

  damagePlayer(player, amount) {
    if (player.isDead) return;

    player.health = Math.max(0, player.health - amount);
    
    this.popups.push({
      text: `-${amount}`,
      x: player.x + player.w / 2,
      y: player.y - 10,
      vy: -0.8,
      alpha: 1,
      color: player.id === 'local-player' ? '#ef4444' : '#84cc16'
    });

    if (player.health <= 0) {
      player.isDead = true;
      this.createDeathExplosion(player.x + player.w / 2, player.y + player.h / 2, player.skin);
      
      if (player.id === 'local-player') {
        this.triggerGameOver('WASTED', 'Neutralized in battle.');
      } else {
        this.kills++;
        this.localPlayer.score += 150;
        this.coinsGained += 25;
        this.remotePlayers = this.remotePlayers.filter(p => p.id !== player.id);
        
        if (this.mode === 'classic' || this.mode === 'ai-battle') {
          setTimeout(() => this.spawnBots(1), 3000);
        }
      }
    }
  }

  updateEffects() {
    this.particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= p.decay || 0.02;
    });
    this.particles = this.particles.filter(p => p.alpha > 0);

    this.popups.forEach(p => {
      p.y += p.vy;
      p.alpha -= 0.02;
    });
    this.popups = this.popups.filter(p => p.alpha > 0);
  }

  updateOnlineControls() {
    this.localPlayer.survivalTime += 1 / 60;

    const keysState = {
      left: this.keys['a'] || this.keys['arrowleft'] || false,
      right: this.keys['d'] || this.keys['arrowright'] || false,
      up: this.keys['w'] || this.keys['arrowup'] || this.keys[' '] || false
    };

    const dx = this.mouse.x - (this.localPlayer.x + this.localPlayer.w / 2);
    const dy = this.mouse.y - (this.localPlayer.y + this.localPlayer.h / 2);
    const aimAngle = Math.atan2(dy, dx);

    if (networkManager.socket) {
      networkManager.socket.emit('playerInputs', {
        keys: keysState,
        aimAngle,
        shoot: this.isMouseDown
      });
    }

    this.updatePlayerMovement(this.localPlayer, 'w', 'a', 'd', 's');
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
    audioSystem.playExplosion();
    for (let i = 0; i < 25; i++) {
      this.particles.push({
        x,
        y,
        vx: Math.random() * 8 - 4,
        vy: Math.random() * 8 - 4,
        alpha: 1,
        decay: 0.02,
        size: Math.random() * 5 + 2,
        color: i % 2 === 0 ? '#ef4444' : '#84cc16'
      });
    }
  }

  createJetpackParticle(x, y) {
    this.particles.push({
      x,
      y,
      vx: Math.random() * 1 - 0.5,
      vy: Math.random() * 2 + 1,
      alpha: 1,
      decay: 0.06,
      size: Math.random() * 4 + 1,
      color: '#f97316'
    });
  }

  // Draw cycles
  draw() {
    if (!this.canvas.width || !this.canvas.height) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.save();
    this.ctx.translate(this.offsetX, this.offsetY);
    this.ctx.scale(this.scale, this.scale);
    
    this.ctx.beginPath();
    this.ctx.rect(0, 0, this.virtualWidth, this.virtualHeight);
    this.ctx.clip();

    // 1. Tactical Military Outpost Background
    this.ctx.fillStyle = '#111827'; // Dark tactical blue-gray
    this.ctx.fillRect(0, 0, this.virtualWidth, this.virtualHeight);
    
    // Background Military Grid
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    this.ctx.lineWidth = 1;
    for (let x = 0; x < this.virtualWidth; x += 40) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.virtualHeight);
      this.ctx.stroke();
    }
    for (let y = 0; y < this.virtualHeight; y += 40) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.virtualWidth, y);
      this.ctx.stroke();
    }

    // 2. Draw Platforms (Steel beams with yellow hazard stripes)
    this.platforms.forEach(p => {
      if (p.isFloor) {
        // Ground floor
        this.ctx.fillStyle = '#1f2937';
        this.ctx.fillRect(p.x, p.y, p.w, p.h);
        this.ctx.fillStyle = '#4d7c0f'; // Army green top border
        this.ctx.fillRect(p.x, p.y, p.w, 6);
      } else {
        // Elevated steel platforms with hazard stripes
        this.ctx.fillStyle = '#374151';
        this.ctx.fillRect(p.x, p.y, p.w, p.h);

        // Yellow hazard stripe top border
        this.ctx.fillStyle = '#eab308';
        this.ctx.fillRect(p.x, p.y, p.w, 4);

        // Rivets
        this.ctx.fillStyle = '#9ca3af';
        this.ctx.fillRect(p.x + 4, p.y + 7, 3, 3);
        this.ctx.fillRect(p.x + p.w - 7, p.y + 7, 3, 3);
      }
    });

    // 3. Draw Supply Crates (Health & Weapon crates)
    this.powerups.forEach(pow => {
      pow.pulse += 0.1;
      const sizeOffset = Math.sin(pow.pulse) * 2;
      
      this.ctx.save();
      this.ctx.translate(pow.x + pow.w / 2, pow.y + pow.h / 2);

      if (pow.type === 'health') {
        // Green Medical Crate with Red Cross
        this.ctx.fillStyle = '#166534';
        this.ctx.fillRect(-pow.w / 2 - sizeOffset/2, -pow.h / 2 - sizeOffset/2, pow.w + sizeOffset, pow.h + sizeOffset);
        this.ctx.fillStyle = '#ef4444';
        this.ctx.fillRect(-2, -6, 4, 12);
        this.ctx.fillRect(-6, -2, 12, 4);
      } else {
        // Wooden Ammo Crate
        this.ctx.fillStyle = '#854d0e';
        this.ctx.fillRect(-pow.w / 2 - sizeOffset/2, -pow.h / 2 - sizeOffset/2, pow.w + sizeOffset, pow.h + sizeOffset);
        this.ctx.fillStyle = '#eab308';
        this.ctx.font = 'bold 9px var(--font-mono)';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('AMMO', 0, 3);
      }

      this.ctx.restore();
    });

    // 4. Draw Laser Sight Line
    if (!this.localPlayer.isDead) {
      this.ctx.strokeStyle = 'rgba(132, 204, 22, 0.2)';
      this.ctx.setLineDash([4, 4]);
      this.ctx.lineWidth = 1.5;
      this.ctx.beginPath();
      this.ctx.moveTo(this.localPlayer.x + this.localPlayer.w / 2, this.localPlayer.y + 12);
      this.ctx.lineTo(
        this.localPlayer.x + this.localPlayer.w / 2 + Math.cos(this.localPlayer.aimAngle) * 500,
        this.localPlayer.y + 12 + Math.sin(this.localPlayer.aimAngle) * 500
      );
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    }

    // 5. Draw Bullets & Grenades
    this.bullets.forEach(b => {
      this.ctx.strokeStyle = b.color;
      this.ctx.shadowColor = b.color;
      this.ctx.shadowBlur = 6;
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();
      this.ctx.moveTo(b.x, b.y);
      this.ctx.lineTo(b.x - b.vx * 0.7, b.y - b.vy * 0.7);
      this.ctx.stroke();
    });
    this.ctx.shadowBlur = 0;

    // Draw Grenades
    this.grenades.forEach(g => {
      this.ctx.fillStyle = '#15803d';
      this.ctx.beginPath();
      this.ctx.arc(g.x, g.y, 4, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.fillStyle = '#eab308';
      this.ctx.fillRect(g.x - 1, g.y - 6, 2, 3);
    });

    // 6. Draw Soldiers
    this.drawPlayer(this.localPlayer);
    this.remotePlayers.forEach(p => this.drawPlayer(p));

    // 7. Draw Particles
    this.particles.forEach(p => {
      this.ctx.fillStyle = p.color;
      this.ctx.globalAlpha = p.alpha;
      this.ctx.fillRect(p.x, p.y, p.size, p.size);
    });
    this.ctx.globalAlpha = 1;

    // 8. Draw Popups
    this.popups.forEach(p => {
      this.ctx.fillStyle = p.color;
      this.ctx.globalAlpha = p.alpha;
      this.ctx.font = 'bold 12px var(--font-mono)';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(p.text, p.x, p.y);
    });
    this.ctx.globalAlpha = 1;

    this.ctx.restore();
    this.drawBoundaries();
  }

  // Authentic Mini Militia Doodle Army Soldier Avatar Renderer
  drawPlayer(p) {
    if (p.isDead) return;

    this.ctx.save();
    
    const accent = p.id === 'local-player' ? '#84cc16' : '#ef4444';

    // 1. Jetpack Tanks on Back
    const jpX = p.x + (p.isFacingRight ? -6 : p.w);
    this.ctx.fillStyle = '#4b5563';
    this.ctx.fillRect(jpX, p.y + 10, 6, 14);

    // Active Jetpack Thruster Flame
    if (p.isFlying) {
      this.ctx.fillStyle = '#f97316';
      this.ctx.beginPath();
      this.ctx.moveTo(jpX, p.y + 24);
      this.ctx.lineTo(jpX + (p.isFacingRight ? -3 : 9), p.y + 34 + Math.random() * 4);
      this.ctx.lineTo(jpX + 6, p.y + 24);
      this.ctx.fill();
    }

    // 2. Doodle Soldier Torso & Camo Vest
    this.ctx.fillStyle = '#166534'; // Army camo green
    if (typeof this.ctx.roundRect === 'function') {
      this.ctx.beginPath();
      this.ctx.roundRect(p.x, p.y + 12, p.w, Math.max(1, p.h - 12), 4);
      this.ctx.fill();
    } else {
      this.ctx.fillRect(p.x, p.y + 12, p.w, Math.max(1, p.h - 12));
    }
    
    // Tactical belt & buckle
    this.ctx.fillStyle = '#1f2937';
    this.ctx.fillRect(p.x, p.y + 24, p.w, 4);
    this.ctx.fillStyle = '#eab308';
    this.ctx.fillRect(p.x + p.w / 2 - 2, p.y + 24, 4, 4);

    // 3. Doodle Head & Army Helmet
    const headCenterX = p.x + p.w / 2;
    const headCenterY = p.y + 8;
    
    // Round skin head
    this.ctx.fillStyle = '#fde047';
    this.ctx.beginPath();
    this.ctx.arc(headCenterX, headCenterY, 8, 0, Math.PI * 2);
    this.ctx.fill();

    // Soldier Eyes (look towards aim direction)
    const eyeOffsetX = (p.isFacingRight ? 2 : -2);
    this.ctx.fillStyle = '#000000';
    this.ctx.beginPath();
    this.ctx.arc(headCenterX + eyeOffsetX, headCenterY - 1, 2, 0, Math.PI * 2);
    this.ctx.fill();

    // Military Helmet
    this.ctx.fillStyle = '#15803d';
    this.ctx.beginPath();
    this.ctx.arc(headCenterX, headCenterY - 2, 9, Math.PI, Math.PI * 2);
    this.ctx.fill();
    
    // Helmet Badge / Star
    this.ctx.fillStyle = '#eab308';
    this.ctx.fillRect(headCenterX - 2, headCenterY - 9, 4, 3);

    // 4. Rotating Arm holding Weapon Sprite
    this.ctx.save();
    this.ctx.translate(headCenterX, p.y + 16);
    this.ctx.rotate(p.aimAngle);

    // Gun Sprites
    if (p.currentWeapon === 'shotgun') {
      // Silver Shotgun Barrel
      this.ctx.fillStyle = '#9ca3af';
      this.ctx.fillRect(0, -3, 16, 5);
      this.ctx.fillStyle = '#78350f';
      this.ctx.fillRect(4, 0, 6, 3);
    } else if (p.currentWeapon === 'sniper') {
      // Long Laser Sniper Barrel + Red Scope
      this.ctx.fillStyle = '#111827';
      this.ctx.fillRect(0, -2, 22, 4);
      this.ctx.fillStyle = '#ef4444';
      this.ctx.fillRect(8, -5, 5, 3);
    } else {
      // AK-47 Wooden Stock + Black Barrel
      this.ctx.fillStyle = '#78350f';
      this.ctx.fillRect(-4, -1, 6, 4);
      this.ctx.fillStyle = '#1f2937';
      this.ctx.fillRect(2, -2, 14, 4);
      this.ctx.fillStyle = '#eab308';
      this.ctx.fillRect(6, 2, 3, 5); // Curved magazine
    }

    // Muzzle Flash Effect when firing
    if (p.muzzleFlashTimer > 0) {
      this.ctx.fillStyle = '#f59e0b';
      this.ctx.beginPath();
      this.ctx.arc(18, 0, 6, 0, Math.PI * 2);
      this.ctx.fill();
    }

    this.ctx.restore();

    // 5. Soldier Name & Health Bar
    this.ctx.font = 'bold 9px var(--font-primary)';
    this.ctx.fillStyle = '#ffffff';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(p.name, headCenterX, p.y - 12);

    const hpBarW = 24;
    const hpBarH = 3;
    const hpX = headCenterX - hpBarW / 2;
    const hpY = p.y - 8;
    this.ctx.fillStyle = '#1f2937';
    this.ctx.fillRect(hpX, hpY, hpBarW, hpBarH);
    this.ctx.fillStyle = p.health > 40 ? '#84cc16' : '#ef4444';
    this.ctx.fillRect(hpX, hpY, hpBarW * (p.health / 100), hpBarH);

    this.ctx.restore();
  }

  drawBoundaries() {
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    this.ctx.lineWidth = 4;
    this.ctx.strokeRect(this.offsetX, this.offsetY, this.virtualWidth * this.scale, this.virtualHeight * this.scale);
  }
}
