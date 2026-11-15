// État partagé de l'appli : réglages, aliments, journée affichée.
import { db, newId } from './db.js';
import { DEFAULT_RULES, computeTarget, totals, recipeTotals, recipeAsFood } from './calc.js';
import { COLLATION_A } from './starter.js';

export const state = {
  settings: null,
  foods: [],
  recipes: [],
  date: todayISO(),
  day: null,
  // Repas en préparation, par jour et par repas (gardés en mémoire tant que l'appli est ouverte).
  drafts: {},
};

export function todayISO(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

export function shiftDate(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return todayISO(new Date(y, m - 1, d + days));
}

function defaultSettings() {
  return { id: 'main', profile: { sex: 'M', age: null, height: null, weight: null }, rules: { ...DEFAULT_RULES } };
}

export async function loadAll() {
  const saved = await db.get('settings', 'main');
  const def = defaultSettings();
  state.settings = saved
    ? { ...def, ...saved, profile: { ...def.profile, ...saved.profile }, rules: { ...def.rules, ...saved.rules } }
    : def;
  state.foods = await db.getAll('foods');
  sortFoods();
  state.recipes = await db.getAll('recipes');
  sortRecipes();
  await addCollationRecipe();
  await loadDay(state.date);
}

function sortFoods() {
  state.foods.sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
}

export async function saveSettings() {
  await db.put('settings', state.settings);
}

export function emptyDay(date) {
  return { date, sessions: [], intense: false, eve: false, entries: [] };
}

export async function loadDay(date) {
  state.date = date;
  state.day = (await db.get('days', date)) || emptyDay(date);
}

export async function saveDay() {
  await db.put('days', state.day);
}

export async function saveFood(food) {
  if (!food.id) food.id = newId();
  await db.put('foods', food);
  const i = state.foods.findIndex((f) => f.id === food.id);
  if (i >= 0) state.foods[i] = food; else state.foods.push(food);
  sortFoods();
  return food;
}

export async function deleteFood(id) {
  await db.del('foods', id);
  state.foods = state.foods.filter((f) => f.id !== id);
}

export const foodById = (id) => state.foods.find((f) => f.id === id);

// ---------- Recettes ----------
function sortRecipes() {
  state.recipes.sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
}
export async function saveRecipe(recipe) {
  if (!recipe.id) recipe.id = newId();
  await db.put('recipes', recipe);
  const i = state.recipes.findIndex((r) => r.id === recipe.id);
  if (i >= 0) state.recipes[i] = recipe; else state.recipes.push(recipe);
  sortRecipes();
  return recipe;
}
export async function deleteRecipe(id) {
  await db.del('recipes', id);
  state.recipes = state.recipes.filter((r) => r.id !== id);
}
export const recipeById = (id) => state.recipes.find((r) => r.id === id);

// Ingrédient d'une recette : valeurs actuelles de l'aliment, ou la copie gardée s'il a été supprimé.
export function ingredientFood(ing) {
  return foodById(ing.foodId) || { ...ing.snapshot, missing: true };
}
export function recipeInfo(recipe) {
  const list = recipe.ingredients.map((i) => ({ food: ingredientFood(i), grams: i.grams }));
  return recipeTotals(list, recipe.servings, recipe.cookedWeight);
}
// Aliment ou recette (identifiant « r:… ») pour l'écran Repas.
export function resolveFood(id) {
  if (String(id).startsWith('r:')) {
    const r = recipeById(id.slice(2));
    return r ? recipeAsFood(r, recipeInfo(r)) : null;
  }
  return foodById(id);
}

// Une seule fois : la collation A devient une recette (avec ses aliments, repris
// de la base s'ils y sont déjà). L'ancien réglage « collation réservée » disparaît.
async function addCollationRecipe() {
  if (state.settings.collationRecipeDone) return;
  state.settings.collationRecipeDone = true;
  delete state.settings.snack;
  await saveSettings();
  if (state.recipes.some((r) => /collation/i.test(r.name))) return;
  const ingredients = [];
  for (const ing of COLLATION_A.ingredients) {
    let food = state.foods.find((f) => ing.match.test(f.name));
    if (!food) food = await saveFood({ ...ing.food });
    const { name, kcal, p, c, f, fib, nova, state: st, unitWeight, unitName } = food;
    const grams = ing.units && food.unitWeight ? ing.units * food.unitWeight : ing.grams;
    ingredients.push({ foodId: food.id, grams, units: ing.units && food.unitWeight ? ing.units : null, snapshot: { name, kcal, p, c, f, fib, nova, state: st, unitWeight, unitName } });
  }
  await saveRecipe({ ...COLLATION_A.recipe, ingredients });
}

// Résumé de la journée affichée : objectif, consommé, collation réservée, reste.
export function daySummary() {
  const { profile, rules } = state.settings;
  const t = computeTarget(profile, rules, state.day);
  return { ...t, consumed: totals(state.day.entries) };
}

export async function exportData() {
  return {
    app: 'appli-nutrition',
    format: 1,
    exportedAt: new Date().toISOString(),
    settings: await db.getAll('settings'),
    foods: await db.getAll('foods'),
    days: await db.getAll('days'),
    recipes: await db.getAll('recipes'),
  };
}

export async function importData(data) {
  if (!data || data.app !== 'appli-nutrition' || !Array.isArray(data.foods) || !Array.isArray(data.days)) {
    throw new Error('Ce fichier n\'est pas une sauvegarde de l\'appli.');
  }
  await db.replaceAll({ ...data, recipes: Array.isArray(data.recipes) ? data.recipes : [] });
  await loadAll();
}

export { newId };
