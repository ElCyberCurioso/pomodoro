// Estadísticas: pomodoros por día, objetivo diario, semana, racha y gráfico de 14 días.
import { $, h, dayKey, formatMinutes } from './util.js';

const WEEKDAY = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const dateFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

export function createStats(app) {
  const { store } = app;
  const S = store.state;
  const body = $('#statsBody');
  let showTable = false;

  const day = (d) => S.stats.days[dayKey(d)] || { count: 0, minutes: 0 };
  const addDays = (d, n) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };

  function record(minutes) {
    const k = dayKey();
    const d = (S.stats.days[k] ||= { count: 0, minutes: 0 });
    d.count += 1;
    d.minutes = Math.round((d.minutes + minutes) * 10) / 10;
    // Conserva un año y poco de historia
    const cutoff = dayKey(addDays(new Date(), -400));
    for (const key of Object.keys(S.stats.days)) if (key < cutoff) delete S.stats.days[key];
    store.saveStats();
  }

  function summary() {
    const now = new Date();
    const today = day(now);
    const dow = (now.getDay() + 6) % 7; // lunes = 0
    let week = 0;
    let weekMin = 0;
    for (let i = 0; i <= dow; i++) {
      const d = day(addDays(now, -i));
      week += d.count;
      weekMin += d.minutes;
    }
    let streak = 0;
    let cursor = today.count ? now : addDays(now, -1);
    while (day(cursor).count > 0) {
      streak += 1;
      cursor = addDays(cursor, -1);
    }
    const total = Object.values(S.stats.days).reduce((s, d) => s + d.count, 0);
    return { today, week, weekMin, streak, total };
  }

  function render() {
    const { today, week, weekMin, streak, total } = summary();
    const goal = S.settings.timer.dailyGoal;
    const pct = goal ? Math.min(100, (today.count / goal) * 100) : 0;
    const now = new Date();

    const days = Array.from({ length: 14 }, (_, i) => {
      const d = addDays(now, i - 13);
      return { date: d, ...day(d), isToday: i === 13 };
    });
    const maxCount = Math.max(...days.map((d) => d.count), goal ? Math.min(goal, 12) : 0, 4);
    const top = Math.ceil(maxCount / 2) * 2;

    const slots = days.map((d) => {
      const label = `${dateFmt.format(d.date)}: ${d.count} ${d.count === 1 ? 'pomodoro' : 'pomodoros'}, ${formatMinutes(d.minutes)}`;
      const slot = h('div', {
        class: `bar-slot${d.isToday ? ' is-today' : ''}${d.count ? '' : ' is-zero'}`,
        tabindex: '0',
        role: 'img',
        'aria-label': label,
      }, h('div', { class: 'bar', style: { height: `${(d.count / top) * 100}%` } }));
      const show = () => {
        slot.querySelector('.chart-tip')?.remove();
        slot.append(h('div', { class: 'chart-tip' },
          h('strong', {}, `${d.count} ${d.count === 1 ? 'pomodoro' : 'pomodoros'}`),
          `${d.isToday ? 'Hoy' : dateFmt.format(d.date)}, ${formatMinutes(d.minutes)}`));
      };
      const hide = () => slot.querySelector('.chart-tip')?.remove();
      slot.addEventListener('pointerenter', show);
      slot.addEventListener('pointerleave', hide);
      slot.addEventListener('focus', show);
      slot.addEventListener('blur', hide);
      return slot;
    });

    const table = h('table', { class: 'stats-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Día'), h('th', {}, 'Pomodoros'), h('th', {}, 'Tiempo'))),
      h('tbody', {}, ...[...days].reverse().map((d) =>
        h('tr', {}, h('td', {}, d.isToday ? 'Hoy' : dateFmt.format(d.date)), h('td', {}, d.count), h('td', {}, formatMinutes(d.minutes))))));

    body.replaceChildren(
      h('div', { class: 'stat-hero' },
        h('div', { class: 'stat-hero-value' }, today.count),
        h('div', { class: 'stat-hero-label' }, today.count === 1 ? 'pomodoro hoy' : 'pomodoros hoy'),
        goal ? h('div', { class: 'goal' },
          h('div', { class: 'goal-track', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': goal, 'aria-valuenow': today.count, 'aria-label': 'Objetivo diario' },
            h('div', { class: 'goal-fill', style: { width: `${pct}%` } })),
          h('div', { class: 'goal-text' }, today.count >= goal
            ? `Objetivo de ${goal} cumplido.`
            : `${today.count} de ${goal} del objetivo diario`)) : null),
      h('div', { class: 'stat-tiles' },
        tile(formatMinutes(today.minutes), 'concentrado hoy'),
        tile(week, 'esta semana'),
        tile(streak, streak === 1 ? 'día seguido' : 'días seguidos')),
      h('div', { class: 'chart-head' },
        h('h3', { class: 'chart-title' }, 'Pomodoros en los últimos 14 días'),
        h('button', { class: 'link-btn', type: 'button', onclick: () => { showTable = !showTable; render(); } },
          showTable ? 'Ver gráfico' : 'Ver tabla')),
      showTable ? table : h('div', {},
        h('div', { class: 'chart' },
          h('div', { class: 'chart-grid', style: { top: '0' } }, h('span', {}, top)),
          h('div', { class: 'chart-grid', style: { top: '50%' } }, h('span', {}, top / 2)),
          ...slots),
        h('div', { class: 'chart-axis', 'aria-hidden': 'true' },
          ...days.map((d) => h('span', {}, d.isToday ? 'Hoy' : WEEKDAY[d.date.getDay()])))),
      h('p', { class: 'about' }, total
        ? `${total} ${total === 1 ? 'pomodoro' : 'pomodoros'} en total. Los datos se guardan solo en este navegador.`
        : 'Completa tu primer pomodoro para empezar a ver tu progreso. Los datos se guardan solo en este navegador.')
    );
  }

  function tile(value, label) {
    return h('div', { class: 'stat-tile' }, h('div', { class: 'stat-tile-value' }, value), h('div', { class: 'stat-tile-label' }, label));
  }

  function todayCount() {
    return day(new Date()).count;
  }

  return { record, render, todayCount };
}
