import { expect, test, type Page } from '@playwright/test';

const SKYR = {
  code: '3329770077003',
  product_name: 'Skyr nature',
  brands: 'Yoplait',
  serving_quantity: 150,
  nutriments: { 'energy-kcal_100g': 57, proteins_100g: 9.5, carbohydrates_100g: 3.6, fat_100g: 0.5 },
};

/** Search service hit: approximate values only (Nutri-Score data). */
const SKYR_HIT = {
  code: SKYR.code,
  product_name: SKYR.product_name,
  brands: ['xx:Yoplait'],
  serving_quantity: 150,
  nutriscore_data: {
    components: {
      negative: [{ id: 'energy', value: 241, unit: 'kJ' }],
      positive: [{ id: 'proteins', value: 9.5, unit: 'g' }],
    },
  },
};

/** Open Food Facts is mocked: tests must not depend on the network or its rate limit. */
async function mockOff(page: Page) {
  await page.route('https://search.openfoodfacts.org/**', (route) => route.fulfill({ json: { hits: [SKYR_HIT] } }));
  await page.route('https://world.openfoodfacts.org/**', (route) => {
    const url = route.request().url();
    if (url.includes('/cgi/search.pl')) return route.fulfill({ json: { products: [SKYR] } });
    if (url.includes(`/product/${SKYR.code}`)) return route.fulfill({ json: { status: 1, product: SKYR } });
    return route.fulfill({ status: 404, json: { status: 0 } });
  });
  await page.route('https://images.openfoodfacts.org/**', (route) => route.abort());
}

async function onboard(page: Page) {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Bienvenue' })).toBeVisible();
  await page.getByLabel('Âge').fill('30');
  await page.getByLabel('Taille').fill('180');
  await page.getByLabel('Poids actuel').fill('80');
  await page.getByText('Actif', { exact: true }).click();
  // Live preview: Mifflin-St Jeor 1780 x 1.55 - 550 = 2210 kcal.
  await expect(page.locator('.preview')).toContainText('2 210 kcal');
  await page.getByRole('button', { name: 'Commencer' }).click();
  await expect(page.getByRole('heading', { name: "Aujourd'hui" })).toBeVisible();
}

test.describe('parcours principal', () => {
  test.use({ serviceWorkers: 'block' });

  test('onboarding, recherche, ajout, édition, poids, stats', async ({ page }) => {
    await mockOff(page);
    await onboard(page);
    await expect(page.locator('.summary')).toContainText('2 210 kcal');

    // Search Open Food Facts and add 150 g of skyr to lunch.
    await page.getByRole('button', { name: 'Ajouter un aliment : Déjeuner' }).click();
    const add = page.locator('dialog.addfood');
    await expect(add).toBeVisible();
    await add.getByLabel('Rechercher un aliment').fill('skyr');
    await add.locator('.food-row .row').filter({ hasText: 'Skyr nature' }).click();
    const qty = page.locator('dialog.sheet').filter({ hasText: 'Pour 100 g' });
    await expect(qty.getByRole('textbox', { name: 'Quantité', exact: true })).toHaveValue('150');
    await qty.getByRole('button', { name: '100 g', exact: true }).click();
    await expect(qty.locator('.nutri-box')).toContainText('57');
    await qty.getByRole('textbox', { name: 'Quantité', exact: true }).fill('200');
    await expect(qty.locator('.nutri-box')).toContainText('114');
    await qty.getByRole('button', { name: 'Ajouter', exact: true }).click();

    const lunch = page.getByRole('region', { name: 'Déjeuner', exact: true });
    await expect(lunch).toContainText('Skyr nature');
    await expect(lunch).toContainText('114 kcal');
    await expect(page.locator('.summary')).toContainText('114 kcal');

    // Create a custom food from the add screen, then log it in 2 taps from the recents.
    await page.getByRole('button', { name: 'Ajouter un aliment', exact: true }).click();
    await add.getByRole('button', { name: 'Aliment', exact: true }).click();
    const editor = page.locator('dialog.sheet').filter({ hasText: 'Nouvel aliment' });
    await editor.getByLabel('Nom').fill('Riz basmati cuit');
    await editor.getByLabel('Protéines').fill('3,5');
    await editor.getByLabel('Glucides').fill('28');
    await editor.getByLabel('Lipides').fill('0,4');
    await expect(editor).toContainText('Calculé : 130 kcal');
    await editor.getByRole('button', { name: 'Enregistrer' }).click();
    const qty2 = page.locator('dialog.sheet').filter({ hasText: 'Pour 100 g' });
    await qty2.locator('.segmented__opt').filter({ hasText: 'Dîner' }).click();
    await expect(qty2.getByRole('radio', { name: 'Dîner' })).toBeChecked();
    await qty2.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Dîner', exact: true })).toContainText('Riz basmati cuit');

    // Edit then delete an entry, with undo.
    await lunch.getByRole('button', { name: /Skyr nature/ }).click();
    const edit = page.locator('dialog.sheet').filter({ hasText: 'Pour 100 g' });
    await edit.getByRole('textbox', { name: 'Quantité', exact: true }).fill('100');
    await edit.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(lunch).toContainText('57 kcal');
    await lunch.getByRole('button', { name: /Skyr nature/ }).click();
    await page.getByRole('button', { name: 'Supprimer' }).click();
    await expect(lunch).not.toContainText('Skyr nature');
    await page.getByRole('button', { name: 'Annuler' }).click();
    await expect(lunch).toContainText('Skyr nature');

    // Day navigation.
    await page.getByRole('button', { name: 'Jour précédent' }).click();
    await expect(page.getByRole('heading', { name: 'Hier' })).toBeVisible();
    await page.getByRole('button', { name: "Revenir à aujourd'hui" }).click();
    await expect(page.getByRole('heading', { name: "Aujourd'hui" })).toBeVisible();

    // Weight: save a new weigh-in, accept the goal update.
    await page.getByRole('link', { name: 'Poids' }).click();
    await page.getByLabel('Poids en kilos').fill('78,4');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByRole('heading', { name: 'Mettre à jour mes objectifs ?' })).toBeVisible();
    await page.getByRole('button', { name: 'Mettre à jour' }).click();
    await expect(page.locator('.list')).toContainText('78,4 kg');

    // Milestones: 30 days at the planned rate (-0.5 kg/week) from 80 kg -> 77,9 kg.
    const milestone = page.locator('section.milestone');
    await expect(milestone).toContainText('77,9');
    await expect(page.getByRole('heading', { name: 'Projection' })).toBeVisible();
    await page.getByLabel('Poids en kilos').fill('77,8');
    await page.locator('form.card').getByRole('button', { name: 'Enregistrer' }).click();
    const win = page.locator('dialog.celebrate-sheet');
    await expect(win.getByRole('heading', { name: 'Palier atteint !' })).toBeVisible();
    await expect(win).toContainText('Prochain palier');
    await win.getByRole('button', { name: 'Continuer' }).click();
    await expect(milestone).toContainText('Palier précédent atteint');
    await expect(page.getByRole('heading', { name: 'Paliers atteints' })).toBeVisible();

    // Stats reflect today.
    await page.getByRole('link', { name: 'Stats' }).click();
    await expect(page.getByText('Moyenne par jour suivi')).toBeVisible();
    await expect(page.locator('.regularity')).toContainText('1 / 7');

    // Data survives a reload (IndexedDB).
    await page.reload();
    await page.getByRole('link', { name: 'Journal' }).click();
    await expect(page.getByRole('region', { name: 'Dîner', exact: true })).toContainText('Riz basmati cuit');
    await page.getByRole('link', { name: 'Réglages' }).click();
    await expect(page.locator('.kv').first()).toContainText('78,4 kg');
  });

  test('eau, ajout rapide, repas type, recette, mesures, dépense réelle', async ({ page }) => {
    await mockOff(page);
    await onboard(page);

    // Water: two glasses.
    const water = page.getByRole('region', { name: 'Eau' });
    await page.getByRole('button', { name: 'Ajouter un verre de 250 ml' }).click();
    await page.getByRole('button', { name: 'Ajouter un verre de 250 ml' }).click();
    await expect(water).toContainText('0,5 L sur 2 L');

    // Quick add on lunch.
    await page.getByRole('button', { name: 'Ajouter un aliment : Déjeuner' }).click();
    await page.getByRole('button', { name: 'Ajout rapide' }).click();
    const quick = page.locator('dialog.sheet').filter({ hasText: "sans créer d'aliment" });
    await quick.getByLabel('Nom (facultatif)').fill('Resto');
    await quick.getByLabel('Calories').fill('850');
    await quick.getByRole('button', { name: 'Ajouter', exact: true }).click();
    const lunch = page.getByRole('region', { name: 'Déjeuner', exact: true });
    await expect(lunch).toContainText('Resto');
    await expect(lunch).toContainText('Ajout rapide');
    await expect(page.locator('.summary')).toContainText('850 kcal');

    // Save lunch as a template, then add it to yesterday's dinner in one tap.
    await page.getByRole('button', { name: 'Enregistrer comme repas type : Déjeuner' }).click();
    await page.locator('dialog.sheet').getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await page.getByRole('button', { name: 'Jour précédent' }).click();
    await page.getByRole('button', { name: 'Ajouter un aliment : Dîner' }).click();
    await page.getByRole('button', { name: 'Ajouter le repas Mon déjeuner' }).click();
    await page.locator('dialog.addfood').getByRole('button', { name: 'Fermer' }).click();
    await expect(page.getByRole('region', { name: 'Dîner', exact: true })).toContainText('Resto');

    // Recipe: one ingredient from Open Food Facts, cooked weight, then log a portion.
    await page.getByRole('button', { name: 'Ajouter un aliment', exact: true }).click();
    await page.getByRole('button', { name: 'Recette' }).click();
    await page.getByLabel('Nom de la recette').fill('Bol skyr');
    await page.getByRole('button', { name: 'Ajouter un ingrédient' }).click();
    await page.getByLabel('Rechercher un ingrédient').fill('skyr');
    await page.locator('dialog').last().locator('.row').filter({ hasText: 'Skyr nature' }).first().click();
    await page.getByLabel('Quantité (crue)').fill('400');
    await page.getByRole('button', { name: 'Ajouter à la recette' }).click();
    await page.getByLabel('Nombre de parts').fill('2');
    await expect(page.locator('dialog.recipe')).toContainText('Une part (200 g)');
    await page.getByRole('button', { name: 'Enregistrer la recette' }).click();
    const qty = page.locator('dialog.sheet').filter({ hasText: 'Pour 100 g' });
    await expect(qty).toContainText('Bol skyr');
    await qty.getByRole('button', { name: '1 portion · 200 g' }).click();
    await qty.getByRole('button', { name: 'Ajouter', exact: true }).click();

    // Body measurements.
    await page.getByRole('link', { name: 'Poids' }).click();
    await page.locator('.segmented__opt').filter({ hasText: 'Mesures' }).click();
    await page.getByLabel('Tour de taille').fill('85');
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Évolution' })).toBeVisible();
    await expect(page.locator('.list').first()).toContainText('85,0 cm');

    // Real expenditure needs more data: the card explains what is missing.
    await page.getByRole('link', { name: 'Stats' }).click();
    await expect(page.getByRole('heading', { name: 'Dépense réelle' })).toBeVisible();
    await expect(page.locator('section').filter({ hasText: 'Dépense réelle' }).last()).toContainText('Note tes repas');
  });

  test('produit introuvable au scan manuel puis création', async ({ page }) => {
    await mockOff(page);
    await onboard(page);
    await page.getByRole('button', { name: 'Ajouter un aliment', exact: true }).click();
    await page.getByRole('button', { name: 'Scanner un code-barres' }).click();
    const scanner = page.locator('dialog.scanner');
    await expect(scanner).toBeVisible();
    await scanner.getByRole('button', { name: 'Saisir le code à la main' }).click();
    await scanner.getByLabel('Code-barres').fill('3017620422003');
    await scanner.getByRole('button', { name: 'Rechercher ce code' }).click();
    await expect(page.getByRole('heading', { name: 'Produit introuvable' })).toBeVisible();
    await page.getByRole('button', { name: 'Créer cet aliment' }).click();
    await expect(page.locator('dialog.sheet').filter({ hasText: 'Nouvel aliment' })).toContainText('3017620422003');
  });
});

test('fonctionne hors ligne après la première visite', async ({ page, context, browserName }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Bienvenue' })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await expect(page.getByRole('heading', { name: 'Bienvenue' })).toBeVisible();

  // The app shell is precached by the service worker.
  const cached = await page.evaluate(async () => {
    const html = await caches.match(new URL('index.html', location.href).href, { ignoreSearch: true });
    const scripts = [...document.querySelectorAll<HTMLScriptElement>('script[type=module]')].map((s) => s.src);
    const js = await Promise.all(scripts.map((u) => caches.match(u, { ignoreSearch: true })));
    return !!html && js.length > 0 && js.every(Boolean);
  });
  expect(cached).toBe(true);

  // Playwright cannot emulate an offline navigation in WebKit; Chromium does the real reload.
  if (browserName === 'webkit') return;
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Bienvenue' })).toBeVisible();
  await context.setOffline(false);
});
