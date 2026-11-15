// Tous les calculs de l'appli, sans aucune dépendance à l'affichage.
// Ce fichier est testé automatiquement (voir tests/calc.test.mjs).

export const KEYS = ['kcal', 'p', 'c', 'f', 'fib'];

// Règles par défaut : valeurs génériques, toutes modifiables dans Réglages.
export const DEFAULT_RULES = {
  baseMode: 'auto',          // 'auto' = Mifflin-St Jeor × facteur, 'fixed' = chiffre saisi
  baseFixed: null,
  activityFactor: 1.2,
  kcalPerKmEffort: 70,
  dPlusPerKm: 100,           // 100 m de D+ = 1 km-effort en plus
  strengthKcalPerMin: 6,     // muscu et « autre activité »
  useGarmin: false,          // true = on utilise les kcal Garmin quand elles sont saisies
  lowerBodyExtraKm: 5,       // renfo bas du corps : glucides en plus = X km-effort
  shortMin: 60,              // en dessous : journée « courte »
  longMin: 120,              // au-dessus : journée « longue »
  deficitShort: 400,
  deficitMid: 250,
  deficitLong: 100,
  proteinMode: 'perKg',      // 'perKg' ou 'fixed'
  proteinPerKg: 1.8,
  proteinFixed: null,
  fatMinMode: 'perKg',
  fatMinPerKg: 0.8,
  fatMinFixed: null,
  fatPct: 20,                // lipides = le plus grand entre le minimum et X % des kcal
  fiberTarget: 30,
};

export const SESSION_TYPES = {
  course: { label: 'Course', kind: 'run' },
  trail: { label: 'Trail', kind: 'run' },
  muscu_haut: { label: 'Muscu haut du corps', kind: 'strength' },
  muscu_bas: { label: 'Muscu bas du corps', kind: 'strength', lowerBody: true },
  autre: { label: 'Autre activité', kind: 'strength' },
};

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
export const zero = () => ({ kcal: 0, p: 0, c: 0, f: 0, fib: 0 });
export function add(a, b, factor = 1) {
  const r = zero();
  for (const k of KEYS) r[k] = (a?.[k] || 0) + (b?.[k] || 0) * factor;
  return r;
}

// Métabolisme de repos (Mifflin-St Jeor).
export function mifflin(profile) {
  const { sex, age, height, weight } = profile || {};
  if (!num(age) || !num(height) || !num(weight)) return null;
  return 10 * weight + 6.25 * height - 5 * age + (sex === 'F' ? -161 : 5);
}

export function computeBase(profile, rules) {
  if (rules.baseMode === 'fixed') {
    return num(rules.baseFixed) ? { value: rules.baseFixed, mode: 'fixed' } : null;
  }
  const bmr = mifflin(profile);
  if (bmr == null) return null;
  return { value: bmr * rules.activityFactor, bmr, mode: 'auto' };
}

// Calories d'une séance : calcul de l'appli + contrôle Garmin.
export function sessionEnergy(s, rules) {
  const type = SESSION_TYPES[s.type] || SESSION_TYPES.autre;
  const minutes = num(s.duration) || 0;
  let calc, kmEffort = null;
  if (type.kind === 'run') {
    kmEffort = (num(s.distance) || 0) + (num(s.elevation) || 0) / rules.dPlusPerKm;
    calc = kmEffort * rules.kcalPerKmEffort;
  } else {
    calc = minutes * rules.strengthKcalPerMin;
  }
  const garmin = num(s.garminKcal);
  const used = rules.useGarmin && garmin != null ? garmin : calc;
  return { calc, garmin, used, kmEffort, minutes, lowerBody: !!type.lowerBody, source: used === calc ? 'calc' : 'garmin' };
}

// Niveau de déficit : 0 = court, 1 = moyen, 2 = long, 3 = aucun déficit.
export function deficitLevel(totalMinutes, flags, rules) {
  let level = totalMinutes < rules.shortMin ? 0 : totalMinutes <= rules.longMin ? 1 : 2;
  if (flags.intense) level++;
  if (flags.eve) level++;
  return Math.min(level, 3);
}
export function deficitFor(level, rules) {
  return [rules.deficitShort, rules.deficitMid, rules.deficitLong, 0][level];
}

// Objectif du jour. Renvoie { error } si le profil est incomplet.
export function computeTarget(profile, rules, day) {
  const base = computeBase(profile, rules);
  if (!base) return { error: 'profil' };
  const weight = num(profile?.weight);
  const protein = rules.proteinMode === 'fixed' ? num(rules.proteinFixed) : weight && weight * rules.proteinPerKg;
  const fatMin = rules.fatMinMode === 'fixed' ? num(rules.fatMinFixed) : weight && weight * rules.fatMinPerKg;
  if (!protein || !fatMin) return { error: 'profil' };

  const sessions = (day.sessions || []).map((s) => ({ ...s, energy: sessionEnergy(s, rules) }));
  const sport = sessions.reduce((t, s) => t + s.energy.used, 0);
  const minutes = sessions.reduce((t, s) => t + s.energy.minutes, 0);
  const lowerBody = sessions.some((s) => s.energy.lowerBody);
  const lowerBodyExtra = lowerBody ? rules.lowerBodyExtraKm * rules.kcalPerKmEffort : 0;
  const level = deficitLevel(minutes, { intense: day.intense, eve: day.eve }, rules);
  const deficit = deficitFor(level, rules);

  const kcal = base.value + sport + lowerBodyExtra - deficit;
  const fat = Math.max(fatMin, (rules.fatPct / 100) * kcal / 9);
  const carbs = Math.max(0, (kcal - 4 * protein - 9 * fat) / 4);
  return {
    base, sessions, sport, minutes, lowerBodyExtra, level, deficit, fatMin,
    target: { kcal, p: protein, c: carbs, f: fat, fib: rules.fiberTarget },
  };
}

// Valeurs nutritionnelles d'une quantité d'aliment (valeurs pour 100 g).
export function foodValues(food, grams) {
  const r = zero();
  for (const k of KEYS) r[k] = ((num(food[k]) || 0) * grams) / 100;
  return r;
}

export function totals(entries) {
  return (entries || []).reduce((t, e) => add(t, e.values), zero());
}

// Part du repas : (objectif − déjà mangé) ÷ repas restants.
export function mealShare(target, consumed, mealsLeft) {
  const n = Math.max(1, mealsLeft || 1);
  const r = zero();
  for (const k of KEYS) r[k] = Math.max(0, target[k] - consumed[k]) / n;
  return r;
}

// Saisie libre : macros estimées à partir des kcal (repas « moyen » de restaurant :
// 20 % protéines, 45 % glucides, 35 % lipides) quand on ne les connaît pas.
export const ESTIMATE_SPLIT = { p: 0.2, c: 0.45, f: 0.35 };
export function estimateFromKcal(kcal) {
  return { kcal, p: (kcal * ESTIMATE_SPLIT.p) / 4, c: (kcal * ESTIMATE_SPLIT.c) / 4, f: (kcal * ESTIMATE_SPLIT.f) / 9, fib: kcal / 100 };
}

// ---------- Calcul des quantités d'un repas ----------
// items : [{ food, mode: 'auto' | 'fixed' | 'free', byUnit, amount }]
//   auto  = l'appli choisit la quantité
//   fixed = quantité imposée (amount en g, ou en unités si byUnit)
//   free  = « à volonté » : compté pour amount, n'intervient pas dans l'équilibrage
// share : objectif du repas { kcal, p, c, f }
const SOLVE_KEYS = ['kcal', 'p', 'c', 'f'];
const WEIGHTS = { kcal: 1, p: 2, c: 1, f: 1 }; // les protéines comptent double
const FLOORS = { kcal: 100, p: 10, c: 10, f: 5 };
const SPREAD = 0.15;

function solveGrams(foods, rest, share) {
  // Moindres carrés pondérés avec quantités ≥ 0 (descente par coordonnées).
  const n = foods.length;
  const W = SOLVE_KEYS.map((k) => WEIGHTS[k] / Math.max(share[k] || 0, FLOORS[k]) ** 2);
  const A = foods.map((f) => SOLVE_KEYS.map((k) => (num(f[k]) || 0) / 100));
  const Q = [], b = [];
  for (let i = 0; i < n; i++) {
    Q[i] = [];
    b[i] = SOLVE_KEYS.reduce((t, k, m) => t + W[m] * A[i][m] * rest[k], 0);
    for (let j = 0; j < n; j++) Q[i][j] = SOLVE_KEYS.reduce((t, k, m) => t + W[m] * A[i][m] * A[j][m], 0);
  }
  // Régularisation : pénalise un aliment qui apporterait à lui seul toutes les calories,
  // pour répartir entre aliments semblables (riz + pâtes) au lieu de tout mettre sur un seul.
  const kW = SPREAD / Math.max(share.kcal || 0, FLOORS.kcal) ** 2;
  for (let i = 0; i < n; i++) Q[i][i] = Q[i][i] * 1.01 + kW * A[i][0] ** 2;
  // Départ : tous les aliments à parts « égales », puis on affine.
  const d = Q.map((row, i) => (row[i] > 0 ? 1 / Math.sqrt(row[i]) : 0));
  const dQd = d.reduce((t, di, i) => t + di * d.reduce((u, dj, j) => u + Q[i][j] * dj, 0), 0);
  const scale = dQd > 0 ? Math.max(0, d.reduce((t, di, i) => t + di * b[i], 0) / dQd) : 0;
  const x = d.map((di) => di * scale);
  for (let it = 0; it < 2000; it++) {
    for (let i = 0; i < n; i++) {
      if (Q[i][i] <= 0) { x[i] = 0; continue; }
      let s = b[i];
      for (let j = 0; j < n; j++) if (j !== i) s -= Q[i][j] * x[j];
      x[i] = Math.min(2000, Math.max(0, s / Q[i][i]));
    }
  }
  return x;
}

export function itemGrams(item) {
  const a = num(item.amount) || 0;
  return item.byUnit ? a * (num(item.food.unitWeight) || 0) : a;
}

export function planMeal(items, share, step = 5) {
  const out = items.map((it) => ({ ...it, grams: it.mode === 'auto' ? 0 : itemGrams(it), units: it.byUnit && it.mode !== 'auto' ? num(it.amount) || 0 : null }));
  const fixedSum = () => out.filter((o) => o.mode !== 'auto' || o.locked).reduce((t, o) => add(t, foodValues(o.food, o.grams)), zero());
  const restOf = (sum) => Object.fromEntries(SOLVE_KEYS.map((k) => [k, share[k] - sum[k]]));

  // 1) Aliments à l'unité : on résout tout en continu, puis on arrondit à l'unité entière (au moins 1).
  let autos = out.filter((o) => o.mode === 'auto');
  if (autos.some((o) => o.byUnit)) {
    const x = solveGrams(autos.map((o) => o.food), restOf(fixedSum()), share);
    autos.forEach((o, i) => {
      if (!o.byUnit) return;
      const w = num(o.food.unitWeight);
      const st = num(o.food.unitStep) || 1; // ex. 0,5 pour les demi-portions de recette
      o.units = Math.max(st, Math.round(x[i] / w / st) * st);
      o.grams = o.units * w;
      o.locked = true;
    });
  }
  // 2) Aliments au gramme : on résout avec les unités fixées, puis arrondi au pas (5 g).
  autos = out.filter((o) => o.mode === 'auto' && !o.locked);
  if (autos.length) {
    const x = solveGrams(autos.map((o) => o.food), restOf(fixedSum()), share);
    autos.forEach((o, i) => { o.grams = Math.round(x[i] / step) * step; });
  }
  for (const o of out) { delete o.locked; o.values = foodValues(o.food, o.grams); }
  const total = out.reduce((t, o) => add(t, o.values), zero());
  return { items: out, total };
}

// ---------- Recettes ----------
// ingredients : [{ food, grams }] (food = valeurs pour 100 g, nova)
export function recipeTotals(ingredients, servings, cookedWeight) {
  let total = zero(), rawWeight = 0, maxNova = null, nova4Kcal = 0;
  const nova4 = [];
  for (const ing of ingredients) {
    const g = num(ing.grams) || 0;
    const v = foodValues(ing.food, g);
    total = add(total, v);
    rawWeight += g;
    const n = num(ing.food.nova);
    if (n) maxNova = Math.max(maxNova || 0, n);
    if (n === 4) { nova4Kcal += v.kcal; nova4.push(ing.food.name); }
  }
  const s = num(servings) > 0 ? servings : 1;
  const cw = num(cookedWeight) > 0 ? cookedWeight : null;
  const perServing = add(zero(), total, 1 / s);
  const per100 = cw ? add(zero(), total, 100 / cw) : null;
  return { total, perServing, per100, rawWeight, maxNova, nova4Kcal, nova4, nova4Share: total.kcal > 0 ? nova4Kcal / total.kcal : 0, servingWeight: cw ? cw / s : null };
}

// Adapte une recette à un autre nombre de portions (quantités et poids cuit au prorata).
export function scaleRecipe(recipe, newServings) {
  const k = newServings / (num(recipe.servings) || 1);
  const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d;
  return {
    ...recipe,
    servings: newServings,
    cookedWeight: num(recipe.cookedWeight) ? Math.round(recipe.cookedWeight * k) : recipe.cookedWeight,
    ingredients: recipe.ingredients.map((i) => ({
      ...i,
      grams: round(i.grams * k, 1),
      units: num(i.units) ? round(i.units * k, 1) : i.units,
    })),
  };
}

// Une recette vue comme un « aliment » pour l'écran Repas :
// 1 unité = 1 portion (par pas de ½) ; au gramme si le poids cuit est connu.
export function recipeAsFood(recipe, totals) {
  const base = totals.per100 || totals.perServing; // sans poids cuit : « 100 g » fictifs = 1 portion
  return {
    id: 'r:' + recipe.id, recipeId: recipe.id, isRecipe: true, name: recipe.name,
    kcal: base.kcal, p: base.p, c: base.c, f: base.f, fib: base.fib,
    nova: totals.maxNova, nova4Share: totals.nova4Share,
    unitWeight: totals.servingWeight || 100, unitName: 'portion', unitStep: 0.5,
    unitOnly: !totals.per100, state: totals.per100 ? 'cuit' : '',
  };
}
