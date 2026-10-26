// Lista de tareas con pomodoros estimados y tarea activa.
import { $, h, icon, uid, clamp, pad2 } from './util.js';

export function createTasks(app) {
  const { store, toast } = app;
  const S = store.state;
  const els = {
    form: $('#taskForm'),
    input: $('#taskInput'),
    est: $('#taskEst'),
    list: $('#taskList'),
    summary: $('#taskSummary'),
    pill: $('#taskPill'),
    pillTitle: $('#taskPillTitle'),
    pillCount: $('#taskPillCount'),
  };
  const T = () => S.tasks;
  const active = () => T().items.find((t) => t.id === T().activeId && !t.completed);

  function add(title, est) {
    const task = { id: uid(), title: title.trim().slice(0, 140), est: clamp(est | 0, 1, 20), done: 0, completed: false, createdAt: Date.now() };
    T().items.push(task);
    if (!active()) T().activeId = task.id;
    store.saveTasks();
    render();
  }

  function toggleCompleted(id) {
    const t = T().items.find((x) => x.id === id);
    if (!t) return;
    t.completed = !t.completed;
    if (t.completed && T().activeId === id) {
      const nextTask = T().items.find((x) => !x.completed);
      T().activeId = nextTask ? nextTask.id : null;
    }
    store.saveTasks();
    render();
  }

  function remove(id) {
    const idx = T().items.findIndex((x) => x.id === id);
    if (idx < 0) return;
    const [removed] = T().items.splice(idx, 1);
    const wasActive = T().activeId === id;
    if (wasActive) T().activeId = T().items.find((x) => !x.completed)?.id || null;
    store.saveTasks();
    render();
    toast('Tarea eliminada.', {
      action: 'Deshacer',
      onAction: () => {
        T().items.splice(idx, 0, removed);
        if (wasActive) T().activeId = removed.id;
        store.saveTasks();
        render();
      },
    });
  }

  function setActive(id) {
    const t = T().items.find((x) => x.id === id);
    if (!t || t.completed) return;
    T().activeId = id;
    store.saveTasks();
    render();
  }

  function clearCompleted() {
    T().items = T().items.filter((t) => !t.completed);
    store.saveTasks();
    render();
  }

  /** Se llama al completar un pomodoro de concentración. */
  function incrementActive() {
    const t = active();
    if (!t) return;
    t.done += 1;
    store.saveTasks();
    render();
  }

  function startEdit(task, titleEl) {
    const input = h('input', { class: 'input', value: task.title, maxlength: '140', 'aria-label': 'Editar tarea' });
    input.style.height = '34px';
    const finish = (save) => {
      if (save && input.value.trim()) task.title = input.value.trim();
      store.saveTasks();
      render();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
      e.stopPropagation();
    });
    input.addEventListener('blur', () => finish(true));
    titleEl.replaceWith(input);
    input.focus();
    input.select();
  }

  function estimate() {
    const items = T().items.filter((t) => !t.completed);
    const remaining = items.reduce((sum, t) => sum + Math.max(0, t.est - t.done), 0);
    if (!remaining) return null;
    const { focus, short, long, longEvery } = S.settings.timer;
    let minutes = 0;
    let inSet = app.timer.completedInSet;
    for (let i = 0; i < remaining; i++) {
      minutes += focus;
      inSet += 1;
      if (i < remaining - 1) minutes += inSet % longEvery === 0 ? long : short;
    }
    if (app.timer.mode === 'focus' && app.timer.status !== 'idle') minutes -= app.timer.elapsed / 60000;
    const end = new Date(Date.now() + minutes * 60000);
    return { remaining, end: `${pad2(end.getHours())}:${pad2(end.getMinutes())}` };
  }

  function render() {
    const items = [...T().items].sort((a, b) => Number(a.completed) - Number(b.completed));
    if (!items.length) {
      els.list.replaceChildren(
        h('li', { class: 'empty' },
          h('strong', {}, 'Sin tareas por ahora'),
          'Escribe arriba en qué quieres trabajar y cuántos pomodoros crees que te llevará.')
      );
    } else {
      els.list.replaceChildren(
        ...items.map((t) => {
          const isActive = t.id === T().activeId && !t.completed;
          const title = h('button', {
            class: 'task-title',
            type: 'button',
            title: t.completed ? '' : 'Clic para trabajar en ella; doble clic para editar',
            onclick: () => setActive(t.id),
            ondblclick: () => startEdit(t, title),
          }, t.title);
          return h('li', { class: `task-row${isActive ? ' is-active' : ''}${t.completed ? ' is-done' : ''}` },
            h('button', {
              class: 'check',
              type: 'button',
              role: 'checkbox',
              'aria-checked': String(t.completed),
              'aria-label': t.completed ? 'Marcar como pendiente' : 'Marcar como terminada',
              onclick: () => toggleCompleted(t.id),
            }, icon('check')),
            title,
            h('span', { class: 'task-count', title: 'Pomodoros hechos de los estimados' }, `${t.done}/${t.est}`),
            h('span', { class: 'row-actions' },
              h('button', {
                class: 'icon-btn small',
                type: 'button',
                'aria-label': 'Eliminar tarea',
                title: 'Eliminar tarea',
                onclick: () => remove(t.id),
              }, icon('trash')))
          );
        })
      );
    }

    const est = estimate();
    const hasDone = T().items.some((t) => t.completed);
    els.summary.replaceChildren(
      ...(est
        ? [h('span', {}, `Quedan ${est.remaining} ${est.remaining === 1 ? 'pomodoro' : 'pomodoros'}. Terminarías hacia las ${est.end}.`)]
        : T().items.length ? [h('span', {}, 'Todo hecho.')] : []),
      ...(hasDone ? [h('button', { class: 'link-btn', type: 'button', onclick: clearCompleted }, 'Quitar terminadas')] : [])
    );

    renderPill();
  }

  function renderPill() {
    const t = active();
    els.pill.classList.toggle('is-empty', !t);
    els.pillTitle.textContent = t ? t.title : 'Elige una tarea';
    els.pillCount.textContent = t ? `${t.done}/${t.est}` : '';
    els.pill.setAttribute('aria-label', t ? `Tarea actual: ${t.title}, ${t.done} de ${t.est} pomodoros` : 'Elegir una tarea');
  }

  // Formulario
  els.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = els.input.value.trim();
    if (!title) {
      els.input.focus();
      return;
    }
    add(title, Number(els.est.value) || 1);
    els.input.value = '';
    els.est.value = 1;
    els.input.focus();
  });

  return { render, renderPill, incrementActive, active };
}

/** Comportamiento común de los selectores numéricos (− valor +). */
export function bindStepper(stepper, onChange) {
  const input = stepper.querySelector('input');
  const min = Number(input.min) || 0;
  const max = Number(input.max) || 999;
  const commit = (v) => {
    const val = clamp(Math.round(Number(v) || min), min, max);
    input.value = val;
    onChange?.(val);
  };
  stepper.querySelectorAll('[data-step]').forEach((b) =>
    b.addEventListener('click', () => commit(Number(input.value) + Number(b.dataset.step)))
  );
  input.addEventListener('change', () => commit(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); commit(Number(input.value) + 1); }
    if (e.key === 'ArrowDown') { e.preventDefault(); commit(Number(input.value) - 1); }
  });
  return commit;
}
