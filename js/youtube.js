// Integración con YouTube: análisis de enlaces, metadatos (oEmbed) y reproductor (IFrame API).

const PRIVATE_LISTS = /^(WL|LL|RD|UL|FL)/; // Ver más tarde, Me gusta, mixes… no se pueden incrustar

function parseStart(value) {
  if (!value) return 0;
  if (/^\d+$/.test(value)) return Number(value);
  const m = String(value).match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m) return 0;
  return (Number(m[1]) || 0) * 3600 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0);
}

/**
 * Acepta enlaces de vídeos, directos, shorts, listas o IDs sueltos.
 * Devuelve { type: 'video' | 'list', ytId, start } o null.
 */
export function parseYouTube(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  if (/^[\w-]{11}$/.test(s)) return { type: 'video', ytId: s, start: 0 };
  if (/^(PL|OL|UU|PU|OLAK5uy_)[\w-]{10,}$/.test(s)) return { type: 'list', ytId: s, start: 0 };

  let url;
  try {
    url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  if (!/^(youtube\.com|youtu\.be|youtube-nocookie\.com)$/.test(host)) return null;

  const path = url.pathname;
  const list = url.searchParams.get('list');
  let v = url.searchParams.get('v');
  if (host === 'youtu.be') v = path.slice(1).split('/')[0];
  const m = path.match(/^\/(?:embed|live|shorts|v)\/([\w-]{11})/);
  if (m) v = m[1];
  const start = parseStart(url.searchParams.get('t') || url.searchParams.get('start'));

  const validList = list && /^[\w-]{10,}$/.test(list) && !PRIVATE_LISTS.test(list);
  if (validList && (path === '/playlist' || path.startsWith('/watch') || host === 'youtu.be')) {
    return { type: 'list', ytId: list, start: 0 };
  }
  if (v && /^[\w-]{11}$/.test(v)) return { type: 'video', ytId: v, start };
  return null;
}

export const watchUrl = (item, videoId) =>
  item?.type === 'list'
    ? `https://www.youtube.com/playlist?list=${item.ytId}`
    : `https://www.youtube.com/watch?v=${videoId || item?.ytId}`;

export const thumbFor = (item, videoId) => {
  if (videoId) return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
  if (!item) return '';
  if (item.thumb) return item.thumb;
  return item.type === 'video' ? `https://i.ytimg.com/vi/${item.ytId}/mqdefault.jpg` : '';
};

/** Título y miniatura vía oEmbed (no necesita clave de API). */
export async function fetchMeta(item) {
  const target = watchUrl(item);
  const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(target)}`);
  if (res.status === 401 || res.status === 403) {
    const err = new Error('embed-disabled');
    err.code = 'embed';
    throw err;
  }
  if (!res.ok) {
    const err = new Error(`oembed-${res.status}`);
    err.code = res.status === 404 || res.status === 400 ? 'missing' : 'network';
    throw err;
  }
  const data = await res.json();
  return { title: data.title || '', author: data.author_name || '', thumb: data.thumbnail_url || '' };
}

/** Carga la mejor imagen de portada disponible para un vídeo. */
export function loadPoster(videoId) {
  return new Promise((resolve) => {
    const tryUrl = (urls) => {
      if (!urls.length) return resolve('');
      const [url, ...rest] = urls;
      const img = new Image();
      img.onload = () => (img.naturalWidth > 120 ? resolve(url) : tryUrl(rest));
      img.onerror = () => tryUrl(rest);
      img.src = url;
    };
    tryUrl([
      `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
      `https://i.ytimg.com/vi/${videoId}/sddefault.jpg`,
      `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    ]);
  });
}

let apiPromise = null;
export function loadYouTubeAPI() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === 'function') prev();
      resolve(window.YT);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => {
      apiPromise = null;
      reject(new Error('No se pudo cargar el reproductor de YouTube'));
    };
    document.head.append(s);
  });
  return apiPromise;
}

export const YT_STATE = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };

export const YT_ERRORS = {
  2: 'El enlace no es válido.',
  5: 'Este vídeo no se puede reproducir en el navegador.',
  100: 'El vídeo no existe o es privado.',
  101: 'El autor no permite reproducir este vídeo fuera de YouTube.',
  150: 'El autor no permite reproducir este vídeo fuera de YouTube.',
  153: 'YouTube no ha recibido el origen de la página. Ábrela desde un servidor (no como archivo local).',
};

export class YTPlayer {
  constructor(elementId, handlers = {}) {
    this.elementId = elementId;
    this.h = handlers;
    this.p = null;
    this.ready = false;
  }

  async init() {
    const YT = await loadYouTubeAPI();
    return new Promise((resolve) => {
      const playerVars = {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        fs: 0,
        iv_load_policy: 3,
        playsinline: 1,
        rel: 0,
      };
      if (location.origin && location.origin !== 'null') playerVars.origin = location.origin;
      this.p = new YT.Player(this.elementId, {
        width: '100%',
        height: '100%',
        playerVars,
        events: {
          onReady: () => {
            this.ready = true;
            resolve(this);
            this.h.onReady?.();
          },
          onStateChange: (e) => this.h.onState?.(e.data),
          onError: (e) => this.h.onError?.(e.data),
        },
      });
    });
  }

  call(method, ...args) {
    if (!this.ready || typeof this.p?.[method] !== 'function') return undefined;
    try {
      return this.p[method](...args);
    } catch (err) {
      console.warn('[pomodoro] YouTube', method, err);
      return undefined;
    }
  }

  load(item, autoplay = false) {
    if (!item) return;
    if (item.type === 'list') {
      const opts = { list: item.ytId, listType: 'playlist', index: 0, startSeconds: item.start || 0 };
      this.call(autoplay ? 'loadPlaylist' : 'cuePlaylist', opts);
    } else {
      const opts = { videoId: item.ytId, startSeconds: item.start || 0 };
      this.call(autoplay ? 'loadVideoById' : 'cueVideoById', opts);
    }
  }

  play() { this.call('playVideo'); }
  pause() { this.call('pauseVideo'); }
  stop() { this.call('stopVideo'); }
  seek(s) { this.call('seekTo', s, true); }
  state() { return this.call('getPlayerState') ?? YT_STATE.UNSTARTED; }
  setVolume(v) { this.call('setVolume', Math.round(v)); }
  getVolume() { return this.call('getVolume') ?? 0; }
  setMuted(m) { this.call(m ? 'mute' : 'unMute'); }
  nextInList() { this.call('nextVideo'); }
  prevInList() { this.call('previousVideo'); }
  listIndex() { return this.call('getPlaylistIndex') ?? -1; }
  listLength() { return (this.call('getPlaylist') || []).length; }
  setLoop(b) { this.call('setLoop', b); }
  setShuffle(b) { this.call('setShuffle', b); }
  videoData() { return this.call('getVideoData') || {}; }
}
