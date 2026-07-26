// ==========================================================================
// Real-time Multiplayer Node.js Game Server
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

// Define default arena dimensions
const GRID_WIDTH = 40;
const GRID_HEIGHT = 22;

// Bot Names for spawning
const BOT_NAMES = [
  'Byte_Hunter', 'GridRunner', 'ApexSlayer', 'Glitch_Master',
  'PixelMamba', 'CypherNode', 'Zero_Cool', 'RivalPilot',
  'NullPointer', 'LaserStrike', 'ShadowSnake', 'VaporGlider'
];

// Active game rooms map
const rooms = {};

// Server-side Snake Entity structure
class ServerSnake {
  constructor(id, name, startX, startY, skin, isBot = false) {
    this.id = id;
    this.name = name;
    this.isBot = isBot;
    this.skin = skin;
    this.isDead = false;
    
    // Position/Movement state (start length 4)
    this.body = [
      { x: startX, y: startY },
      { x: startX - 1, y: startY },
      { x: startX - 2, y: startY },
      { x: startX - 3, y: startY }
    ];
    this.dir = { x: 1, y: 0 };
    this.nextDir = { x: 1, y: 0 };
    
    this.shieldTime = 0;
    this.speedTime = 0;
    this.score = 0;
    this.kills = 0;
    this.coinsGained = 0;
  }

  setDirection(newDir) {
    if (this.dir.x + newDir.x === 0 && this.dir.y + newDir.y === 0) return;
    this.nextDir = newDir;
  }

  update(gridWidth, gridHeight, shouldGrow) {
    this.dir = { ...this.nextDir };
    
    const nextX = (this.body[0].x + this.dir.x + gridWidth) % gridWidth;
    const nextY = (this.body[0].y + this.dir.y + gridHeight) % gridHeight;
    
    this.body.unshift({ x: nextX, y: nextY });
    
    if (!shouldGrow) {
      this.body.pop();
    }

    if (this.shieldTime > 0) this.shieldTime--;
    if (this.speedTime > 0) this.speedTime--;
  }
}

// Get or initialize room object
function getOrCreateRoom(roomId) {
  if (rooms[roomId]) return rooms[roomId];

  const room = {
    id: roomId,
    players: {}, // socket.id -> ServerSnake
    bots: [],    // Array of ServerSnake
    food: [],    // Array of food items
    tickCount: 0,
    intervalId: null
  };

  // Populate initial food items
  spawnFoodInRoom(room, 'normal', 10);
  spawnFoodInRoom(room, 'golden', 3);
  spawnFoodInRoom(room, 'speed', 2);
  spawnFoodInRoom(room, 'shield', 2);

  // Spawn initial bots to fill room
  for (let i = 0; i < 5; i++) {
    spawnBotInRoom(room);
  }

  // Start game tick loop (100ms interval = 10 updates per second)
  room.intervalId = setInterval(() => {
    tickRoom(room);
  }, 100);

  rooms[roomId] = room;
  console.log(`Created multiplayer grid room: ${roomId}`);
  return room;
}

// Clean up empty rooms to conserve server resources
function cleanEmptyRoom(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  const activePlayers = Object.keys(room.players).length;
  if (activePlayers === 0) {
    clearInterval(room.intervalId);
    delete rooms[roomId];
    console.log(`Terminated empty room: ${roomId}`);
  }
}

// Tick Physics Loop
function tickRoom(room) {
  room.tickCount++;
  const allSnakes = [...Object.values(room.players), ...room.bots];

  // 1. Calculate Bot AI directions
  room.bots.forEach(bot => {
    if (bot.isDead) return;
    const aiDir = getBotNextDir(bot, allSnakes, room.food);
    bot.setDirection(aiDir);
  });

  // 2. Move Snakes
  allSnakes.forEach(snake => {
    if (snake.isDead) return;

    // Speedboost double moves
    const moves = snake.speedTime > 0 ? 2 : 1;
    for (let m = 0; m < moves; m++) {
      const head = snake.body[0];
      const nextX = (head.x + snake.nextDir.x + GRID_WIDTH) % GRID_WIDTH;
      const nextY = (head.y + snake.nextDir.y + GRID_HEIGHT) % GRID_HEIGHT;
      
      const eatingIdx = room.food.findIndex(f => f.x === nextX && f.y === nextY);
      const shouldGrow = (eatingIdx !== -1);
      
      snake.update(GRID_WIDTH, GRID_HEIGHT, shouldGrow);

      if (shouldGrow) {
        const eaten = room.food[eatingIdx];
        room.food.splice(eatingIdx, 1);
        handleEatFood(room, snake, eaten);
        spawnFoodInRoom(room, eaten.type, 1);
      }
    }
  });

  // 3. Resolve Collisions
  allSnakes.forEach(snake => {
    if (snake.isDead) return;
    const head = snake.body[0];

    // Self collisions
    for (let i = 1; i < snake.body.length; i++) {
      if (snake.body[i].x === head.x && snake.body[i].y === head.y) {
        if (snake.shieldTime > 0) continue;
        handleSnakeDeath(room, snake, 'self');
        break;
      }
    }

    if (snake.isDead) return;

    // Body collisions against other snakes
    for (let other of allSnakes) {
      if (other.isDead || other.id === snake.id) continue;
      
      for (let seg of other.body) {
        if (seg.x === head.x && seg.y === head.y) {
          if (snake.shieldTime > 0) continue;
          handleSnakeDeath(room, snake, 'combat', other);
          break;
        }
      }
      if (snake.isDead) break;
    }
  });

  // 4. Clean dead bots and spawn new ones
  room.bots = room.bots.filter(b => !b.isDead);
  if (room.bots.length < 5 && Math.random() < 0.15) {
    spawnBotInRoom(room);
  }

  // 5. Broadcast State Frame
  const activeSnakes = [...Object.values(room.players), ...room.bots].map(s => ({
    id: s.id,
    name: s.name,
    body: s.body,
    dir: s.dir,
    skin: s.skin,
    shieldTime: s.shieldTime,
    speedTime: s.speedTime,
    isDead: s.isDead,
    score: s.score,
    kills: s.kills,
    coinsGained: s.coinsGained
  }));

  const leaderboard = [...activeSnakes]
    .sort((a, b) => b.body.length - a.body.length)
    .slice(0, 5)
    .map(s => ({ name: s.name, score: s.score, length: s.body.length }));

  io.to(room.id).emit('gameState', {
    snakes: activeSnakes,
    food: room.food,
    leaderboard
  });
}

function handleEatFood(room, snake, food) {
  let scoreVal = 10;
  let coinsVal = 3; // base multiplayer coin multiplier (3x)

  if (food.type === 'golden') {
    scoreVal = 30;
    coinsVal = 9;
    io.to(room.id).emit('playSfx', { type: 'eat_gold', x: food.x, y: food.y });
  } else if (food.type === 'speed') {
    snake.speedTime = 60;
    scoreVal = 5;
    io.to(room.id).emit('playSfx', { type: 'powerup', x: food.x, y: food.y });
  } else if (food.type === 'shield') {
    snake.shieldTime = 90;
    scoreVal = 5;
    io.to(room.id).emit('playSfx', { type: 'powerup', x: food.x, y: food.y });
  } else {
    io.to(room.id).emit('playSfx', { type: 'eat', x: food.x, y: food.y });
  }

  snake.score += scoreVal;
  snake.coinsGained += coinsVal;
}

function handleSnakeDeath(room, snake, cause, killer = null) {
  snake.isDead = true;

  // Turn segments into food drops
  snake.body.forEach(seg => {
    if (Math.random() < 0.35) {
      room.food.push({ x: seg.x, y: seg.y, type: 'normal' });
    }
  });

  // Reward killer
  if (killer) {
    killer.kills += 1;
    killer.score += 150;
    killer.coinsGained += 75; // high multiplayer kill reward (25x3)
    
    // Broadcast notification to Room Chat
    const msg = {
      author: 'SYSTEM',
      text: `Combat Alert: ${killer.name} neutralized ${snake.name}! Bounty distributed (+150 Score, +75 Coins).`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    io.to(room.id).emit('chatMessage', msg);
  }

  // Handle client-specific termination packets
  if (!snake.isBot) {
    const socket = io.sockets.sockets.get(snake.id);
    if (socket) {
      socket.emit('gameOver', {
        score: snake.score,
        coinsGained: snake.coinsGained,
        kills: snake.kills,
        length: snake.body.length
      });
    }
  }
}

// Bot Spawning and Pathfinding
function spawnBotInRoom(room) {
  const id = 'bot-' + Math.random().toString(36).substr(2, 9);
  const name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
  const skins = ['neon-magenta', 'fire', 'matrix', 'rainbow'];
  const skin = skins[Math.floor(Math.random() * skins.length)];

  let x = Math.floor(Math.random() * (GRID_WIDTH - 6)) + 3;
  let y = Math.floor(Math.random() * (GRID_HEIGHT - 6)) + 3;

  const bot = new ServerSnake(id, name, x, y, skin, true);
  
  const dirs = [{x:1,y:0}, {x:-1,y:0}, {x:0,y:1}, {x:0,y:-1}];
  bot.setDirection(dirs[Math.floor(Math.random() * dirs.length)]);
  
  room.bots.push(bot);
}

function spawnFoodInRoom(room, type, count) {
  for (let c = 0; c < count; c++) {
    const x = Math.floor(Math.random() * GRID_WIDTH);
    const y = Math.floor(Math.random() * GRID_HEIGHT);
    room.food.push({ x, y, type });
  }
}

function checkGridCollision(x, y, selfId, allSnakes) {
  for (let snake of allSnakes) {
    if (snake.isDead) continue;
    const startIdx = (snake.id === selfId) ? 1 : 0;
    
    for (let i = startIdx; i < snake.body.length; i++) {
      if (snake.body[i].x === x && snake.body[i].y === y) {
        if (snake.id === selfId && snake.shieldTime > 0) continue;
        return true;
      }
    }
  }
  return false;
}

// Server side bot heuristic pathfinder
function getBotNextDir(bot, allSnakes, allFood) {
  const head = bot.body[0];
  let target = null;
  let minDist = Infinity;

  allFood.forEach(food => {
    let dx = Math.min(Math.abs(food.x - head.x), GRID_WIDTH - Math.abs(food.x - head.x));
    let dy = Math.min(Math.abs(food.y - head.y), GRID_HEIGHT - Math.abs(food.y - head.y));
    const d = dx + dy;
    if (d < minDist) {
      minDist = d;
      target = food;
    }
  });

  if (!target) {
    target = { x: Math.floor(GRID_WIDTH / 2), y: Math.floor(GRID_HEIGHT / 2) };
  }

  const moves = [{x:0,y:-1}, {x:0,y:1}, {x:-1,y:0}, {x:1,y:0}];
  let bestMove = bot.dir;
  let bestScore = -Infinity;

  moves.forEach(m => {
    if (m.x + bot.dir.x === 0 && m.y + bot.dir.y === 0) return;

    const nx = (head.x + m.x + GRID_WIDTH) % GRID_WIDTH;
    const ny = (head.y + m.y + GRID_HEIGHT) % GRID_HEIGHT;

    let dx = Math.min(Math.abs(target.x - nx), GRID_WIDTH - Math.abs(target.x - nx));
    let dy = Math.min(Math.abs(target.y - ny), GRID_HEIGHT - Math.abs(target.y - ny));
    let score = -(dx + dy);

    if (checkGridCollision(nx, ny, bot.id, allSnakes)) {
      score -= 100000;
    }

    score += (Math.random() - 0.5) * 0.2;

    if (score > bestScore) {
      bestScore = score;
      bestMove = m;
    }
  });

  return bestMove;
}

// Socket Connection Handler
io.on('connection', (socket) => {
  console.log(`Pilot connected: ${socket.id}`);
  let currentRoomId = null;

  socket.on('joinArena', ({ name, skin }) => {
    currentRoomId = 'infinite-nexus'; // All online matchmaking routes to single scalable sandbox room
    socket.join(currentRoomId);

    const room = getOrCreateRoom(currentRoomId);
    
    // Spawn player in random open position
    let x = Math.floor(Math.random() * (GRID_WIDTH - 6)) + 3;
    let y = Math.floor(Math.random() * (GRID_HEIGHT - 6)) + 3;
    
    const playerSnake = new ServerSnake(socket.id, name || 'Pilot', x, y, skin || 'neon-cyan');
    room.players[socket.id] = playerSnake;

    console.log(`Pilot '${name}' entered room '${currentRoomId}'`);

    // Broadcast Join alert to chat
    const msg = {
      author: 'SYSTEM',
      text: `${name || 'Pilot'} connected to grid node.`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    io.to(currentRoomId).emit('chatMessage', msg);
  });

  socket.on('steer', (dir) => {
    if (!currentRoomId) return;
    const room = rooms[currentRoomId];
    if (room && room.players[socket.id]) {
      room.players[socket.id].setDirection(dir);
    }
  });

  socket.on('chatMessage', (text) => {
    if (!currentRoomId) return;
    const room = rooms[currentRoomId];
    if (!room) return;

    const pilotName = room.players[socket.id]?.name || 'Pilot';
    const msg = {
      author: pilotName,
      text: text.substring(0, 60), // clamp text length
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    
    // Broadcast to room
    io.to(currentRoomId).emit('chatMessage', msg);

    // Bot interactive replies to user
    const lowerText = text.toLowerCase();
    let reply = null;

    if (lowerText.includes('hello') || lowerText.includes('hi')) {
      reply = `Yo ${pilotName}! Prepare to get cut off.`;
    } else if (lowerText.includes('noob')) {
      reply = `Watch it ${pilotName}, my neural paths are fully optimized.`;
    } else if (lowerText.includes('hack')) {
      reply = "Hacks? In the Nexus? Grid admins scan for anomalies constantly.";
    } else if (lowerText.includes('skin')) {
      reply = "Make sure to lock in your skin config before deploying.";
    }

    if (reply) {
      setTimeout(() => {
        const botName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
        io.to(currentRoomId).emit('chatMessage', {
          author: botName,
          text: reply,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
      }, 700 + Math.random() * 800);
    }
  });

  // Client disconnected cleanup
  socket.on('disconnect', () => {
    console.log(`Pilot disconnected: ${socket.id}`);
    if (currentRoomId && rooms[currentRoomId]) {
      const room = rooms[currentRoomId];
      const name = room.players[socket.id]?.name || 'Pilot';
      delete room.players[socket.id];

      // Broadcast disconnect alerts to room chat
      const msg = {
        author: 'SYSTEM',
        text: `${name} disconnected from grid node.`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      io.to(currentRoomId).emit('chatMessage', msg);

      cleanEmptyRoom(currentRoomId);
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Real-time Game Mainframe listening on port ${PORT}`);
});
