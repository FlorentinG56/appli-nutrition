// Écran « Jour » : objectif, ce qui a été mangé, ce qu'il reste.
import { state, saveDay, daySummary, newId, recipeById } from '../state.js';
import { foodValues, snackValues, zero } from '../calc.js';
import { esc, fmt, parseNum, numInput, toast, openSheet, closeSheet, bar, macroLine, MEALS, defaultMeal, novaBadge } from '../ui.js';
import { pickFood } from './aliments.js';
import { openRecipeEntryForm } from './recettes.js';

export function render(root) {
  const day = state.day;
  const { snack } = state.settings;
  const s = daySummary();
  const c = s.consumed;

  let head;
  if (s.error) {
    head = `<div class="card warn"><h2>Bienvenue 👋</h2><p>Pour calculer votre objectif, complétez d'abord votre profil (âge, taille, poids) dans <a href="#reglages">Réglages</a>.</p></div>`;
  } else {
    const t = s.target;
    const left = t.kcal - c.kcal - s.reserve.kcal;
    head = `<div class="card">
      ${day.sessions.length ? '' : '<p class="notice">Aucune séance saisie : objectif d\'un jour de repos. <a href="#seance">Saisir la séance</a></p>'}
      <div class="center">
        <div class="muted small">Il reste pour la journée</div>
        <div class="big" style="color:${left < 0 ? 'var(--warn)' : 'var(--primary)'}">${fmt(left)} kcal</div>
        <div class="small">P ${fmt(t.p - c.p - s.reserve.p)} g · G ${fmt(t.c - c.c - s.reserve.c)} g · L ${fmt(t.f - c.f - s.reserve.f)} g</div>
        <div class="muted small">Objectif ${fmt(t.kcal)} kcal${s.reserve.kcal ? `, ${esc(snack.name)} déjà mise de côté` : ''}</div>
      </div>
      ${bar('Calories', c.kcal, t.kcal, 'kcal')}
      ${bar('Protéines', c.p, t.p)}
      ${bar('Glucides', c.c, t.c)}
      ${bar('Lipides', c.f, t.f)}
      ${bar('Fibres', c.fib, t.fib)}
    </div>`;
  }

  const snackCard = day.snack?.planned && !day.entries.some((e) => e.kind === 'snack')
    ? `<div class="card"><div class="row"><div><b>${esc(snack.name)}${day.snack.milk ? ' (au lait)' : ''}</b> réservée<div class="small muted">${macroLine(s.reserve)}</div></div>
       <button class="btn-primary" id="snack-eaten" style="flex:none">✔ Prise</button></div></div>`
    : '';

  root.innerHTML = `${head}${snackCard}
    <div class="grid2">
      <button class="btn-primary" id="add-entry">＋ Aliment</button>
      <button id="add-manual">＋ Saisie libre</button>
    </div>
    <p class="hint center">Saisie libre : repas non maîtrisé (resto, invité), valeurs estimées.</p>
    ${journal(day.entries, c)}`;

  root.querySelector('#add-entry').onclick = () => pickFood('Ajouter au journal', (food) => openEntryForm({ kind: 'food', food }), (recipe) => openRecipeEntryForm({ recipe }));
  root.querySelector('#add-manual').onclick = () => openManualForm(null);
  root.querySelector('#snack-eaten')?.addEventListener('click', async () => {
    day.entries.push({ id: newId(), kind: 'snack', name: snack.name + (day.snack.milk ? ' (au lait)' : ''), meal: 'Collation', values: snackValues(snack, day.snack.milk), time: Date.now() });
    await saveDay();
    toast(`${snack.name} notée`);
    render(root);
  });
  root.querySelectorAll('li[data-entry]').forEach((li) => {
    li.onclick = () => {
      const e = day.entries.find((x) => x.id === li.dataset.entry);
      if (e.kind === 'food') openEntryForm({ kind: 'food', entry: e });
      else if (e.kind === 'recipe') openRecipeEntryForm({ entry: e, recipe: recipeById(e.recipeId) });
      else openManualForm(e);
    };
  });
}

function journal(entries, c) {
  if (!entries.length) return '<div class="card"><p class="muted center">Rien de noté pour ce jour.</p></div>';
  const groups = MEALS.map((m) => [m, entries.filter((e) => e.meal === m)]).filter(([, l]) => l.length);
  const others = entries.filter((e) => !MEALS.includes(e.meal));
  if (others.length) groups.push(['Autre', others]);
  const nova4 = entries.reduce((t, e) => t + (e.kind === 'recipe' ? e.values.kcal * (e.nova4Share || 0) : e.nova === 4 ? e.values.kcal : 0), 0);
  return groups.map(([meal, list]) => {
    const sum = list.reduce((t, e) => t + e.values.kcal, 0);
    return `<div class="card"><h2>${esc(meal)} <span class="muted small">${fmt(sum)} kcal</span></h2><ul class="list">
      ${list.map((e) => `<li class="tap" data-entry="${e.id}"><div class="grow">
        <div class="name">${e.kind === 'recipe' ? '📖 ' : ''}${esc(e.name)} ${novaBadge(e.nova)}</div>
        <div class="sub">${e.kind === 'food' ? `${e.units ? `${fmt(e.units, 1)} × ${esc(e.unitName || 'unité')} = ` : ''}${fmt(e.grams)} g${e.state ? ` ${esc(e.state)}` : ''} · ` : e.kind === 'manual' ? 'estimation · ' : e.kind === 'recipe' ? `${e.servings != null ? `${fmt(e.servings, 1)} portion${e.servings > 1 ? 's' : ''}` : `${fmt(e.grams)} g cuit`} · ` : ''}${macroLine(e.values)}</div>
      </div><span aria-hidden="true">›</span></li>`).join('')}
    </ul></div>`;
  }).join('') + `<p class="center small muted">Total mangé : ${macroLine(c)} · fibres ${fmt(c.fib)} g${nova4 ? `<br>Ultra-transformés (NOVA 4) : ${fmt((nova4 / Math.max(1, c.kcal)) * 100)} % des kcal` : ''}</p>`;
}

// Ajout ou modification d'un aliment du journal.
// opts : { food } pour un nouvel ajout, ou { entry } pour modifier.
export function openEntryForm({ food, entry }) {
  const per100 = entry ? entry.per100 : pick100(food);
  const unitWeight = entry ? entry.unitWeight : food.unitWeight;
  const unitName = entry ? entry.unitName : food.unitName;
  const name = entry ? entry.name : food.name;
  let byUnit = entry ? !!entry.units : !!unitWeight;
  const meal = entry ? entry.meal : defaultMeal();

  openSheet(`
    <h2>${esc(name)}</h2>
    <p class="small muted">${macroLine(per100)} pour 100 g${(entry?.state || food?.state) ? ` (${esc(entry?.state || food?.state)})` : ''}</p>
    <form id="entry-form" autocomplete="off">
      <label>Repas</label>
      <select name="meal">${MEALS.map((m) => `<option ${m === meal ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>
      ${unitWeight ? `<div class="seg" data-seg="unit"><button type="button" data-v="g">En grammes</button><button type="button" data-v="u">À l'unité (${fmt(unitWeight)} g)</button></div>` : ''}
      <label id="qty-label"></label>
      ${numInput('qty', '', 'required')}
      ${food?.packPortion ? `<button type="button" class="btn-small" id="pack">Portion du paquet : ${fmt(food.packPortion)} g</button>` : ''}
      <p class="notice" id="preview"></p>
      <button type="submit" class="btn-primary btn-block">${entry ? 'Enregistrer' : 'Ajouter au journal'}</button>
      ${entry ? '<button type="button" class="btn-danger btn-block" id="del-entry">Retirer du journal</button>' : ''}
    </form>`, (body) => {
    const form = body.querySelector('#entry-form');
    const qty = form.elements.qty;
    const grams = () => { const q = parseNum(qty.value) || 0; return byUnit ? q * unitWeight : q; };
    const refresh = () => {
      body.querySelector('#qty-label').textContent = byUnit ? `Nombre (${unitName || 'unités'})` : 'Quantité (g)';
      body.querySelectorAll('[data-seg="unit"] button').forEach((b) => b.classList.toggle('on', (b.dataset.v === 'u') === byUnit));
      body.querySelector('#preview').textContent = `${fmt(grams())} g → ${macroLine(foodValues(per100, grams()))}`;
    };
    if (entry) qty.value = String(byUnit ? entry.units : entry.grams).replace('.', ',');
    body.querySelector('[data-seg="unit"]')?.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const g = grams();
      byUnit = b.dataset.v === 'u';
      if (g) qty.value = String(byUnit ? Math.round((g / unitWeight) * 10) / 10 : Math.round(g)).replace('.', ',');
      refresh();
    });
    body.querySelector('#pack')?.addEventListener('click', () => { byUnit = false; qty.value = String(food.packPortion).replace('.', ','); refresh(); });
    qty.oninput = refresh;
    refresh();
    setTimeout(() => qty.focus(), 50);
    form.onsubmit = async (e) => {
      e.preventDefault();
      const g = grams();
      if (!(g > 0)) return toast('Indiquez une quantité');
      const data = entry || {
        id: newId(), kind: 'food', foodId: food.id, name: food.name, brand: food.brand, state: food.state, nova: food.nova,
        per100, unitWeight: food.unitWeight || null, unitName: food.unitName || '', time: Date.now(),
      };
      data.meal = form.elements.meal.value;
      data.grams = g;
      data.units = byUnit ? parseNum(qty.value) : null;
      data.values = foodValues(per100, g);
      if (!entry) state.day.entries.push(data);
      await saveDay();
      closeSheet();
      toast(entry ? 'Modifié' : 'Ajouté au journal');
      state.rerender();
    };
    body.querySelector('#del-entry')?.addEventListener('click', () => removeEntry(entry));
  });
}

async function removeEntry(entry) {
  state.day.entries = state.day.entries.filter((x) => x.id !== entry.id);
  await saveDay();
  closeSheet();
  toast('Retiré du journal');
  state.rerender();
}

export function pick100(food) {
  return { kcal: food.kcal || 0, p: food.p || 0, c: food.c || 0, f: food.f || 0, fib: food.fib || 0 };
}

// Saisie libre (repas non maîtrisé) ou modification de la collation notée.
function openManualForm(entry) {
  const v = entry?.values || zero();
  const isSnack = entry?.kind === 'snack';
  openSheet(`
    <h2>${entry ? esc(entry.name) : 'Saisie libre'}</h2>
    <form id="manual-form" autocomplete="off">
      ${isSnack ? '' : `<label>Description</label><input name="name" value="${esc(entry?.name || '')}" placeholder="ex. Resto : burger + frites">`}
      <label>Repas</label>
      <select name="meal">${MEALS.map((m) => `<option ${m === (entry?.meal || defaultMeal()) ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>
      <div class="grid2">
        <div><label>kcal</label>${numInput('kcal', entry ? Math.round(v.kcal) : '')}</div>
        <div><label>Protéines (g)</label>${numInput('p', entry ? Math.round(v.p) : '')}</div>
        <div><label>Glucides (g)</label>${numInput('c', entry ? Math.round(v.c) : '')}</div>
        <div><label>Lipides (g)</label>${numInput('f', entry ? Math.round(v.f) : '')}</div>
        <div><label>Fibres (g)</label>${numInput('fib', entry ? Math.round(v.fib) : '')}</div>
      </div>
      ${isSnack ? '' : `<label class="check"><input type="checkbox" name="nova4" ${entry?.nova === 4 ? 'checked' : ''}> Plutôt ultra-transformé (NOVA 4)</label>`}
      <p class="hint">Estimation sans culpabiliser : le reste de la journée s'ajuste.</p>
      <button type="submit" class="btn-primary btn-block">${entry ? 'Enregistrer' : 'Ajouter au journal'}</button>
      ${entry ? '<button type="button" class="btn-danger btn-block" id="del-entry">Retirer du journal</button>' : ''}
    </form>`, (body) => {
    const form = body.querySelector('#manual-form');
    form.onsubmit = async (e) => {
      e.preventDefault();
      const values = zero();
      for (const k of Object.keys(values)) values[k] = parseNum(form.elements[k].value) || 0;
      if (!values.kcal) return toast('Indiquez au moins les kcal');
      const data = entry || { id: newId(), kind: 'manual', time: Date.now() };
      if (!isSnack) {
        data.name = form.elements.name.value.trim() || 'Repas estimé';
        data.nova = form.elements.nova4.checked ? 4 : null;
      }
      data.meal = form.elements.meal.value;
      data.values = values;
      if (!entry) state.day.entries.push(data);
      await saveDay();
      closeSheet();
      toast(entry ? 'Modifié' : 'Ajouté au journal');
      state.rerender();
    };
    body.querySelector('#del-entry')?.addEventListener('click', () => removeEntry(entry));
  });
}

