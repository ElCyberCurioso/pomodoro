// Estado persistente de la app (localStorage) con valores por defecto.
import { clone, deepMerge, getPath, setPath, uid, isObj } from './util.js';
import { parseYouTube } from './youtube.js';

const PREFIX = 'pomodoro.v1.';

export const DEFAULT_SETTINGS = {
  timer: {
    focus: 25,
    short: 5,
    long: 15,
    longEvery: 4,
    autoBreaks: true,
    autoFocus: false,
    dailyGoal: 8,
    wakeLock: false,
  },
  look: {
    theme: 'musgo',
    custom: { focus: '#1F3B33', short: '#24394B', long: '#3A3049', ink: '#EEF0E7', accent: '#E7B76F' },
    backdrop: 'video', // 'video' | 'image' | 'color'
    imageUrl: '',
    shade: 0.78,
    blur: 0,
    timerFont: 'fraunces',
    uiFont: 'hanken',
    clockStyle: 'classic', // 'classic' | 'ring' | 'minimal'
    clockScale: 1,
    showCycle: true,
    autoHide: true,
  },
  music: {
    volume: 60,
    muted: false,
    shuffle: false,
    repeat: 'all', // 'all' | 'one' | 'off'
    breakBehavior: 'duck', // 'keep' | 'duck' | 'pause'
    duckLevel: 35,
    startWithFocus: true,
    pauseWithTimer: true,
    windowCorner: 'left',
    windowSize: 'small',
  },
  sound: {
    alarm: 'bell',
    volume: 70,
    repeat: 2,
    tick: false,
    tickVolume: 30,
    notifications: false,
    tabTitle: true,
  },
};

export function read(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function write(key, value) {
  try {
    if (value === undefined) localStorage.removeItem(PREFIX + key);
    else localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn('[pomodoro] No se pudo guardar', key, err);
    return false;
  }
}

export function readRaw(key) {
  try { return localStorage.getItem(PREFIX + key); } catch { return null; }
}
export function writeRaw(key, value) {
  try {
    if (value == null) localStorage.removeItem(PREFIX + key);
    else localStorage.setItem(PREFIX + key, value);
    return true;
  } catch {
    return false;
  }
}

/** Convierte la lista de config.js en listas con elementos normalizados. */
export function playlistsFromConfig(cfgLists = []) {
  return cfgLists
    .map((list) => ({
      id: uid(),
      name: String(list.name || 'Mi lista'),
      items: (list.items || [])
        .map((it) => {
          const src = typeof it === 'string' ? { url: it } : it;
          const parsed = parseYouTube(src.url || src.id || '');
          if (!parsed) return null;
          return { id: uid(), ...parsed, title: src.title || '', thumb: '' };
        })
        .filter(Boolean),
    }))
    .filter((l) => l.name);
}

export function sanitizePlaylists(lists) {
  if (!Array.isArray(lists)) return null;
  return lists
    .filter((l) => isObj(l) && Array.isArray(l.items))
    .map((l) => ({
      id: l.id || uid(),
      name: String(l.name || 'Mi lista').slice(0, 60),
      items: l.items
        .filter((it) => isObj(it) && typeof it.ytId === 'string' && /^[\w-]{6,64}$/.test(it.ytId))
        .map((it) => ({
          id: it.id || uid(),
          type: it.type === 'list' ? 'list' : 'video',
          ytId: it.ytId,
          start: Number(it.start) || 0,
          title: String(it.title || '').slice(0, 200),
          author: String(it.author || '').slice(0, 120),
          thumb: typeof it.thumb === 'string' && /^https:\/\//.test(it.thumb) ? it.thumb : '',
        })),
    }));
}

/** Pequeño almacén reactivo. */
export function createStore(config = {}) {
  const listeners = new Map();
  const defaults = deepMerge(clone(DEFAULT_SETTINGS), config.settings || {});

  const state = {
    settings: deepMerge(clone(defaults), read('settings', {})),
    playlists: sanitizePlaylists(read('playlists', null)) || playlistsFromConfig(config.playlists),
    activeListId: read('activeListId', null),
    tasks: read('tasks', { items: [], activeId: null }),
    stats: read('stats', { days: {} }),
  };
  if (!state.playlists.length) state.playlists = [{ id: uid(), name: 'Mi lista', items: [] }];
  if (!state.playlists.some((l) => l.id === state.activeListId)) state.activeListId = state.playlists[0].id;
  if (!isObj(state.tasks) || !Array.isArray(state.tasks.items)) state.tasks = { items: [], activeId: null };
  if (!isObj(state.stats) || !isObj(state.stats.days)) state.stats = { days: {} };

  const emit = (evt, detail) => (listeners.get(evt) || []).forEach((fn) => fn(detail));

  return {
    state,
    defaults,
    on(evt, fn) {
      if (!listeners.has(evt)) listeners.set(evt, []);
      listeners.get(evt).push(fn);
    },
    emit,
    get(path) {
      return getPath(state.settings, path);
    },
    set(path, value) {
      setPath(state.settings, path, value);
      write('settings', state.settings);
      emit('settings', { path, value });
    },
    replaceSettings(next) {
      state.settings = deepMerge(clone(defaults), next || {});
      write('settings', state.settings);
      emit('settings', { path: '*' });
    },
    savePlaylists() {
      write('playlists', state.playlists);
      write('activeListId', state.activeListId);
      emit('playlists');
    },
    saveTasks() {
      write('tasks', state.tasks);
      emit('tasks');
    },
    saveStats() {
      write('stats', state.stats);
      emit('stats');
    },
  };
}
