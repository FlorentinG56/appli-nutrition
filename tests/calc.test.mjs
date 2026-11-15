// Tests des calculs. Lancer avec : node --test tests/
// Profil fictif (pas de données personnelles) : homme, 40 ans, 175 cm, 70 kg.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RULES, DEFAULT_SNACK, computeTarget, mifflin, planMeal, mealShare, snackReserve, totals, zero,
} from '../js/calc.js';

const profile = { sex: 'M', age: 40, height: 175, weight: 70 };
const rules = { ...DEFAULT_RULES };
const near = (a, b, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);
const day = (sessions = [], extra = {}) => ({ sessions, entries: [], snack: { planned: true, milk: false }, ...extra });

test('Mifflin-St Jeor', () => {
  near(mifflin(profile), 1598.75, 0.01);
  near(mifflin({ ...profile, sex: 'F' }), 1432.75, 0.01);
  assert.equal(mifflin({ age: 40 }), null);
});

test('jour de repos : base × 1,2 − 400', () => {
  const r = computeTarget(profile, rules, day());
  near(r.target.kcal, 1918.5 - 400);
  near(r.target.p, 126);
  near(r.target.f, 56); // minimum 0,8 g/kg l'emporte sur 20 %
  near(r.target.c, (1518.5 - 504 - 504) / 4);
});

test('5 km en 30 min : +350 kcal, déficit 400', () => {
  const r = computeTarget(profile, rules, day([{ type: 'course', distance: 5, duration: 30 }]));
  near(r.target.kcal, 1918.5 + 350 - 400);
  assert.equal(r.deficit, 400);
});

test('sortie longue 25 km / 800 m D+ / 3 h : 33 km-effort, déficit 100, lipides à 20 %', () => {
  const r = computeTarget(profile, rules, day([{ type: 'trail', distance: 25, elevation: 800, duration: 180 }]));
  near(r.sessions[0].energy.kmEffort, 33, 0.001);
  near(r.target.kcal, 1918.5 + 2310 - 100);
  near(r.target.f, (0.2 * r.target.kcal) / 9, 0.01);
});

test('déficit : les cases remontent d\'un cran, cumulables, jamais au-delà de 0', () => {
  const t = (min, flags) => computeTarget(profile, rules, day([{ type: 'course', distance: 1, duration: min }], flags)).deficit;
  assert.equal(t(30, {}), 400);
  assert.equal(t(30, { intense: true }), 250);
  assert.equal(t(30, { intense: true, eve: true }), 100);
  assert.equal(t(60, {}), 250);
  assert.equal(t(90, { intense: true }), 100);
  assert.equal(t(150, {}), 100);
  assert.equal(t(150, { intense: true, eve: true }), 0);
});

test('durée totale = course + muscu', () => {
  const r = computeTarget(profile, rules, day([
    { type: 'course', distance: 5, duration: 30 },
    { type: 'muscu_haut', duration: 45 },
  ]));
  assert.equal(r.minutes, 75);
  assert.equal(r.deficit, 250);
  near(r.sport, 350 + 270);
});

test('muscu bas du corps : 6 kcal/min + équivalent 5 km de glucides', () => {
  const r = computeTarget(profile, rules, day([{ type: 'muscu_bas', duration: 50 }]));
  near(r.sport, 300);
  near(r.lowerBodyExtra, 350);
});

test('Garmin : contrôle par défaut, utilisé si l\'interrupteur est activé', () => {
  const s = [{ type: 'course', distance: 5, duration: 30, garminKcal: 420 }];
  near(computeTarget(profile, rules, day(s)).sport, 350);
  near(computeTarget(profile, { ...rules, useGarmin: true }, day(s)).sport, 420);
});

test('base fixe et protéines fixes', () => {
  const r = computeTarget(profile, { ...rules, baseMode: 'fixed', baseFixed: 2000, proteinMode: 'fixed', proteinFixed: 140 }, day());
  near(r.target.kcal, 1600);
  near(r.target.p, 140);
});

test('profil incomplet', () => {
  assert.equal(computeTarget({}, rules, day()).error, 'profil');
});

test('collation réservée puis libérée quand elle est notée au journal', () => {
  const d = day();
  near(snackReserve(DEFAULT_SNACK, d).kcal, 236);
  near(snackReserve(DEFAULT_SNACK, { ...d, snack: { planned: true, milk: true } }).kcal, 361);
  near(snackReserve(DEFAULT_SNACK, { ...d, snack: { planned: false } }).kcal, 0);
  near(snackReserve(DEFAULT_SNACK, { ...d, entries: [{ kind: 'snack', values: zero() }] }).kcal, 0);
});

test('part du repas = (objectif − consommé − collation) ÷ repas restants', () => {
  const target = { kcal: 2000, p: 150, c: 200, f: 70, fib: 30 };
  const consumed = { kcal: 500, p: 30, c: 60, f: 20, fib: 5 };
  const s = mealShare(target, consumed, { kcal: 236, p: 24, c: 33, f: 2, fib: 4 }, 2);
  near(s.kcal, 632);
  near(s.p, 48);
});

const pates = { name: 'Pâtes crues', kcal: 360, p: 12, c: 72, f: 1.5, fib: 3 };
const poulet = { name: 'Poulet cru', kcal: 110, p: 23, c: 0, f: 1.5, fib: 0 };
const carottes = { name: 'Carottes', kcal: 41, p: 0.9, c: 10, f: 0.2, fib: 2.8 };
const huile = { name: 'Huile', kcal: 900, p: 0, c: 0, f: 100, fib: 0 };
const oeuf = { name: 'Œuf', kcal: 143, p: 12.6, c: 0.7, f: 9.5, fib: 0, unitWeight: 50 };

test('calcul de quantités : pâtes + poulet + huile, carottes à volonté', () => {
  const share = { kcal: 700, p: 48, c: 80, f: 18 };
  const r = planMeal([
    { food: pates, mode: 'auto' },
    { food: poulet, mode: 'auto' },
    { food: huile, mode: 'auto' },
    { food: carottes, mode: 'free', amount: 100 },
  ], share);
  for (const it of r.items) assert.equal(it.grams % 5, 0);
  assert.equal(r.items[3].grams, 100);
  near(r.total.kcal, share.kcal, 40);
  near(r.total.p, share.p, 5);
  near(r.total.c, share.c, 10);
  near(r.total.f, share.f, 5);
});

test('aliment fixé et aliment à l\'unité (nombre entier, au moins 1)', () => {
  const share = { kcal: 500, p: 35, c: 50, f: 15 };
  const r = planMeal([
    { food: oeuf, mode: 'auto', byUnit: true },
    { food: pates, mode: 'fixed', amount: 60 },
    { food: poulet, mode: 'auto' },
  ], share);
  const o = r.items[0];
  assert.ok(Number.isInteger(o.units) && o.units >= 1);
  assert.equal(o.grams, o.units * 50);
  assert.equal(r.items[1].grams, 60);
  const fixedUnits = planMeal([{ food: oeuf, mode: 'fixed', byUnit: true, amount: 3 }], share);
  assert.equal(fixedUnits.items[0].grams, 150);
});

test('totaux du journal', () => {
  const t = totals([{ values: { kcal: 100, p: 10, c: 5, f: 2, fib: 1 } }, { values: { kcal: 50, p: 1, c: 10, f: 0, fib: 0 } }]);
  assert.equal(t.kcal, 150);
  assert.equal(t.p, 11);
});
