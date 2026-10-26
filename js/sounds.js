// Sonidos sintetizados con Web Audio: no hace falta descargar ningún archivo.

export const ALARMS = {
  bell: { label: 'Campana', length: 1.7 },
  bowl: { label: 'Cuenco', length: 3.2 },
  chime: { label: 'Campanillas', length: 1.6 },
  wood: { label: 'Madera', length: 0.9 },
  digital: { label: 'Digital', length: 1.2 },
  none: { label: 'Sin sonido', length: 0 },
};

function envTone(ctx, dest, { freq, type = 'sine', t, peak, attack = 0.005, decay = 1, detune = 0 }) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  osc.detune.value = detune;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  osc.connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + attack + decay + 0.05);
}

const SYNTHS = {
  bell(ctx, out, t, v) {
    const f = 659.25;
    [[1, 1, 2.4], [2, 0.32, 1.3], [2.76, 0.42, 1.6], [5.4, 0.16, 0.7], [8.93, 0.06, 0.4]].forEach(([r, a, d]) =>
      envTone(ctx, out, { freq: f * r, t, peak: 0.28 * a * v, decay: d })
    );
  },
  bowl(ctx, out, t, v) {
    const f = 196;
    [[1, 1, 5], [2.71, 0.5, 3.6], [5.15, 0.24, 2.2], [8.3, 0.08, 1.2]].forEach(([r, a, d]) => {
      envTone(ctx, out, { freq: f * r, t, peak: 0.24 * a * v, attack: 0.03, decay: d });
      envTone(ctx, out, { freq: f * r + 1.3, t, peak: 0.16 * a * v, attack: 0.03, decay: d * 0.9 });
    });
  },
  chime(ctx, out, t, v) {
    [1046.5, 1318.5, 1568].forEach((f, i) => {
      envTone(ctx, out, { freq: f, t: t + i * 0.16, peak: 0.2 * v, decay: 1.3 });
      envTone(ctx, out, { freq: f * 2, t: t + i * 0.16, peak: 0.05 * v, decay: 0.5 });
    });
  },
  wood(ctx, out, t, v) {
    [0, 0.2].forEach((dt) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(980, t + dt);
      osc.frequency.exponentialRampToValueAtTime(420, t + dt + 0.08);
      g.gain.setValueAtTime(0.0001, t + dt);
      g.gain.exponentialRampToValueAtTime(0.5 * v, t + dt + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.16);
      osc.connect(g).connect(out);
      osc.start(t + dt);
      osc.stop(t + dt + 0.2);
    });
  },
  digital(ctx, out, t, v) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    lp.connect(out);
    [0, 0.14, 0.5, 0.64].forEach((dt) =>
      envTone(ctx, lp, { freq: 1318.5, type: 'square', t: t + dt, peak: 0.09 * v, attack: 0.004, decay: 0.09 })
    );
  },
};

export class Sounds {
  constructor() {
    this.ctx = null;
    this.out = null;
    this.noise = null;
  }

  /** Debe llamarse tras un gesto del usuario (clic o tecla). */
  unlock() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) {
      this.ctx = new AC();
      this.out = this.ctx.createDynamicsCompressor();
      this.out.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  play(name = 'bell', volume = 70, repeat = 1) {
    const synth = SYNTHS[name];
    if (!synth) return;
    this.unlock();
    if (!this.ctx) return;
    const v = Math.max(0, Math.min(1, volume / 100));
    const t0 = this.ctx.currentTime + 0.03;
    const len = ALARMS[name].length;
    for (let i = 0; i < Math.max(1, repeat); i++) synth(this.ctx, this.out, t0 + i * len, v);
  }

  tick(volume = 30) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (!this.noise) {
      const len = Math.floor(this.ctx.sampleRate * 0.02);
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 3200;
    hp.Q.value = 1.4;
    const g = this.ctx.createGain();
    g.gain.value = (volume / 100) * 0.6;
    src.connect(hp).connect(g).connect(this.out);
    src.start();
  }
}
