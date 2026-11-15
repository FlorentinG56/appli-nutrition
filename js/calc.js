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

// Collation réservée chaque jour (modifiable dans Réglages).
export const DEFAULT_SNACK = {
  name: 'Collation A',
  description: '1 pomme (~180 g) + 1 c. à thé de miel (7 g) + 30 g de whey dans l\'eau',
  base: { kcal: 236, p: 24.5, c: 33, f: 2, fib: 4 },
  milkLabel: '+ 250 ml de lait au lieu de l\'eau',
  milk: { kcal: 125, p: 9, c: 12, f: 5, fib: 0 },
  defaultPlanned: true,
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

export function snackValues(snack, milk) {
  return milk ? add(snack.base, snack.milk) : add(zero(), snack.base);
}

// La collation reste réservée tant qu'elle est prévue et pas encore notée au journal.
export function snackReserve(snack, day) {
  if (!day.snack?.planned) return zero();
  if ((day.entries || []).some((e) => e.kind === 'snack')) return zero();
  return snackValues(snack, day.snack.milk);
}

// Part du repas : (objectif − consommé − collation réservée) ÷ repas restants.
export function mealShare(target, consumed, reserve, mealsLeft) {
  const n = Math.max(1, mealsLeft || 1);
  const r = zero();
  for (const k of KEYS) r[k] = Math.max(0, target[k] - consumed[k] - reserve[k]) / n;
  return r;
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
      o.units = Math.max(1, Math.round(x[i] / w));
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
