# MyFit

PWA personnelle de suivi nutritionnel (calories, protéines, glucides, lipides, poids) pensée pour iPhone.
Pas de compte, pas de pub, pas de tracking : les données restent dans le navigateur (IndexedDB).
Seules les recherches de produits partent vers [Open Food Facts](https://world.openfoodfacts.org).

Stack : Vite, TypeScript strict, Preact, vite-plugin-pwa (Workbox), idb, zxing (chargé seulement à l'ouverture du scanner sur Safari).

## Lancer

```sh
npm install
npm run dev          # http://localhost:5173/myFitApp/
```

## Tester

```sh
npm run typecheck
npm test                                  # calculs (Vitest)
npx playwright install webkit             # une fois
npm run test:e2e                          # parcours principal, WebKit en profil iPhone
E2E_BROWSER=chromium npm run test:e2e     # même test sous Chromium
```

## Builder

```sh
npm run build        # sortie dans dist/
npm run preview      # sert dist/ sur http://localhost:4173/myFitApp/
```

Le sous-chemin vient de `BASE_PATH` (défaut `/myFitApp/`). `start_url`, `scope` et l'enregistrement du service worker le suivent.

## Déployer

Chaque push sur `main` lance `.github/workflows/deploy.yml` : typecheck, tests, build, publication sur GitHub Pages.
Prérequis, une seule fois : Settings > Pages > Build and deployment > Source : **GitHub Actions**.

URL : https://nassim-moussaoui.github.io/myFitApp/

## Structure

```
src/
  app/        état global, routage par onglets, service worker, thème
  ui/         composants partagés (feuilles <dialog>, champs, barres)
  features/   journal, foods (recherche, scan, saisie), weight, stats, settings
  lib/
    nutrition/  BMR, TDEE, cibles, macros, tendance du poids, stats (testés)
    db/         schéma IndexedDB versionné, migrations, export/import
    off/        client Open Food Facts, cache, limite de débit
```

Pour faire évoluer le stockage : incrémenter `DB_VERSION` dans `src/lib/db/schema.ts`, ajouter une étape à la fin de `migrations` (`src/lib/db/index.ts`) et, si le format change, une migration de données dans `src/lib/db/backup.ts`.

Icônes : sources SVG dans `scripts/`, PNG régénérés par `npm run icons`.
