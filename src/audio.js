// ==========================================================================
// Web Audio API Synthesizer and Sequencer
// ==========================================================================

class AudioSystem {
  constructor() {
    this.ctx = null;
    this.muted = true; // Start muted to comply with autoplay & user comfort
    this.bgmNode = null;
    
    // Music Sequencer state
    this.bpm = 105;
    this.isPlayingBgm = false;
    this.nextNoteTime = 0.0;
    this.step = 0;
    this.timerId = null;

    // A-Minor scale bass frequencies (A1, C2, D2, E2, G2)
    this.bassNotes = [55.0, 65.41, 73.42, 82.41, 98.0];
    this.bassPattern = [0, 0, 3, 3, 4, 4, 2, 2, 0, 0, 3, 3, 4, 4, 1, 2];
    
    // Melody notes (A4, B4, C5, E5, G5, A5)
    this.melodyNotes = [440.00, 493.88, 523.25, 659.25, 783.99, 880.00];
    this.melodyPattern = [
      -1, 0, 2, -1, 3, -1, 4, -1,
      -1, 3, 2, -1, 0, -1, 1, -1,
      -1, 4, 5, -1, 3, -1, 2, -1,
      -1, 2, 0, -1, 1, -1, 0, -1
    ];
  }

  init() {
    if (this.ctx) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContextClass();
    
    // Master gain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0.0 : 0.35;
    this.masterGain.connect(this.ctx.destination);
    
    // Sub gains
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.8;
    this.sfxGain.connect(this.masterGain);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.45;
    this.musicGain.connect(this.masterGain);
  }

  resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.resume();
    this.muted = !this.muted;
    if (this.masterGain) {
      // Smooth transition to avoid clicks
      const targetGain = this.muted ? 0.0 : 0.35;
      this.masterGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.1);
    }
    
    // Automatically manage BGM when muting/unmuting
    if (!this.muted) {
      this.startBgm();
    } else {
      this.stopBgm();
    }
    return this.muted;
  }

  // Play Eat sound effect
  playEat() {
    if (this.muted || !this.ctx) return;
    this.resume();

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(350, now);
    osc.frequency.exponentialRampToValueAtTime(700, now + 0.08);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.08);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.09);
  }

  // Play Powerup pickup sound effect
  playPowerup() {
    if (this.muted || !this.ctx) return;
    this.resume();

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    
    // Quick chiptune arpeggio
    osc.frequency.setValueAtTime(440, now); // A4
    osc.frequency.setValueAtTime(554.37, now + 0.05); // C#5
    osc.frequency.setValueAtTime(659.25, now + 0.10); // E5
    osc.frequency.setValueAtTime(880, now + 0.15); // A5

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.setValueAtTime(0.15, now + 0.15);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.25);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.26);
  }

  // Play combat kill / explosion sound effect
  playKill() {
    if (this.muted || !this.ctx) return;
    this.resume();

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.3);

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(100, now);
    osc2.frequency.linearRampToValueAtTime(40, now + 0.3);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.3);

    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc2.start(now);
    osc.stop(now + 0.31);
    osc2.stop(now + 0.31);
  }

  // Play death sound effect
  playDie() {
    if (this.muted || !this.ctx) return;
    this.resume();

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.linearRampToValueAtTime(40, now + 0.45);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.linearRampToValueAtTime(0.001, now + 0.45);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.46);
  }

  // Procedural Music Synthesizer & Sequencer
  startBgm() {
    this.resume();
    if (this.isPlayingBgm || this.muted || !this.ctx) return;
    
    this.isPlayingBgm = true;
    this.nextNoteTime = this.ctx.currentTime;
    this.step = 0;
    
    // Setup sequencer scheduler loop
    const scheduler = () => {
      while (this.nextNoteTime < this.ctx.currentTime + 0.1) {
        this.scheduleNextStep(this.step, this.nextNoteTime);
        this.advanceStep();
      }
      this.timerId = setTimeout(scheduler, 25);
    };
    
    scheduler();
  }

  stopBgm() {
    this.isPlayingBgm = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  advanceStep() {
    const secondsPerBeat = 60.0 / this.bpm;
    const stepDuration = 0.25 * secondsPerBeat; // sixteenth notes
    this.nextNoteTime += stepDuration;
    
    this.step = (this.step + 1) % 32;
  }

  scheduleNextStep(step, time) {
    if (!this.ctx) return;

    // --- BASS LINE (plays on every 8th note, i.e., steps 0, 2, 4, etc.) ---
    if (step % 2 === 0) {
      const bassIndex = this.bassPattern[(step / 2) % this.bassPattern.length];
      const freq = this.bassNotes[bassIndex];
      
      const bassOsc = this.ctx.createOscillator();
      const bassGain = this.ctx.createGain();
      
      bassOsc.type = 'sawtooth';
      bassOsc.frequency.setValueAtTime(freq, time);
      
      // Simple synthwave filter sweep
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(150, time);
      filter.frequency.exponentialRampToValueAtTime(450, time + 0.1);
      
      bassGain.gain.setValueAtTime(0.12, time);
      bassGain.gain.linearRampToValueAtTime(0.001, time + 0.18);
      
      bassOsc.connect(filter);
      filter.connect(bassGain);
      bassGain.connect(this.musicGain);
      
      bassOsc.start(time);
      bassOsc.stop(time + 0.2);
    }

    // --- LEADS / MELODY (plays on selected patterns) ---
    const melodyIndex = this.melodyPattern[step];
    if (melodyIndex !== -1 && step % 4 !== 2) { // Add syncopation
      const freq = this.melodyNotes[melodyIndex];
      
      const leadOsc = this.ctx.createOscillator();
      const leadGain = this.ctx.createGain();
      const delay = this.ctx.createDelay();
      const delayFeedback = this.ctx.createGain();
      
      leadOsc.type = 'sine'; // Soft retro sine lead
      leadOsc.frequency.setValueAtTime(freq, time);
      
      leadGain.gain.setValueAtTime(0.06, time);
      leadGain.gain.setTargetAtTime(0.001, time + 0.15, 0.05);
      
      // Add feedback delay for spacey synth effect
      delay.delayTime.setValueAtTime(0.15, time);
      delayFeedback.gain.setValueAtTime(0.35, time);
      
      leadOsc.connect(leadGain);
      
      // Connect delay loop
      leadGain.connect(delay);
      delay.connect(delayFeedback);
      delayFeedback.connect(delay);
      
      leadGain.connect(this.musicGain);
      delay.connect(this.musicGain);
      
      leadOsc.start(time);
      leadOsc.stop(time + 0.4);
    }

    // --- DRUMS: SYNTHESIZED SYNTHWAVE BEAT ---
    // Kick Drum (on steps 0, 8, 16, 24)
    if (step % 8 === 0) {
      const kickOsc = this.ctx.createOscillator();
      const kickGain = this.ctx.createGain();
      
      kickOsc.frequency.setValueAtTime(120, time);
      kickOsc.frequency.exponentialRampToValueAtTime(40, time + 0.08);
      
      kickGain.gain.setValueAtTime(0.4, time);
      kickGain.gain.linearRampToValueAtTime(0.001, time + 0.1);
      
      kickOsc.connect(kickGain);
      kickGain.connect(this.musicGain);
      
      kickOsc.start(time);
      kickOsc.stop(time + 0.11);
    }
    
    // Snare / Clap (on steps 4, 12, 20, 28)
    if (step % 8 === 4) {
      // Noise-like snare using high-frequency oscillator and envelope
      const snareOsc = this.ctx.createOscillator();
      const snareGain = this.ctx.createGain();
      
      snareOsc.type = 'triangle';
      snareOsc.frequency.setValueAtTime(180, time);
      
      // High pass filter for snare snap
      const hpFilter = this.ctx.createBiquadFilter();
      hpFilter.type = 'highpass';
      hpFilter.frequency.setValueAtTime(1000, time);
      
      snareGain.gain.setValueAtTime(0.07, time);
      snareGain.gain.linearRampToValueAtTime(0.001, time + 0.15);
      
      snareOsc.connect(hpFilter);
      hpFilter.connect(snareGain);
      snareGain.connect(this.musicGain);
      
      snareOsc.start(time);
      snareOsc.stop(time + 0.16);
    }
  }
}

export const audioSystem = new AudioSystem();
