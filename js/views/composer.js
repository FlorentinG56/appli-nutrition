// Composer un repas depuis la page Jour : je choisis mes aliments,
// l'appli calcule aussitôt la quantité de chacun pour respecter la part du repas.
import { state, saveDay, daySummary, newId, resolveFood, recipeById, recipeInfo } from '../state.js';
import { mealShare, planMeal, add } from '../calc.js';
import { esc, fmt, parseNum, numInput, toast, openSheet, closeSheet, macroLine, novaBadge } from '../ui.js';
import { pickFood } from './aliments.js';
import { pick100 } from './jour.js';

const MAIN = ['Petit-déjeuner', 'Midi', 'Souper'];
const MODES = [['auto', 'Calculé'], ['fixed', 'Fixé'], ['free', 'À volonté']];
const plural = (w, n) => (n > 1 && !/[sx]$/.test(w) ? w + 's' : w);

// Repas restants par défaut : ce repas + les repas principaux suivants encore vides.
function defaultMealsLeft(meal) {
  const empty = (m) => !state.day.entries.some((e) => e.meal === m);
  const i = MAIN.indexOf(meal);
  const after = i >= 0 ? MAIN.slice(i + 1) : MAIN.filter((m) => empty(m) && isLater(m));
  return 1 + after.filter(empty).length;
}
function isLater(m) {
  const h = new Date().getHours();
  return { 'Petit-déjeuner': h < 10, Midi: h < 14, Souper: h < 21 }[m];
}

function draftFor(meal) {
  state.drafts ||= {};
  const key = `${state.date}|${meal}`;
  state.drafts[key] ||= { items: [], mealsLeft: defaultMealsLeft(meal) };
  return state.drafts[key];
}

export function openComposer(meal) {
  const d = draftFor(meal);
  d.items = d.items.filter((it) => resolveFood(it.foodId));
  const s = daySummary();
  if (s.error) {
    openSheet('<h2>Profil incomplet</h2><p>Complétez votre profil dans <a href="#reglages">Réglages</a> pour calculer les quantités.</p>');
    return;
  }
  openSheet(`
    <h2>${esc(meal)}</h2>
    <div class="notice" id="share-box"></div>
    <label>Repas restants dans la journée (celui-ci compris)</label>
    <div class="seg" id="meals-left">${[1, 2, 3, 4].map((n) => `<button type="button" data-v="${n}" class="${n === d.mealsLeft ? 'on' : ''}">${n}</button>`).join('')}</div>

    <h3>Ce que je vais manger</h3>
    ${d.items.length ? '' : '<p class="muted">Ajoutez les aliments de votre repas : l\'appli calcule la quantité de chacun.</p>'}
    <div id="items">${d.items.map((it, i) => itemCard(it, i)).join('')}</div>
    <button type="button" class="btn-primary btn-block" id="add-item">＋ Ajouter un aliment</button>
    <div id="result"></div>`, (body) => {
    const recompute = () => update(body, meal, d);
    recompute();

    body.querySelector('#meals-left').onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      d.mealsLeft = Number(b.dataset.v);
      body.querySelectorAll('#meals-left button').forEach((x) => x.classList.toggle('on', x === b));
      recompute();
    };
    const addItem = (id, byUnit) => {
      if (!d.items.some((it) => it.foodId === id)) d.items.push({ foodId: id, mode: 'auto', byUnit, amount: null });
      openComposer(meal);
    };
    body.querySelector('#add-item').onclick = () => pickFood(`Ajouter au repas (${meal})`,
      (food) => addItem(food.id, !!food.unitWeight),
      (r) => addItem('r:' + r.id, true),
      () => openComposer(meal));

    const items = body.querySelector('#items');
    items.onclick = (e) => {
      const card = e.target.closest('[data-i]');
      const b = e.target.closest('button');
      if (!card || !b) return;
      const i = Number(card.dataset.i);
      const it = d.items[i];
      if (b.dataset.remove != null) d.items.splice(i, 1);
      else if (b.dataset.mode) {
        it.mode = b.dataset.mode;
        // « Fixé » part de la quantité proposée : il suffit de l'ajuster.
        if (it.mode === 'fixed') it.amount = it.lastProposal || defaultAmount(it);
        else if (it.mode === 'free') it.amount = defaultAmount(it);
        else it.amount = null;
      } else if (b.dataset.unit) {
        it.byUnit = b.dataset.unit === 'u';
        it.amount = it.mode === 'auto' ? null : defaultAmount(it);
      } else return;
      openComposer(meal);
    };
    items.oninput = (e) => {
      const card = e.target.closest('[data-i]');
      if (card && e.target.name === 'amount') { d.items[Number(card.dataset.i)].amount = parseNum(e.target.value); recompute(); }
    };
  });
}

function defaultAmount(it) {
  const f = resolveFood(it.foodId);
  return it.byUnit ? 1 : f.packPortion || 100;
}

function itemCard(it, i) {
  const f = resolveFood(it.foodId);
  const unitSeg = f.unitWeight && !f.unitOnly
    ? `<div class="seg"><button type="button" data-unit="g" class="${it.byUnit ? '' : 'on'}">Grammes</button><button type="button" data-unit="u" class="${it.byUnit ? 'on' : ''}">${f.isRecipe ? 'Portions' : 'À l\'unité'}</button></div>`
    : '';
  const amount = it.mode === 'auto' ? '' : `<label>${it.mode === 'free' ? 'Portion comptée' : 'Quantité fixée'} (${it.byUnit ? esc(f.unitName || 'unités') : 'g'})</label>${numInput('amount', it.amount)}`;
  return `<div class="card item-card" data-i="${i}">
    <div class="row"><div class="grow"><b>${f.isRecipe ? '📖 ' : ''}${esc(f.name)}</b> ${f.state ? `<span class="pill">${esc(f.state)}</span>` : ''} ${novaBadge(f.nova)}</div>
      <div class="qty" data-out="${i}"></div>
      <button type="button" class="btn-small btn-danger" data-remove style="flex:none" aria-label="Retirer">✕</button></div>
    <div class="seg">${MODES.map(([k, l]) => `<button type="button" data-mode="${k}" class="${it.mode === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${unitSeg}${amount}
  </div>`;
}

// Recalcule tout et met à jour l'affichage sans toucher aux champs en cours de saisie.
function update(body, meal, d) {
  const s = daySummary();
  const share = mealShare(s.target, s.consumed, d.mealsLeft);
  const dayLeft = mealShare(s.target, s.consumed, 1);
  body.querySelector('#share-box').innerHTML = `<b>Part de ce repas : ${fmt(share.kcal)} kcal</b><br>P ${fmt(share.p)} g · G ${fmt(share.c)} g · L ${fmt(share.f)} g
    <div class="hint">Reste du jour ${fmt(dayLeft.kcal)} kcal.</div>`;
  const out = body.querySelector('#result');
  if (!d.items.length) { out.innerHTML = ''; return; }
  const bad = d.items.find((it) => it.mode !== 'auto' && !(it.amount > 0));
  const input = d.items.map((it) => ({ ...it, food: resolveFood(it.foodId) }));
  const r = planMeal(bad ? input.map((it) => (it === input[d.items.indexOf(bad)] ? { ...it, amount: 0 } : it)) : input, share);
  r.items.forEach((it, i) => {
    const f = it.food;
    d.items[i].lastProposal = it.units ?? it.grams;
    const el = body.querySelector(`[data-out="${i}"]`);
    if (el) el.innerHTML = it.units ? `${fmt(it.units, 1)} <small>${esc(plural(f.unitName || 'unité', it.units))}</small>` : `${fmt(it.grams)} <small>g${f.state ? ' ' + esc(f.state) : ''}</small>`;
  });
  const after = add(dayLeft, r.total, -1);
  const diff = (k) => {
    const x = r.total[k] - share[k];
    return Math.abs(x) < (k === 'kcal' ? 25 : 3) ? '✔' : `${x > 0 ? '+' : '−'}${fmt(Math.abs(x))}`;
  };
  const nova4 = r.items.filter((it) => it.food.nova === 4 && it.grams > 0);
  const zero = r.items.filter((it) => it.mode === 'auto' && !(it.grams > 0));
  out.innerHTML = `<div class="card">
    <table class="calc">
      <tr><td>Ce repas</td><td>${fmt(r.total.kcal)} kcal <span class="muted small">(${diff('kcal')})</span></td></tr>
      <tr><td>Protéines</td><td>${fmt(r.total.p)} g <span class="muted small">(${diff('p')})</span></td></tr>
      <tr><td>Glucides</td><td>${fmt(r.total.c)} g <span class="muted small">(${diff('c')})</span></td></tr>
      <tr><td>Lipides</td><td>${fmt(r.total.f)} g <span class="muted small">(${diff('f')})</span></td></tr>
    </table>
    ${zero.length ? `<p class="notice">${zero.map((it) => esc(it.food.name)).join(', ')} : pas nécessaire pour ce repas (l'objectif est déjà atteint avec le reste).</p>` : ''}
    ${nova4.length ? `<p class="notice">⚠️ Ultra-transformé (NOVA 4) : ${nova4.map((it) => esc(it.food.name)).join(', ')}. À garder occasionnel.</p>` : ''}
    <p class="small">Après ce repas, il restera <b>${fmt(after.kcal)} kcal</b> et <b>${fmt(after.p)} g de protéines</b> pour la journée.</p>
    <p class="hint">Touchez « Fixé » sur un aliment pour imposer sa quantité : les autres s'ajustent.</p>
    ${bad ? '<p class="notice warn">Indiquez la quantité de l\'aliment fixé.</p>' : ''}
    <button type="button" class="btn-primary btn-block" id="to-journal" ${bad ? 'disabled' : ''}>✔ Ajouter au journal (${esc(meal)})</button>
  </div>`;
  out.querySelector('#to-journal').onclick = async () => {
    for (const it of r.items) {
      if (!(it.grams > 0)) continue;
      const f = it.food;
      if (f.isRecipe) {
        const rec = recipeById(f.recipeId);
        const t = recipeInfo(rec);
        state.day.entries.push({
          id: newId(), kind: 'recipe', recipeId: rec.id, name: rec.name, perServing: t.perServing, per100: t.per100,
          servingWeight: t.servingWeight, nova: t.maxNova, nova4Share: t.nova4Share,
          servings: it.byUnit ? it.units : null, grams: it.byUnit ? null : it.grams, values: it.values, meal, time: Date.now(),
        });
        continue;
      }
      state.day.entries.push({
        id: newId(), kind: 'food', foodId: f.id, name: f.name, brand: f.brand, state: f.state, nova: f.nova,
        per100: pick100(f), unitWeight: f.unitWeight || null, unitName: f.unitName || '',
        grams: it.grams, units: it.units || null, values: it.values, meal, time: Date.now(),
      });
    }
    await saveDay();
    delete state.drafts[`${state.date}|${meal}`];
    closeSheet();
    toast(`${meal} ajouté au journal`);
    state.rerender();
  };
}
