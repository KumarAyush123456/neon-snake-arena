// ==========================================================================
// Persistent State Management System
// ==========================================================================

class Store {
  constructor() {
    this.key = 'neonsnake_platform_state';
    
    // Default initial state
    this.state = {
      username: 'Grid_Pilot_99',
      coins: 50,
      selectedSkin: 'neon-cyan',
      unlockedSkins: ['neon-cyan'],
      highScore: 0,
      stats: {
        matches: 0,
        totalFood: 0,
        maxLength: 0,
        kills: 0,
        timePlayed: 0 // in seconds
      },
      achievements: {
        first_bite: { id: 'first_bite', title: 'First Bite', desc: 'Synthesized your first energy cell', unlocked: false },
        length_30: { id: 'length_30', title: 'Centipede', desc: 'Reach a snake length of 30 units', unlocked: false },
        length_60: { id: 'length_60', title: 'Gigantism', desc: 'Reach a snake length of 60 units', unlocked: false },
        combat_kill: { id: 'combat_kill', title: 'Grid Enforcer', desc: 'Eliminate an opponent snake in AI Battle or Arena', unlocked: false },
        first_buy: { id: 'first_buy', title: 'Custom Config', desc: 'Purchase any cosmetic skin from the Shop', unlocked: false },
        rich_snake: { id: 'rich_snake', title: 'Crypto-Hoarder', desc: 'Accumulate 300 grid coins', unlocked: false }
      },
      matchHistory: []
    };

    this.listeners = [];
    this.load();
  }

  // Register a listener for state changes (e.g. to update wallet or stats displays)
  subscribe(listener) {
    this.listeners.push(listener);
    // Trigger immediately with current state
    listener(this.state);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notify() {
    this.listeners.forEach(listener => listener({ ...this.state }));
  }

  // Load from localStorage
  load() {
    try {
      const data = localStorage.getItem(this.key);
      if (data) {
        const parsed = JSON.parse(data);
        // Deep merge states to handle structural updates safely
        this.state = {
          ...this.state,
          ...parsed,
          stats: { ...this.state.stats, ...(parsed.stats || {}) },
          achievements: this.mergeAchievements(this.state.achievements, parsed.achievements || {}),
          matchHistory: parsed.matchHistory || []
        };
      }
    } catch (e) {
      console.error('Failed to load state from localStorage:', e);
    }
  }

  mergeAchievements(defaults, loaded) {
    const merged = { ...defaults };
    Object.keys(loaded).forEach(key => {
      if (merged[key]) {
        merged[key].unlocked = loaded[key].unlocked;
        merged[key].unlockedAt = loaded[key].unlockedAt;
      }
    });
    return merged;
  }

  // Save to localStorage
  save() {
    try {
      localStorage.setItem(this.key, JSON.stringify(this.state));
      this.notify();
    } catch (e) {
      console.error('Failed to save state to localStorage:', e);
    }
  }

  updateUsername(newName) {
    const cleanName = newName.trim().substring(0, 15) || 'Grid_Pilot_99';
    this.state.username = cleanName;
    this.save();
  }

  // Modify coins
  addCoins(amount) {
    this.state.coins = Math.max(0, this.state.coins + amount);
    if (this.state.coins >= 300) {
      this.unlockAchievement('rich_snake');
    }
    this.save();
  }

  // Unlock cosmetic skin
  unlockSkin(skinId, cost) {
    if (this.state.unlockedSkins.includes(skinId)) return true;
    if (this.state.coins >= cost) {
      this.state.coins -= cost;
      this.state.unlockedSkins.push(skinId);
      this.unlockAchievement('first_buy');
      this.save();
      return true;
    }
    return false;
  }

  // Equip cosmetic skin
  equipSkin(skinId) {
    if (this.state.unlockedSkins.includes(skinId)) {
      this.state.selectedSkin = skinId;
      this.save();
      return true;
    }
    return false;
  }

  // Log a completed run
  recordMatch(score, length, kills, durationSecs) {
    this.state.stats.matches += 1;
    this.state.stats.totalFood += Math.floor(score / 10); // Approximation
    this.state.stats.maxLength = Math.max(this.state.stats.maxLength, length);
    this.state.stats.kills += kills;
    this.state.stats.timePlayed += durationSecs;

    if (score > this.state.highScore) {
      this.state.highScore = score;
    }

    // Process Achievements
    if (score > 0) {
      this.unlockAchievement('first_bite');
    }
    if (length >= 30) {
      this.unlockAchievement('length_30');
    }
    if (length >= 60) {
      this.unlockAchievement('length_60');
    }
    if (kills >= 1) {
      this.unlockAchievement('combat_kill');
    }

    // Add to local history
    this.state.matchHistory.unshift({
      date: new Date().toLocaleDateString(),
      score,
      length,
      kills,
      duration: durationSecs
    });
    
    // Keep last 10 games
    if (this.state.matchHistory.length > 10) {
      this.state.matchHistory.pop();
    }

    this.save();
  }

  // Unlock achievement helper
  unlockAchievement(id) {
    if (this.state.achievements[id] && !this.state.achievements[id].unlocked) {
      this.state.achievements[id].unlocked = true;
      this.state.achievements[id].unlockedAt = new Date().toLocaleDateString();
      
      // Trigger a chat message notify or alert (handled in main/lobby)
      this.dispatchCustomEvent('achievement_unlocked', this.state.achievements[id]);
    }
  }

  dispatchCustomEvent(name, detail) {
    const event = new CustomEvent(name, { detail });
    window.dispatchEvent(event);
  }
}

export const store = new Store();
