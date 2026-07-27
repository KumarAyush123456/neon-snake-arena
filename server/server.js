// ==========================================================================
// Real-time Multiplayer Node.js Game Server - Neon Militia 2D Platformer
// ==========================================================================

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

// Health Check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('HEALTHY');
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3001;

// Virtual maps layout geometry
const MAP_WIDTH = 800;
const MAP_HEIGHT = 500;
const GRAVITY = 0.25;
const FRICTION = 0.85;

const PLATFORMS = [
  { x: 0, y: 460, w: 800, h: 40, isFloor: true },
  { x: 80, y: 340, w: 200, h: 12 },
  { x: 520, y: 340, w: 200, h: 12 },
  { x: 280, y: 220, w: 240, h: 12 },
  { x: 50, y: 150, w: 140, h: 10 },
  { x: 610, y: 150, w: 140, h: 10 }
];

const WEAPONS = {
  rifle: { fireRate: 150, damage: 15, speed: 12, ammoMax: 30, spread: 0.05, count: 1 },
  shotgun: { fireRate: 700, damage: 12, speed: 10, ammoMax: 6, spread: 0.2, count: 4 },
  sniper: { fireRate: 1200, damage: 65, speed: 20, ammoMax: 3, spread: 0.0, count: 1 }
};

// Active game rooms map
const rooms = {};

class ServerPlayer {
  constructor(id, name, skin, x, y) {
    this.id = id;
    this.name = name;
    this.skin = skin;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.w = 20;
    this.h = 32;
    this.health = 100;
    this.fuel = 100;
    this.isFacingRight = true;
    this.aimAngle = 0;
    this.currentWeapon = 'rifle';
    this.ammo = 30;
    this.lastFireTime = 0;
    this.kills = 0;
    this.score = 0;
    this.coinsGained = 0;
    this.isGrounded = false;
    this.isDead = false;

    // Movement control states
    this.inputs = { left: false, right: false, up: false };
    this.shootInput = false;
  }

  respawn() {
    this.x = 100 + Math.random() * 600;
    this.y = 100;
    this.vx = 0;
    this.vy = 0;
    this.health = 100;
    this.fuel = 100;
    this.ammo = WEAPONS[this.currentWeapon].ammoMax;
    this.isDead = false;
  }
}

function getOrCreateRoom(roomId) {
  if (rooms[roomId]) return rooms[roomId];

  const room = {
    id: roomId,
    players: {},
    bullets: [],
    powerups: [],
    tickCount: 0,
    intervalId: null
  };

  // Initial powerups in room
  room.powerups.push({ type: 'weapon', x: 250, y: 180, w: 16, h: 16 });
  room.powerups.push({ type: 'health', x: 550, y: 300, w: 16, h: 16 });

  // Start fast physics loop (33ms ticks = ~30Hz update rate)
  room.intervalId = setInterval(() => {
    tickRoom(room);
  }, 33);

  rooms[roomId] = room;
  console.log(`Created multiplayer shooter room: ${roomId}`);
  return room;
}

function cleanEmptyRoom(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  const activeCount = Object.keys(room.players).length;
  if (activeCount === 0) {
    clearInterval(room.intervalId);
    delete rooms[roomId];
    console.log(`Terminated empty room: ${roomId}`);
  }
}

function tickRoom(room) {
  room.tickCount++;

  const activePlayers = Object.values(room.players);

  // 1. Process player movement physics & controls
  activePlayers.forEach(p => {
    if (p.isDead) return;

    // Horizontal speeds
    if (p.inputs.left) {
      p.vx = -4.2;
      p.isFacingRight = false;
    } else if (p.inputs.right) {
      p.vx = 4.2;
      p.isFacingRight = true;
    } else {
      p.vx *= FRICTION;
    }

    // Jetpack flight checks
    p.isFlying = false;
    if (p.inputs.up) {
      if (p.fuel > 0) {
        p.vy -= 0.65;
        p.fuel = Math.max(0, p.fuel - 0.7);
        p.isFlying = true;
      }
    } else {
      if (p.isGrounded) {
        p.fuel = Math.min(100, p.fuel + 0.8);
      }
    }

    p.vy += GRAVITY;
    p.x += p.vx;
    p.y += p.vy;

    // Platforms collisions
    p.isGrounded = false;
    PLATFORMS.forEach(plat => {
      if (p.x + p.w >= plat.x && p.x <= plat.x + plat.w) {
        const playerBottom = p.y + p.h;
        const prevPlayerBottom = playerBottom - p.vy;
        if (prevPlayerBottom <= plat.y + 2 && playerBottom >= plat.y && p.vy > 0) {
          p.y = plat.y - p.h;
          p.vy = 0;
          p.isGrounded = true;
        }
      }
    });

    // Outer screen boundaries check
    if (p.x < 0) p.x = 0;
    if (p.x + p.w > MAP_WIDTH) p.x = MAP_WIDTH - p.w;
    if (p.y < 0) p.y = 0;
    if (p.y + p.h > MAP_HEIGHT) {
      p.y = MAP_HEIGHT - p.h;
      p.vy = 0;
      p.isGrounded = true;
    }

    // Process shooting action
    if (p.shootInput) {
      const wp = WEAPONS[p.currentWeapon];
      const now = Date.now();
      if (now - p.lastFireTime >= wp.fireRate) {
        if (p.ammo <= 0) {
          // reload click trigger
          p.ammo = wp.ammoMax;
          p.lastFireTime = now + 1000;
        } else {
          p.ammo--;
          p.lastFireTime = now;

          // Broadcast firing SFX event
          io.to(room.id).emit('playSfx', { type: 'eat', x: p.x, y: p.y });

          const startX = p.x + p.w / 2 + Math.cos(p.aimAngle) * 16;
          const startY = p.y + p.h / 2 - 4 + Math.sin(p.aimAngle) * 16;

          for (let i = 0; i < wp.count; i++) {
            const spreadAngle = p.aimAngle + (Math.random() * wp.spread - wp.spread / 2);
            room.bullets.push({
              ownerId: p.id,
              x: startX,
              y: startY,
              vx: Math.cos(spreadAngle) * wp.speed,
              vy: Math.sin(spreadAngle) * wp.speed,
              damage: wp.damage,
              color: p.skin === 'neon-magenta' ? '#ff0055' : '#00f2fe'
            });
          }
        }
      }
    }
  });

  // 2. Process bullet movements & hit collisions
  const remainingBullets = [];
  room.bullets.forEach(b => {
    b.x += b.vx;
    b.y += b.vy;

    let hit = false;

    // Check bounds
    if (b.x < 0 || b.x > MAP_WIDTH || b.y < 0 || b.y > MAP_HEIGHT) {
      hit = true;
    }

    // Check platform collision
    PLATFORMS.forEach(plat => {
      if (!hit && b.x >= plat.x && b.x <= plat.x + plat.w && b.y >= plat.y && b.y <= plat.y + plat.h) {
        hit = true;
      }
    });

    // Check player hits
    activePlayers.forEach(p => {
      if (!hit && !p.isDead && b.ownerId !== p.id) {
        if (b.x >= p.x && b.x <= p.x + p.w && b.y >= p.y && b.y <= p.y + p.h) {
          hit = true;
          p.health = Math.max(0, p.health - b.damage);
          
          // Player death resolution
          if (p.health <= 0) {
            p.isDead = true;
            p.respawn();

            // Reward killer
            const killer = room.players[b.ownerId];
            if (killer) {
              killer.kills += 1;
              killer.score += 150;
              killer.coinsGained += 75;

              // Send chat alert
              io.to(room.id).emit('chatMessage', {
                author: 'SYSTEM',
                text: `Combat Alert: ${killer.name} neutralized ${p.name}! (+150 Score, +75 Coins)`,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              });
            }
          }
        }
      }
    });

    if (!hit) remainingBullets.push(b);
  });
  room.bullets = remainingBullets;

  // 3. Process powerups collisions
  room.powerups.forEach(pow => {
    activePlayers.forEach(p => {
      if (!p.isDead && p.x + p.w >= pow.x && p.x <= pow.x + pow.w && p.y + p.h >= pow.y && p.y <= pow.y + pow.h) {
        // Collect!
        if (pow.type === 'health') {
          p.health = Math.min(100, p.health + 40);
          io.to(room.id).emit('playSfx', { type: 'powerup', x: pow.x, y: pow.y });
          
          // Relocate powerup after collection
          pow.x = 100 + Math.random() * 600;
          pow.y = 200 + Math.random() * 200;
        } else if (pow.type === 'weapon') {
          // cycle weapon
          const weaponKeys = Object.keys(WEAPONS);
          const idx = weaponKeys.indexOf(p.currentWeapon);
          p.currentWeapon = weaponKeys[(idx + 1) % weaponKeys.length];
          p.ammo = WEAPONS[p.currentWeapon].ammoMax;
          
          io.to(room.id).emit('playSfx', { type: 'powerup', x: pow.x, y: pow.y });
          
          pow.x = 100 + Math.random() * 600;
          pow.y = 200 + Math.random() * 200;
        }
      }
    });
  });

  // 4. Emit State tick packet
  const playersState = {};
  activePlayers.forEach(p => {
    playersState[p.id] = {
      id: p.id,
      name: p.name,
      skin: p.skin,
      x: p.x,
      y: p.y,
      vx: p.vx,
      vy: p.vy,
      health: p.health,
      fuel: p.fuel,
      isFacingRight: p.isFacingRight,
      aimAngle: p.aimAngle,
      currentWeapon: p.currentWeapon,
      ammo: p.ammo,
      kills: p.kills,
      score: p.score,
      coinsGained: p.coinsGained,
      isFlying: p.isFlying
    };
  });

  const packet = {
    players: playersState,
    bullets: room.bullets.map(b => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, ownerId: b.ownerId, color: b.color })),
    powerups: room.powerups
  };

  io.to(room.id).emit('gameState', packet);
}

// Socket Connection Routing
io.on('connection', (socket) => {
  console.log(`Pilot connected: ${socket.id}`);
  io.emit('onlineCount', io.engine.clientsCount);
  let currentRoomId = null;

  socket.on('joinArena', ({ name, skin }) => {
    currentRoomId = 'infinite-nexus';
    socket.join(currentRoomId);

    const room = getOrCreateRoom(currentRoomId);

    // Spawn coordinate
    const x = 100 + Math.random() * 600;
    const y = 100;

    const player = new ServerPlayer(socket.id, name || 'Pilot', skin || 'neon-cyan', x, y);
    room.players[socket.id] = player;

    console.log(`Pilot '${name}' entered room '${currentRoomId}'`);

    // Chat broadcast
    io.to(currentRoomId).emit('chatMessage', {
      author: 'SYSTEM',
      text: `${name || 'Pilot'} connected to grid node.`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  });

  // Track inputs ticks
  socket.on('playerInputs', ({ keys, aimAngle, shoot }) => {
    if (!currentRoomId) return;
    const room = rooms[currentRoomId];
    if (room && room.players[socket.id]) {
      const player = room.players[socket.id];
      player.inputs = keys;
      player.aimAngle = aimAngle;
      player.shootInput = shoot;
    }
  });

  socket.on('chatMessage', (text) => {
    if (!currentRoomId) return;
    const room = rooms[currentRoomId];
    if (!room) return;

    const pName = room.players[socket.id]?.name || 'Pilot';
    
    io.to(currentRoomId).emit('chatMessage', {
      author: pName,
      text: text.substring(0, 60),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  });

  socket.on('disconnect', () => {
    console.log(`Pilot disconnected: ${socket.id}`);
    io.emit('onlineCount', io.engine.clientsCount);

    if (currentRoomId && rooms[currentRoomId]) {
      const room = rooms[currentRoomId];
      const pName = room.players[socket.id]?.name || 'Pilot';
      delete room.players[socket.id];

      io.to(currentRoomId).emit('chatMessage', {
        author: 'SYSTEM',
        text: `${pName} disconnected from grid node.`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });

      cleanEmptyRoom(currentRoomId);
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Real-time Game Mainframe listening on port ${PORT}`);
});
