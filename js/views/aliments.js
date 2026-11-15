// Écran « Aliments » : base d'aliments (ajout, recherche, modification).
// Contient aussi le sélecteur d'aliment réutilisé par les écrans Jour et Repas.
import { state, saveFood, deleteFood } from '../state.js';
import { esc, fmt, parseNum, numInput, toast, openSheet, closeSheet, novaBadge, matchFood } from '../ui.js';

let query = '';

export function render(root) {
  const list = state.foods.filter((f) => matchFood(f, query));
  root.innerHTML = `
    <button class="btn-primary btn-block" id="add-food">＋ Nouvel aliment</button>
    <div class="card" style="margin-top:12px">
      <input type="search" id="food-search" placeholder="Rechercher (nom, marque, magasin)" value="${esc(query)}">
      <p class="small muted">${state.foods.length} aliment${state.foods.length > 1 ? 's' : ''} dans la base. Valeurs pour 100 g.</p>
      ${state.foods.length === 0 ? '<p>Votre base est vide. Ajoutez vos aliments à partir de leur étiquette nutritionnelle.</p>' : ''}
      <ul class="list">${list.map(foodRow).join('')}</ul>
    </div>`;
  root.querySelector('#add-food').onclick = () => openFoodForm(null, () => render(root));
  const search = root.querySelector('#food-search');
  search.oninput = () => {
    query = search.value;
    root.querySelector('.list').innerHTML = state.foods.filter((f) => matchFood(f, query)).map(foodRow).join('');
  };
  root.querySelector('.list').onclick = (e) => {
    const li = e.target.closest('li[data-id]');
    if (li) openFoodForm(state.foods.find((f) => f.id === li.dataset.id), () => render(root));
  };
}

export function foodRow(f) {
  const details = [f.brand, f.store].filter(Boolean).map(esc).join(' · ');
  return `<li class="tap" data-id="${f.id}">
    <div class="grow">
      <div class="name">${esc(f.name)} ${f.state ? `<span class="pill">${esc(f.state)}</span>` : ''} ${novaBadge(f.nova)}</div>
      <div class="sub">${details ? details + ' — ' : ''}${fmt(f.kcal)} kcal · P ${fmt(f.p, 1)} · G ${fmt(f.c, 1)} · L ${fmt(f.f, 1)}</div>
    </div>
  </li>`;
}

const FIELDS = [
  ['kcal', 'Énergie (kcal)'], ['p', 'Protéines (g)'], ['c', 'Glucides (g)'], ['f', 'Lipides (g)'], ['fib', 'Fibres (g)'],
];

export function openFoodForm(food, onDone) {
  const f = food || { nova: null, state: '' };
  const stores = [...new Set(state.foods.map((x) => x.store).filter(Boolean))];
  openSheet(`
    <h2>${food ? 'Modifier l\'aliment' : 'Nouvel aliment'}</h2>
    <form id="food-form" autocomplete="off">
      <label>Nom *</label>
      <input name="name" required value="${esc(f.name)}" placeholder="ex. Pâtes penne">
      <div class="grid2">
        <div><label>Marque</label><input name="brand" value="${esc(f.brand)}"></div>
        <div><label>Magasin</label><input name="store" list="stores" value="${esc(f.store)}"></div>
      </div>
      <datalist id="stores">${stores.map((s) => `<option value="${esc(s)}">`).join('')}</datalist>

      <label>Pesé cru ou cuit ?</label>
      <div class="seg" data-seg="state">
        ${['cru', 'cuit', ''].map((v) => `<button type="button" data-v="${v}" class="${(f.state || '') === v ? 'on' : ''}">${v || 'Sans objet'}</button>`).join('')}
      </div>

      <h3>Valeurs pour 100 g</h3>
      <div class="grid2">
        ${FIELDS.map(([k, l]) => `<div><label>${l}${k === 'fib' ? '' : ' *'}</label>${numInput(k, f[k])}</div>`).join('')}
      </div>
      <p class="hint" id="kcal-check"></p>

      <label>Transformation (NOVA)</label>
      <div class="seg" data-seg="nova">
        ${[1, 2, 3, 4].map((n) => `<button type="button" data-v="${n}" class="${f.nova === n ? 'on' : ''}">${n}</button>`).join('')}
      </div>
      <p class="hint">1 = brut (œuf, riz, poulet) · 2 = ingrédient culinaire (huile, beurre, miel) · 3 = transformé (pain, fromage, conserve) · 4 = ultra-transformé (additifs, arômes, émulsifiants).</p>

      <div class="grid2">
        <div><label>Portion du paquet (g)</label>${numInput('packPortion', f.packPortion, 'placeholder="ex. 175"')}</div>
        <div><label>Poids d'une unité (g)</label>${numInput('unitWeight', f.unitWeight, 'placeholder="ex. 50"')}</div>
      </div>
      <label>Nom de l'unité</label>
      <input name="unitName" value="${esc(f.unitName)}" placeholder="ex. œuf, pomme, tranche">
      <p class="hint">Remplir le poids d'une unité permet de compter cet aliment « à l'unité » (2 œufs au lieu de 100 g).</p>

      <button type="submit" class="btn-primary btn-block">Enregistrer</button>
      ${food ? '<button type="button" class="btn-danger btn-block" id="del-food">Supprimer cet aliment</button>' : ''}
    </form>`, (body) => {
    const form = body.querySelector('#food-form');
    const seg = { state: f.state || '', nova: f.nova || null };
    body.querySelectorAll('[data-seg]').forEach((el) => {
      el.onclick = (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        const key = el.dataset.seg;
        const v = key === 'nova' ? Number(b.dataset.v) : b.dataset.v;
        seg[key] = seg[key] === v && key === 'nova' ? null : v;
        el.querySelectorAll('button').forEach((x) => x.classList.toggle('on', (key === 'nova' ? Number(x.dataset.v) : x.dataset.v) === seg[key]));
      };
    });
    // Contrôle : 4 × P + 4 × G + 9 × L doit être proche des kcal de l'étiquette.
    const check = () => {
      const v = Object.fromEntries(FIELDS.map(([k]) => [k, parseNum(form.elements[k].value)]));
      const est = 4 * (v.p || 0) + 4 * (v.c || 0) + 9 * (v.f || 0);
      const el = body.querySelector('#kcal-check');
      if (v.kcal && est && Math.abs(est - v.kcal) > Math.max(15, 0.2 * v.kcal)) {
        el.innerHTML = `⚠️ Les macros donnent environ ${fmt(est)} kcal, l'étiquette ${fmt(v.kcal)} kcal. Vérifiez une faute de frappe (les fibres et l'alcool peuvent expliquer un petit écart).`;
      } else el.textContent = '';
    };
    form.oninput = check;
    check();
    form.onsubmit = async (e) => {
      e.preventDefault();
      const data = { ...f, name: form.elements.name.value.trim(), brand: form.elements.brand.value.trim(), store: form.elements.store.value.trim(), unitName: form.elements.unitName.value.trim(), state: seg.state, nova: seg.nova };
      for (const [k] of FIELDS) data[k] = parseNum(form.elements[k].value);
      data.packPortion = parseNum(form.elements.packPortion.value);
      data.unitWeight = parseNum(form.elements.unitWeight.value);
      if (!data.name) return toast('Le nom est obligatoire');
      if ([data.kcal, data.p, data.c, data.f].some((x) => x == null || x < 0)) return toast('Remplissez kcal, protéines, glucides et lipides');
      if (data.unitWeight != null && data.unitWeight <= 0) data.unitWeight = null;
      const saved = await saveFood(data);
      closeSheet();
      toast(food ? 'Aliment modifié' : 'Aliment ajouté');
      onDone?.(saved);
    };
    body.querySelector('#del-food')?.addEventListener('click', async () => {
      if (!confirm(`Supprimer « ${f.name} » de la base ? Les journaux déjà enregistrés ne changent pas.`)) return;
      await deleteFood(f.id);
      closeSheet();
      toast('Aliment supprimé');
      onDone?.(null);
    });
  });
}

// Sélecteur d'aliment : recherche puis toucher un aliment pour le choisir.
export function pickFood(title, onPick) {
  let q = '';
  const html = () => {
    const list = state.foods.filter((f) => matchFood(f, q)).slice(0, 80);
    return list.length ? list.map(foodRow).join('') : '<li class="muted">Aucun aliment trouvé.</li>';
  };
  openSheet(`
    <h2>${esc(title)}</h2>
    <input type="search" id="pick-search" placeholder="Rechercher un aliment">
    <button type="button" class="btn-block" id="pick-new">＋ Créer un nouvel aliment</button>
    <ul class="list" id="pick-list">${html()}</ul>`, (body) => {
    const input = body.querySelector('#pick-search');
    input.oninput = () => { q = input.value; body.querySelector('#pick-list').innerHTML = html(); };
    body.querySelector('#pick-list').onclick = (e) => {
      const li = e.target.closest('li[data-id]');
      if (li) onPick(state.foods.find((f) => f.id === li.dataset.id));
    };
    body.querySelector('#pick-new').onclick = () => openFoodForm(null, (food) => food && onPick(food));
  });
}
