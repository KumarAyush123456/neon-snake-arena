// ==========================================================================
// Socket.io WebSocket Client Interface
// ==========================================================================

import { io } from 'socket.io-client';

class NetworkManager {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.roomStateCallback = null;
    this.gameOverCallback = null;
    this.sfxCallback = null;
    this.chatCallbacks = [];
  }

  /**
   * Connect to the real-time server and join the matchmaking lobby.
   */
  connect(name, skin, onStateUpdate, onGameOver, onSfxTrigger) {
    if (this.isConnected) return;

    // Direct connections to localhost:3001 in dev, otherwise fallback to root host for ALB routes
    const serverUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? 'http://localhost:3001'
      : 'http://neon-snake-alb-1575625893.ap-south-1.elb.amazonaws.com'; // Production AWS ALB path

    console.log(`Connecting to game mainframe at: ${serverUrl}`);

    this.socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      timeout: 10000
    });

    this.roomStateCallback = onStateUpdate;
    this.gameOverCallback = onGameOver;
    this.sfxCallback = onSfxTrigger;

    this.socket.on('connect', () => {
      this.isConnected = true;
      console.log(`Connected to server. Socket ID: ${this.socket.id}`);
      
      // Request matchmaking entrance
      this.socket.emit('joinArena', { name, skin });
    });

    // Handle incoming state frame tick
    this.socket.on('gameState', (state) => {
      if (this.roomStateCallback) {
        this.roomStateCallback(state);
      }
    });

    // Handle SFX triggers from server
    this.socket.on('playSfx', (data) => {
      if (this.sfxCallback) {
        this.sfxCallback(data);
      }
    });

    // Handle chat broadcasts
    this.socket.on('chatMessage', (msg) => {
      this.chatCallbacks.forEach(cb => cb(msg));
    });

    // Handle player death
    this.socket.on('gameOver', (stats) => {
      if (this.gameOverCallback) {
        this.gameOverCallback(stats);
      }
      this.disconnect();
    });

    this.socket.on('disconnect', () => {
      this.isConnected = false;
      console.log('Disconnected from game server');
    });

    this.socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
  }

  steer(dir) {
    if (this.isConnected && this.socket) {
      this.socket.emit('steer', dir);
    }
  }

  sendChat(text) {
    if (this.isConnected && this.socket) {
      this.socket.emit('chatMessage', text);
    }
  }

  subscribeChat(callback) {
    this.chatCallbacks.push(callback);
    return () => {
      this.chatCallbacks = this.chatCallbacks.filter(cb => cb !== callback);
    };
  }
}

export const networkManager = new NetworkManager();
