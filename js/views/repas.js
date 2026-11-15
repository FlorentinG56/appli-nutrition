// Écran « Repas » : je choisis mes aliments, l'appli propose les quantités.
import { state, saveDay, daySummary, newId, resolveFood as foodById, recipeById, recipeInfo } from '../state.js';
import { mealShare, planMeal, add } from '../calc.js';
import { esc, fmt, parseNum, numInput, toast, closeSheet, macroLine, MEALS, defaultMeal, novaBadge } from '../ui.js';
import { pickFood } from './aliments.js';
import { pick100 } from './jour.js';

const MODES = [['auto', 'Calculer'], ['fixed', 'Fixé'], ['free', 'À volonté']];

function defaultMealsLeft() {
  const h = new Date().getHours();
  return h < 10 ? 3 : h < 15 ? 2 : 1;
}

export function render(root) {
  const m = state.meal;
  m.label ||= defaultMeal();
  m.mealsLeft ||= defaultMealsLeft();
  m.items = m.items.filter((it) => foodById(it.foodId));
  const s = daySummary();

  if (s.error) {
    root.innerHTML = `<div class="card warn"><p>Complétez votre profil dans <a href="#reglages">Réglages</a> pour calculer les quantités.</p></div>`;
    return;
  }
  const share = mealShare(s.target, s.consumed, s.reserve, m.mealsLeft);
  const dayLeft = mealShare(s.target, s.consumed, s.reserve, 1);

  root.innerHTML = `
    <div class="card">
      <h2>Part de ce repas</h2>
      <label>Repas</label>
      <select id="meal-label">${MEALS.map((x) => `<option ${x === m.label ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
      <label>Repas restants dans la journée (celui-ci compris)</label>
      <div class="seg" id="meals-left">${[1, 2, 3, 4].map((n) => `<button type="button" data-v="${n}" class="${n === m.mealsLeft ? 'on' : ''}">${n}</button>`).join('')}</div>
      <p class="small">Reste du jour : ${macroLine(dayLeft)}${s.reserve.kcal ? `<br><span class="muted">${esc(state.settings.snack.name)} déjà mise de côté (${fmt(s.reserve.kcal)} kcal).</span>` : ''}</p>
      <div class="notice"><b>Ce repas : ${fmt(share.kcal)} kcal</b><br>P ${fmt(share.p)} g · G ${fmt(share.c)} g · L ${fmt(share.f)} g</div>
    </div>

    <div class="card">
      <h2>Mes aliments</h2>
      ${m.items.length ? '' : '<p class="muted">Choisissez les aliments de votre repas : l\'appli calcule les grammes.</p>'}
      <div id="items">${m.items.map(itemCard).join('')}</div>
      <button class="btn-block" id="add-item">＋ Choisir un aliment</button>
      <button class="btn-primary btn-block" id="compute" ${m.items.length ? '' : 'disabled'}>Calculer les quantités</button>
    </div>
    <div id="result">${m.result ? resultHtml(m.result, share, dayLeft) : ''}</div>`;

  root.querySelector('#meal-label').onchange = (e) => { m.label = e.target.value; render(root); };
  root.querySelector('#meals-left').onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    m.mealsLeft = Number(b.dataset.v);
    m.result = null;
    render(root);
  };
  const addItem = (id, byUnit) => {
    if (!m.items.some((it) => it.foodId === id)) m.items.push({ foodId: id, mode: 'auto', byUnit, amount: null });
    m.result = null;
    closeSheet();
    render(root);
  };
  // Une recette compte à la portion (au gramme possible si son poids cuit est connu).
  root.querySelector('#add-item').onclick = () => pickFood('Ajouter au repas', (food) => addItem(food.id, !!food.unitWeight), (r) => addItem('r:' + r.id, true));

  const items = root.querySelector('#items');
  items.onclick = (e) => {
    const card = e.target.closest('[data-i]');
    if (!card) return;
    const it = m.items[Number(card.dataset.i)];
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.remove != null) m.items.splice(Number(card.dataset.i), 1);
    else if (b.dataset.mode) {
      it.mode = b.dataset.mode;
      if (it.mode !== 'auto' && it.amount == null) it.amount = defaultAmount(it);
    } else if (b.dataset.unit) {
      it.byUnit = b.dataset.unit === 'u';
      it.amount = it.mode === 'auto' ? null : defaultAmount(it);
    } else return;
    m.result = null;
    render(root);
  };
  items.oninput = (e) => {
    const card = e.target.closest('[data-i]');
    if (card && e.target.name === 'amount') { m.items[Number(card.dataset.i)].amount = parseNum(e.target.value); m.result = null; root.querySelector('#result').innerHTML = ''; }
  };

  root.querySelector('#compute').onclick = () => {
    const bad = m.items.find((it) => it.mode !== 'auto' && !(it.amount > 0));
    if (bad) return toast(`Indiquez la quantité de « ${foodById(bad.foodId).name} »`);
    const input = m.items.map((it) => ({ ...it, food: foodById(it.foodId) }));
    m.result = planMeal(input, share);
    render(root);
    root.querySelector('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  root.querySelector('#add-journal')?.addEventListener('click', async () => {
    for (const it of m.result.items) {
      if (!(it.grams > 0)) continue;
      const f = it.food;
      if (f.isRecipe) {
        const r = recipeById(f.recipeId);
        const t = recipeInfo(r);
        state.day.entries.push({
          id: newId(), kind: 'recipe', recipeId: r.id, name: r.name, perServing: t.perServing, per100: t.per100,
          servingWeight: t.servingWeight, nova: t.maxNova, nova4Share: t.nova4Share,
          servings: it.byUnit ? it.units : null, grams: it.byUnit ? null : it.grams, values: it.values, meal: m.label, time: Date.now(),
        });
        continue;
      }
      state.day.entries.push({
        id: newId(), kind: 'food', foodId: f.id, name: f.name, brand: f.brand, state: f.state, nova: f.nova,
        per100: pick100(f), unitWeight: f.unitWeight || null, unitName: f.unitName || '',
        grams: it.grams, units: it.units || null, values: it.values, meal: m.label, time: Date.now(),
      });
    }
    await saveDay();
    state.meal = { label: null, mealsLeft: null, items: [], result: null };
    toast('Repas ajouté au journal');
    location.hash = '#jour';
  });
}

function defaultAmount(it) {
  const f = foodById(it.foodId);
  if (it.byUnit) return 1;
  return f.packPortion || 100;
}

function itemCard(it, i) {
  const f = foodById(it.foodId);
  const unitSeg = f.unitWeight && !f.unitOnly
    ? `<div class="seg"><button type="button" data-unit="g" class="${it.byUnit ? '' : 'on'}">Grammes</button><button type="button" data-unit="u" class="${it.byUnit ? 'on' : ''}">${f.isRecipe ? 'Portions' : 'À l\'unité'}</button></div>`
    : '';
  const amount = it.mode === 'auto' ? '' : `<label>${it.mode === 'free' ? 'Portion comptée' : 'Quantité'} (${it.byUnit ? esc(f.unitName || 'unités') : 'g'})</label>${numInput('amount', it.amount)}`;
  return `<div class="card" data-i="${i}" style="background:var(--bg)">
    <div class="row"><div class="grow"><b>${f.isRecipe ? '📖 ' : ''}${esc(f.name)}</b> ${f.state ? `<span class="pill">${esc(f.state)}</span>` : ''} ${novaBadge(f.nova)}</div>
      <button type="button" class="btn-small btn-danger" data-remove style="flex:none" aria-label="Retirer">✕</button></div>
    <div class="seg">${MODES.map(([k, l]) => `<button type="button" data-mode="${k}" class="${it.mode === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${unitSeg}${amount}
  </div>`;
}

function resultHtml(r, share, dayLeft) {
  const after = add(dayLeft, r.total, -1);
  const lines = r.items.map((it) => {
    const f = it.food;
    const qty = it.units ? `${fmt(it.units, 1)} ${esc(plural(f.unitName || 'unité', it.units))}` : `${fmt(it.grams)} g`;
    const sub = [it.units ? `${fmt(it.grams)} g` : null, f.state || null, it.mode === 'free' ? 'à volonté' : it.mode === 'fixed' ? 'fixé' : null].filter(Boolean).join(' · ');
    return `<div class="result-item"><div><b>${esc(f.name)}</b>${f.nova === 4 ? ' ' + novaBadge(4) : ''}<div class="small muted">${sub}${it.grams > 0 ? '' : ' — pas nécessaire'}</div></div><div class="qty">${qty}</div></div>`;
  }).join('');
  const diff = (k, u = 'g') => {
    const d = r.total[k] - share[k];
    return Math.abs(d) < (k === 'kcal' ? 25 : 3) ? '✔' : `${d > 0 ? '+' : '−'}${fmt(Math.abs(d))} ${u}`;
  };
  const nova4 = r.items.filter((it) => it.food.nova === 4 && it.grams > 0);
  return `<div class="card">
    <h2>Quantités proposées</h2>
    ${lines}
    <table class="calc" style="margin-top:10px">
      <tr><td>Ce repas</td><td>${fmt(r.total.kcal)} kcal</td></tr>
      <tr><td>Protéines</td><td>${fmt(r.total.p)} g <span class="muted small">(${diff('p')})</span></td></tr>
      <tr><td>Glucides</td><td>${fmt(r.total.c)} g <span class="muted small">(${diff('c')})</span></td></tr>
      <tr><td>Lipides</td><td>${fmt(r.total.f)} g <span class="muted small">(${diff('f')})</span></td></tr>
    </table>
    ${nova4.length ? `<p class="notice">⚠️ Ultra-transformé (NOVA 4) : ${nova4.map((it) => esc(it.food.name)).join(', ')}. À garder occasionnel : existe-t-il une version plus brute ?</p>` : ''}
    <p class="notice">Après ce repas, il restera <b>${fmt(after.kcal)} kcal</b> et <b>${fmt(after.p)} g de protéines</b> pour la journée${state.day.snack?.planned && !state.day.entries.some((e) => e.kind === 'snack') ? ` (en plus de la ${esc(state.settings.snack.name)})` : ''}.</p>
    <p class="hint">Les écarts viennent des aliments choisis : par exemple, sans source de lipides, les lipides resteront bas.</p>
    <button class="btn-primary btn-block" id="add-journal">Ajouter au journal (${esc(state.meal.label)})</button>
  </div>`;
}


const plural = (w, n) => (n > 1 && !/[sx]$/.test(w) ? w + 's' : w);
