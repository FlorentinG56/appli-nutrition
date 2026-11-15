// Lecture d'étiquettes : texte du tableau « Valeur nutritive » → valeurs pour 100 g,
// liste d'ingrédients → NOVA estimé, fiche Open Food Facts → aliment.
// Aucune dépendance à l'affichage : testé dans tests/label.test.mjs.

const strip = (s) => String(s ?? '').toLowerCase().replace(/œ/g, 'oe').normalize('NFD').replace(/[̀-ͯ]/g, '');
const toNum = (s) => Number(String(s).replace(',', '.'));
const N = '(\\d{1,4}(?:[.,]\\d{1,2})?)';

// Corrige les confusions de lecture fréquentes dans les nombres (O → 0, l/I → 1).
function cleanText(text) {
  return strip(text)
    .replace(/\r/g, '')
    .replace(/(\d)[o](?=\d|\s*g\b)/g, '$10')
    .replace(/(^|[\s(])[o](?=[.,]\d)/g, '$10')
    .replace(/(^|[\s(])[o](?=\s*m?g\b)/g, '$10')
    .replace(/(\d)[il|](?=\d)/g, '$11');
}

function findServing(t) {
  if (/(pour|per)\s*100\s*(g|ml)\b/.test(t)) return 100;
  const paren = t.match(/\(\s*(\d{1,4}(?:[.,]\d)?)\s*(g|ml)\s*\)/);
  if (paren) return toNum(paren[1]);
  const m = t.match(/(?:pour|per|portion|serving)[^\n]{0,40}?(\d{1,4}(?:[.,]\d)?)\s*(g|ml)\b/);
  return m ? toNum(m[1]) : null;
}

// Pour chaque nutriment : le premier nombre après le mot-clé (sur la même ligne ou la suivante).
const PATTERNS = {
  kcal: [new RegExp(`${N}\\s*kcal`), new RegExp(`calor\\w*[^\\d\\n]{0,12}${N}`), new RegExp(`energie[^\\d\\n]{0,20}${N}`)],
  f: [new RegExp(`\\b(?:lipides|fat|matieres grasses)\\b[^\\d\\n]{0,25}${N}([ \\t]*g\\b)?`)],
  c: [new RegExp(`\\b(?:glucides|carbohydrates?|carbohydrate)\\b[^\\d\\n]{0,25}${N}([ \\t]*g\\b)?`)],
  fib: [new RegExp(`\\b(?:fibres?|fibers?)\\b(?:\\s*alimentaires?)?[^\\d\\n]{0,25}${N}([ \\t]*g\\b)?`)],
  p: [new RegExp(`\\b(?:prot\\w*ines?|protein\\w*)\\b[^\\d\\n]{0,25}${N}([ \\t]*g\\b)?`)],
};

export function parseNutritionText(text) {
  const t = cleanText(text);
  const serving = findServing(t);
  const raw = {}, alts = {};
  for (const [k, pats] of Object.entries(PATTERNS)) {
    for (const re of pats) {
      const m = t.match(re);
      if (!m) continue;
      raw[k] = toNum(m[1]);
      // « 1,5g » est parfois lu « 1,59 » : les étiquettes n'ont qu'une décimale, donc on retire ce 9.
      // « 19g » lu « 199 » : on garde les deux lectures et on choisit la plus cohérente avec les kcal.
      if (k !== 'kcal' && !m[2] && /[.,]\d9$/.test(m[1])) raw[k] = toNum(m[1].slice(0, -1));
      else if (k !== 'kcal' && !m[2] && /\d9$/.test(m[1])) alts[k] = toNum(m[1].slice(0, -1).replace(/[.,]$/, ''));
      break;
    }
  }
  pickConsistent(raw, alts, serving);
  const missing = ['kcal', 'p', 'c', 'f'].filter((k) => raw[k] == null);
  return { serving, raw, per100: to100(raw, serving), missing, found: Object.keys(raw).length };
}

// Choisit, parmi les lectures possibles, celle où 4 P + 4 G + 9 L colle le mieux aux kcal.
function pickConsistent(raw, alts, serving) {
  const keys = Object.keys(alts);
  if (!keys.length || raw.kcal == null) return;
  let best = null;
  for (let mask = 0; mask < 1 << keys.length; mask++) {
    const v = { ...raw };
    keys.forEach((k, i) => { if (mask & (1 << i)) v[k] = alts[k]; });
    const est = 4 * (v.p || 0) + 4 * (v.c || 0) + 9 * (v.f || 0);
    const sum = (v.p || 0) + (v.c || 0) + (v.f || 0);
    const score = Math.abs(est - raw.kcal) + (serving && sum > serving ? 1000 : 0);
    if (!best || score < best.score) best = { score, v };
  }
  Object.assign(raw, best.v);
}

export function to100(raw, serving) {
  const k = serving > 0 ? 100 / serving : 1;
  const out = {};
  for (const key of ['kcal', 'p', 'c', 'f', 'fib']) {
    if (raw[key] != null) out[key] = Math.round(raw[key] * k * (key === 'kcal' ? 1 : 10)) / (key === 'kcal' ? 1 : 10);
  }
  return out;
}

// ---------- NOVA estimé à partir de la liste d'ingrédients ----------
const NOVA4_MARKERS = [
  'arome', 'flavour', 'flavor', 'emulsifiant', 'emulsifier', 'lecithine', 'lecithin', 'mono- et diglycerides', 'monoglycerides',
  'sirop de glucose', 'glucose-fructose', 'sirop de mais', 'corn syrup', 'maltodextrine', 'maltodextrin', 'dextrose',
  'isolat', 'isolate', 'concentre de proteines', 'protein concentrate', 'hydrolys', 'modifie', 'modified', 'gomme', 'gum',
  'carraghenane', 'carrageenan', 'colorant', 'colour', 'color', 'edulcorant', 'sweetener', 'sucralose', 'aspartame',
  'acesulfame', 'stevia', 'glutamate', 'inosinate', 'guanylate', 'hydrogene', 'hydrogenated', 'epaississant', 'thickener',
  'stabilisant', 'stabilizer', 'agent de texture', 'nitrite', 'benzoate', 'sorbate', 'polysorbate', 'carboxymethyl',
  'phosphate', 'sucre inverti', 'invert sugar', 'fibre de mais soluble', 'inuline', 'polydextrose',
];
const CULINARY = ['huile', 'oil', 'sucre', 'sugar', 'sel', 'salt', 'beurre', 'butter', 'miel', 'honey', 'vinaigre', 'vinegar', "sirop d'erable", 'saindoux'];
const VITAMINS = /niacine|niacin|fer\b|iron|thiamine|riboflavine|riboflavin|acide folique|folic|vitamine|vitamin|mononitrate|reduit|zinc|calcium|acide ascorbique/;

export function estimateNova(text) {
  const t = strip(text).replace(/\s+/g, ' ');
  const m = t.match(/ingr[e]?dients?\s*[:/]?\s*(.+?)(?:\b(?:contient|contains|peut contenir|may contain)\b|$)/);
  if (!m) return null;
  const list = splitIngredients(m[1]).filter((i) => i && !VITAMINS.test(i));
  if (!list.length) return null;
  const all = list.join(', ');
  const marker = NOVA4_MARKERS.find((w) => all.includes(w)) || (/\be ?\d{3}\b/.test(all) ? 'additif E…' : null);
  if (marker) return { nova: 4, reason: `ingrédient industriel ou additif : « ${marker} »`, count: list.length };
  const culinary = CULINARY.filter((w) => new RegExp(`\\b${w}\\b`).test(all));
  if (list.length === 1) return culinary.length ? { nova: 2, reason: 'ingrédient culinaire', count: 1 } : { nova: 1, reason: 'un seul ingrédient brut', count: 1 };
  if (culinary.length) return { nova: 3, reason: `aliment transformé avec ${culinary.slice(0, 2).join(', ')}`, count: list.length };
  return { nova: 1, reason: 'ingrédients bruts, sans additif', count: list.length };
}

function splitIngredients(s) {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    if ((ch === ',' || ch === ';') && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  out.push(cur.replace(/[.]\s*$/, '').trim());
  return out.filter(Boolean);
}

// ---------- Open Food Facts ----------
export function offToFood(product) {
  const n = product?.nutriments || {};
  const val = (k) => (n[k] == null || n[k] === '' ? null : Math.round(Number(n[k]) * 10) / 10);
  let kcal = val('energy-kcal_100g');
  if (kcal == null && n.energy_100g != null) kcal = Math.round(Number(n.energy_100g) / 4.184);
  const name = (product.product_name_fr || product.product_name || '').trim();
  return {
    name,
    brand: String(product.brands || '').split(',')[0].trim(),
    kcal: kcal == null ? null : Math.round(kcal),
    p: val('proteins_100g'), c: val('carbohydrates_100g'), f: val('fat_100g'), fib: val('fiber_100g'),
    nova: [1, 2, 3, 4].includes(Number(product.nova_group)) ? Number(product.nova_group) : null,
    packPortion: Number(product.serving_quantity) > 0 ? Math.round(Number(product.serving_quantity)) : null,
    state: guessState(name),
    ingredients: product.ingredients_text_fr || product.ingredients_text || '',
  };
}

// Aliments vendus crus (pâtes, riz, viandes…) : les valeurs de l'étiquette sont « cru ».
export function guessState(name) {
  return /pates|spaghett|penne|macaroni|fusilli|linguine|nouilles|vermicelle|riz|quinoa|couscous|boulgour|orge|lentilles|pois casses|flocons|avoine|semoule|farine|sarrasin|poulet|boeuf|porc|dinde|veau|agneau|saumon|truite|morue|crevettes|viande|hache/.test(strip(name)) ? 'cru' : '';
}
