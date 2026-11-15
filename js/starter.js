// Collation A (recette du cahier des charges, section 9), ajoutée une fois aux recettes.
// Valeurs approximatives pour 100 g : à remplacer par celles de vos étiquettes.
export const COLLATION_A = {
  ingredients: [
    { match: /pomme/i, units: 1, grams: 180, food: { name: 'Pomme', kcal: 53, p: 0.3, c: 13.9, f: 0.2, fib: 2.2, nova: 1, state: '', unitWeight: 180, unitName: 'pomme' } },
    { match: /miel/i, grams: 7, food: { name: 'Miel', kcal: 300, p: 0, c: 85.7, f: 0, fib: 0, nova: 2, state: '' } },
    { match: /whey|lactos[ée]rum/i, grams: 30, food: { name: 'Whey (poudre)', kcal: 400, p: 80, c: 6.7, f: 5, fib: 0, nova: 4, state: '', packPortion: 30 } },
  ],
  recipe: {
    id: null,
    name: 'Collation A (pomme, miel, whey)',
    servings: 1,
    cookedWeight: null,
    prepTime: 2,
    cookTime: null,
    utensils: 'Couteau, shaker',
    steps: [
      'Lave la pomme, coupe-la en quartiers ou en lamelles. Garde la peau : c\'est là que sont la moitié des fibres.',
      'Verse le miel en filet sur les tranches. Cannelle en option, quasi 0 kcal.',
      'Dans le shaker : 250 à 300 ml d\'eau froide d\'abord, la poudre ensuite (moins de grumeaux). Secoue 15 à 20 secondes.',
      'Mange assis, en 10 minutes environ, en alternant pomme et shake. La satiété met 15 à 20 minutes à arriver.',
    ],
    tips: 'Variante grosse journée : shake au lait (250 ml) au lieu de l\'eau, soit environ +125 kcal et +9 g de protéines (ajoutez le lait comme ingrédient dans une copie de la recette).\nValeurs de départ approximatives : mettez à jour la pomme, le miel et la whey avec vos étiquettes dans Cuisine › Aliments.',
  },
};
