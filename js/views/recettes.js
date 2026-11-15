// Onglet Cuisine › Recettes : fiches recettes (ingrédients, préparation, apports).
import { state, saveRecipe, deleteRecipe, recipeById, recipeInfo, ingredientFood, saveDay, newId } from '../state.js';
import { recipeTotals, scaleRecipe, foodValues } from '../calc.js';
import { esc, fmt, parseNum, parseDuration, formatDuration, numInput, toast, openSheet, closeSheet, novaBadge, matchFood, rank, macroLine, MEALS, defaultMeal } from '../ui.js';
import { pickFood, cuisineSwitch } from './aliments.js';

let query = '';
let viewing = null;   // id de la recette affichée
let draft = null;     // recette en cours de modification

export function render(root) {
  if (draft) return renderEditor(root);
  const r = viewing && recipeById(viewing);
  if (r) return renderDetail(root, r);
  viewing = null;
  renderList(root);
}

// Ouvre directement une recette (depuis une autre partie de l'appli).
export function show(id) { viewing = id; draft = null; }

// ---------- Liste ----------
function renderList(root) {
  const list = state.recipes.filter((r) => matchFood({ name: r.name }, query));
  root.innerHTML = `${cuisineSwitch('recettes')}
    <button class="btn-primary btn-block" id="new-recipe">＋ Nouvelle recette</button>
    <div class="card" style="margin-top:12px">
      <input type="search" id="recipe-search" placeholder="Rechercher une recette" value="${esc(query)}">
      ${state.recipes.length ? '' : '<p>Aucune recette pour l\'instant. Une recette se compose d\'aliments de votre base : ajoutez d\'abord les ingrédients dans « Aliments ».</p>'}
      <ul class="list" id="recipe-list">${list.map(recipeRow).join('')}</ul>
    </div>`;
  root.querySelector('#new-recipe').onclick = () => { draft = newDraft(); render(root); window.scrollTo(0, 0); };
  const search = root.querySelector('#recipe-search');
  search.oninput = () => {
    query = search.value;
    root.querySelector('#recipe-list').innerHTML = state.recipes.filter((r) => matchFood({ name: r.name }, query)).map(recipeRow).join('');
  };
  root.querySelector('#recipe-list').onclick = (e) => {
    const li = e.target.closest('li[data-rid]');
    if (li) { viewing = li.dataset.rid; render(root); window.scrollTo(0, 0); }
  };
}

export function recipeRow(r) {
  const t = recipeInfo(r);
  const time = (r.prepTime || 0) + (r.cookTime || 0);
  return `<li class="tap" data-rid="${r.id}"><div class="grow">
    <div class="name">📖 ${esc(r.name)} ${t.maxNova ? novaBadge(t.maxNova) : ''}</div>
    <div class="sub">Par portion : ${macroLine(t.perServing)}</div>
    <div class="sub">${fmt(r.servings, 1)} portion${r.servings > 1 ? 's' : ''}${time ? ` · ${formatDuration(time)}` : ''}</div>
  </div><span aria-hidden="true">›</span></li>`;
}

// ---------- Fiche ----------
function renderDetail(root, r) {
  const t = recipeInfo(r);
  const missing = r.ingredients.filter((i) => ingredientFood(i).missing);
  const steps = (r.steps || []).filter(Boolean);
  root.innerHTML = `
    <button class="btn-small" id="back">‹ Recettes</button>
    <div class="card" style="margin-top:10px">
      <h2>${esc(r.name)} ${t.maxNova ? novaBadge(t.maxNova) : ''}</h2>
      <p class="small muted">${fmt(r.servings, 1)} portion${r.servings > 1 ? 's' : ''}${t.servingWeight ? ` de ${fmt(t.servingWeight)} g cuit` : ''}${r.prepTime ? ` · préparation ${formatDuration(r.prepTime)}` : ''}${r.cookTime ? ` · cuisson ${formatDuration(r.cookTime)}` : ''}</p>
      <h3>Par portion</h3>
      ${macroGrid(t.perServing)}
      <p class="small muted center">Recette entière : ${macroLine(t.total)} · fibres ${fmt(t.total.fib)} g${t.per100 ? `<br>Pour 100 g cuit : ${macroLine(t.per100)}` : ''}</p>
      ${novaWarning(t)}
      <button class="btn-primary btn-block" id="to-journal">＋ Ajouter au journal</button>
    </div>

    <div class="card">
      <h2>Ingrédients</h2>
      ${missing.length ? `<p class="notice">⚠️ Aliment supprimé de la base : ${missing.map((i) => esc(i.snapshot?.name)).join(', ')}. Ses dernières valeurs connues sont utilisées.</p>` : ''}
      <ul class="list">${r.ingredients.map((i) => {
        const f = ingredientFood(i);
        const v = foodValues(f, i.grams);
        return `<li><div class="grow"><div class="name">${esc(f.name)} ${f.state ? `<span class="pill">${esc(f.state)}</span>` : ''} ${novaBadge(f.nova)}</div><div class="sub">${fmt(v.kcal)} kcal · P ${fmt(v.p)} · G ${fmt(v.c)} · L ${fmt(v.f)}</div></div>
          <b style="white-space:nowrap">${ingredientQty(i, f)}</b></li>`;
      }).join('')}</ul>
      <button class="btn-block" id="scale">Adapter le nombre de portions</button>
    </div>

    <div class="card">
      <h2>Préparation</h2>
      ${r.utensils ? `<p><b>Ustensiles :</b> ${esc(r.utensils)}</p>` : ''}
      ${steps.length ? `<ol class="steps">${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : '<p class="muted">Pas encore d\'étapes : touchez « Modifier » pour les écrire.</p>'}
      ${r.tips ? `<h3>Astuces et variantes</h3><p style="white-space:pre-line">${esc(r.tips)}</p>` : ''}
    </div>

    <div class="grid2">
      <button id="edit">Modifier</button>
      <button id="dup">Dupliquer</button>
    </div>
    <button class="btn-danger btn-block" id="del">Supprimer la recette</button>`;

  root.querySelector('#back').onclick = () => { viewing = null; render(root); };
  root.querySelector('#to-journal').onclick = () => openRecipeEntryForm({ recipe: r });
  root.querySelector('#edit').onclick = () => { draft = structuredClone(r); render(root); window.scrollTo(0, 0); };
  root.querySelector('#dup').onclick = () => {
    draft = { ...structuredClone(r), id: null, name: `${r.name} (copie)` };
    render(root);
    window.scrollTo(0, 0);
  };
  root.querySelector('#del').onclick = async () => {
    if (!confirm(`Supprimer la recette « ${r.name} » ? Le journal déjà noté ne change pas.`)) return;
    await deleteRecipe(r.id);
    viewing = null;
    toast('Recette supprimée');
    render(root);
  };
  root.querySelector('#scale').onclick = () => openScaleForm(r, root);
}

function ingredientQty(i, f) {
  if (i.units) return `${fmt(i.units, 1)} ${esc(f.unitName || 'unité(s)')} <span class="muted small">(${fmt(i.grams)} g)</span>`;
  return `${fmt(i.grams)} g`;
}

const macroGrid = (v) => `<div class="macro-grid">
  <div><b>${fmt(v.kcal)}</b><span>kcal</span></div>
  <div><b>${fmt(v.p)}</b><span>Protéines g</span></div>
  <div><b>${fmt(v.c)}</b><span>Glucides g</span></div>
  <div><b>${fmt(v.f)}</b><span>Lipides g</span></div>
</div>`;

function novaWarning(t) {
  if (!t.nova4.length) return '';
  return `<p class="notice">⚠️ Ultra-transformé (NOVA 4) : ${t.nova4.map(esc).join(', ')} — ${fmt(t.nova4Share * 100)} % des kcal de la recette. Existe-t-il une version plus brute ?</p>`;
}

function openScaleForm(r, root) {
  openSheet(`
    <h2>Adapter les portions</h2>
    <p class="small">Actuellement : ${fmt(r.servings, 1)} portion(s). Toutes les quantités seront recalculées au prorata${r.cookedWeight ? ', ainsi que le poids cuit' : ''}.</p>
    <form id="scale-form">
      <label>Nouveau nombre de portions</label>
      ${numInput('servings', r.servings)}
      <button type="submit" class="btn-primary btn-block">Recalculer et enregistrer</button>
      <button type="button" class="btn-block" id="scale-copy">Recalculer dans une copie</button>
    </form>`, (body) => {
    const form = body.querySelector('#scale-form');
    const go = async (copy) => {
      const n = parseNum(form.elements.servings.value);
      if (!(n > 0)) return toast('Indiquez un nombre de portions');
      const scaled = scaleRecipe(structuredClone(r), n);
      if (copy) { scaled.id = null; scaled.name = `${r.name} (${fmt(n, 1)} portions)`; }
      const saved = await saveRecipe(scaled);
      viewing = saved.id;
      closeSheet();
      toast('Quantités recalculées');
      render(root);
    };
    form.onsubmit = (e) => { e.preventDefault(); go(false); };
    body.querySelector('#scale-copy').onclick = () => go(true);
  });
}

// ---------- Édition ----------
function newDraft() {
  return { id: null, name: '', servings: 1, cookedWeight: null, ingredients: [], prepTime: null, cookTime: null, utensils: '', steps: [], tips: '' };
}

function renderEditor(root) {
  const d = draft;
  root.innerHTML = `
    <form id="recipe-form" autocomplete="off">
      <div class="card">
        <h2>${d.id ? 'Modifier la recette' : 'Nouvelle recette'}</h2>
        <label>Nom *</label>
        <input name="name" value="${esc(d.name)}" placeholder="ex. Chili au bœuf">
        <div class="grid2">
          <div><label>Portions *</label>${numInput('servings', d.servings)}</div>
          <div><label>Poids total cuit (g)</label>${numInput('cookedWeight', d.cookedWeight, 'placeholder="facultatif"')}</div>
        </div>
        <p class="hint">Pesez le plat fini (sans le récipient) : vous pourrez ensuite noter au journal en grammes.</p>
      </div>

      <div class="card">
        <h2>Ingrédients</h2>
        <div id="ings">${d.ingredients.map(ingEditor).join('')}</div>
        <button type="button" class="btn-block" id="add-ing">＋ Ajouter un ingrédient</button>
        <div id="live"></div>
      </div>

      <div class="card">
        <h2>Préparation</h2>
        <div class="grid2">
          <div><label>Préparation</label><input name="prepTime" value="${d.prepTime != null ? esc(String(d.prepTime)) : ''}" placeholder="minutes"></div>
          <div><label>Cuisson</label><input name="cookTime" value="${d.cookTime != null ? esc(String(d.cookTime)) : ''}" placeholder="minutes"></div>
        </div>
        <label>Ustensiles</label>
        <input name="utensils" value="${esc(d.utensils)}" placeholder="ex. poêle, casserole, shaker">
        <label>Étapes (une par ligne)</label>
        <textarea name="steps" rows="6" placeholder="Lave la pomme…&#10;Verse le miel…">${esc((d.steps || []).join('\n'))}</textarea>
        <p class="hint">Chaque ligne devient une étape numérotée.</p>
        <label>Astuces et variantes</label>
        <textarea name="tips" rows="4">${esc(d.tips)}</textarea>
      </div>

      <button type="submit" class="btn-primary btn-block">Enregistrer la recette</button>
      <button type="button" class="btn-block" id="cancel">Annuler</button>
    </form>`;

  const form = root.querySelector('#recipe-form');
  const readHead = () => {
    d.name = form.elements.name.value;
    d.servings = parseNum(form.elements.servings.value);
    d.cookedWeight = parseNum(form.elements.cookedWeight.value);
    d.prepTime = parseDuration(form.elements.prepTime.value);
    d.cookTime = parseDuration(form.elements.cookTime.value);
    d.utensils = form.elements.utensils.value.trim();
    d.steps = form.elements.steps.value.split('\n').map((s) => s.replace(/^\s*\d+[.)-]?\s*/, '').trim()).filter(Boolean);
    d.tips = form.elements.tips.value.trim();
  };
  const live = () => {
    const list = d.ingredients.map((i) => ({ food: ingredientFood(i), grams: i.grams || 0 }));
    const t = recipeTotals(list, parseNum(form.elements.servings.value), parseNum(form.elements.cookedWeight.value));
    root.querySelector('#live').innerHTML = d.ingredients.length
      ? `<h3>Par portion</h3>${macroGrid(t.perServing)}<p class="small muted center">Recette entière : ${macroLine(t.total)}</p>${novaWarning(t)}`
      : '<p class="muted">Ajoutez les ingrédients : les apports se calculent au fur et à mesure.</p>';
  };
  live();

  form.oninput = (e) => {
    const box = e.target.closest('[data-ing]');
    if (box && e.target.name === 'qty') {
      const ing = d.ingredients[Number(box.dataset.ing)];
      const f = ingredientFood(ing);
      const q = parseNum(e.target.value) || 0;
      if (ing.units != null) { ing.units = q; ing.grams = q * (f.unitWeight || 0); } else ing.grams = q;
      box.querySelector('.ing-values').textContent = macroLine(foodValues(f, ing.grams));
    }
    live();
  };
  root.querySelector('#ings').onclick = (e) => {
    const box = e.target.closest('[data-ing]');
    const b = e.target.closest('button');
    if (!box || !b) return;
    const i = Number(box.dataset.ing);
    const ing = d.ingredients[i];
    const f = ingredientFood(ing);
    readHead();
    if (b.dataset.remove != null) d.ingredients.splice(i, 1);
    else if (b.dataset.unit) {
      if (b.dataset.unit === 'u' && ing.units == null) ing.units = Math.round((ing.grams / f.unitWeight) * 10) / 10 || 1;
      if (b.dataset.unit === 'g') ing.units = null;
      ing.grams = ing.units != null ? ing.units * f.unitWeight : ing.grams;
    } else return;
    renderEditor(root);
  };
  root.querySelector('#add-ing').onclick = () => {
    readHead();
    pickFood('Ajouter un ingrédient', (food) => {
      d.ingredients.push({ foodId: food.id, grams: food.unitWeight ? food.unitWeight : 100, units: food.unitWeight ? 1 : null, snapshot: snapshot(food) });
      closeSheet();
      renderEditor(root);
      const last = root.querySelector(`[data-ing="${d.ingredients.length - 1}"] input`);
      last?.scrollIntoView({ block: 'center' });
      last?.select();
    });
  };
  root.querySelector('#cancel').onclick = () => { draft = null; render(root); };
  form.onsubmit = async (e) => {
    e.preventDefault();
    readHead();
    d.name = d.name.trim();
    if (!d.name) return toast('Donnez un nom à la recette');
    if (!(d.servings > 0)) return toast('Indiquez le nombre de portions');
    if (!d.ingredients.length) return toast('Ajoutez au moins un ingrédient');
    if (d.ingredients.some((i) => !(i.grams > 0))) return toast('Une quantité d\'ingrédient est vide');
    // Copie des valeurs de chaque aliment, au cas où il serait supprimé de la base plus tard.
    d.ingredients.forEach((i) => { const f = ingredientFood(i); if (!f.missing) i.snapshot = snapshot(f); });
    const saved = await saveRecipe(d);
    draft = null;
    viewing = saved.id;
    toast('Recette enregistrée');
    render(root);
    window.scrollTo(0, 0);
  };
}

function snapshot(f) {
  const { name, kcal, p, c, f: fat, fib, nova, state: st, unitWeight, unitName } = f;
  return { name, kcal, p, c, f: fat, fib, nova, state: st, unitWeight, unitName };
}

function ingEditor(ing, i) {
  const f = ingredientFood(ing);
  const byUnit = ing.units != null;
  return `<div class="card" data-ing="${i}" style="background:var(--bg)">
    <div class="row"><div class="grow"><b>${esc(f.name)}</b> ${f.state ? `<span class="pill">${esc(f.state)}</span>` : ''} ${novaBadge(f.nova)}${f.missing ? ' <span class="pill">supprimé de la base</span>' : ''}</div>
      <button type="button" class="btn-small btn-danger" data-remove style="flex:none" aria-label="Retirer">✕</button></div>
    ${f.unitWeight ? `<div class="seg"><button type="button" data-unit="g" class="${byUnit ? '' : 'on'}">Grammes</button><button type="button" data-unit="u" class="${byUnit ? 'on' : ''}">À l'unité (${fmt(f.unitWeight)} g)</button></div>` : ''}
    <label>${byUnit ? `Nombre (${esc(f.unitName || 'unités')})` : 'Quantité (g)'}</label>
    ${numInput('qty', byUnit ? ing.units : ing.grams)}
    <div class="hint ing-values">${macroLine(foodValues(f, ing.grams || 0))}</div>
  </div>`;
}

// ---------- Journal ----------
// Ajout d'une recette au journal (ou modification d'une ligne déjà notée).
export function openRecipeEntryForm({ recipe, entry, meal: mealArg }) {
  const t = recipe ? recipeInfo(recipe) : null;
  const perServing = entry ? entry.perServing : t.perServing;
  const per100 = entry ? entry.per100 : t.per100;
  const name = entry ? entry.name : recipe.name;
  let inGrams = entry ? entry.grams != null && entry.servings == null : false;
  const meal = entry ? entry.meal : mealArg || defaultMeal();

  openSheet(`
    <h2>📖 ${esc(name)}</h2>
    <p class="small muted">1 portion : ${macroLine(perServing)}</p>
    <form id="rentry-form" autocomplete="off">
      <label>Repas</label>
      <select name="meal">${MEALS.map((m) => `<option ${m === meal ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>
      ${per100 ? '<div class="seg" data-seg="mode"><button type="button" data-v="s">En portions</button><button type="button" data-v="g">En grammes (cuit)</button></div>' : ''}
      <label id="rqty-label"></label>
      ${numInput('qty', entry ? (inGrams ? entry.grams : entry.servings) : 1)}
      <div class="seg" id="quick"></div>
      <p class="notice" id="rpreview"></p>
      <button type="submit" class="btn-primary btn-block">${entry ? 'Enregistrer' : 'Ajouter au journal'}</button>
      ${entry ? '<button type="button" class="btn-danger btn-block" id="del-entry">Retirer du journal</button>' : ''}
    </form>`, (body) => {
    const form = body.querySelector('#rentry-form');
    const qty = form.elements.qty;
    const values = () => {
      const q = parseNum(qty.value) || 0;
      if (inGrams) return Object.fromEntries(Object.entries(per100).map(([k, v]) => [k, (v * q) / 100]));
      return Object.fromEntries(Object.entries(perServing).map(([k, v]) => [k, v * q]));
    };
    const refresh = () => {
      body.querySelector('#rqty-label').textContent = inGrams ? 'Quantité (g, cuit)' : 'Nombre de portions';
      body.querySelectorAll('[data-seg="mode"] button').forEach((b) => b.classList.toggle('on', (b.dataset.v === 'g') === inGrams));
      body.querySelector('#quick').hidden = inGrams;
      body.querySelector('#quick').innerHTML = inGrams ? '' : [0.5, 1, 1.5, 2].map((n) => `<button type="button" data-q="${n}">${fmt(n, 1)}</button>`).join('');
      body.querySelector('#rpreview').textContent = macroLine(values());
    };
    body.querySelector('[data-seg="mode"]')?.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      inGrams = b.dataset.v === 'g';
      qty.value = inGrams ? String(Math.round((per100 && t?.servingWeight) || (entry?.servingWeight) || 100)) : '1';
      refresh();
    });
    body.querySelector('#quick').onclick = (e) => {
      const b = e.target.closest('button[data-q]');
      if (b) { qty.value = b.dataset.q.replace('.', ','); refresh(); }
    };
    qty.oninput = refresh;
    refresh();
    form.onsubmit = async (e) => {
      e.preventDefault();
      const q = parseNum(qty.value);
      if (!(q > 0)) return toast('Indiquez une quantité');
      const data = entry || {
        id: newId(), kind: 'recipe', recipeId: recipe.id, name: recipe.name, perServing, per100,
        servingWeight: t.servingWeight, nova: t.maxNova, nova4Share: t.nova4Share, time: Date.now(),
      };
      data.meal = form.elements.meal.value;
      data.servings = inGrams ? null : q;
      data.grams = inGrams ? q : null;
      data.values = values();
      if (!entry) state.day.entries.push(data);
      await saveDay();
      closeSheet();
      toast(entry ? 'Modifié' : 'Recette ajoutée au journal');
      state.rerender();
    };
    body.querySelector('#del-entry')?.addEventListener('click', async () => {
      state.day.entries = state.day.entries.filter((x) => x.id !== entry.id);
      await saveDay();
      closeSheet();
      toast('Retiré du journal');
      state.rerender();
    });
  });
}

// Bouton « 📖 Recette » de la page Jour : choisir une recette pour ce repas.
export function pickRecipe(meal) {
  let q = '';
  const rows = () => {
    const list = rank(state.recipes.filter((r) => matchFood({ name: r.name }, q)), q);
    return list.length ? list.map(recipeRow).join('') : '<li class="muted">Aucune recette trouvée.</li>';
  };
  if (!state.recipes.length) {
    openSheet('<h2>Aucune recette</h2><p>Créez vos recettes dans <a href="#recettes">Cuisine › Recettes</a> : elles seront ensuite disponibles ici en un geste.</p>');
    return;
  }
  openSheet(`
    <h2>Recette pour : ${esc(meal)}</h2>
    <input type="search" id="rpick-search" placeholder="Rechercher une recette">
    <ul class="list" id="rpick-list">${rows()}</ul>`, (body) => {
    const input = body.querySelector('#rpick-search');
    input.oninput = () => { q = input.value; body.querySelector('#rpick-list').innerHTML = rows(); };
    body.querySelector('#rpick-list').onclick = (e) => {
      const li = e.target.closest('li[data-rid]');
      if (li) openRecipeEntryForm({ recipe: recipeById(li.dataset.rid), meal });
    };
  });
}
