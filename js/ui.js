// Petits outils d'affichage communs à tous les écrans.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
export const fmt = (n, dec = 0) => (n == null || !isFinite(n) ? '–' : (dec ? nf1 : nf0).format(n));

// Accepte « 12,5 » comme « 12.5 ». Vide → null.
export function parseNum(v) {
  if (v == null) return null;
  const s = String(v).trim().replace(/\s/g, '').replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return isFinite(n) ? n : null;
}

// Durée : « 90 », « 1:30 » ou « 1h30 » → minutes.
export function parseDuration(v) {
  const s = String(v ?? '').trim().toLowerCase().replace(/\s/g, '');
  if (!s) return null;
  const m = s.match(/^(\d+)[:h](\d{0,2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2] || 0);
  return parseNum(s);
}
export function formatDuration(min) {
  if (min == null) return '';
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

export const numInput = (name, value, attrs = '') =>
  `<input name="${name}" inputmode="decimal" autocomplete="off" value="${value == null ? '' : esc(String(value).replace('.', ','))}" ${attrs}>`;

export function formatDate(iso, long = true) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', long ? { weekday: 'long', day: 'numeric', month: 'long' } : { day: 'numeric', month: 'short' });
}

export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2200);
}

// Fenêtre qui monte du bas de l'écran.
export function openSheet(html, onMount) {
  const sheet = document.getElementById('sheet');
  sheet.querySelector('.sheet-body').innerHTML = html;
  sheet.hidden = false;
  document.body.classList.add('sheet-open');
  onMount?.(sheet.querySelector('.sheet-body'));
}
export function closeSheet() {
  const sheet = document.getElementById('sheet');
  sheet.hidden = true;
  sheet.querySelector('.sheet-body').innerHTML = '';
  document.body.classList.remove('sheet-open');
}

export const novaBadge = (n) => (n ? `<span class="nova nova${n}" title="NOVA ${n}">NOVA ${n}</span>` : '');

// Barre de progression consommé / objectif.
export function bar(label, done, target, unit = 'g') {
  const pct = target > 0 ? Math.min(100, (done / target) * 100) : 0;
  const left = target - done;
  const over = left < 0;
  return `<div class="bar-row">
    <div class="bar-head"><strong>${label}</strong><span>${fmt(done)} / ${fmt(target)} ${unit}</span></div>
    <div class="bar"><div class="bar-fill${over ? ' over' : ''}" style="width:${pct}%"></div></div>
    <div class="bar-left ${over ? 'over' : ''}">${over ? `Dépassé de ${fmt(-left)} ${unit}` : `Reste ${fmt(left)} ${unit}`}</div>
  </div>`;
}

export const macroLine = (v) => `${fmt(v.kcal)} kcal · P ${fmt(v.p)} · G ${fmt(v.c)} · L ${fmt(v.f)}`;

// Recherche insensible aux accents et majuscules.
export const norm = (s) => String(s ?? '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export function matchFood(food, q) {
  if (!q) return true;
  const hay = norm(`${food.name} ${food.brand || ''} ${food.store || ''}`);
  return norm(q).split(/\s+/).every((w) => hay.includes(w));
}

export const MEALS = ['Petit-déjeuner', 'Midi', 'Collation', 'Souper', 'Pendant l\'effort', 'Autre'];
export function defaultMeal(date = new Date()) {
  const h = date.getHours();
  return h < 10 ? MEALS[0] : h < 14.5 ? MEALS[1] : h < 17 ? MEALS[2] : MEALS[3];
}
