// Motor del temporizador. Usa marcas de tiempo absolutas (no resta segundos),
// así sigue siendo exacto aunque el navegador ralentice la pestaña en segundo plano.

export const MODES = ['focus', 'short', 'long'];

export const MODE_LABEL = {
  focus: 'Concentración',
  short: 'Pausa corta',
  long: 'Pausa larga',
};

export class Timer extends EventTarget {
  constructor({ getMinutes, getLongEvery }) {
    super();
    this.getMinutes = getMinutes;
    this.getLongEvery = getLongEvery;
    this.mode = 'focus';
    this.status = 'idle'; // 'idle' | 'running' | 'paused'
    this.duration = this.durationFor('focus');
    this.remainingAtPause = this.duration;
    this.endAt = 0;
    this.completedInSet = 0;
    this.initTicker();
  }

  durationFor(mode) {
    return Math.max(1000, Math.round(this.getMinutes(mode) * 60000));
  }

  get remaining() {
    return this.status === 'running' ? Math.max(0, this.endAt - Date.now()) : this.remainingAtPause;
  }

  get progress() {
    return this.duration ? Math.min(1, Math.max(0, 1 - this.remaining / this.duration)) : 0;
  }

  get elapsed() {
    return this.duration - this.remaining;
  }

  start() {
    if (this.status === 'running') return;
    const reason = this.status === 'paused' ? 'resume' : 'start';
    if (this.remainingAtPause <= 0) this.remainingAtPause = this.duration;
    this.endAt = Date.now() + this.remainingAtPause;
    this.status = 'running';
    this.startTicker();
    this.emit('change', { reason });
    this.tick();
  }

  pause() {
    if (this.status !== 'running') return;
    this.remainingAtPause = Math.max(0, this.endAt - Date.now());
    this.status = 'paused';
    this.stopTicker();
    this.emit('change', { reason: 'pause' });
    this.emitTick();
  }

  toggle() {
    if (this.status === 'running') this.pause();
    else this.start();
  }

  reset() {
    this.stopTicker();
    this.status = 'idle';
    this.duration = this.durationFor(this.mode);
    this.remainingAtPause = this.duration;
    this.emit('change', { reason: 'reset' });
    this.emitTick();
  }

  setMode(mode, cause = 'manual') {
    if (!MODES.includes(mode)) return;
    this.stopTicker();
    const prevMode = this.mode;
    this.mode = mode;
    this.status = 'idle';
    this.duration = this.durationFor(mode);
    this.remainingAtPause = this.duration;
    this.emit('change', { reason: 'mode', prevMode, cause });
    this.emitTick();
  }

  /** Pasa a la siguiente fase sin contarla como completada. */
  skip() {
    let next;
    if (this.mode === 'focus') next = this.completedInSet >= this.getLongEvery() ? 'long' : 'short';
    else {
      if (this.mode === 'long') this.completedInSet = 0;
      next = 'focus';
    }
    this.setMode(next, 'skip');
  }

  addTime(ms) {
    if (this.status === 'running') this.endAt += ms;
    else this.remainingAtPause += ms;
    this.duration += ms;
    this.emitTick();
  }

  /** Recalcula la duración si cambian los ajustes y el temporizador no está en marcha. */
  refreshDuration() {
    if (this.status !== 'idle') return;
    this.duration = this.durationFor(this.mode);
    this.remainingAtPause = this.duration;
    this.emitTick();
  }

  complete({ restored = false } = {}) {
    this.stopTicker();
    const finished = this.mode;
    const duration = this.duration;
    let next;
    if (finished === 'focus') {
      this.completedInSet += 1;
      next = this.completedInSet >= this.getLongEvery() ? 'long' : 'short';
    } else {
      if (finished === 'long') this.completedInSet = 0;
      next = 'focus';
    }
    this.status = 'idle';
    this.remainingAtPause = 0;
    this.emit('complete', { finished, duration, next, restored });
    this.setMode(next, 'auto');
  }

  tick() {
    if (this.status !== 'running') return;
    this.emitTick();
    if (this.remaining <= 0) this.complete();
  }

  emitTick() {
    this.emit('tick', { remaining: this.remaining, duration: this.duration, progress: this.progress });
  }

  emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail: { ...detail, mode: this.mode, status: this.status } }));
  }

  // Un Web Worker marca el ritmo: los navegadores no lo ralentizan tanto como a setInterval.
  initTicker() {
    try {
      const src = 'let t=null;onmessage=e=>{clearInterval(t);t=null;if(e.data>0)t=setInterval(()=>postMessage(0),e.data)}';
      this.worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      this.worker.onmessage = () => this.tick();
    } catch {
      this.worker = null;
    }
  }
  startTicker() {
    if (this.worker) this.worker.postMessage(250);
    else {
      clearInterval(this.interval);
      this.interval = setInterval(() => this.tick(), 250);
    }
  }
  stopTicker() {
    this.worker?.postMessage(0);
    clearInterval(this.interval);
  }

  serialize() {
    return {
      mode: this.mode,
      status: this.status,
      endAt: this.endAt,
      remaining: this.remainingAtPause,
      duration: this.duration,
      completedInSet: this.completedInSet,
    };
  }

  restore(s) {
    if (!s || !MODES.includes(s.mode)) return;
    this.mode = s.mode;
    this.completedInSet = Math.max(0, s.completedInSet | 0);
    if (s.status === 'running' && s.endAt) {
      this.duration = s.duration || this.durationFor(this.mode);
      if (s.endAt > Date.now()) {
        this.status = 'running';
        this.endAt = s.endAt;
        this.startTicker();
        this.emit('change', { reason: 'restore' });
      } else {
        this.status = 'running';
        this.endAt = s.endAt;
        this.complete({ restored: true });
        return;
      }
    } else if (s.status === 'paused' && s.remaining > 0) {
      this.status = 'paused';
      this.duration = s.duration || this.durationFor(this.mode);
      this.remainingAtPause = Math.min(s.remaining, this.duration);
      this.emit('change', { reason: 'restore' });
    } else {
      this.status = 'idle';
      this.duration = this.durationFor(this.mode);
      this.remainingAtPause = this.duration;
      this.emit('change', { reason: 'restore' });
    }
    this.emitTick();
  }
}
