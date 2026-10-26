// Temas de color y tipografías disponibles.
import { contrast, bestOn, luminance } from './util.js';

export const THEMES = {
  musgo:      { name: 'Musgo',      scheme: 'dark',  focus: '#1F3B33', short: '#24394B', long: '#3A3049', ink: '#EEF0E7', accent: '#E7B76F' },
  tomate:     { name: 'Tomate',     scheme: 'dark',  focus: '#B5473C', short: '#2E6C6E', long: '#3A5680', ink: '#FFF6F0', accent: '#FFE7D1' },
  medianoche: { name: 'Medianoche', scheme: 'dark',  focus: '#161A2E', short: '#14263A', long: '#24193A', ink: '#E4E7F5', accent: '#9DB0FF' },
  oceano:     { name: 'Océano',     scheme: 'dark',  focus: '#0F3A4A', short: '#14473F', long: '#203558', ink: '#E5F4F3', accent: '#7FD4C6' },
  grafito:    { name: 'Grafito',    scheme: 'dark',  focus: '#26282C', short: '#262C30', long: '#2D2930', ink: '#ECEDEE', accent: '#ECEDEE' },
  niebla:     { name: 'Niebla',     scheme: 'light', focus: '#E3E8EC', short: '#DFEAE4', long: '#E6E1EE', ink: '#1C2632', accent: '#2E5C88' },
  salvia:     { name: 'Salvia',     scheme: 'light', focus: '#DCE4D4', short: '#D5E2E2', long: '#E5DDD7', ink: '#26301F', accent: '#4F6B3E' },
  cerezo:     { name: 'Cerezo',     scheme: 'light', focus: '#F4E2E5', short: '#E2EBF2', long: '#ECE3F1', ink: '#3B2430', accent: '#B5466A' },
};

const GF = 'https://fonts.googleapis.com/css2?family=';

export const TIMER_FONTS = {
  fraunces:     { label: 'Serif suave',   family: "'Fraunces'", fallback: 'Georgia, serif', query: 'Fraunces:opsz,wght,SOFT@9..144,200..600,0..100', weight: 300, settings: "'SOFT' 60", tracking: '-0.01em' },
  hanken:       { label: 'Grotesca',      family: "'Hanken Grotesk'", fallback: 'system-ui, sans-serif', query: 'Hanken+Grotesk:wght@200..600', weight: 250, tracking: '-0.03em' },
  bigshoulders: { label: 'Condensada',    family: "'Big Shoulders Display'", fallback: 'Impact, sans-serif', query: 'Big+Shoulders+Display:wght@200..700', weight: 400, tracking: '0em', size: 1.12 },
  unbounded:    { label: 'Expandida',     family: "'Unbounded'", fallback: 'system-ui, sans-serif', query: 'Unbounded:wght@200..600', weight: 300, tracking: '-0.03em', size: 0.8 },
  bodoni:       { label: 'Clásica',       family: "'Bodoni Moda'", fallback: 'Didot, serif', query: 'Bodoni+Moda:opsz,wght@6..96,400..700', weight: 400, tracking: '-0.01em' },
  quicksand:    { label: 'Redondeada',    family: "'Quicksand'", fallback: 'system-ui, sans-serif', query: 'Quicksand:wght@300..700', weight: 400, tracking: '-0.02em' },
  jetbrains:    { label: 'Monoespaciada', family: "'JetBrains Mono'", fallback: 'ui-monospace, monospace', query: 'JetBrains+Mono:wght@100..500', weight: 200, tracking: '-0.05em', size: 0.92 },
  system:       { label: 'Del sistema',   family: 'system-ui', fallback: "-apple-system, 'Segoe UI', sans-serif", query: null, weight: 300, tracking: '-0.02em' },
};

export const UI_FONTS = {
  hanken:   { label: 'Hanken Grotesk', family: "'Hanken Grotesk'", query: 'Hanken+Grotesk:wght@400;500;600' },
  plex:     { label: 'IBM Plex Sans', family: "'IBM Plex Sans'", query: 'IBM+Plex+Sans:wght@400;500;600' },
  nunito:   { label: 'Nunito', family: "'Nunito'", query: 'Nunito:wght@400;500;600' },
  atkinson: { label: 'Atkinson Hyperlegible', family: "'Atkinson Hyperlegible'", query: 'Atkinson+Hyperlegible:wght@400;700' },
  system:   { label: 'Del sistema', family: 'system-ui', query: null },
};

const loaded = new Set();
export function ensureFont(query) {
  if (!query || loaded.has(query)) return;
  loaded.add(query);
  if (document.querySelector(`link[data-font="${CSS.escape(query)}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `${GF}${query}&display=swap`;
  link.dataset.font = query;
  document.head.append(link);
}
// Las dos fuentes por defecto ya vienen en index.html
document.querySelectorAll('link[data-font]').forEach((l) => loaded.add(l.dataset.font));

export function resolveTheme(look) {
  if (look.theme === 'custom') {
    const c = look.custom;
    return { name: 'Personalizado', ...c, scheme: luminance(c.focus) > 0.35 ? 'light' : 'dark' };
  }
  return THEMES[look.theme] || THEMES.musgo;
}

function onAccent(t) {
  if (contrast(t.accent, t.focus) >= 4.5) return t.focus;
  if (contrast(t.accent, t.ink) >= 4.5) return t.ink;
  return bestOn(t.accent, ['#ffffff', '#16191c']);
}

export function applyLook(look) {
  const root = document.documentElement;
  const t = resolveTheme(look);
  const tf = TIMER_FONTS[look.timerFont] || TIMER_FONTS.fraunces;
  const uf = UI_FONTS[look.uiFont] || UI_FONTS.hanken;
  ensureFont(tf.query);
  ensureFont(uf.query);

  const vars = {
    '--bg-focus': t.focus,
    '--bg-short': t.short,
    '--bg-long': t.long,
    '--ink': t.ink,
    '--accent': t.accent,
    '--on-accent': onAccent(t),
    '--font-ui': `${uf.family}, system-ui, -apple-system, 'Segoe UI', sans-serif`,
    '--font-timer': `${tf.family}, ${tf.fallback}`,
    '--timer-weight': tf.weight,
    '--timer-settings': tf.settings || 'normal',
    '--timer-tracking': tf.tracking || '0em',
    '--clock-scale': look.clockScale,
    '--timer-size': tf.size || 1,
    '--shade': look.shade,
    '--blur-n': look.blur,
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.dataset.scheme = t.scheme;
  root.style.colorScheme = t.scheme;
  return { theme: t, timerFont: tf };
}
