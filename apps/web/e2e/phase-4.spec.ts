import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  E2E_ADMIN,
  IMPORT_CSV,
  PNG,
  WEB_URL,
  copyCredentials,
  loginSeller,
  loginStaff,
  pdf,
} from './support';

/**
 * Phases 1 to 4 as their users see them (D-49): the admin creates a courier,
 * a Dépôt account and a seller; the seller logs in, creates a parcel, imports
 * three more, prints their labels, finds them in Mes colis, asks for a pickup
 * and cancels it; the admin looks with "Voir comme le vendeur"; the Dépôt
 * sees the shop, and nothing more.
 *
 * One flow in order, on a fresh database: each test starts where the
 * previous one stopped. Each role has a browser of its own (its own cookies).
 */

const SHOP = 'Bijoux Yasmine';
const SELLER_EMAIL = 'yasmine@bijoux.tn';
const DEPOT_USERNAME = 'depot.e2e';

let admin: Page;
let seller: Page;
let sellerPassword = '';
let depotPassword = '';
const contexts: BrowserContext[] = [];

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  const open = async () => {
    const context = await browser.newContext({
      baseURL: WEB_URL,
      locale: 'fr-FR',
      timezoneId: 'Africa/Tunis',
      permissions: ['clipboard-read', 'clipboard-write'],
    });
    contexts.push(context);
    return context.newPage();
  };
  admin = await open();
  seller = await open();
});

test.afterAll(async () => {
  for (const context of contexts) await context.close();
});

/** The rows of the table on screen. */
const rows = (page: Page) => page.locator('tbody tr');

test('the admin logs in with his username; a wrong password is refused', async () => {
  await admin.goto('/admin/connexion');
  await admin.getByLabel('Identifiant').fill(E2E_ADMIN.username);
  await admin.getByLabel('Mot de passe').fill('pas-le-bon-mot-de-passe');
  await admin.getByRole('button', { name: 'Se connecter' }).click();
  // Scoped to the form: Next.js adds its own route announcer with role="alert".
  await expect(admin.locator('form').getByRole('alert')).toHaveText(
    'Identifiant ou mot de passe incorrect',
  );

  await loginStaff(admin, E2E_ADMIN.username, E2E_ADMIN.password);
  await expect(admin.getByRole('heading', { name: 'Bonjour Admin' })).toBeVisible();
});

test('Créer un coursier, then Copier les identifiants (Admin 4.15, A-20)', async () => {
  await admin.getByRole('link', { name: 'Coursiers', exact: true }).click();
  await admin.getByRole('button', { name: 'Créer un coursier' }).click();
  const form = admin.getByRole('dialog', { name: 'Créer un coursier' });
  await form.getByLabel('Prénom').fill('Oussama');
  await form.getByLabel('Nom', { exact: true }).fill('Trabelsi');
  await form.getByLabel('Téléphone').fill('55 123 456');
  await form.getByLabel('CIN').fill('09876543');
  await form.getByRole('button', { name: 'Créer', exact: true }).click();

  const { password, copied } = await copyCredentials(admin);
  expect(copied).toBe(`Téléphone : 55123456\nMot de passe : ${password}\nRôle : Livreur`);
  await expect(admin.getByText('Oussama Trabelsi')).toBeVisible();
});

test('Paramètres › Utilisateurs: a Dépôt account (Admin 4.16)', async () => {
  await admin.goto('/admin/parametres/utilisateurs');
  await admin.getByRole('button', { name: 'Créer un utilisateur' }).click();
  const form = admin.getByRole('dialog', { name: 'Créer un utilisateur' });
  await form.getByLabel('Rôle').selectOption('DEPOT');
  await form.getByLabel('Identifiant').fill(DEPOT_USERNAME);
  await form.getByLabel('Prénom').fill('Karim');
  await form.getByLabel('Nom', { exact: true }).fill('Dépôt');
  await form.getByLabel('Téléphone').fill('20111222');
  await form.getByRole('button', { name: 'Créer', exact: true }).click();

  const { password, copied } = await copyCredentials(admin);
  expect(copied).toBe(`Identifiant : ${DEPOT_USERNAME}\nMot de passe : ${password}`);
  depotPassword = password;
});

test('Créer un vendeur with his documents (Admin 4.14, D-33)', async () => {
  await admin.getByRole('link', { name: 'Vendeurs', exact: true }).click();
  await admin.getByRole('button', { name: 'Créer un vendeur' }).click();
  const form = admin.getByRole('dialog', { name: 'Créer un vendeur' });
  await form.getByLabel('Nom de la boutique').fill(SHOP);
  await form.getByLabel('Catégorie de produits').selectOption({ index: 1 });
  await form.getByLabel('Prénom').fill('Yasmine');
  await form.getByLabel('Nom', { exact: true }).fill('Gharbi');
  await form.getByLabel('Téléphone').fill('29555666');
  await form.getByLabel('Email (identifiant de connexion)').fill(SELLER_EMAIL);
  await form.getByRole('radio', { name: 'Patente' }).check();
  await form.locator('#document-CIN_RECTO').setInputFiles(PNG);
  await form.locator('#document-CIN_VERSO').setInputFiles(pdf('cin-verso.pdf'));
  await form.locator('#document-PATENTE').setInputFiles(pdf('patente.pdf'));
  await form.getByRole('button', { name: 'Créer', exact: true }).click();

  const { password, copied } = await copyCredentials(admin);
  expect(copied).toBe(`Email : ${SELLER_EMAIL}\nMot de passe : ${password}`);
  sellerPassword = password;
  await expect(admin.getByRole('link', { name: SHOP })).toBeVisible();
  // The admin sees the login email; the Dépôt will not (D-11).
  await expect(admin.getByRole('main').getByText(SELLER_EMAIL)).toBeVisible();
});

test('the seller logs in with his email; the Tableau de bord starts at zero', async () => {
  await loginSeller(seller, SELLER_EMAIL, sellerPassword);
  const today = seller.getByRole('region', { name: 'Aujourd’hui' });
  await expect(today.getByRole('definition')).toHaveText(['0', '0', '0', '0', '0', '0']);
  await expect(
    seller.getByRole('main').getByRole('link', { name: 'Créer un colis' }),
  ).toBeVisible();
});

test('Créer un colis (Vendeur 4.2)', async () => {
  await seller.getByRole('main').getByRole('link', { name: 'Créer un colis' }).click();
  await seller.getByLabel('Nom du destinataire').fill('Amira Ben Salah');
  await seller.getByLabel('Téléphone', { exact: true }).fill('29876543');
  await seller.getByLabel('Rechercher une localité').fill('Khaznadar');
  await seller.getByRole('list', { name: 'Résultats' }).getByRole('button').first().click();
  await expect(seller.getByLabel('Localité', { exact: true })).not.toHaveValue('');
  await seller.getByLabel('Adresse', { exact: true }).fill('12 rue de Marseille');
  await seller.getByLabel('Description du produit').fill('Bracelets');
  await seller.getByLabel('Montant COD (DT)').fill('85,000');
  await seller.getByRole('button', { name: 'Créer le colis' }).click();

  await seller.waitForURL(/\/vendeur\/colis\/FG-/);
  await expect(seller.getByRole('heading', { level: 1 })).toHaveText(/^FG-/);
  await expect(seller.getByText('Créé', { exact: true }).first()).toBeVisible();
});

test('Import CSV: Arabic, a localité settled in its dropdown, a French row (Vendeur 4.3)', async () => {
  await seller.goto('/vendeur/colis/import');
  await seller.getByLabel('Fichier CSV').setInputFiles(IMPORT_CSV);
  await expect(seller.getByText('colis.csv : 2 valides · 1 à vérifier · 0 erreur')).toBeVisible();

  await seller.getByLabel('Localité de la ligne 3').selectOption({ index: 1 });
  await expect(seller.getByText('colis.csv : 3 valides · 0 à vérifier · 0 erreur')).toBeVisible();
  await seller.getByRole('button', { name: 'Importer 3 colis' }).click();
  await expect(seller.getByRole('status')).toHaveText('3 colis importés depuis colis.csv.');
  await expect(seller.getByText('أمينة بن صالح')).toBeVisible();
});

test('Imprimer toutes les étiquettes gives a PDF (Vendeur 4.4)', async () => {
  const links = seller
    .getByText('Imprimer toutes les étiquettes :')
    .locator('xpath=..')
    .getByRole('link');
  // One link per format: thermal 10 × 15 cm and A4 (D-36).
  await expect(links).toHaveCount(2);
  for (const link of await links.all()) {
    const href = await link.getAttribute('href');
    const response = await seller.request.get(href!);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('application/pdf');
    const body = await response.body();
    expect(body.length).toBeGreaterThan(1000);
    expect(body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  }
});

test('Mes colis: four parcels, the En cours group, a search by phone (Vendeur 4.7)', async () => {
  await seller.goto('/vendeur/colis');
  await expect(seller.getByRole('link', { name: 'Tous (4)' })).toBeVisible();
  await expect(rows(seller)).toHaveCount(4);
  await expect(seller.getByRole('cell', { name: 'أمينة بن صالح' })).toBeVisible();

  await seller.getByRole('link', { name: 'En cours (4)' }).click();
  await seller.waitForURL(/groupe=EN_COURS/);
  await expect(rows(seller)).toHaveCount(4);

  await seller.getByLabel('Rechercher').fill('98222333');
  await seller.getByRole('button', { name: 'Filtrer' }).click();
  await seller.waitForURL(/q=98222333/);
  await expect(rows(seller)).toHaveCount(1);
  await expect(rows(seller)).toContainText('Sami Trabelsi');
});

test('Demander un ramassage at a new address, two parcels, Matin; then cancel it (Vendeur 4.5)', async () => {
  await seller.goto('/vendeur/ramassages');
  await seller.getByRole('main').getByRole('link', { name: 'Demander un ramassage' }).click();
  await seller.waitForURL('**/vendeur/ramassages/nouveau');

  await seller.getByLabel('Rechercher une localité').fill('Khaznadar');
  await seller.getByRole('list', { name: 'Résultats' }).getByRole('button').first().click();
  await seller.getByLabel('Adresse', { exact: true }).fill('4 rue de Rome');

  // Every ready parcel is ticked at first: keep two.
  await seller.getByRole('checkbox', { name: /Leïla Mansour/ }).uncheck();
  await seller.getByRole('checkbox', { name: /أمينة بن صالح/ }).uncheck();
  await expect(seller.getByText('2 colis choisis')).toBeVisible();
  await seller.getByRole('radio', { name: 'Matin' }).check();
  await seller.getByRole('button', { name: 'Demander le ramassage' }).click();

  await seller.waitForURL(/\/vendeur\/ramassages\/[0-9a-f-]{36}$/);
  await expect(seller.getByText('Demandé', { exact: true })).toBeVisible();
  await expect(seller.getByText('Amira Ben Salah')).toBeVisible();
  await expect(seller.getByText('Sami Trabelsi')).toBeVisible();

  await seller.getByRole('button', { name: 'Annuler le ramassage' }).click();
  const confirm = seller.getByRole('dialog', { name: 'Annuler le ramassage' });
  await confirm.getByRole('button', { name: 'Annuler le ramassage' }).click();
  await expect(confirm).toBeHidden();
  await expect(seller.getByText('Annulé', { exact: true })).toBeVisible();
  await expect(seller.getByRole('button', { name: 'Annuler le ramassage' })).toHaveCount(0);
});

test('Tableau de bord over 7 derniers jours: Créés = 4 (D-48)', async () => {
  await seller.goto('/vendeur');
  await seller.getByRole('link', { name: '7 derniers jours' }).click();
  await seller.waitForURL(/periode=SEPT_JOURS/);
  const week = seller.getByRole('region', { name: '7 derniers jours' });
  await expect(week.getByRole('definition').first()).toHaveText('4');
  await expect(week.getByRole('term').first()).toHaveText('Créés');
});

test('Voir comme le vendeur: his space, read-only, then Quitter (D-5)', async () => {
  await admin.goto('/admin/vendeurs');
  // The test API also holds the demo seller (D-50): this shop's row only.
  await admin
    .getByRole('listitem')
    .filter({ hasText: SHOP })
    .getByRole('button', { name: 'Voir comme le vendeur' })
    .click();
  await admin.waitForURL('**/vendeur');

  const banner = admin.getByRole('region', { name: 'Consultation' });
  await expect(banner).toContainText(`Vous consultez le compte de ${SHOP}`);
  await expect(banner).toContainText('Consultation en lecture seule : aucune action possible.');
  await expect(admin.getByRole('main').getByRole('link', { name: 'Créer un colis' })).toHaveCount(
    0,
  );

  await admin.goto('/vendeur/colis');
  await expect(admin.getByRole('link', { name: 'Tous (4)' })).toBeVisible();
  await expect(admin.getByRole('link', { name: 'Exporter' })).toHaveCount(0);

  await banner.getByRole('button', { name: 'Quitter' }).click();
  await admin.waitForURL('**/admin/vendeurs');
});

test('the Dépôt sees the shop, not the email nor the documents, and has no action (D-11)', async ({
  browser,
}) => {
  const context = await browser.newContext({ baseURL: WEB_URL });
  contexts.push(context);
  const depot = await context.newPage();
  await loginStaff(depot, DEPOT_USERNAME, depotPassword);

  await depot.getByRole('link', { name: 'Vendeurs', exact: true }).click();
  const main = depot.getByRole('main');
  await expect(main.getByRole('link', { name: SHOP })).toBeVisible();
  await expect(main.getByText(SELLER_EMAIL)).toHaveCount(0);
  await expect(main.getByRole('button')).toHaveCount(0);

  await main.getByRole('link', { name: SHOP }).click();
  await depot.waitForURL(/\/admin\/vendeurs\/[0-9a-f-]{36}$/);
  await expect(main.getByRole('heading', { level: 1 })).toHaveText(SHOP);
  await expect(main.getByText(SELLER_EMAIL)).toHaveCount(0);
  await expect(main.getByText('Email (identifiant de connexion)')).toHaveCount(0);
  await expect(main.getByRole('heading', { name: 'Documents' })).toHaveCount(0);
  await expect(main.getByRole('button')).toHaveCount(0);
});

test('the seller logs out; his space sends him back to the login', async () => {
  await seller.goto('/vendeur');
  await seller.getByRole('button', { name: 'Se déconnecter' }).click();
  await seller.waitForURL('**/vendeur/connexion');
  await seller.goto('/vendeur');
  await seller.waitForURL('**/vendeur/connexion**');
});
