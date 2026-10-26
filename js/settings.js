// Panel de ajustes, generado a partir de un esquema.
import { $, h, icon, clamp, contrast, downloadFile } from './util.js';
import { THEMES, TIMER_FONTS, UI_FONTS, resolveTheme, ensureFont } from './themes.js';
import { ALARMS } from './sounds.js';
import { writeRaw, playlistsFromConfig } from './store.js';

export function createSettings(app) {
  const { store, toast, confirm } = app;
  const S = store.state;
  const nav = $('#settingsNav');
  const body = $('#settingsBody');
  const updaters = [];
  let built = false;

  const get = (p) => store.get(p);
  const set = (p, v) => store.set(p, v);

  // ---------- Controles ----------
  function field(label, help, control, opts = {}) {
    const el = h('div', { class: `field${opts.stack ? ' stack' : ''}` },
      h('div', { class: 'field-text' },
        h('span', { class: 'field-label', id: opts.id }, label),
        help ? h('span', { class: 'field-help' }, help) : null),
      control);
    if (opts.showIf) updaters.push(() => { el.hidden = !opts.showIf(); });
    return el;
  }

  function toggle(path, label, help, opts = {}) {
    const btn = h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-label': label });
    btn.addEventListener('click', async () => {
      const next = !get(path);
      if (opts.beforeOn && next && !(await opts.beforeOn())) return;
      set(path, next);
    });
    updaters.push(() => btn.setAttribute('aria-checked', String(!!get(path))));
    return field(label, help, btn, opts);
  }

  function number(path, label, { min, max, unit, help, showIf } = {}) {
    const input = h('input', { type: 'number', min, max, inputmode: 'numeric', 'aria-label': label });
    const commit = (v) => {
      const val = clamp(Math.round(Number(v) || min), min, max);
      input.value = val;
      if (val !== get(path)) set(path, val);
    };
    const stepper = h('div', { class: 'stepper' },
      h('button', { class: 'stepper-btn', type: 'button', 'aria-label': `Menos ${label.toLowerCase()}`, onclick: () => commit(get(path) - 1) }, icon('minus')),
      input,
      unit ? h('span', { class: 'unit' }, unit) : null,
      h('button', { class: 'stepper-btn', type: 'button', 'aria-label': `Más ${label.toLowerCase()}`, onclick: () => commit(get(path) + 1) }, icon('plus')));
    input.addEventListener('change', () => commit(input.value));
    updaters.push(() => { if (document.activeElement !== input) input.value = get(path); });
    return field(label, help, stepper, { showIf });
  }

  function range(path, label, { min, max, step = 1, format = (v) => v, help, showIf } = {}) {
    const input = h('input', { class: 'range', type: 'range', min, max, step, 'aria-label': label });
    const out = h('span', { class: 'field-value' });
    const paint = (v) => {
      input.style.setProperty('--pct', `${((v - min) / (max - min)) * 100}%`);
      out.textContent = format(v);
    };
    input.addEventListener('input', () => {
      const v = Number(input.value);
      paint(v);
      set(path, v);
    });
    updaters.push(() => {
      const v = get(path);
      if (document.activeElement !== input) input.value = v;
      paint(v);
    });
    return field(label, help, h('div', { class: 'range-wrap' }, input, out), { showIf });
  }

  function segmented(path, label, options, { help, showIf, onPick } = {}) {
    const group = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label },
      ...options.map(([value, text]) =>
        h('button', {
          type: 'button',
          role: 'radio',
          dataset: { value },
          onclick: () => (onPick ? onPick(value) : set(path, value)),
        }, text)));
    updaters.push(() => group.querySelectorAll('button').forEach((b) =>
      b.setAttribute('aria-checked', String(String(get(path)) === b.dataset.value))));
    return field(label, help, group, { showIf });
  }

  function select(path, label, options, { help, showIf, extra } = {}) {
    const sel = h('select', { class: 'select', 'aria-label': label },
      ...options.map(([value, text]) => h('option', { value }, text)));
    sel.addEventListener('change', () => set(path, sel.value));
    updaters.push(() => { sel.value = get(path); });
    const ctl = h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, h('div', { class: 'select-wrap' }, sel), extra || null);
    return field(label, help, ctl, { showIf });
  }

  // ---------- Bloques especiales ----------
  function themeGrid() {
    const grid = h('div', { class: 'theme-grid', role: 'radiogroup', 'aria-label': 'Tema de color' });
    const items = Object.entries(THEMES).map(([id, t]) =>
      h('button', {
        class: 'theme-swatch',
        type: 'button',
        role: 'radio',
        dataset: { value: id },
        onclick: () => set('look.theme', id),
      },
        h('span', { class: 'swatch', 'aria-hidden': 'true' },
          h('i', { style: { background: t.focus } }), h('i', { style: { background: t.short } }), h('i', { style: { background: t.long } }),
          h('span', { class: 'aa', style: { color: t.ink } }, 'Aa'),
          h('span', { class: 'dot', style: { background: t.accent } })),
        t.name));
    const custom = h('button', {
      class: 'theme-swatch custom',
      type: 'button',
      role: 'radio',
      dataset: { value: 'custom' },
      onclick: () => {
        if (get('look.theme') !== 'custom') {
          const base = resolveTheme(S.settings.look);
          set('look.custom', { focus: base.focus, short: base.short, long: base.long, ink: base.ink, accent: base.accent });
        }
        set('look.theme', 'custom');
      },
    }, h('span', { class: 'swatch', 'aria-hidden': 'true' }, icon('sliders')), 'A tu gusto');
    grid.append(...items, custom);
    updaters.push(() => grid.querySelectorAll('.theme-swatch').forEach((b) =>
      b.setAttribute('aria-checked', String(get('look.theme') === b.dataset.value))));
    return grid;
  }

  function customColors() {
    const fields = [['focus', 'Concentración'], ['short', 'Pausa corta'], ['long', 'Pausa larga'], ['ink', 'Texto'], ['accent', 'Acento']];
    const warn = h('p', { class: 'warn' });
    const wrap = h('div', {},
      h('div', { class: 'color-grid' },
        ...fields.map(([key, label]) => {
          const input = h('input', { type: 'color', 'aria-label': `Color de ${label.toLowerCase()}` });
          input.addEventListener('input', () => set(`look.custom.${key}`, input.value));
          updaters.push(() => { input.value = get(`look.custom.${key}`); });
          return h('label', { class: 'color-field' }, input, label);
        })),
      warn);
    updaters.push(() => {
      wrap.hidden = get('look.theme') !== 'custom';
      const c = S.settings.look.custom;
      const low = ['focus', 'short', 'long'].filter((k) => contrast(c[k], c.ink) < 4.5);
      warn.hidden = !low.length;
      warn.textContent = low.length ? 'El texto tiene poco contraste con alguno de los fondos; puede costar leerlo.' : '';
    });
    return wrap;
  }

  function fontGrid(path, fonts) {
    const grid = h('div', { class: 'font-grid', role: 'radiogroup', 'aria-label': 'Tipografía del reloj' },
      ...Object.entries(fonts).map(([id, f]) =>
        h('button', {
          class: 'font-option',
          type: 'button',
          role: 'radio',
          dataset: { value: id },
          onclick: () => set(path, id),
        },
          h('span', { class: 'sample', style: { fontFamily: `${f.family}, ${f.fallback}`, fontWeight: f.weight, fontVariationSettings: f.settings || 'normal' } }, '25:00'),
          h('span', { class: 'name' }, f.label))));
    updaters.push(() => grid.querySelectorAll('.font-option').forEach((b) =>
      b.setAttribute('aria-checked', String(get(path) === b.dataset.value))));
    return grid;
  }

  function imagePicker() {
    const url = h('input', { class: 'input', type: 'url', placeholder: 'https://… enlace a una imagen', 'aria-label': 'Enlace de la imagen de fondo' });
    const file = h('input', { type: 'file', accept: 'image/*', hidden: true });
    url.addEventListener('change', () => {
      const v = url.value.trim();
      if (v && !/^https:\/\//i.test(v)) {
        toast('Usa un enlace que empiece por https://');
        return;
      }
      set('look.imageUrl', v);
    });
    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      if (!f) return;
      try {
        const dataUrl = await shrinkImage(f);
        if (!writeRaw('bgimage', dataUrl)) throw new Error('quota');
        set('look.imageUrl', 'local');
        app.applyBackdrop();
        toast('Imagen de fondo guardada.');
      } catch {
        toast('No se ha podido guardar la imagen. Prueba con una más pequeña.');
      }
      file.value = '';
    });
    const wrap = h('div', { class: 'field stack' },
      h('div', { class: 'field-text' },
        h('span', { class: 'field-label' }, 'Imagen'),
        h('span', { class: 'field-help' }, 'Pega un enlace o sube una foto desde tu equipo.')),
      h('div', { class: 'image-row' }, url, file,
        h('button', { class: 'btn ghost', type: 'button', onclick: () => file.click() }, icon('upload'), 'Subir')));
    updaters.push(() => {
      wrap.hidden = get('look.backdrop') !== 'image';
      const v = get('look.imageUrl');
      if (document.activeElement !== url) url.value = v === 'local' ? '' : v;
      url.placeholder = v === 'local' ? 'Usando una imagen subida' : 'https://… enlace a una imagen';
    });
    return wrap;
  }

  function dataBlock() {
    const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
    fileInput.addEventListener('change', async () => {
      const f = fileInput.files?.[0];
      fileInput.value = '';
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (data?.app !== 'pomodoro') throw new Error('formato');
        const ok = await confirm({
          title: 'Importar copia',
          text: 'Se sustituirán tus ajustes, listas de música, tareas y estadísticas por los de la copia.',
          ok: 'Importar',
        });
        if (!ok) return;
        app.importBackup(data);
        toast('Copia importada.');
      } catch {
        toast('Ese archivo no es una copia válida de esta app.');
      }
    });
    return h('div', {},
      h('div', { class: 'data-actions' },
        h('button', { class: 'btn ghost', type: 'button', onclick: () => {
          const data = {
            app: 'pomodoro',
            version: 1,
            exportedAt: new Date().toISOString(),
            settings: S.settings,
            playlists: S.playlists,
            tasks: S.tasks,
            stats: S.stats,
          };
          downloadFile(`pomodoro-copia-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2));
        } }, icon('download'), 'Exportar copia'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => fileInput.click() }, icon('upload'), 'Importar copia'),
        fileInput),
      h('h4', {}, 'Restablecer'),
      h('div', { class: 'data-actions' },
        h('button', { class: 'btn danger', type: 'button', onclick: async () => {
          if (await confirm({ title: 'Restablecer ajustes', text: 'Los ajustes volverán a sus valores iniciales. Tus listas, tareas y estadísticas no cambian.', ok: 'Restablecer' })) {
            writeRaw('bgimage', null);
            store.replaceSettings({});
            toast('Ajustes restablecidos.');
          }
        } }, 'Ajustes iniciales'),
        h('button', { class: 'btn danger', type: 'button', onclick: async () => {
          if (await confirm({ title: 'Restaurar listas', text: 'Tus listas de música se sustituirán por las que vienen en config.js.', ok: 'Restaurar' })) {
            app.music.resetToConfig(playlistsFromConfig(window.POMODORO_CONFIG?.playlists || []));
            toast('Listas restauradas.');
          }
        } }, 'Listas iniciales'),
        h('button', { class: 'btn danger', type: 'button', onclick: async () => {
          if (await confirm({ title: 'Borrar estadísticas', text: 'Se borrará el historial de pomodoros. No se puede deshacer.', ok: 'Borrar' })) {
            S.stats = { days: {} };
            store.saveStats();
            toast('Estadísticas borradas.');
          }
        } }, 'Borrar estadísticas'),
        h('button', { class: 'btn danger', type: 'button', onclick: async () => {
          if (await confirm({ title: 'Borrar tareas', text: 'Se eliminarán todas las tareas.', ok: 'Borrar' })) {
            S.tasks = { items: [], activeId: null };
            store.saveTasks();
            app.tasks.render();
            toast('Tareas borradas.');
          }
        } }, 'Borrar tareas')),
      h('p', { class: 'about' }, 'Todo se guarda solo en este navegador: no hay cuentas ni servidores. Exporta una copia para llevarte tu configuración a otro equipo.'));
  }

  function shortcuts() {
    const list = [
      [['Espacio'], 'Empezar o pausar'],
      [['R'], 'Reiniciar la fase'],
      [['S'], 'Saltar a la siguiente fase'],
      [['1'], 'Concentración'],
      [['2'], 'Pausa corta'],
      [['3'], 'Pausa larga'],
      [['K'], 'Reproducir o pausar la música'],
      [['N'], 'Siguiente pista'],
      [['B'], 'Pista anterior'],
      [['M'], 'Silenciar la música'],
      [['V'], 'Vídeo de fondo o en ventana'],
      [['T'], 'Tareas'],
      [['Y'], 'Música'],
      [['E'], 'Estadísticas'],
      [[','], 'Ajustes'],
      [['Z'], 'Modo sin distracciones'],
      [['F'], 'Pantalla completa'],
      [['Esc'], 'Cerrar panel'],
    ];
    return h('dl', { class: 'kbd-list' },
      ...list.flatMap(([keys, text]) => [h('dt', {}, ...keys.map((k) => h('kbd', {}, k))), h('dd', {}, text)]));
  }

  // ---------- Construcción ----------
  const pct = (v) => `${Math.round(v * 100)} %`;

  function build() {
    const sections = [
      ['timer', 'Temporizador', [
        number('timer.focus', 'Concentración', { min: 1, max: 180, unit: 'min' }),
        number('timer.short', 'Pausa corta', { min: 1, max: 60, unit: 'min' }),
        number('timer.long', 'Pausa larga', { min: 1, max: 90, unit: 'min' }),
        number('timer.longEvery', 'Pausa larga cada', { min: 2, max: 12, unit: 'pom.', help: 'Pomodoros de concentración por serie' }),
        number('timer.dailyGoal', 'Objetivo diario', { min: 0, max: 30, unit: 'pom.', help: '0 para no fijar objetivo' }),
        toggle('timer.autoBreaks', 'Empezar las pausas solas', 'Al terminar la concentración, la pausa arranca sin pulsar nada'),
        toggle('timer.autoFocus', 'Empezar la concentración sola', 'Al terminar la pausa, el siguiente pomodoro arranca solo'),
        toggle('timer.wakeLock', 'Mantener la pantalla encendida', 'Mientras el temporizador está en marcha (útil en el móvil)'),
      ]],
      ['look', 'Apariencia', [
        h('h4', { style: { marginTop: '4px' } }, 'Tema'),
        themeGrid(),
        customColors(),
        h('h4', {}, 'Fondo'),
        segmented('look.backdrop', 'Fondo de pantalla', [['color', 'Color'], ['image', 'Imagen'], ['video', 'Vídeo']], {
          help: 'Con vídeo, la música se ve detrás del reloj',
        }),
        imagePicker(),
        range('look.shade', 'Capa de color', { min: 0.3, max: 1, step: 0.01, format: pct, help: 'Cuánto tapa el color de la fase a la imagen o el vídeo', showIf: () => get('look.backdrop') !== 'color' }),
        range('look.blur', 'Desenfoque', { min: 0, max: 30, step: 1, format: (v) => `${v} px`, showIf: () => get('look.backdrop') !== 'color' }),
        h('h4', {}, 'Reloj'),
        segmented('look.clockStyle', 'Estilo', [['classic', 'Barra'], ['ring', 'Anillo'], ['minimal', 'Solo cifras']]),
        range('look.clockScale', 'Tamaño', { min: 0.7, max: 1.3, step: 0.05, format: pct }),
        fontGrid('look.timerFont', TIMER_FONTS),
        toggle('look.showCycle', 'Mostrar la serie de pomodoros', 'Los puntos bajo el reloj'),
        toggle('look.autoHide', 'Ocultar los controles al concentrarte', 'Se esconden si no mueves el ratón durante unos segundos'),
        select('look.uiFont', 'Tipografía de la interfaz', Object.entries(UI_FONTS).map(([id, f]) => [id, f.label])),
      ]],
      ['music', 'Música', [
        segmented('music.breakBehavior', 'En las pausas', [['keep', 'Seguir'], ['duck', 'Bajar'], ['pause', 'Pausar']], {
          help: 'Qué hace la música cuando toca descansar',
        }),
        range('music.duckLevel', 'Volumen en las pausas', { min: 5, max: 90, step: 5, format: (v) => `${v} %`, showIf: () => get('music.breakBehavior') === 'duck' }),
        toggle('music.startWithFocus', 'Poner música al concentrarte', 'Empieza a sonar cuando inicias un pomodoro'),
        toggle('music.pauseWithTimer', 'Pausar la música con el temporizador'),
        segmented('music.windowCorner', 'Ventana de vídeo', [['left', 'Izquierda'], ['right', 'Derecha']], {
          help: 'Cuando el vídeo no está de fondo',
        }),
        segmented('music.windowSize', 'Tamaño de la ventana', [['small', 'Pequeña'], ['large', 'Grande']]),
      ]],
      ['sound', 'Sonido y avisos', [
        select('sound.alarm', 'Sonido al terminar', Object.entries(ALARMS).map(([id, a]) => [id, a.label]), {
          extra: h('button', { class: 'btn ghost', type: 'button', onclick: () => app.sounds.play(get('sound.alarm'), get('sound.volume'), 1) }, 'Probar'),
        }),
        range('sound.volume', 'Volumen del aviso', { min: 0, max: 100, step: 5, format: (v) => `${v} %` }),
        number('sound.repeat', 'Repeticiones', { min: 1, max: 5 }),
        toggle('sound.tick', 'Tictac durante la concentración'),
        range('sound.tickVolume', 'Volumen del tictac', { min: 5, max: 100, step: 5, format: (v) => `${v} %`, showIf: () => get('sound.tick') }),
        toggle('sound.notifications', 'Notificaciones del navegador', 'Te avisa aunque estés en otra pestaña', {
          beforeOn: async () => {
            if (!('Notification' in window)) {
              toast('Este navegador no admite notificaciones.');
              return false;
            }
            const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
            if (perm !== 'granted') toast('Has bloqueado las notificaciones. Actívalas en los permisos del sitio.');
            return perm === 'granted';
          },
        }),
        toggle('sound.tabTitle', 'Cuenta atrás en la pestaña', 'Muestra el tiempo restante en el título'),
      ]],
      ['data', 'Tus datos', [dataBlock()]],
      ['keys', 'Atajos de teclado', [shortcuts()]],
    ];

    nav.replaceChildren(...sections.map(([id, title]) =>
      h('a', {
        href: `#ajustes-${id}`,
        dataset: { target: id },
        onclick: (e) => {
          e.preventDefault();
          body.querySelector(`#ajustes-${id}`).scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
      }, title)));
    body.replaceChildren(...sections.map(([id, title, children]) =>
      h('section', { class: 'group', id: `ajustes-${id}` }, h('h3', {}, title), ...children)));

    // Resalta la sección visible
    const io = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (!visible) return;
      const id = visible.target.id.replace('ajustes-', '');
      nav.querySelectorAll('a').forEach((a) => a.classList.toggle('is-current', a.dataset.target === id));
    }, { root: body, rootMargin: '0px 0px -60% 0px' });
    body.querySelectorAll('.group').forEach((g) => io.observe(g));
    built = true;
  }

  function sync() {
    if (!built) return;
    updaters.forEach((u) => u());
  }

  function open(section) {
    if (!built) {
      build();
      Object.values(TIMER_FONTS).forEach((f) => ensureFont(f.query));
    }
    sync();
    if (section) requestAnimationFrame(() => body.querySelector(`#ajustes-${section}`)?.scrollIntoView({ block: 'start' }));
  }

  return { open, sync };
}

/** Reduce la imagen a 1920 px como máximo para que quepa en el almacenamiento local. */
async function shrinkImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.82);
}
