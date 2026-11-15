// Écran « Séance » : saisie de l'entraînement du jour et détail du calcul de l'objectif.
import { state, saveDay, daySummary, newId } from '../state.js';
import { SESSION_TYPES, sessionEnergy, snackValues } from '../calc.js';
import { esc, fmt, parseNum, parseDuration, formatDuration, numInput, toast, openSheet, closeSheet, macroLine } from '../ui.js';

const LEVEL_TEXT = ['moins de 1 h', 'de 1 h à 2 h', 'plus de 2 h', 'aucun déficit'];

export function render(root) {
  const day = state.day;
  const { rules, snack } = state.settings;
  const s = daySummary();

  root.innerHTML = `
    <div class="card">
      <h2>Séances du jour</h2>
      ${day.sessions.length ? `<ul class="list">${day.sessions.map((x) => sessionRow(x, rules)).join('')}</ul>` : '<p class="muted">Aucune séance : journée de repos.</p>'}
      <button class="btn-primary btn-block" id="add-session">＋ Ajouter une séance</button>
    </div>

    <div class="card">
      <h2>Ajustements</h2>
      <label class="check"><input type="checkbox" id="f-intense" ${day.intense ? 'checked' : ''}> Séance intense (fractionné, côtes)</label>
      <label class="check"><input type="checkbox" id="f-eve" ${day.eve ? 'checked' : ''}> Veille d'une grosse sortie</label>
      <p class="hint">Chaque case réduit le déficit d'un cran (cumulable, jusqu'à 0).</p>
      <h3>${esc(snack.name)}</h3>
      <label class="check"><input type="checkbox" id="f-snack" ${day.snack?.planned ? 'checked' : ''}> ${esc(snack.name)} prévue</label>
      <label class="check"><input type="checkbox" id="f-milk" ${day.snack?.milk ? 'checked' : ''} ${day.snack?.planned ? '' : 'disabled'}> Version au lait (grosse journée)</label>
      <p class="hint">${esc(snack.description)} — ${macroLine(snackValues(snack, day.snack?.milk))}. Réservée dans l'objectif tant qu'elle n'est pas notée au journal.</p>
    </div>

    ${detail(s, rules)}`;

  root.querySelector('#add-session').onclick = () => openSessionForm(null);
  root.querySelector('.list')?.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-id]');
    if (li) openSessionForm(day.sessions.find((x) => x.id === li.dataset.id));
  });
  const flag = (id, fn) => { root.querySelector(id).onchange = async (e) => { fn(e.target.checked); await saveDay(); render(root); }; };
  flag('#f-intense', (v) => { day.intense = v; });
  flag('#f-eve', (v) => { day.eve = v; });
  flag('#f-snack', (v) => { day.snack = { ...day.snack, planned: v }; });
  flag('#f-milk', (v) => { day.snack = { ...day.snack, milk: v }; });
}

function sessionRow(x, rules) {
  const en = sessionEnergy(x, rules);
  const type = SESSION_TYPES[x.type] || SESSION_TYPES.autre;
  const bits = [];
  if (x.distance != null) bits.push(`${fmt(x.distance, 1)} km`);
  if (x.duration != null) bits.push(formatDuration(x.duration));
  if (x.elevation) bits.push(`${fmt(x.elevation)} m D+`);
  if (x.hr) bits.push(`FC ${fmt(x.hr)}`);
  const garmin = en.garmin != null ? ` · Garmin ${fmt(en.garmin)}` : '';
  return `<li class="tap" data-id="${x.id}"><div class="grow">
    <div class="name">${esc(type.label)}</div>
    <div class="sub">${bits.join(' · ') || '—'}</div>
    <div class="sub">Calcul ${fmt(en.calc)} kcal${en.kmEffort != null ? ` (${fmt(en.kmEffort, 1)} km-effort)` : ''}${garmin}${en.source === 'garmin' ? ' → Garmin utilisé' : ''}</div>
  </div><span aria-hidden="true">›</span></li>`;
}

function detail(s, rules) {
  if (s.error) {
    return `<div class="card warn"><h2>Objectif du jour</h2><p>Complétez votre profil (âge, taille, poids) dans <a href="#reglages">Réglages</a> pour calculer l'objectif.</p></div>`;
  }
  const t = s.target;
  const baseText = s.base.mode === 'auto' ? `Besoins de base (repos ${fmt(s.base.bmr)} × ${String(rules.activityFactor).replace('.', ',')})` : 'Besoins de base (chiffre fixe)';
  const sportLines = s.sessions.map((x) => {
    const type = SESSION_TYPES[x.type] || SESSION_TYPES.autre;
    const how = x.energy.source === 'garmin' ? 'Garmin' : x.energy.kmEffort != null ? `${fmt(x.energy.kmEffort, 1)} km-effort × ${fmt(rules.kcalPerKmEffort)}` : `${fmt(x.energy.minutes)} min × ${fmt(rules.strengthKcalPerMin)}`;
    const ctrl = x.energy.garmin != null && x.energy.source !== 'garmin' ? `<div class="hint">Contrôle Garmin : ${fmt(x.energy.garmin)} kcal (écart ${fmt(x.energy.garmin - x.energy.calc)})</div>` : '';
    return `<tr><td>${esc(type.label)} <span class="muted small">(${how})</span>${ctrl}</td><td>+ ${fmt(x.energy.used)}</td></tr>`;
  }).join('');
  const levelText = LEVEL_TEXT[s.level];
  return `<div class="card">
    <h2>Objectif du jour</h2>
    <div class="big center">${fmt(t.kcal)} kcal</div>
    <div class="macro-grid">
      <div><b>${fmt(t.p)}</b><span>Protéines g</span></div>
      <div><b>${fmt(t.c)}</b><span>Glucides g</span></div>
      <div><b>${fmt(t.f)}</b><span>Lipides g</span></div>
      <div><b>${fmt(t.fib)}</b><span>Fibres g</span></div>
    </div>
    <h3>Comment c'est calculé</h3>
    <table class="calc">
      <tr><td>${baseText}</td><td>${fmt(s.base.value)}</td></tr>
      ${sportLines}
      ${s.lowerBodyExtra ? `<tr><td>Renfo bas du corps (glucides comme ${fmt(rules.lowerBodyExtraKm)} km de plus)</td><td>+ ${fmt(s.lowerBodyExtra)}</td></tr>` : ''}
      <tr><td>Déficit (${fmt(s.minutes)} min de sport : ${levelText}${state.day.intense || state.day.eve ? ', ajusté par les cases' : ''})</td><td>− ${fmt(s.deficit)}</td></tr>
      <tr class="total"><td>Objectif</td><td>${fmt(t.kcal)} kcal</td></tr>
    </table>
    <p class="small"><b>Protéines</b> ${fmt(t.p)} g : ${rules.proteinMode === 'fixed' ? 'chiffre fixe' : `${String(rules.proteinPerKg).replace('.', ',')} g/kg`}.<br>
    <b>Lipides</b> ${fmt(t.f)} g : le plus grand entre le minimum (${fmt(s.fatMin)} g) et ${fmt(rules.fatPct)} % des kcal.<br>
    <b>Glucides</b> ${fmt(t.c)} g : le reste des calories.</p>
  </div>`;
}

function openSessionForm(sess) {
  const x = sess || { type: 'course' };
  const typeOptions = Object.entries(SESSION_TYPES).map(([k, v]) => `<option value="${k}" ${x.type === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('');
  openSheet(`
    <h2>${sess ? 'Modifier la séance' : 'Nouvelle séance'}</h2>
    <form id="sess-form" autocomplete="off">
      <label>Type</label>
      <select name="type">${typeOptions}</select>
      <div class="grid2">
        <div class="run-only"><label>Distance (km)</label>${numInput('distance', x.distance, 'placeholder="ex. 8,5"')}</div>
        <div><label>Durée</label><input name="duration" inputmode="text" value="${x.duration != null ? esc(formatHM(x.duration)) : ''}" placeholder="ex. 45 ou 1:30"></div>
        <div class="run-only"><label>D+ (m)</label>${numInput('elevation', x.elevation, 'placeholder="ex. 250"')}</div>
        <div><label>FC moyenne</label>${numInput('hr', x.hr, 'placeholder="bpm"')}</div>
        <div><label>Kcal Garmin</label>${numInput('garminKcal', x.garminKcal, 'placeholder="facultatif"')}</div>
      </div>
      <p class="hint">Durée en minutes (45) ou en heures:minutes (1:30). Prévue ou faite : vous pourrez corriger après la séance.</p>
      <button type="submit" class="btn-primary btn-block">Enregistrer</button>
      ${sess ? '<button type="button" class="btn-danger btn-block" id="del-sess">Supprimer la séance</button>' : ''}
    </form>`, (body) => {
    const form = body.querySelector('#sess-form');
    const toggle = () => {
      const run = SESSION_TYPES[form.elements.type.value].kind === 'run';
      body.querySelectorAll('.run-only').forEach((el) => { el.hidden = !run; });
    };
    form.elements.type.onchange = toggle;
    toggle();
    form.onsubmit = async (e) => {
      e.preventDefault();
      const type = form.elements.type.value;
      const run = SESSION_TYPES[type].kind === 'run';
      const data = {
        id: x.id || newId(), type,
        distance: run ? parseNum(form.elements.distance.value) : null,
        elevation: run ? parseNum(form.elements.elevation.value) : null,
        duration: parseDuration(form.elements.duration.value),
        hr: parseNum(form.elements.hr.value),
        garminKcal: parseNum(form.elements.garminKcal.value),
      };
      if (run && data.distance == null) return toast('Indiquez la distance');
      if (data.duration == null) return toast('Indiquez la durée (elle sert à choisir le déficit)');
      const list = state.day.sessions;
      const i = list.findIndex((s) => s.id === data.id);
      if (i >= 0) list[i] = data; else list.push(data);
      await saveDay();
      closeSheet();
      toast('Séance enregistrée');
      state.rerender();
    };
    body.querySelector('#del-sess')?.addEventListener('click', async () => {
      state.day.sessions = state.day.sessions.filter((s) => s.id !== x.id);
      await saveDay();
      closeSheet();
      toast('Séance supprimée');
      state.rerender();
    });
  });
}

function formatHM(min) {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}` : String(m);
}
