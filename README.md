# appli-nutrition

Web-app (PWA) de suivi nutritionnel pour sportif d'endurance, installable sur iPhone depuis Safari.

- 100 % gratuite, sans serveur : hébergée sur GitHub Pages.
- **Les données restent sur le téléphone** (IndexedDB). Rien n'est envoyé sur Internet. Le profil se saisit dans l'écran Réglages.
- Sauvegarde et restauration par fichier JSON (Réglages › Sauvegardes).
- Fonctionne hors ligne une fois installée.

## Fonctions

| Écran | Rôle |
|---|---|
| **Jour** | Ce qu'il reste pour la journée, barres kcal / protéines / glucides / lipides / fibres, journal par repas, saisie libre (resto), collation réservée. Flèches ◀ ▶ pour changer de jour. |
| **Séance** | Séances du jour (course, trail, muscu, autre) → objectif calculé avec le détail du calcul. |
| **Repas** | Choisir les aliments d'un repas → l'appli propose les grammes (ou un nombre d'unités) pour coller à la part du repas. |
| **Cuisine › Aliments** | Base d'aliments : valeurs pour 100 g, cru/cuit, NOVA, portion du paquet, poids d'une unité. |
| **Cuisine › Recettes** | Fiches recettes : ingrédients de la base, apports totaux et par portion (et pour 100 g cuit si le plat est pesé), NOVA, étapes, temps, ustensiles, astuces. Adapter les portions, dupliquer, ajouter au journal (en portions ou en grammes). Une recette peut aussi servir dans l'écran Repas, par demi-portions. |
| **Réglages** | Profil, règles de calcul, collation réservée, export / import. |

## Règles de calcul (modifiables dans Réglages)

1. Besoins de base = Mifflin-St Jeor × facteur d'activité (ou chiffre fixe).
2. \+ sport : course/trail = km-effort × kcal par km-effort (1 km-effort = 1 km, + 1 par 100 m D+) ; muscu/autre = minutes × kcal par minute. Les kcal Garmin servent de contrôle (ou remplacent le calcul si l'option est activée).
3. \+ renfo bas du corps : l'équivalent de X km-effort, en glucides.
4. − déficit selon la durée totale de sport (court / moyen / long). Les cases « séance intense » et « veille de grosse sortie » le réduisent chacune d'un cran, jusqu'à 0.
5. Protéines (g/kg ou g/jour) ; lipides = le plus grand entre le minimum et X % des kcal ; glucides = le reste.
6. Part d'un repas = (objectif − déjà mangé − collation réservée) ÷ repas restants.

## Technique

HTML, CSS et JavaScript (modules ES), sans étape de build. Les fichiers du dépôt sont publiés tels quels.

```
index.html, css/style.css, manifest.webmanifest, sw.js (hors ligne), icons/
js/calc.js      calculs (testés)
js/db.js        stockage IndexedDB
js/state.js     état partagé, export/import
js/ui.js        outils d'affichage
js/views/*.js   un fichier par écran (recettes.js = fiches recettes)
tests/          tests des calculs : node --test tests/calc.test.mjs
```

Après chaque modification d'un fichier de l'appli, changer `CACHE` dans `sw.js` n'est pas obligatoire (stratégie « réseau d'abord »), mais la liste `ASSETS` doit contenir tout nouveau fichier.

**Dépôt public** : n'y mettre aucune donnée personnelle (profil, mesures, sauvegardes JSON, cahier des charges).
