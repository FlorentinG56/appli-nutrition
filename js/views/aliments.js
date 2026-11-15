// Écran « Aliments » : base d'aliments (ajout, recherche, modification).
// Contient aussi le sélecteur d'aliment réutilisé par les écrans Jour et Repas.
import { state, saveFood, deleteFood, recipeInfo } from '../state.js';
import { readBarcode, lookupBarcode, readText } from '../scan.js';
import { parseNutritionText, estimateNova, to100, guessState } from '../label.js';
import { esc, fmt, parseNum, numInput, toast, openSheet, closeSheet, novaBadge, matchFood, rank } from '../ui.js';

let query = '';

export function render(root) {
  const list = rank(state.foods.filter((f) => matchFood(f, query)), query);
  root.innerHTML = `${cuisineSwitch('aliments')}
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
    root.querySelector('.list').innerHTML = rank(state.foods.filter((f) => matchFood(f, query)), query).map(foodRow).join('');
  };
  root.querySelector('.list').onclick = (e) => {
    const li = e.target.closest('li[data-id]');
    if (li) openFoodForm(state.foods.find((f) => f.id === li.dataset.id), () => render(root));
  };
}

// Boutons « Aliments | Recettes » en haut de l'onglet Cuisine.
export const cuisineSwitch = (on) => `<div class="seg" style="margin:0 0 12px">
  <a class="btn ${on === 'aliments' ? 'on' : ''}" href="#aliments">🥕 Aliments</a>
  <a class="btn ${on === 'recettes' ? 'on' : ''}" href="#recettes">📖 Recettes</a>
</div>`;

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
    <div class="card autofill">
      <b>Remplir automatiquement</b>
      <div class="grid2" style="margin-top:8px">
        <button type="button" data-scan="barcode">📷 Code-barres</button>
        <button type="button" data-scan="label">📷 Tableau nutritionnel</button>
      </div>
      <button type="button" class="btn-small btn-block" data-scan="ingredients">📷 Liste d'ingrédients (pour le NOVA)</button>
      <details class="small" style="margin-top:8px"><summary>Taper le code-barres à la main</summary>
        <div class="row" style="margin-top:6px"><input id="bar-code" inputmode="numeric" placeholder="ex. 0064200116183" value="${esc(f.barcode || '')}"><button type="button" class="btn-small" id="bar-go" style="flex:none">Chercher</button></div>
      </details>
      <div id="scan-status" class="small"></div>
      <img id="scan-photo" alt="Photo de l'étiquette" hidden style="width:100%;border-radius:10px;margin-top:8px">
      <input type="file" id="scan-file" accept="image/*" hidden>
    </div>
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
      <p class="hint" id="nova-reason"></p>
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
    const setSeg = (key, v) => {
      seg[key] = v;
      body.querySelectorAll(`[data-seg="${key}"] button`).forEach((x) => x.classList.toggle('on', (key === 'nova' ? Number(x.dataset.v) : x.dataset.v) === v));
    };
    const extra = { barcode: f.barcode || null };
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
      const data = { ...f, barcode: extra.barcode || parseNum(body.querySelector('#bar-code').value) && body.querySelector('#bar-code').value.trim() || null, name: form.elements.name.value.trim(), brand: form.elements.brand.value.trim(), store: form.elements.store.value.trim(), unitName: form.elements.unitName.value.trim(), state: seg.state, nova: seg.nova };
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
    setupAutofill(body, form, { setSeg, extra, check, current: f });
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
// Avec onPickRecipe, les recettes sont proposées aussi (en tête de liste).
export function pickFood(title, onPick, onPickRecipe, onBack) {
  let q = '';
  const html = () => {
    const recipes = onPickRecipe ? rank(state.recipes.filter((r) => matchFood({ name: r.name }, q)), q) : [];
    const list = rank(state.foods.filter((f) => matchFood(f, q)), q).slice(0, 80);
    const rows = recipes.map((r) => {
      const t = recipeInfo(r);
      return `<li class="tap" data-rid="${r.id}"><div class="grow"><div class="name">📖 ${esc(r.name)} ${novaBadge(t.maxNova)}</div>
        <div class="sub">Recette · par portion ${fmt(t.perServing.kcal)} kcal · P ${fmt(t.perServing.p)}</div></div></li>`;
    }).join('') + list.map(foodRow).join('');
    return rows || '<li class="muted">Aucun aliment trouvé.</li>';
  };
  openSheet(`
    ${onBack ? '<button type="button" class="btn-small" id="pick-back">‹ Retour</button>' : ''}
    <h2>${esc(title)}</h2>
    <input type="search" id="pick-search" placeholder="Rechercher ${onPickRecipe ? 'un aliment ou une recette' : 'un aliment'}">
    <button type="button" class="btn-block" id="pick-new">＋ Créer un nouvel aliment</button>
    <ul class="list" id="pick-list">${html()}</ul>`, (body) => {
    const input = body.querySelector('#pick-search');
    input.oninput = () => { q = input.value; body.querySelector('#pick-list').innerHTML = html(); };
    body.querySelector('#pick-list').onclick = (e) => {
      const rli = e.target.closest('li[data-rid]');
      if (rli) return onPickRecipe(state.recipes.find((r) => r.id === rli.dataset.rid));
      const li = e.target.closest('li[data-id]');
      if (li) onPick(state.foods.find((f) => f.id === li.dataset.id));
    };
    body.querySelector('#pick-back')?.addEventListener('click', onBack);
    body.querySelector('#pick-new').onclick = () => openFoodForm(null, (food) => food && onPick(food));
  });
}

// ---------- Remplissage automatique (code-barres, photo du tableau, ingrédients) ----------
function setupAutofill(body, form, { setSeg, extra, check, current }) {
  const status = body.querySelector('#scan-status');
  const fileInput = body.querySelector('#scan-file');
  const photo = body.querySelector('#scan-photo');
  let mode = null;
  const say = (html, cls = '') => { status.className = `small notice ${cls}`; status.innerHTML = html; };
  const setVal = (name, v) => {
    if (v == null || v === '') return;
    const el = form.elements[name];
    el.value = typeof v === 'number' ? String(v).replace('.', ',') : v;
    el.classList.add('filled');
  };
  const fillValues = (v) => { for (const k of ['kcal', 'p', 'c', 'f', 'fib']) setVal(k, v[k]); check(); };
  const showNova = (est, source) => {
    if (!est) return;
    setSeg('nova', est.nova);
    body.querySelector('#nova-reason').textContent = `NOVA ${est.nova} ${source} : ${est.reason}. À vérifier.`;
  };

  body.querySelectorAll('[data-scan]').forEach((b) => {
    b.onclick = () => { mode = b.dataset.scan; fileInput.value = ''; fileInput.click(); };
  });
  fileInput.onchange = async () => {
    const file = fileInput.files[0];
    if (!file) return;
    photo.src = URL.createObjectURL(file);
    photo.hidden = false;
    try {
      if (mode === 'barcode') {
        say('Lecture du code-barres…');
        const code = await readBarcode(file);
        if (!code) return say('Code-barres non lu. Reprenez la photo de plus près, bien à plat et net, ou tapez le code à la main.', 'warn');
        await byBarcode(code);
      } else {
        say('Préparation de la lecture…');
        const text = await readText(file, (msg) => say(msg));
        if (mode === 'label') byLabelText(text); else byIngredients(text);
      }
    } catch (err) {
      say(`Échec : ${esc(err.message)}`, 'warn');
    }
  };
  body.querySelector('#bar-go').onclick = () => {
    const code = body.querySelector('#bar-code').value.replace(/\D/g, '');
    if (code.length < 8) return toast('Code-barres trop court');
    byBarcode(code).catch((err) => say(`Échec : ${esc(err.message)}`, 'warn'));
  };

  async function byBarcode(code) {
    extra.barcode = code;
    body.querySelector('#bar-code').value = code;
    const dup = state.foods.find((x) => x.barcode === code && x.id !== current.id);
    say(`Code ${esc(code)} : recherche dans Open Food Facts…`);
    let p;
    try { p = await lookupBarcode(code); } catch (err) {
      return say(`Code ${esc(code)} lu, mais la recherche a échoué (${esc(err.message)}). Vérifiez la connexion, ou prenez le tableau nutritionnel en photo.`, 'warn');
    }
    const dupMsg = dup ? `<br>⚠️ Cet article est déjà dans votre base : « ${esc(dup.name)} ».` : '';
    if (!p || p.incomplete) {
      if (p?.name) setVal('name', p.name);
      return say(`Code ${esc(code)} : ${p ? 'produit trouvé mais sans valeurs nutritives' : 'produit inconnu d\'Open Food Facts'}. 👉 Prenez maintenant le <b>tableau nutritionnel</b> en photo.${dupMsg}`, 'warn');
    }
    setVal('name', p.name);
    setVal('brand', p.brand);
    fillValues(p);
    if (p.packPortion) setVal('packPortion', p.packPortion);
    if (p.state) setSeg('state', p.state);
    if (p.nova) showNova({ nova: p.nova, reason: 'classement Open Food Facts' }, 'selon Open Food Facts');
    else showNova(estimateNova(p.ingredients), 'estimé d\'après les ingrédients');
    const miss = ['kcal', 'p', 'c', 'f'].filter((k) => p[k] == null);
    say(`✔ Produit trouvé : <b>${esc(p.name || 'sans nom')}</b>${p.brand ? ` (${esc(p.brand)})` : ''}. Valeurs pour 100 g remplies (cases jaunes).${miss.length ? ' Certaines valeurs manquent : complétez-les.' : ''} <b>Vérifiez avec l'emballage avant d'enregistrer.</b>${dupMsg}`);
  }

  function byLabelText(text) {
    const r = parseNutritionText(text);
    if (r.found < 2) {
      return say('Je n\'arrive pas à lire le tableau. Conseils : photo bien à plat, de face, sans reflet, le tableau doit remplir la photo.', 'warn');
    }
    const apply = (serving) => fillValues(to100(r.raw, serving));
    apply(r.serving);
    const st = guessState(form.elements.name.value);
    if (st && !current.state) setSeg('state', st);
    if (r.serving && r.serving !== 100 && !form.elements.packPortion.value) setVal('packPortion', r.serving);
    const raw = r.raw;
    say(`✔ Tableau lu. Valeurs lues ${r.serving ? '' : '(<b>portion non lue</b>)'} :
      ${fmt(raw.kcal)} kcal · P ${fmt(raw.p, 1)} · G ${fmt(raw.c, 1)} · L ${fmt(raw.f, 1)} · fibres ${fmt(raw.fib, 1)}
      <label>pour une portion de (g)</label><input id="serving-g" inputmode="decimal" value="${r.serving ? String(r.serving).replace('.', ',') : ''}" placeholder="ex. 85">
      <span class="hint">Converties automatiquement pour 100 g. Corrigez la portion si besoin.${r.missing.length ? ` Non lu : ${r.missing.map((k) => ({ kcal: 'kcal', p: 'protéines', c: 'glucides', f: 'lipides' }[k])).join(', ')}.` : ''}</span>
      <b>Vérifiez chaque case jaune avec l'emballage avant d'enregistrer.</b>`);
    status.querySelector('#serving-g').oninput = (e) => { const g = parseNum(e.target.value); if (g > 0) apply(g); };
    const nova = estimateNova(text);
    if (nova) showNova(nova, 'estimé d\'après les ingrédients');
  }

  function byIngredients(text) {
    const nova = estimateNova(text) || estimateNova('ingrédients : ' + text);
    if (!nova) return say('Liste d\'ingrédients non lue. Reprenez la photo, bien nette.', 'warn');
    showNova(nova, 'estimé d\'après les ingrédients');
    say(`✔ Ingrédients lus (${nova.count}). NOVA ${nova.nova} proposé : ${esc(nova.reason)}. Vérifiez.`);
  }
}
