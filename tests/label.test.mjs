// Tests de lecture d'étiquettes. Lancer avec : node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNutritionText, estimateNova, offToFood, guessState } from '../js/label.js';

const near = (a, b, tol = 0.6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

test('tableau canadien bilingue, portion de 85 g → pour 100 g', () => {
  const text = `Valeur nutritive / Nutrition Facts
Pour 3/4 tasse (85 g) / Per 3/4 cup (85 g)
Calories 300            % valeur quotidienne*
Lipides / Fat 1,5 g          2 %
 saturés / Saturated 0,3 g
Glucides / Carbohydrate 61 g
 Fibres / Fibre 3 g          11 %
 Sucres / Sugars 2 g
Protéines / Protein 11 g
Cholestérol / Cholesterol 0 mg
Sodium 5 mg`;
  const r = parseNutritionText(text);
  assert.equal(r.serving, 85);
  assert.deepEqual(r.raw, { kcal: 300, f: 1.5, c: 61, fib: 3, p: 11 });
  near(r.per100.kcal, 353, 1);
  near(r.per100.p, 12.9);
  near(r.per100.c, 71.8);
  near(r.per100.f, 1.8);
  near(r.per100.fib, 3.5);
  assert.deepEqual(r.missing, []);
});

test('erreurs de lecture : « g » lu « 9 », accents perdus, O pour 0', () => {
  const text = `Valeur nutritive
pour 1 pot (175 g)
Calorles 150
Lipides 1,59
Glucides 1O g
Fibres O g
Proteines 199`;
  const r = parseNutritionText(text);
  assert.equal(r.serving, 175);
  assert.equal(r.raw.f, 1.5);
  assert.equal(r.raw.c, 10);
  assert.equal(r.raw.fib, 0);
  assert.equal(r.raw.p, 19);
  assert.equal(r.raw.kcal, 150);
});

test('étiquette européenne déjà pour 100 g (kJ / kcal)', () => {
  const r = parseNutritionText(`Valeurs nutritionnelles pour 100 g
Energie 1521 kJ / 359 kcal
Matières grasses 2 g
Glucides 71 g
Fibres alimentaires 3 g
Protéines 13 g
Sel 0,01 g`);
  assert.equal(r.serving, 100);
  assert.deepEqual(r.per100, { kcal: 359, f: 2, c: 71, fib: 3, p: 13 });
});

test('portion absente : valeurs gardées telles quelles et signalées', () => {
  const r = parseNutritionText('Calories 120\nLipides 2 g\nGlucides 20 g\nProtéines 5 g');
  assert.equal(r.serving, null);
  assert.equal(r.per100.kcal, 120);
});

test('NOVA estimé à partir des ingrédients', () => {
  assert.equal(estimateNova('Ingrédients : semoule de blé dur, niacine, fer, thiamine, riboflavine, acide folique.').nova, 1);
  assert.equal(estimateNova('INGRÉDIENTS : huile d\'olive extra vierge.').nova, 2);
  assert.equal(estimateNova('Ingrédients : pois chiches, eau, sel.').nova, 3);
  const r = estimateNova('Ingrédients : farine, sucre, huile de palme, sirop de glucose-fructose, émulsifiant (lécithine de soja), arôme. Contient : blé, soja.');
  assert.equal(r.nova, 4);
  assert.match(r.reason, /glucose-fructose|emulsifiant|arome/);
  assert.equal(estimateNova('Ingrédients : lait, ferments lactiques, E407').nova, 4);
  assert.equal(estimateNova('Pas de liste ici'), null);
});

test('fiche Open Food Facts → aliment', () => {
  const f = offToFood({
    product_name_fr: 'Penne rigate', brands: 'Marque X, Groupe Y', nova_group: 1, serving_quantity: '85',
    nutriments: { 'energy-kcal_100g': 353.4, proteins_100g: 12.94, carbohydrates_100g: 71.8, fat_100g: 1.8, fiber_100g: 3.5 },
  });
  assert.equal(f.name, 'Penne rigate');
  assert.equal(f.brand, 'Marque X');
  assert.equal(f.kcal, 353);
  assert.equal(f.p, 12.9);
  assert.equal(f.nova, 1);
  assert.equal(f.packPortion, 85);
  assert.equal(f.state, 'cru');
  assert.equal(offToFood({ product_name: 'Jus', nutriments: { energy_100g: 1000 } }).kcal, 239);
  assert.equal(guessState('Yogourt grec'), '');
});
