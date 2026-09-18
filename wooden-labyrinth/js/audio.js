/**
 * Procedural wood/marble rolling audio via Web Audio API.
 * Velocity-driven rumble + soft grain; impact ticks on wall hits.
 */
export class BallAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.rollGain = null;
    this.rollFilter = null;
    this.noiseSrc = null;
    this.lfo = null;
    this.started = false;
    this._speed = 0;
  }

  async unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();
      this._buildGraph();
    }
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
    if (!this.started) {
      this.noiseSrc.start(0);
      this.started = true;
    }
  }

  _buildGraph() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(ctx.destination);

    // Brown-ish noise buffer
    const seconds = 3;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }

    this.noiseSrc = ctx.createBufferSource();
    this.noiseSrc.buffer = buffer;
    this.noiseSrc.loop = true;

    this.rollFilter = ctx.createBiquadFilter();
    this.rollFilter.type = "bandpass";
    this.rollFilter.frequency.value = 180;
    this.rollFilter.Q.value = 0.7;

    const woodTone = ctx.createBiquadFilter();
    woodTone.type = "lowpass";
    woodTone.frequency.value = 900;

    this.rollGain = ctx.createGain();
    this.rollGain.gain.value = 0;

    // Gentle amplitude flutter for grain authenticity
    this.lfo = ctx.createOscillator();
    this.lfo.type = "sine";
    this.lfo.frequency.value = 11;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.08;
    this.lfo.connect(lfoGain);

    const flutter = ctx.createGain();
    flutter.gain.value = 1;
    lfoGain.connect(flutter.gain);

    this.noiseSrc.connect(this.rollFilter);
    this.rollFilter.connect(woodTone);
    woodTone.connect(flutter);
    flutter.connect(this.rollGain);
    this.rollGain.connect(this.master);

    this.lfo.start(0);
  }

  /** @param {number} speed world units / sec */
  setSpeed(speed) {
    if (!this.ctx || !this.started) return;
    this._speed = speed;
    const t = this.ctx.currentTime;
    const intensity = Math.min(1, speed / 3.2);
    const target = intensity < 0.04 ? 0 : 0.02 + intensity * 0.38;
    this.rollGain.gain.setTargetAtTime(target, t, 0.05);
    const freq = 120 + intensity * 420;
    this.rollFilter.frequency.setTargetAtTime(freq, t, 0.08);
    this.lfo.frequency.setTargetAtTime(8 + intensity * 18, t, 0.1);
  }

  playImpact(strength = 0.5) {
    if (!this.ctx || !this.started) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const s = Math.min(1, Math.max(0.15, strength));

    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(140 + s * 90, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.12);

    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 600 + s * 400;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22 * s, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);

    // Tiny noise burst for wood grain
    const burst = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    burst.buffer = buf;
    const bg = ctx.createGain();
    bg.gain.value = 0.12 * s;

    osc.connect(filt);
    filt.connect(g);
    g.connect(this.master);
    burst.connect(bg);
    bg.connect(this.master);

    osc.start(t);
    osc.stop(t + 0.2);
    burst.start(t);
    burst.stop(t + 0.05);
  }

  playFall() {
    if (!this.ctx || !this.started) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.55);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.28, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.65);
    this.setSpeed(0);
  }

  playGoal() {
    if (!this.ctx || !this.started) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const notes = [392, 494, 587];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const g = ctx.createGain();
      const start = t + i * 0.18;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.16, start + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.55);
      osc.connect(g);
      g.connect(this.master);
      osc.start(start);
      osc.stop(start + 0.6);
    });
    this.setSpeed(0);
  }

  hush() {
    this.setSpeed(0);
  }
}
