// Punto de entrada: une temporizador, música, tareas, estadísticas y ajustes.
import { $, $$, h, icon, formatClock, fromBase64Url } from './util.js';
import { createStore, read, write, readRaw, sanitizePlaylists } from './store.js';
import { Timer, MODE_LABEL } from './timer.js';
import { Sounds } from './sounds.js';
import { applyLook, resolveTheme, TIMER_FONTS } from './themes.js';
import { createMusic } from './music.js';
import { createTasks, bindStepper } from './tasks.js';
import { createStats } from './stats.js';
import { createSettings } from './settings.js';

const config = window.POMODORO_CONFIG || {};
const appName = config.appName || 'Pomodoro';
const store = createStore(config);
const S = store.state;
const sounds = new Sounds();
const timer = new Timer({
  getMinutes: (mode) => S.settings.timer[mode],
  getLongEvery: () => S.settings.timer.longEvery,
});

const body = document.body;
const root = document.documentElement;
const els = {
  time: $('#time'),
  clock: $('#clock'),
  ring: $('#ringFill'),
  progress: $('#progressFill'),
  cycle: $('#cycle'),
  start: $('#startBtn'),
  startLabel: $('#startLabel'),
  reset: $('#resetBtn'),
  skip: $('#skipBtn'),
  modes: $$('.mode'),
  scrim: $('#scrim'),
  toasts: $('#toasts'),
  dialog: $('#dialog'),
  announcer: $('#announcer'),
  backdropImage: $('#backdropImage'),
  stage: $('#videoStage'),
  favicon: $('#favicon'),
  themeColor: document.querySelector('meta[name="theme-color"]'),
  zen: $('#zenBtn'),
  fullscreen: $('#fullscreenBtn'),
  pip: $('#pipBtn'),
};

// ---------- Avisos y diálogos ----------
function toast(message, { action, onAction, duration = 4200 } = {}) {
  const el = h('div', { class: 'toast', role: 'status' }, h('span', {}, message));
  const dismiss = () => {
    if (!el.isConnected) return;
    el.classList.add('out');
    setTimeout(() => el.remove(), 260);
  };
  if (action) el.append(h('button', { type: 'button', onclick: () => { onAction?.(); dismiss(); } }, action));
  els.toasts.append(el);
  while (els.toasts.children.length > 3) els.toasts.firstElementChild.remove();
  setTimeout(dismiss, action ? duration + 2000 : duration);
}

function confirmDialog({ title, text, ok = 'Aceptar', cancel = 'Cancelar' }) {
  return new Promise((resolve) => {
    $('#dialogTitle').textContent = title;
    $('#dialogText').textContent = text;
    $('#dialogOk').textContent = ok;
    $('#dialogCancel').textContent = cancel;
    els.dialog.returnValue = '';
    els.dialog.addEventListener('close', () => resolve(els.dialog.returnValue === 'ok'), { once: true });
    els.dialog.showModal();
    $('#dialogOk').focus();
  });
}

function announce(text) {
  els.announcer.textContent = '';
  setTimeout(() => (els.announcer.textContent = text), 50);
}

// ---------- Paneles ----------
let openId = null;
let lastFocus = null;
function openSheet(id, section) {
  if (openId === id && !section) return closeSheet();
  if (openId) closeSheet(false);
  const el = $(`#sheet-${id}`);
  if (!el) return;
  lastFocus = document.activeElement;
  if (id === 'stats') stats.render();
  if (id === 'tasks') tasks.render();
  if (id === 'music') music.renderSheet();
  if (id === 'settings') settingsUI.open(section);
  el.inert = false;
  el.classList.add('is-open');
  els.scrim.classList.add('is-open');
  openId = id;
  $$(`[data-open="${id}"]`).forEach((b) => b.setAttribute('aria-expanded', 'true'));
  body.classList.remove('is-idle');
  setTimeout(() => el.querySelector('[data-close]')?.focus({ preventScroll: true }), 60);
}
function closeSheet(restoreFocus = true) {
  if (!openId) return;
  const el = $(`#sheet-${openId}`);
  el.classList.remove('is-open');
  el.inert = true;
  els.scrim.classList.remove('is-open');
  $$(`[data-open="${openId}"]`).forEach((b) => b.setAttribute('aria-expanded', 'false'));
  openId = null;
  if (restoreFocus && lastFocus?.isConnected) lastFocus.focus({ preventScroll: true });
  bumpActivity();
}

// ---------- App compartida ----------
const app = {
  store,
  sounds,
  timer,
  toast,
  confirm: confirmDialog,
  announce,
  openSheet,
  closeSheet,
  applyBackdrop,
  toggleVideoLayout,
  importBackup,
  onMusicRender: () => {},
};
const music = createMusic(app);
const tasks = createTasks(app);
const stats = createStats(app);
const settingsUI = createSettings(app);
app.music = music;
app.tasks = tasks;
app.stats = stats;

// ---------- Reloj ----------
let lastTimeStr = '';
let lastSecond = -1;
function renderClock() {
  const remaining = timer.remaining;
  const str = formatClock(remaining);
  if (str !== lastTimeStr) {
    lastTimeStr = str;
    els.time.classList.toggle('has-hours', str.length > 5);
    els.time.innerHTML = [...str]
      .map((c) => (c === ':' ? '<span class="sep">:</span>' : `<span class="dg">${c}</span>`))
      .join('');
    const [m, s] = str.split(':').slice(-2).map(Number);
    els.time.setAttribute('aria-label', `${MODE_LABEL[timer.mode]}: quedan ${m} minutos y ${s} segundos`);
    updateTitle(str);
    updatePip(str);
  }
  const p = timer.progress;
  els.progress.style.transform = `scaleX(${p})`;
  els.ring.style.strokeDashoffset = String(1000 * (1 - p));
  els.ring.style.opacity = p > 0.001 ? '1' : '0';

  // Tictac una vez por segundo durante la concentración
  const sec = Math.ceil(remaining / 1000);
  if (sec !== lastSecond) {
    lastSecond = sec;
    if (timer.status === 'running' && timer.mode === 'focus' && S.settings.sound.tick) sounds.tick(S.settings.sound.tickVolume);
    maybeDrawFavicon();
  }
}

function updateTitle(str = formatClock(timer.remaining)) {
  if (S.settings.sound.tabTitle && timer.status !== 'idle') {
    document.title = `${timer.status === 'paused' ? '⏸ ' : ''}${str} – ${MODE_LABEL[timer.mode]}`;
  } else {
    document.title = appName;
  }
}

function renderControls() {
  const { mode, status } = timer;
  body.dataset.phase = mode;
  body.dataset.status = status;
  els.startLabel.textContent = status === 'running' ? 'Pausar' : status === 'paused' ? 'Continuar' : 'Empezar';
  els.start.setAttribute('aria-label', `${els.startLabel.textContent} (Espacio)`);
  els.modes.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));

  // Serie de pomodoros
  const n = Math.min(12, S.settings.timer.longEvery);
  const done = mode === 'long' ? n : Math.min(timer.completedInSet, n);
  els.cycle.hidden = !S.settings.look.showCycle;
  els.cycle.replaceChildren(
    ...Array.from({ length: n }, (_, i) =>
      h('li', { class: i < done ? 'done' : i === done && mode === 'focus' ? 'current' : '' }))
  );
  els.cycle.setAttribute('aria-label', `${done} de ${n} pomodoros de la serie`);

  const theme = resolveTheme(S.settings.look);
  els.themeColor?.setAttribute('content', theme[mode]);
  updateTitle();
  drawFavicon();
  tasks.renderPill();
}

// Ancho fijo por cifra para que el reloj no "baile"
async function measureDigits() {
  const tf = TIMER_FONTS[S.settings.look.timerFont] || TIMER_FONTS.fraunces;
  try {
    if (tf.query) await document.fonts.load(`${tf.weight} 100px ${tf.family}`, '0123456789');
  } catch { /* sin conexión: se usa la fuente de reserva */ }
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;left:-9999px';
  els.time.append(probe);
  let max = 0;
  for (const d of '0123456789') {
    probe.textContent = d;
    max = Math.max(max, probe.getBoundingClientRect().width);
  }
  const fs = parseFloat(getComputedStyle(els.time).fontSize);
  probe.remove();
  if (max && fs) root.style.setProperty('--digit-w', `${(max / fs + 0.01).toFixed(3)}em`);
}

// ---------- Apariencia ----------
function applyAppearance() {
  const look = S.settings.look;
  applyLook(look);
  els.clock.dataset.style = look.clockStyle;
  applyBackdrop();
  renderControls();
  measureDigits();
}

function applyBackdrop() {
  const look = S.settings.look;
  els.stage.dataset.layout = look.backdrop === 'video' ? 'background' : 'window';
  let img = '';
  if (look.backdrop === 'image') img = look.imageUrl === 'local' ? readRaw('bgimage') || '' : look.imageUrl;
  els.backdropImage.style.backgroundImage = img ? `url("${img.replace(/"/g, '%22')}")` : 'none';
  body.classList.toggle('has-image', !!img);
  music.render();
}

function toggleVideoLayout() {
  const look = S.settings.look;
  if (look.backdrop === 'video') {
    store.set('look.backdrop', look.prevBackdrop && look.prevBackdrop !== 'video' ? look.prevBackdrop : 'color');
  } else {
    store.set('look.prevBackdrop', look.backdrop);
    store.set('look.backdrop', 'video');
  }
}

// ---------- Favicon dinámico ----------
const favCanvas = document.createElement('canvas');
favCanvas.width = favCanvas.height = 64;
const staticFavicon = els.favicon.href;
let lastFavKey = '';
function maybeDrawFavicon() {
  const key = `${timer.mode}${timer.status}${Math.floor(timer.progress * 40)}`;
  if (key !== lastFavKey) drawFavicon();
}
function drawFavicon() {
  lastFavKey = `${timer.mode}${timer.status}${Math.floor(timer.progress * 40)}`;
  if (timer.status === 'idle') {
    els.favicon.type = 'image/svg+xml';
    els.favicon.href = staticFavicon;
    return;
  }
  const t = resolveTheme(S.settings.look);
  const ctx = favCanvas.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);
  ctx.fillStyle = t[timer.mode];
  ctx.beginPath();
  ctx.arc(32, 32, 31, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.strokeStyle = `${t.ink}40`;
  ctx.beginPath();
  ctx.arc(32, 32, 20, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = t.accent;
  ctx.beginPath();
  ctx.arc(32, 32, 20, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.02, timer.progress));
  ctx.stroke();
  if (timer.status === 'paused') {
    ctx.fillStyle = t.ink;
    ctx.fillRect(25, 23, 5, 18);
    ctx.fillRect(34, 23, 5, 18);
  }
  els.favicon.type = 'image/png';
  els.favicon.href = favCanvas.toDataURL('image/png');
}

// ---------- Eventos del temporizador ----------
let pendingAuto = false;

timer.addEventListener('tick', renderClock);

timer.addEventListener('change', (e) => {
  const { reason, cause, mode } = e.detail;
  write('timer', timer.serialize());
  renderControls();
  renderClock();
  if (reason === 'start' || reason === 'resume') music.onTimerStart(mode, reason);
  if (reason === 'pause') music.onTimerPause();
  if (reason === 'mode') {
    music.onPhase(mode);
    if (cause === 'auto' && pendingAuto) {
      pendingAuto = false;
      const t = S.settings.timer;
      if ((mode === 'focus' && t.autoFocus) || (mode !== 'focus' && t.autoBreaks)) {
        setTimeout(() => timer.start(), 600);
      } else if (mode === 'focus') {
        toast('Pausa terminada. ¿Seguimos?', { action: 'Empezar', onAction: () => { sounds.unlock(); timer.start(); } });
      }
    }
  }
  syncWakeLock();
  bumpActivity();
});

timer.addEventListener('complete', (e) => {
  const { finished, duration, next, restored } = e.detail;
  if (finished === 'focus') {
    stats.record(duration / 60000);
    tasks.incrementActive();
  }
  pendingAuto = !restored;
  if (restored) return;
  const snd = S.settings.sound;
  sounds.play(snd.alarm, snd.volume, snd.repeat);
  const msg = finished === 'focus'
    ? `Pomodoro completado. Toca ${next === 'long' ? 'una pausa larga' : 'una pausa corta'}.`
    : 'Pausa terminada. Hora de concentrarse.';
  announce(msg);
  if (finished === 'focus') {
    const goal = S.settings.timer.dailyGoal;
    const count = stats.todayCount();
    toast(goal && count === goal ? `Objetivo cumplido: ${goal} pomodoros hoy.` : msg);
  }
  notify(finished, next);
});

async function notify(finished, next) {
  if (!S.settings.sound.notifications || !('Notification' in window) || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible' && document.hasFocus()) return;
  const title = finished === 'focus' ? 'Pomodoro completado' : 'Pausa terminada';
  const text = finished === 'focus'
    ? `Toca ${next === 'long' ? 'una pausa larga' : 'una pausa corta'}.`
    : 'Hora de volver a concentrarte.';
  const opts = { body: text, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'pomodoro', renotify: true, silent: true };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) return void reg.showNotification(title, opts);
  } catch { /* sigue con la API normal */ }
  try { new Notification(title, opts); } catch { /* sin soporte */ }
}

// ---------- Controles ----------
els.start.addEventListener('click', () => {
  sounds.unlock();
  timer.toggle();
});
els.reset.addEventListener('click', () => timer.reset());
els.skip.addEventListener('click', () => {
  const wasFocus = timer.mode === 'focus' && timer.status !== 'idle';
  timer.skip();
  if (wasFocus) toast('Pomodoro saltado: no cuenta en tus estadísticas.');
});
els.modes.forEach((b) => b.addEventListener('click', () => switchMode(b.dataset.mode)));

async function switchMode(mode) {
  if (mode === timer.mode) return;
  if (timer.status !== 'idle' && timer.elapsed > 60000) {
    const ok = await confirmDialog({
      title: 'Cambiar de fase',
      text: 'El tiempo de la sesión actual se perderá.',
      ok: 'Cambiar',
    });
    if (!ok) return;
  }
  timer.setMode(mode);
}

$$('[data-open]').forEach((b) => b.addEventListener('click', () => openSheet(b.dataset.open)));
$$('[data-close]').forEach((b) => b.addEventListener('click', () => closeSheet()));
els.scrim.addEventListener('click', () => closeSheet());
bindStepper($('#taskForm [data-stepper]'));

// ---------- Inactividad, modo sin distracciones y pantalla completa ----------
let idleTimer = null;
const canIdle = () => S.settings.look.autoHide && timer.status === 'running' && !openId && !els.dialog.open;
function bumpActivity() {
  body.classList.remove('is-idle');
  clearTimeout(idleTimer);
  if (canIdle()) idleTimer = setTimeout(() => canIdle() && body.classList.add('is-idle'), 3500);
}
['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) =>
  window.addEventListener(ev, bumpActivity, { passive: true }));

function toggleZen(force) {
  const on = force ?? !body.classList.contains('is-zen');
  body.classList.toggle('is-zen', on);
  els.zen.setAttribute('aria-pressed', String(on));
  if (on) toast('Modo sin distracciones. Pulsa Z o Esc para salir.', { duration: 2600 });
}
els.zen.addEventListener('click', () => toggleZen());

function toggleFullscreen() {
  if (!document.fullscreenEnabled) return;
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
}
els.fullscreen.addEventListener('click', toggleFullscreen);
if (!document.fullscreenEnabled) els.fullscreen.hidden = true;
document.addEventListener('fullscreenchange', () => {
  const on = !!document.fullscreenElement;
  els.fullscreen.replaceChildren(icon(on ? 'shrink' : 'expand'));
  els.fullscreen.setAttribute('aria-label', on ? 'Salir de pantalla completa' : 'Pantalla completa');
});

// ---------- Temporizador flotante (Document Picture-in-Picture) ----------
let pipWin = null;
if ('documentPictureInPicture' in window) {
  els.pip.hidden = false;
  els.pip.addEventListener('click', togglePip);
}
async function togglePip() {
  if (pipWin) {
    pipWin.close();
    return;
  }
  try {
    pipWin = await window.documentPictureInPicture.requestWindow({ width: 300, height: 180 });
  } catch {
    return;
  }
  const doc = pipWin.document;
  $$('link[rel="stylesheet"]').forEach((l) => doc.head.append(l.cloneNode()));
  doc.documentElement.setAttribute('style', root.getAttribute('style') || '');
  doc.documentElement.dataset.scheme = root.dataset.scheme;
  doc.body.className = 'pip-body';
  doc.body.dataset.phase = timer.mode;
  doc.body.append(
    document.querySelector('body > svg').cloneNode(true),
    h('div', { class: 'pip-phase' }),
    h('div', { class: 'pip-time' }),
    h('div', { class: 'pip-controls' },
      h('button', { class: 'round-btn', type: 'button', 'data-act': 'toggle', 'aria-label': 'Empezar o pausar' }),
      h('button', { class: 'round-btn', type: 'button', 'data-act': 'skip', 'aria-label': 'Saltar fase' }, icon('skip'))));
  doc.body.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'toggle') { sounds.unlock(); timer.toggle(); }
    if (act === 'skip') timer.skip();
  });
  pipWin.addEventListener('pagehide', () => { pipWin = null; });
  updatePip(formatClock(timer.remaining));
}
function updatePip(str) {
  if (!pipWin) return;
  const doc = pipWin.document;
  doc.body.dataset.phase = timer.mode;
  doc.documentElement.setAttribute('style', root.getAttribute('style') || '');
  doc.querySelector('.pip-time').textContent = str;
  doc.querySelector('.pip-phase').textContent = MODE_LABEL[timer.mode];
  const btn = doc.querySelector('[data-act="toggle"]');
  const want = timer.status === 'running' ? 'pause' : 'play';
  if (btn.dataset.icon !== want) {
    btn.dataset.icon = want;
    btn.replaceChildren(icon(want));
  }
}

// ---------- Pantalla siempre encendida ----------
let wakeLock = null;
async function syncWakeLock() {
  const want = S.settings.timer.wakeLock && timer.status === 'running' && document.visibilityState === 'visible';
  if (want && !wakeLock && 'wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch { wakeLock = null; }
  } else if (!want && wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}
document.addEventListener('visibilitychange', () => {
  timer.tick();
  syncWakeLock();
});

// ---------- Teclado ----------
document.addEventListener('keydown', (e) => {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target;
  if (t.closest?.('input, textarea, select, [contenteditable="true"]')) {
    if (e.key === 'Escape') t.blur();
    return;
  }
  if (els.dialog.open) return;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const onControl = t !== body && t.closest?.('button, a, [tabindex], [role="switch"]');
  if ((key === ' ' || key === 'Enter') && onControl) return;

  const actions = {
    ' ': () => { sounds.unlock(); timer.toggle(); },
    r: () => timer.reset(),
    s: () => els.skip.click(),
    1: () => switchMode('focus'),
    2: () => switchMode('short'),
    3: () => switchMode('long'),
    k: () => music.toggle(),
    n: () => music.next(),
    b: () => music.prev(),
    m: () => music.toggleMute(),
    v: () => toggleVideoLayout(),
    t: () => openSheet('tasks'),
    y: () => openSheet('music'),
    e: () => openSheet('stats'),
    ',': () => openSheet('settings'),
    '?': () => openSheet('settings', 'keys'),
    z: () => toggleZen(),
    f: () => toggleFullscreen(),
    Escape: () => {
      if (openId) closeSheet();
      else if (body.classList.contains('is-zen')) toggleZen(false);
    },
  };
  const fn = actions[key];
  if (fn) {
    e.preventDefault();
    fn();
  }
});

// ---------- Ajustes ----------
store.on('settings', ({ path }) => {
  const all = path === '*';
  if (all || path.startsWith('look')) applyAppearance();
  if (all || path.startsWith('timer')) {
    timer.refreshDuration();
    renderControls();
    tasks.render();
  }
  if (all || path.startsWith('music')) music.applySettings(path);
  if (all || path === 'timer.wakeLock') syncWakeLock();
  if (all || path.startsWith('sound')) updateTitle();
  settingsUI.sync();
  bumpActivity();
});

function importBackup(data) {
  if (data.settings) store.replaceSettings(data.settings);
  const lists = sanitizePlaylists(data.playlists);
  if (lists?.length) music.resetToConfig(lists);
  if (data.tasks?.items) {
    S.tasks = { items: data.tasks.items, activeId: data.tasks.activeId || null };
    store.saveTasks();
    tasks.render();
  }
  if (data.stats?.days) {
    S.stats = { days: data.stats.days };
    store.saveStats();
  }
}

// ---------- Listas compartidas por enlace ----------
function checkSharedList() {
  const m = location.hash.match(/^#lista=([\w-]+)/);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  try {
    const data = JSON.parse(fromBase64Url(m[1]));
    const items = (data.i || []).map(([t, ytId, title, start]) => ({ type: t === 'l' ? 'list' : 'video', ytId, title, start }));
    const [list] = sanitizePlaylists([{ name: data.n || 'Lista compartida', items }]);
    if (!list?.items.length) throw new Error('vacía');
    confirmDialog({
      title: 'Lista compartida',
      text: `¿Añadir «${list.name}» (${list.items.length} ${list.items.length === 1 ? 'elemento' : 'elementos'}) a tus listas de música?`,
      ok: 'Añadir',
    }).then((ok) => ok && music.importList(list));
  } catch {
    toast('El enlace de la lista no es válido.');
  }
}

// ---------- Arranque ----------
$('#brandName').textContent = appName;
document.title = appName;
applyAppearance();
timer.restore(read('timer', null));
renderControls();
renderClock();
tasks.render();
music.init();
checkSharedList();
document.fonts?.addEventListener?.('loadingdone', measureDigits);

if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

if (location.protocol === 'file:') {
  toast('Abre la app desde un servidor (por ejemplo GitHub Pages) para que YouTube funcione.', { duration: 9000 });
}
