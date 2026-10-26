// Música: listas de YouTube, cola de reproducción, reproductor y su sincronía con el temporizador.
import { $, h, icon, uid, toBase64Url } from './util.js';
import { read, write } from './store.js';
import {
  YTPlayer, YT_STATE, YT_ERRORS, parseYouTube, fetchMeta, thumbFor, watchUrl, loadPoster,
} from './youtube.js';

const REPEAT_LABEL = { all: 'Repetir lista', one: 'Repetir uno', off: 'Sin repetir' };
const REPEAT_NEXT = { all: 'one', one: 'off', off: 'all' };

export function createMusic(app) {
  const { store, toast, confirm } = app;
  const S = store.state;
  const cfg = () => S.settings.music;

  const els = {
    stage: $('#videoStage'),
    poster: $('#videoPoster'),
    windowPlay: $('#windowPlay'),
    windowOpen: $('#windowOpen'),
    windowToBackdrop: $('#windowToBackdrop'),
    dockThumb: $('#dockThumb'),
    dockTitle: $('#dockTitle'),
    dockSub: $('#dockSub'),
    playBtn: $('#playBtn'),
    prevBtn: $('#prevBtn'),
    nextBtn: $('#nextBtn'),
    muteBtn: $('#muteBtn'),
    volume: $('#volume'),
    layoutBtn: $('#layoutBtn'),
    tabs: $('#listTabs'),
    listName: $('#listName'),
    deleteList: $('#deleteList'),
    shareList: $('#shareList'),
    addForm: $('#addForm'),
    addInput: $('#addInput'),
    trackList: $('#trackList'),
    shuffleBtn: $('#shuffleBtn'),
    repeatBtn: $('#repeatBtn'),
    repeatLabel: $('#repeatLabel'),
  };

  let player = null;
  let ready = false;
  let apiFailed = false;
  let current = read('current', null); // { listId, itemId }
  let loadedId = null; // id del elemento cargado en el reproductor
  let ytState = YT_STATE.UNSTARTED;
  let wantPlay = false;
  let ducked = false;
  let pausedByTimer = false;
  let pausedByBreak = false;
  let errorStreak = 0;
  let fadeTimer = null;
  let videoId = null;
  let videoTitle = '';
  let posterFor = null;
  let pendingListOpts = false;

  // ---------- Consultas ----------
  const activeList = () => S.playlists.find((l) => l.id === S.activeListId) || S.playlists[0];
  function cur() {
    if (!current) return {};
    const list = S.playlists.find((l) => l.id === current.listId);
    const item = list?.items.find((i) => i.id === current.itemId);
    return item ? { list, item } : {};
  }
  const queueList = () => cur().list || activeList();
  const isPlaying = () => ytState === YT_STATE.PLAYING || (ytState === YT_STATE.BUFFERING && wantPlay);
  const effectiveVolume = () => Math.round(cfg().volume * (ducked ? cfg().duckLevel / 100 : 1));

  // ---------- Reproductor ----------
  async function init() {
    restoreCurrent();
    render();
    renderSheet();
    enrichMissing();
    player = new YTPlayer('ytPlayer', { onReady, onState, onError });
    try {
      await player.init();
    } catch (err) {
      apiFailed = true;
      console.warn(err);
      render();
    }
  }

  function restoreCurrent() {
    if (!cur().item) {
      const list = activeList();
      current = list?.items[0] ? { listId: list.id, itemId: list.items[0].id } : null;
    }
  }

  function onReady() {
    ready = true;
    applyVolume();
    player.setMuted(cfg().muted);
    const { item } = cur();
    if (item) {
      load(item, wantPlay);
    }
    render();
  }

  function load(item, autoplay) {
    loadedId = item.id;
    videoId = item.type === 'video' ? item.ytId : null;
    videoTitle = '';
    pendingListOpts = item.type === 'list';
    if (ready) {
      player.load(item, autoplay);
      if (item.type === 'video') player.setLoop(false);
    }
    if (autoplay) wantPlay = true;
    updatePoster();
  }

  function select(list, item, autoplay = true) {
    current = { listId: list.id, itemId: item.id };
    write('current', current);
    load(item, autoplay);
    render();
    renderTracks();
  }

  function onState(state) {
    ytState = state;
    const { item } = cur();
    if (state === YT_STATE.PLAYING) {
      errorStreak = 0;
      if (item?.error) item.error = '';
    }
    if ((state === YT_STATE.PLAYING || state === YT_STATE.CUED) && pendingListOpts) {
      pendingListOpts = false;
      player.setShuffle(cfg().shuffle);
      player.setLoop(cfg().repeat === 'one');
    }
    const vd = player.videoData();
    if (vd.video_id && vd.video_id !== videoId) {
      videoId = vd.video_id;
      updatePoster();
    }
    if (vd.title) {
      videoTitle = vd.title;
      if (item && !item.title && item.type === 'video') {
        item.title = vd.title;
        store.savePlaylists();
        renderTracks();
      }
    }
    if (state === YT_STATE.ENDED) handleEnded();
    render();
  }

  function onError(code) {
    const { item } = cur();
    if (item) item.error = String(code);
    errorStreak += 1;
    const list = queueList();
    toast(YT_ERRORS[code] || 'No se ha podido reproducir este vídeo.');
    render();
    renderTracks();
    if (wantPlay && list && list.items.length > 1 && errorStreak < list.items.length) {
      setTimeout(() => next({ auto: true }), 1400);
    }
  }

  function handleEnded() {
    const { item } = cur();
    if (!item) return;
    if (cfg().repeat === 'one' && item.type === 'video') {
      player.seek(item.start || 0);
      player.play();
      return;
    }
    if (item.type === 'list') {
      const idx = player.listIndex();
      const len = player.listLength();
      if (len && idx > -1 && idx < len - 1) return; // YouTube sigue con el siguiente vídeo de la lista
    }
    next({ auto: true });
  }

  function updatePoster() {
    const id = videoId || (cur().item?.type === 'video' ? cur().item.ytId : null);
    if (!id) {
      const thumb = cur().item?.thumb;
      els.poster.style.backgroundImage = thumb ? `url("${thumb}")` : '';
      posterFor = null;
      return;
    }
    if (id === posterFor) return;
    posterFor = id;
    els.poster.style.backgroundImage = `url("https://i.ytimg.com/vi/${id}/mqdefault.jpg")`;
    loadPoster(id).then((url) => {
      if (url && posterFor === id) els.poster.style.backgroundImage = `url("${url}")`;
    });
  }

  // ---------- Controles ----------
  function play() {
    pausedByTimer = false;
    pausedByBreak = false;
    app.sounds.unlock();
    const { list, item } = cur();
    if (!item) {
      const l = activeList();
      if (!l?.items.length) {
        app.openSheet('music');
        toast('Añade un vídeo de YouTube para empezar.');
        return;
      }
      select(l, l.items[0], true);
      return;
    }
    wantPlay = true;
    if (!ready) {
      if (apiFailed) toast('No se ha podido cargar YouTube. Revisa tu conexión.');
      render();
      return;
    }
    if (loadedId !== item.id || ytState === YT_STATE.UNSTARTED && item.error) {
      select(list, item, true);
      return;
    }
    applyVolume();
    player.play();
    render();
  }

  function pause() {
    wantPlay = false;
    pausedByTimer = false;
    pausedByBreak = false;
    player?.pause();
    render();
  }

  const toggle = () => (isPlaying() || (wantPlay && ytState === YT_STATE.BUFFERING) ? pause() : play());

  function next({ auto = false } = {}) {
    const list = queueList();
    if (!list?.items.length) return;
    const idx = list.items.findIndex((i) => i.id === current?.itemId);
    const item = list.items[idx];
    if (!auto && item?.type === 'list' && ready && loadedId === item.id) {
      const li = player.listIndex();
      const len = player.listLength();
      if (len && li > -1 && li < len - 1) {
        player.nextInList();
        return;
      }
    }
    let n;
    if (cfg().shuffle && list.items.length > 1) {
      do n = Math.floor(Math.random() * list.items.length); while (n === idx);
    } else {
      n = idx + 1;
      if (n >= list.items.length) {
        if (auto && cfg().repeat === 'off') {
          wantPlay = false;
          render();
          return;
        }
        n = 0;
      }
    }
    select(list, list.items[n], true);
  }

  function prev() {
    const list = queueList();
    if (!list?.items.length) return;
    const idx = list.items.findIndex((i) => i.id === current?.itemId);
    const item = list.items[idx];
    if (item?.type === 'list' && ready && loadedId === item.id && player.listIndex() > 0) {
      player.prevInList();
      return;
    }
    const n = idx <= 0 ? list.items.length - 1 : idx - 1;
    select(list, list.items[n], true);
  }

  function applyVolume() {
    clearInterval(fadeTimer);
    if (ready) player.setVolume(effectiveVolume());
  }

  function fadeTo(target, ms = 1000, done) {
    clearInterval(fadeTimer);
    if (!ready) return done?.();
    const from = player.getVolume();
    const steps = Math.max(1, Math.round(ms / 50));
    let i = 0;
    fadeTimer = setInterval(() => {
      i += 1;
      player.setVolume(from + (target - from) * (i / steps));
      if (i >= steps) {
        clearInterval(fadeTimer);
        done?.();
      }
    }, 50);
  }

  function setVolume(v) {
    store.set('music.volume', v);
    if (v > 0 && cfg().muted) setMuted(false);
  }

  function setMuted(m) {
    store.set('music.muted', m);
  }

  // ---------- Sincronía con el temporizador ----------
  function onPhase(mode) {
    const behavior = cfg().breakBehavior;
    if (mode === 'focus') {
      if (ducked) {
        ducked = false;
        if (isPlaying()) fadeTo(effectiveVolume(), 1500);
        else applyVolume();
      }
      return;
    }
    if (behavior === 'duck' && !ducked) {
      ducked = true;
      if (isPlaying()) fadeTo(effectiveVolume(), 1500);
      else applyVolume();
    } else if (behavior === 'pause' && isPlaying()) {
      pausedByBreak = true;
      wantPlay = false;
      fadeTo(0, 1200, () => {
        player.pause();
        applyVolume();
      });
    }
  }

  function onTimerStart(mode, reason) {
    if (pausedByTimer || pausedByBreak) {
      if (mode === 'focus' || pausedByTimer) {
        pausedByTimer = false;
        pausedByBreak = false;
        play();
      }
      return;
    }
    if (mode === 'focus' && reason === 'start' && cfg().startWithFocus && !isPlaying()) {
      const hasItems = cur().item || activeList()?.items.length;
      if (hasItems) play();
    }
  }

  function onTimerPause() {
    if (cfg().pauseWithTimer && isPlaying()) {
      player.pause();
      wantPlay = false;
      pausedByTimer = true;
      render();
    }
  }

  function applySettings(path) {
    if (path === '*' || path === 'music.volume' || path === 'music.duckLevel') applyVolume();
    if (path === '*' || path === 'music.muted') player?.setMuted(cfg().muted);
    if (path === 'music.breakBehavior' && app.timer.mode !== 'focus') {
      ducked = false;
      onPhase(app.timer.mode);
      applyVolume();
    }
    if ((path === 'music.shuffle' || path === 'music.repeat') && cur().item?.type === 'list' && ready) {
      player.setShuffle(cfg().shuffle);
      player.setLoop(cfg().repeat === 'one');
    }
    render();
    renderPlayback();
  }

  // ---------- Listas ----------
  async function addFromInput(text) {
    const parsed = parseYouTube(text);
    if (!parsed) {
      toast('No reconozco ese enlace. Pega la URL de un vídeo, directo o lista de YouTube.');
      return false;
    }
    const list = activeList();
    if (list.items.some((i) => i.ytId === parsed.ytId)) {
      toast('Eso ya está en la lista.');
      return false;
    }
    const item = { id: uid(), ...parsed, title: '', thumb: '' };
    list.items.push(item);
    store.savePlaylists();
    if (!cur().item) {
      current = { listId: list.id, itemId: item.id };
      write('current', current);
      if (ready) load(item, false);
    }
    renderTracks();
    render();
    enrich(item);
    return true;
  }

  async function enrich(item) {
    try {
      const meta = await fetchMeta(item);
      if (!item.title) item.title = meta.title;
      item.author = meta.author;
      if (item.type === 'list' && meta.thumb) item.thumb = meta.thumb;
      if (item.error === 'embed' || item.error === 'missing') item.error = '';
    } catch (err) {
      if (err.code === 'embed') {
        item.error = 'embed';
        toast('El autor de este vídeo no permite reproducirlo fuera de YouTube.');
      } else if (err.code === 'missing') {
        item.error = 'missing';
      }
    }
    store.savePlaylists();
    renderTracks();
    render();
  }

  async function enrichMissing() {
    for (const list of S.playlists) {
      for (const item of list.items) {
        if (!item.title || !item.author || (item.type === 'list' && !item.thumb)) await enrich(item);
      }
    }
  }

  function removeItem(listId, itemId) {
    const list = S.playlists.find((l) => l.id === listId);
    if (!list) return;
    const idx = list.items.findIndex((i) => i.id === itemId);
    if (idx < 0) return;
    const [removed] = list.items.splice(idx, 1);
    const wasCurrent = current?.itemId === itemId;
    store.savePlaylists();
    if (wasCurrent) {
      const playing = isPlaying();
      const nextItem = list.items[Math.min(idx, list.items.length - 1)];
      if (nextItem) select(list, nextItem, playing);
      else {
        current = null;
        loadedId = null;
        videoId = null;
        write('current', null);
        wantPlay = false;
        player?.stop();
        ytState = YT_STATE.UNSTARTED;
        updatePoster();
      }
    }
    renderTracks();
    render();
    toast('Eliminado de la lista.', {
      action: 'Deshacer',
      onAction: () => {
        list.items.splice(idx, 0, removed);
        store.savePlaylists();
        if (!cur().item) select(list, removed, false);
        renderTracks();
        render();
      },
    });
  }

  function moveItem(list, fromIdx, toIdx) {
    if (fromIdx === toIdx || fromIdx < 0) return;
    const [it] = list.items.splice(fromIdx, 1);
    list.items.splice(toIdx > fromIdx ? toIdx - 1 : toIdx, 0, it);
    store.savePlaylists();
    renderTracks();
  }

  function selectList(id) {
    S.activeListId = id;
    store.savePlaylists();
    renderSheet();
  }

  function createList(name = 'Nueva lista', items = []) {
    const list = { id: uid(), name, items };
    S.playlists.push(list);
    S.activeListId = list.id;
    store.savePlaylists();
    renderSheet();
    return list;
  }

  function importList(list) {
    const created = createList(list.name, list.items.map((i) => ({ ...i, id: uid() })));
    toast(`Lista «${created.name}» añadida.`);
    app.openSheet('music');
    enrichMissing();
  }

  async function deleteActiveList() {
    const list = activeList();
    if (S.playlists.length <= 1) return;
    const ok = await confirm({
      title: 'Eliminar lista',
      text: `Se eliminará «${list.name}» con sus ${list.items.length} elementos.`,
      ok: 'Eliminar',
    });
    if (!ok) return;
    S.playlists = S.playlists.filter((l) => l.id !== list.id);
    S.activeListId = S.playlists[0].id;
    if (current?.listId === list.id) {
      current = null;
      write('current', null);
      pause();
      restoreCurrent();
      const { item } = cur();
      if (item && ready) load(item, false);
      else {
        videoId = null;
        loadedId = null;
        updatePoster();
      }
    }
    store.savePlaylists();
    renderSheet();
    render();
  }

  function shareUrl(list) {
    const payload = {
      n: list.name,
      i: list.items.map((i) => [i.type === 'list' ? 'l' : 'v', i.ytId, i.title || '', i.start || 0]),
    };
    return `${location.origin}${location.pathname}#lista=${toBase64Url(JSON.stringify(payload))}`;
  }

  async function shareActiveList() {
    const list = activeList();
    if (!list.items.length) {
      toast('La lista está vacía.');
      return;
    }
    const url = shareUrl(list);
    try {
      await navigator.clipboard.writeText(url);
      toast('Enlace copiado. Quien lo abra podrá añadir esta lista.');
    } catch {
      window.prompt('Copia este enlace para compartir la lista:', url);
    }
  }

  function resetToConfig(lists) {
    S.playlists = lists.length ? lists : [{ id: uid(), name: 'Mi lista', items: [] }];
    S.activeListId = S.playlists[0].id;
    current = null;
    write('current', null);
    pause();
    restoreCurrent();
    const { item } = cur();
    if (item && ready) load(item, false);
    store.savePlaylists();
    renderSheet();
    render();
    enrichMissing();
  }

  // ---------- Pintado ----------
  function eq() {
    return h('span', { class: 'eq', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'));
  }

  function render() {
    const { list, item } = cur();
    const playing = isPlaying();
    const look = S.settings.look;
    const body = document.body;

    // Dock
    const thumb = thumbFor(item, videoId);
    els.dockThumb.style.backgroundImage = thumb ? `url("${thumb}")` : '';
    els.dockThumb.replaceChildren(...(thumb ? (playing ? [eq()] : []) : [icon('music')]));
    if (item) {
      const title = item.type === 'list' ? videoTitle || item.title || 'Lista de YouTube' : item.title || videoTitle || 'Vídeo de YouTube';
      els.dockTitle.textContent = title;
      els.dockSub.textContent = item.type === 'list' && item.title ? item.title : list.name;
    } else {
      els.dockTitle.textContent = 'Sin música';
      els.dockSub.textContent = 'Añade vídeos de YouTube';
    }
    els.playBtn.replaceChildren(icon(playing ? 'pause' : 'play'));
    els.playBtn.setAttribute('aria-label', playing ? 'Pausar música (K)' : 'Reproducir música (K)');
    els.prevBtn.disabled = !item;
    els.nextBtn.disabled = !item;
    const vol = cfg().volume;
    els.volume.value = cfg().muted ? 0 : vol;
    els.volume.style.setProperty('--pct', `${cfg().muted ? 0 : vol}%`);
    els.muteBtn.replaceChildren(icon(cfg().muted || vol === 0 ? 'mute' : 'volume'));
    els.muteBtn.setAttribute('aria-label', cfg().muted ? 'Activar sonido de la música (M)' : 'Silenciar música (M)');
    const inBackground = look.backdrop === 'video';
    els.layoutBtn.replaceChildren(icon(inBackground ? 'window' : 'backdrop'));
    const layoutText = inBackground ? 'Mostrar el vídeo en una ventana (V)' : 'Poner el vídeo de fondo (V)';
    els.layoutBtn.setAttribute('aria-label', layoutText);
    els.layoutBtn.title = layoutText;

    // Escenario de vídeo
    els.stage.classList.toggle('is-empty', !item);
    if (ytState === YT_STATE.PLAYING) els.stage.classList.add('is-playing');
    else if (ytState !== YT_STATE.BUFFERING) els.stage.classList.remove('is-playing');
    els.stage.dataset.corner = cfg().windowCorner;
    els.stage.dataset.size = cfg().windowSize;
    els.windowOpen.href = item ? watchUrl(item, videoId) : '#';
    body.classList.toggle('has-video', inBackground && !!item);
    body.classList.toggle('has-media', (inBackground && !!item) || body.classList.contains('has-image'));
    body.classList.toggle('music-playing', playing);
    app.onMusicRender?.();
  }

  function renderPlayback() {
    els.shuffleBtn.setAttribute('aria-pressed', String(cfg().shuffle));
    els.repeatBtn.setAttribute('aria-pressed', String(cfg().repeat !== 'off'));
    els.repeatLabel.textContent = REPEAT_LABEL[cfg().repeat];
  }

  function renderSheet() {
    const active = activeList();
    els.tabs.replaceChildren(
      ...S.playlists.map((l) =>
        h('button', {
          class: 'list-tab',
          type: 'button',
          role: 'tab',
          'aria-selected': String(l.id === active.id),
          onclick: () => selectList(l.id),
        }, l.name || 'Sin nombre')
      ),
      h('button', {
        class: 'list-tab add',
        type: 'button',
        onclick: () => {
          createList();
          els.listName.focus();
          els.listName.select();
        },
      }, icon('plus'), 'Nueva lista')
    );
    if (document.activeElement !== els.listName) els.listName.value = active.name;
    els.deleteList.disabled = S.playlists.length <= 1;
    renderTracks();
    renderPlayback();
  }

  let dragFrom = -1;
  function renderTracks() {
    const list = activeList();
    const playing = isPlaying();
    if (!list.items.length) {
      els.trackList.replaceChildren(
        h('li', { class: 'empty' },
          h('strong', {}, 'Esta lista está vacía'),
          'Pega arriba el enlace de un vídeo, un directo o una lista de YouTube.')
      );
      return;
    }
    els.trackList.replaceChildren(
      ...list.items.map((item, idx) => {
        const isCurrent = current?.itemId === item.id;
        const thumb = isCurrent && item.type === 'list' && videoId ? thumbFor(null, videoId) : thumbFor(item);
        const meta = item.error
          ? item.error === 'embed' || item.error === '101' || item.error === '150'
            ? 'No se puede reproducir fuera de YouTube'
            : 'No disponible'
          : [item.type === 'list' ? 'Lista de reproducción' : 'Vídeo', item.author].filter(Boolean).join(' de ');
        const row = h('li', {
          class: `track-row${isCurrent ? ' is-current' : ''}`,
          draggable: 'true',
          dataset: { idx },
          tabindex: '0',
          'aria-current': isCurrent ? 'true' : null,
          onclick: (e) => {
            if (e.target.closest('.row-actions')) return;
            if (isCurrent && loadedId === item.id && ready) toggle();
            else select(list, item, true);
          },
          onkeydown: (e) => {
            if (e.target !== e.currentTarget) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              select(list, item, true);
            } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
              e.preventDefault();
              const to = e.key === 'ArrowUp' ? idx - 1 : idx + 2;
              if (to >= 0 && to <= list.items.length) {
                moveItem(list, idx, to);
                els.trackList.children[e.key === 'ArrowUp' ? idx - 1 : idx + 1]?.focus();
              }
            } else if (e.key === 'Delete') {
              removeItem(list.id, item.id);
            }
          },
          ondragstart: (e) => {
            dragFrom = idx;
            row.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(idx));
          },
          ondragend: () => {
            row.classList.remove('dragging');
            els.trackList.querySelectorAll('.drop-before,.drop-after').forEach((r) => r.classList.remove('drop-before', 'drop-after'));
          },
          ondragover: (e) => {
            if (dragFrom < 0) return;
            e.preventDefault();
            const rect = row.getBoundingClientRect();
            const after = e.clientY > rect.top + rect.height / 2;
            row.classList.toggle('drop-after', after);
            row.classList.toggle('drop-before', !after);
          },
          ondragleave: () => row.classList.remove('drop-before', 'drop-after'),
          ondrop: (e) => {
            e.preventDefault();
            const after = row.classList.contains('drop-after');
            row.classList.remove('drop-before', 'drop-after');
            moveItem(list, dragFrom, after ? idx + 1 : idx);
            dragFrom = -1;
          },
        },
          h('span', { class: 'grip', 'aria-hidden': 'true', title: 'Arrastra para reordenar' }, icon('grip')),
          h('span', { class: 'row-thumb', style: thumb ? { backgroundImage: `url("${thumb}")` } : null },
            !thumb ? icon(item.type === 'list' ? 'tasks' : 'music') : null,
            isCurrent && playing ? eq() : null),
          h('span', { class: 'row-text' },
            h('span', { class: 'row-title' }, item.title || (item.type === 'list' ? 'Lista de YouTube' : 'Vídeo de YouTube')),
            h('span', { class: `row-meta${item.error ? ' is-error' : ''}` }, meta)),
          h('span', { class: 'row-actions' },
            h('a', {
              class: 'icon-btn small',
              href: watchUrl(item),
              target: '_blank',
              rel: 'noopener',
              'aria-label': 'Abrir en YouTube',
              title: 'Abrir en YouTube',
            }, icon('external')),
            h('button', {
              class: 'icon-btn small',
              type: 'button',
              'aria-label': 'Quitar de la lista',
              title: 'Quitar de la lista',
              onclick: () => removeItem(list.id, item.id),
            }, icon('trash')))
        );
        return row;
      })
    );
  }

  // ---------- Eventos de la interfaz ----------
  els.playBtn.addEventListener('click', toggle);
  els.prevBtn.addEventListener('click', prev);
  els.nextBtn.addEventListener('click', () => next());
  els.windowPlay.addEventListener('click', play);
  els.windowToBackdrop.addEventListener('click', () => app.toggleVideoLayout());
  els.layoutBtn.addEventListener('click', () => app.toggleVideoLayout());
  els.muteBtn.addEventListener('click', () => setMuted(!cfg().muted));
  els.volume.addEventListener('input', () => {
    const v = Number(els.volume.value);
    els.volume.style.setProperty('--pct', `${v}%`);
    setVolume(v);
  });
  els.addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const value = els.addInput.value;
    if (!value.trim()) return;
    if (await addFromInput(value)) els.addInput.value = '';
  });
  els.addInput.addEventListener('paste', () => {
    // Añade automáticamente si se pega un enlace válido
    setTimeout(async () => {
      if (parseYouTube(els.addInput.value) && (await addFromInput(els.addInput.value))) els.addInput.value = '';
    }, 0);
  });
  els.listName.addEventListener('input', () => {
    activeList().name = els.listName.value.trim() || 'Sin nombre';
    store.savePlaylists();
    els.tabs.querySelector('[aria-selected="true"]').textContent = activeList().name;
  });
  els.listName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') els.listName.blur();
  });
  els.deleteList.addEventListener('click', deleteActiveList);
  els.shareList.addEventListener('click', shareActiveList);
  els.shuffleBtn.addEventListener('click', () => store.set('music.shuffle', !cfg().shuffle));
  els.repeatBtn.addEventListener('click', () => store.set('music.repeat', REPEAT_NEXT[cfg().repeat]));

  return {
    init,
    play,
    pause,
    toggle,
    next,
    prev,
    isPlaying,
    toggleMute: () => setMuted(!cfg().muted),
    onPhase,
    onTimerStart,
    onTimerPause,
    applySettings,
    render,
    renderSheet,
    importList,
    resetToConfig,
    shareUrl,
  };
}
