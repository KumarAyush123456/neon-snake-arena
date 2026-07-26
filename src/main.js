// ==========================================================================
// Main Application Router, Controller and Event Coordinator
// ==========================================================================

import { store } from './store.js';
import { audioSystem } from './audio.js';
import { GameEngine } from './engine.js';
import { LobbySystem } from './lobby.js';
import { ShopSystem } from './shop.js';
import { networkManager } from './network.js';

class App {
  constructor() {
    this.engine = new GameEngine('gameCanvas');
    this.lobby = new LobbySystem();
    this.shop = new ShopSystem();

    // Elements
    this.navButtons = document.querySelectorAll('.nav-btn');
    this.viewContainers = document.querySelectorAll('.view');
    this.audioToggleBtn = document.getElementById('audioToggle');
    this.audioIconOn = document.getElementById('audioIconOn');
    this.audioIconOff = document.getElementById('audioIconOff');
    this.coinDisplayVal = document.getElementById('playerCoins');
    this.onlineIndicatorVal = document.getElementById('onlineCount');

    // Lobby mode elements
    this.modeCards = document.querySelectorAll('.mode-card');
    this.lobbyActionBox = document.getElementById('lobbyActionBox');
    this.selectedModeTitle = document.getElementById('selectedModeTitle');
    this.selectedModeDesc = document.getElementById('selectedModeDesc');
    this.btnCancelQueue = document.getElementById('btnCancelQueue');
    this.btnLaunchGame = document.getElementById('btnLaunchGame');

    // Game Overlay Modal elements
    this.gameModal = document.getElementById('gameModal');
    this.btnPauseGame = document.getElementById('btnPauseGame');
    this.btnOverlayStart = document.getElementById('btnOverlayStart');
    
    // Pause menu elements
    this.pauseOverlay = document.getElementById('pauseOverlay');
    this.btnPauseResume = document.getElementById('btnPauseResume');
    this.btnPauseQuit = document.getElementById('btnPauseQuit');
    
    // GameOver menu elements
    this.gameOverOverlay = document.getElementById('gameOverOverlay');
    this.btnGameOverExit = document.getElementById('btnGameOverExit');
    this.btnGameOverRetry = document.getElementById('btnGameOverRetry');
    this.countdownDisplay = document.getElementById('countdownDisplay');

    // Active configuration
    this.selectedMode = null;

    this.init();
  }

  init() {
    this.setupNavigation();
    this.setupSettings();
    this.setupLobbySelection();
    this.setupGameModalControls();
    this.setupKeyboardInput();

    // Subscribe elements to state changes
    store.subscribe((state) => this.updateUI(state));
    
    // Periodically fluctuate player count slightly
    setInterval(() => {
      const base = 1200 + Math.floor(Math.sin(Date.now() / 20000) * 80);
      const dev = Math.floor(Math.random() * 8 - 4);
      this.onlineIndicatorVal.innerText = `${base + dev} Online`;
    }, 4000);

    // Initial Leaderboard Load
    this.renderLeaderboard();
  }

  // View Switching Tabs Router
  setupNavigation() {
    this.navButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tabName = e.currentTarget.getAttribute('data-tab');
        
        // Update header buttons active state
        this.navButtons.forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');

        // Toggle active views
        this.viewContainers.forEach(view => {
          view.classList.remove('active');
          if (view.id === `view-${tabName}`) {
            view.classList.add('active');
          }
        });

        // Trigger secondary updates
        if (tabName === 'leaderboard') {
          this.renderLeaderboard();
        }
      });
    });
  }

  // Audio system volume toggles
  setupSettings() {
    this.audioToggleBtn.addEventListener('click', () => {
      const isMuted = audioSystem.toggleMute();
      if (isMuted) {
        this.audioIconOn.classList.add('hidden');
        this.audioIconOff.classList.remove('hidden');
      } else {
        this.audioIconOn.classList.remove('hidden');
        this.audioIconOff.classList.add('hidden');
      }
    });

    // Unmute on first click to satisfy browser autoplay
    document.body.addEventListener('click', () => {
      if (!audioSystem.ctx) {
        audioSystem.init();
      }
    }, { once: true });
  }

  // Mode Selection Dashboard Card clicks
  setupLobbySelection() {
    this.modeCards.forEach(card => {
      card.addEventListener('click', () => {
        this.modeCards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        
        const mode = card.getAttribute('data-mode');
        this.selectedMode = mode;

        // Details content definitions
        let title = '';
        let desc = '';
        
        if (mode === 'classic') {
          title = 'Classic Neon Practice';
          desc = 'High-speed solo survival training grid. Practice reflex alignment.';
        } else if (mode === 'ai-battle') {
          title = 'Cyber Arena Duel (1v1 AI)';
          desc = 'Deploy grid snake nodes vs Neural Viper programs. Outmaneuver to override.';
        } else if (mode === 'local-vs') {
          title = 'Local Grid Showdown (WASD vs Arrows)';
          desc = 'Duel a secondary pilot on the same console mainframe.';
        } else if (mode === 'online-arena') {
          title = 'Infinite Nexus Arena (Multiplayer Sandbox)';
          desc = 'Deploy into persistent grid sector with online pilot bots.';
        }

        this.selectedModeTitle.innerText = title;
        this.selectedModeDesc.innerText = desc;
        this.lobbyActionBox.classList.remove('hidden');
        
        // Smooth scroll to action details box
        this.lobbyActionBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    });

    this.btnCancelQueue.addEventListener('click', () => {
      this.modeCards.forEach(c => c.classList.remove('selected'));
      this.lobbyActionBox.classList.add('hidden');
      this.selectedMode = null;
    });

    this.btnLaunchGame.addEventListener('click', () => {
      if (!this.selectedMode) return;
      
      // Stop lobby music or keep it in background
      audioSystem.resume();

      if (this.selectedMode === 'online-arena') {
        // Trigger simulated matchmaking queue delay
        this.lobby.startMatchmaking(() => {
          this.openGameModal();
        });
      } else {
        this.openGameModal();
      }
    });
  }

  // Launch modal setup
  openGameModal() {
    this.gameModal.classList.remove('hidden');
    document.getElementById('canvasOverlay').classList.remove('hidden');
    document.getElementById('menuOverlay').classList.remove('hidden');
    this.gameOverOverlay.classList.add('hidden');
    this.pauseOverlay.classList.add('hidden');
    this.countdownDisplay.classList.add('hidden');

    // Update overlay title
    let modeText = 'Classic Grid';
    if (this.selectedMode === 'ai-battle') modeText = 'Cyber Duel vs AI';
    if (this.selectedMode === 'local-vs') modeText = 'Dual Grid Showdown';
    if (this.selectedMode === 'online-arena') modeText = 'Nexus Arena';
    
    document.getElementById('overlayTitle').innerText = modeText;
    document.getElementById('hudPlayerName').innerText = store.state.selectedSkin.toUpperCase().replace('-', '_');

    // Setup Engine state (ready to run)
    this.engine.setup(this.selectedMode);
    this.engine.updateHUD();
  }

  setupGameModalControls() {
    // Launch Overlay Start button click
    this.btnOverlayStart.addEventListener('click', () => {
      document.getElementById('menuOverlay').classList.add('hidden');
      this.startCountdown(() => {
        document.getElementById('canvasOverlay').classList.add('hidden');
        if (this.selectedMode === 'online-arena') {
          this.startMultiplayer();
        } else {
          this.engine.start();
        }
      });
    });

    // Pause triggers
    this.btnPauseGame.addEventListener('click', () => this.togglePause());
    this.btnPauseResume.addEventListener('click', () => this.togglePause());
    this.btnPauseQuit.addEventListener('click', () => {
      this.engine.stop();
      this.closeGameModal();
    });

    // Game Over actions
    this.btnGameOverExit.addEventListener('click', () => {
      this.closeGameModal();
    });

    this.btnGameOverRetry.addEventListener('click', () => {
      this.openGameModal();
    });
  }

  startMultiplayer() {
    const pName = store.state.selectedSkin.toUpperCase().replace('-', '_') + '_' + Math.floor(Math.random() * 90 + 10);
    const skin = store.state.selectedSkin;
    
    networkManager.connect(
      pName,
      skin,
      (state) => {
        if (networkManager.socket) {
          this.engine.updateNetworkState(state, networkManager.socket.id);
        }
      },
      (stats) => {
        this.engine.triggerGameOver('System Failure', `Neutralized in the Arena.`, false);
      },
      (sfxData) => {
        if (sfxData.type === 'eat') audioSystem.playEat();
        if (sfxData.type === 'eat_gold') audioSystem.playEat();
        if (sfxData.type === 'powerup') audioSystem.playPowerup();
      }
    );
    
    this.chatUnsubscribe = networkManager.subscribeChat((msg) => {
      this.lobby.postBotMessage(msg.author, msg.text);
    });

    this.engine.start();
  }

  startCountdown(callback) {
    this.countdownDisplay.classList.remove('hidden');
    let count = 3;
    this.countdownDisplay.innerText = count;

    const interval = setInterval(() => {
      count--;
      if (count <= 0) {
        clearInterval(interval);
        this.countdownDisplay.classList.add('hidden');
        callback();
      } else {
        this.countdownDisplay.innerText = count;
        // play retro tick beep sound
        if (audioSystem.ctx && !audioSystem.muted) {
          const osc = audioSystem.ctx.createOscillator();
          const gain = audioSystem.ctx.createGain();
          osc.frequency.value = 600;
          gain.gain.value = 0.05;
          osc.connect(gain);
          gain.connect(audioSystem.ctx.destination);
          osc.start();
          osc.stop(audioSystem.ctx.currentTime + 0.05);
        }
      }
    }, 600);
  }

  togglePause() {
    if (this.engine.isGameOver) return;
    
    this.engine.togglePause();
    
    if (this.engine.isPaused) {
      this.pauseOverlay.classList.remove('hidden');
      document.getElementById('canvasOverlay').classList.remove('hidden');
      document.getElementById('menuOverlay').classList.add('hidden');
    } else {
      this.pauseOverlay.classList.add('hidden');
      document.getElementById('canvasOverlay').classList.add('hidden');
    }
  }

  closeGameModal() {
    this.gameModal.classList.add('hidden');
    this.engine.stop();
    if (this.selectedMode === 'online-arena') {
      networkManager.disconnect();
      if (this.chatUnsubscribe) {
        this.chatUnsubscribe();
        this.chatUnsubscribe = null;
      }
    }
  }

  // Keyboard controls steering routes
  setupKeyboardInput() {
    window.addEventListener('keydown', (e) => {
      if (!this.engine.isRunning || this.engine.isPaused || this.engine.isGameOver) {
        // Allow escape to resume if paused
        if (e.key === 'Escape' && this.engine.isPaused) {
          this.togglePause();
        }
        return;
      }

      // Prevent window scroll behavior for arrow keys
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }

      if (e.key === 'Escape') {
        this.togglePause();
        return;
      }

      if (this.selectedMode === 'online-arena') {
        let dir = null;
        if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') {
          dir = { x: 0, y: -1 };
        } else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') {
          dir = { x: 0, y: 1 };
        } else if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') {
          dir = { x: -1, y: 0 };
        } else if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') {
          dir = { x: 1, y: 0 };
        }
        if (dir) {
          networkManager.steer(dir);
        }
        return;
      }

      const p1 = this.engine.snakes.find(s => s.id === 'player' || s.id === 'player1');
      const p2 = this.engine.snakes.find(s => s.id === 'player2'); // local VS opponent

      // Player 1 Input Routes (WASD / Arrows if single player, WASD only if 2-Player VS)
      if (p1) {
        // Up
        if (e.key === 'w' || e.key === 'W' || (!p2 && e.key === 'ArrowUp')) {
          p1.setDirection({ x: 0, y: -1 });
        }
        // Down
        else if (e.key === 's' || e.key === 'S' || (!p2 && e.key === 'ArrowDown')) {
          p1.setDirection({ x: 0, y: 1 });
        }
        // Left
        else if (e.key === 'a' || e.key === 'A' || (!p2 && e.key === 'ArrowLeft')) {
          p1.setDirection({ x: -1, y: 0 });
        }
        // Right
        else if (e.key === 'd' || e.key === 'D' || (!p2 && e.key === 'ArrowRight')) {
          p1.setDirection({ x: 1, y: 0 });
        }
      }

      // Player 2 Local VS Input Routes (Arrow Keys)
      if (p2) {
        if (e.key === 'ArrowUp') {
          p2.setDirection({ x: 0, y: -1 });
        } else if (e.key === 'ArrowDown') {
          p2.setDirection({ x: 0, y: 1 });
        } else if (e.key === 'ArrowLeft') {
          p2.setDirection({ x: -1, y: 0 });
        } else if (e.key === 'ArrowRight') {
          p2.setDirection({ x: 1, y: 0 });
        }
      }
    });
  }

  // Profile View & stats layout binding
  updateUI(state) {
    // Coins balance
    this.coinDisplayVal.innerText = state.coins;

    // Profile page fields
    document.getElementById('statMatches').innerText = state.stats.matches;
    document.getElementById('statHighScore').innerText = state.highScore;
    document.getElementById('statTotalCoins').innerText = state.stats.totalFood; // proxy for total earnings
    document.getElementById('statTotalFood').innerText = state.stats.totalFood;
    document.getElementById('statKills').innerText = state.stats.kills;
    document.getElementById('statMaxLength').innerText = state.stats.maxLength;
    
    // Minutes played display
    const mins = Math.floor(state.stats.timePlayed / 60);
    const secs = state.stats.timePlayed % 60;
    document.getElementById('statTimePlayed').innerText = `${mins}m ${secs}s`;

    // Render achievements
    const achList = document.getElementById('achievementsList');
    if (achList) {
      achList.innerHTML = '';
      Object.values(state.achievements).forEach(ach => {
        const row = document.createElement('div');
        row.className = `achievement-row ${ach.unlocked ? 'unlocked' : ''}`;
        row.innerHTML = `
          <div class="achievement-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          </div>
          <div class="achievement-info">
            <h4>${ach.title}</h4>
            <p>${ach.desc} ${ach.unlocked ? `(Unlocked ${ach.unlockedAt})` : ''}</p>
          </div>
        `;
        achList.appendChild(row);
      });
    }
  }

  // Populate dynamic Global Rankings Leaderboard
  renderLeaderboard() {
    const leaderboardBody = document.getElementById('leaderboardBody');
    if (!leaderboardBody) return;

    // Hardcoded leaderboard with bot entries and user score merged
    const entries = [
      { name: 'ApexSlayer', skin: 'Rainbow Config', score: 1820, online: true },
      { name: 'Byte_Hunter', skin: 'Fire Config', score: 1450, online: true },
      { name: 'GridRunner', skin: 'Matrix Config', score: 1100, online: true },
      { name: 'CypherNode', skin: 'Magenta Config', score: 980, online: false },
      { name: 'PixelMamba', skin: 'Cyan Config', score: 750, online: true },
      { name: 'Zero_Cool', skin: 'Cyan Config', score: 620, online: false }
    ];

    // Add player entry dynamically
    const pScore = store.state.highScore;
    const pSkinText = store.state.selectedSkin.toUpperCase().replace('-', ' ') + ' Config';
    
    entries.push({
      name: 'You (Grid_Pilot)',
      skin: pSkinText,
      score: pScore,
      online: true,
      isPlayer: true
    });

    // Sort entries descending
    entries.sort((a, b) => b.score - a.score);

    leaderboardBody.innerHTML = '';

    entries.forEach((item, index) => {
      const rank = index + 1;
      let rankClass = 'rank-normal';
      if (rank === 1) rankClass = 'rank-1';
      else if (rank === 2) rankClass = 'rank-2';
      else if (rank === 3) rankClass = 'rank-3';

      const statusHtml = item.online 
        ? `<span class="status-dot online"></span>Active`
        : `<span class="status-dot offline"></span>Offline`;

      const row = document.createElement('tr');
      row.innerHTML = `
        <td><span class="rank-badge ${rankClass}">${rank}</span></td>
        <td class="pilot-name-cell ${item.isPlayer ? 'user-highlight' : ''}">${item.name}</td>
        <td>${item.skin}</td>
        <td class="score-cell">${item.score}</td>
        <td>${statusHtml}</td>
      `;
      leaderboardBody.appendChild(row);
    });
  }
}

// Instantiate and start app controller
document.addEventListener('DOMContentLoaded', () => {
  new App();
});
