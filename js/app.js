// Démarrage de l'appli et navigation entre les onglets.
import { state, loadAll, loadDay, shiftDate, todayISO } from './state.js';
import { formatDate, closeSheet, esc } from './ui.js';
import * as jour from './views/jour.js';
import * as seance from './views/seance.js';
import * as repas from './views/repas.js';
import * as aliments from './views/aliments.js';
import * as reglages from './views/reglages.js';

const VIEWS = {
  jour: { mod: jour, dated: true },
  seance: { mod: seance, dated: true },
  repas: { mod: repas, dated: true },
  aliments: { mod: aliments, title: 'Aliments' },
  reglages: { mod: reglages, title: 'Réglages' },
};

const currentTab = () => (location.hash.slice(1) in VIEWS ? location.hash.slice(1) : 'jour');

export function render() {
  const tab = currentTab();
  const v = VIEWS[tab];
  document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
  document.getElementById('datebar').hidden = !v.dated;
  const title = document.getElementById('page-title');
  title.hidden = !!v.dated;
  title.textContent = v.title || '';
  const isToday = state.date === todayISO();
  document.getElementById('date-label').innerHTML =
    `${esc(formatDate(state.date))}<small>${isToday ? 'Aujourd\'hui' : 'Toucher pour revenir à aujourd\'hui'}</small>`;
  v.mod.render(document.getElementById('view'));
}
state.rerender = render;

async function goToDate(iso) {
  await loadDay(iso);
  state.meal.result = null;
  render();
  window.scrollTo(0, 0);
}

document.getElementById('datebar').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.shift) goToDate(shiftDate(state.date, Number(b.dataset.shift)));
  else goToDate(todayISO());
});
document.getElementById('sheet').addEventListener('click', (e) => {
  if (e.target.closest('[data-close-sheet]')) closeSheet();
});
window.addEventListener('hashchange', () => { closeSheet(); render(); window.scrollTo(0, 0); });

// Si l'appli reste ouverte jusqu'au lendemain, on passe au nouveau jour quand on y revient.
let lastToday = todayISO();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const t = todayISO();
  if (t !== lastToday) {
    const wasToday = state.date === lastToday;
    lastToday = t;
    if (wasToday) goToDate(t);
  }
});

async function start() {
  try {
    await loadAll();
  } catch (err) {
    document.getElementById('view').innerHTML = `<div class="card warn">Impossible d'ouvrir le stockage du téléphone : ${esc(err.message)}.<br>En navigation privée, Safari bloque le stockage.</div>`;
    return;
  }
  render();
  // Demande à Safari de ne pas effacer les données (si possible).
  navigator.storage?.persist?.().catch(() => {});
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
start();
