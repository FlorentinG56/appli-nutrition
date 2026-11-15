# appli-nutrition

Web-app (PWA) de suivi nutritionnel pour sportif d'endurance, installable sur iPhone depuis Safari.

- 100 % gratuite, sans serveur : hébergée sur GitHub Pages.
- **Les données restent sur le téléphone** (IndexedDB). Rien n'est envoyé sur Internet. Le profil se saisit dans l'écran Réglages.
- Sauvegarde et restauration par fichier JSON (Réglages › Sauvegardes).
- Fonctionne hors ligne une fois installée.

## Fonctions

| Écran | Rôle |
|---|---|
| **Jour** | Ce qu'il reste pour la journée, barres kcal / protéines / glucides / lipides / fibres, collation réservée. Pour chaque repas : « Préparer ce repas » → je choisis mes aliments, l'appli calcule aussitôt la quantité de chacun (aliment fixé, à volonté, à l'unité, recette en portions), puis ajout au journal. Saisie libre (resto). Flèches ◀ ▶ pour changer de jour. |
| **Séance** | Séances du jour (course, trail, muscu, autre) → objectif calculé avec le détail du calcul. |
| **Cuisine › Aliments** | Base d'aliments : valeurs pour 100 g, cru/cuit, NOVA, portion du paquet, poids d'une unité. **Remplissage automatique** : photo du code-barres (fiche Open Food Facts, NOVA compris) ou photo du tableau « Valeur nutritive » (lu dans le téléphone, converti pour 100 g), photo des ingrédients pour estimer le NOVA. Toujours vérifié avant d'enregistrer. |
| **Cuisine › Recettes** | Fiches recettes : ingrédients de la base, apports totaux et par portion (et pour 100 g cuit si le plat est pesé), NOVA, étapes, temps, ustensiles, astuces. Adapter les portions, dupliquer, ajouter au journal (en portions ou en grammes). Une recette peut aussi servir dans l'écran Repas, par demi-portions. |
| **Réglages** | Profil, règles de calcul, collation réservée, export / import. |

## Règles de calcul (modifiables dans Réglages)

1. Besoins de base = Mifflin-St Jeor × facteur d'activité (ou chiffre fixe).
2. \+ sport : course/trail = km-effort × kcal par km-effort (1 km-effort = 1 km, + 1 par 100 m D+) ; muscu/autre = minutes × kcal par minute. Les kcal Garmin servent de contrôle (ou remplacent le calcul si l'option est activée).
3. \+ renfo bas du corps : l'équivalent de X km-effort, en glucides.
4. − déficit selon la durée totale de sport (court / moyen / long). Les cases « séance intense » et « veille de grosse sortie » le réduisent chacune d'un cran, jusqu'à 0.
5. Protéines (g/kg ou g/jour) ; lipides = le plus grand entre le minimum et X % des kcal ; glucides = le reste.
6. Part d'un repas = (objectif − déjà mangé − collation réservée) ÷ repas restants.

Seul réseau utilisé : la recherche d'un code-barres sur Open Food Facts (base publique gratuite). Seul le code-barres est envoyé.

## Technique

HTML, CSS et JavaScript (modules ES), sans étape de build. Les fichiers du dépôt sont publiés tels quels.

```
index.html, css/style.css, manifest.webmanifest, sw.js (hors ligne), icons/
js/calc.js      calculs (testés)
js/label.js     lecture d'étiquettes, NOVA estimé, Open Food Facts (testés)
js/scan.js      photo → code-barres (ZXing) ou texte (Tesseract)
vendor/         bibliothèques libres intégrées : Tesseract.js (Apache 2.0), ZXing (Apache 2.0)
js/db.js        stockage IndexedDB
js/state.js     état partagé, export/import
js/ui.js        outils d'affichage
js/views/*.js   un fichier par écran (recettes.js = fiches recettes)
tests/          tests : node --test tests/*.test.mjs
```

Après chaque modification d'un fichier de l'appli, changer `CACHE` dans `sw.js` n'est pas obligatoire (stratégie « réseau d'abord »), mais la liste `ASSETS` doit contenir tout nouveau fichier.

**Dépôt public** : n'y mettre aucune donnée personnelle (profil, mesures, sauvegardes JSON, cahier des charges).
