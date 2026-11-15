// audio.js — every sound is synthesised with WebAudio: noise bursts for
// gunfire, square blips for the charge, a low boom for the detonation.
// No audio files, so the game stays self-contained and offline. The
// context wakes on the first user gesture; before that, calls are no-ops.

export class SoundFX {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
  }

  wake() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.42;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null; // no audio device: the game plays silent
    }
  }

  // burst plays filtered noise: the gunshot/explosion workhorse.
  burst(dur, freq, gain, type = 'lowpass') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur);
  }

  // blip plays a short oscillator tone (UI, beeps, hit confirmations).
  blip(freq, dur, gain, type = 'square', slideTo = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur);
  }

  // shot: gain falls with distance so far gunfire reads as far.
  shot(distance = 0, heavy = false) {
    const g = Math.max(0.05, 0.5 - distance * 0.011);
    this.burst(heavy ? 0.22 : 0.13, heavy ? 900 : 1600, g);
    if (heavy) this.blip(90, 0.18, g * 0.7, 'sine', 45);
  }

  dryFire() { this.blip(1400, 0.04, 0.12, 'square'); }
  reload() {
    this.blip(300, 0.05, 0.15, 'square');
    setTimeout(() => this.blip(210, 0.05, 0.15, 'square'), 140);
    setTimeout(() => this.blip(520, 0.05, 0.18, 'square'), 320);
  }
  hit(head) { this.blip(head ? 1560 : 1180, 0.06, 0.2, 'sine'); }
  hurt() { this.blip(160, 0.12, 0.22, 'sawtooth', 90); }
  kill() { this.blip(880, 0.09, 0.2, 'sine'); setTimeout(() => this.blip(1320, 0.1, 0.2, 'sine'), 70); }
  buy() { this.blip(660, 0.05, 0.15, 'sine'); setTimeout(() => this.blip(990, 0.07, 0.15, 'sine'), 55); }
  denied() { this.blip(180, 0.09, 0.15, 'square'); }
  throwIt() { this.burst(0.08, 2400, 0.08, 'bandpass'); }
  explosion() {
    this.burst(0.9, 220, 0.9);
    this.blip(60, 0.8, 0.8, 'sine', 28);
  }
  chargeBeep() { this.blip(1240, 0.07, 0.22, 'square'); }
  planted() { this.blip(1240, 0.08, 0.25, 'square'); setTimeout(() => this.blip(1240, 0.08, 0.25, 'square'), 130); }
  roundWin() { this.blip(523, 0.12, 0.2, 'triangle'); setTimeout(() => this.blip(784, 0.16, 0.2, 'triangle'), 110); }
  roundLose() { this.blip(392, 0.12, 0.2, 'triangle'); setTimeout(() => this.blip(262, 0.18, 0.2, 'triangle'), 110); }
}
