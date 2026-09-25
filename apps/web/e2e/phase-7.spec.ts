import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { E2E_ADMIN, WEB_URL, copyCredentials, loginSeller, loginStaff } from './support';

/**
 * Phase 7, À vérifier (Vendeur 4.9, Admin 4.6), on the two failed deliveries
 * the test API seeds for the demo seller: one still with the livreur, one
 * back at the depot with less than 24 hours left. The admin, holding Service
 * client's rights, logs a call; the seller sees the badge and the banner,
 * relaunches one parcel with a corrected phone, and gives the other to a new
 * customer; the team reads the old customer and the call on Colis.
 */

const SELLER_EMAIL = 'vendeur@boutique-demo.test';
const WITH_LIVREUR = 'Nour Démo';
const AT_DEPOT = 'Yassine Démo';

let admin: Page;
let seller: Page;
let sellerPassword = '';
let depotCode = '';
const contexts: BrowserContext[] = [];

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  const page = async () => {
    const context = await browser.newContext({
      baseURL: WEB_URL,
      locale: 'fr-FR',
      timezoneId: 'Africa/Tunis',
      permissions: ['clipboard-read', 'clipboard-write'],
    });
    contexts.push(context);
    return context.newPage();
  };
  admin = await page();
  seller = await page();
  await loginStaff(admin, E2E_ADMIN.username, E2E_ADMIN.password);
});

test.afterAll(async () => {
  for (const context of contexts) await context.close();
});

test('the admin hands the demo seller a password', async () => {
  await admin.goto('/admin/vendeurs');
  await admin
    .getByRole('listitem')
    .filter({ hasText: 'Boutique Démo' })
    .getByRole('button', { name: 'Régénérer le mot de passe' })
    .click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Régénérer' }).click();
  sellerPassword = (await copyCredentials(admin)).password;
});

test('Service client follow-up: both parcels, soonest first, and a call logged (Admin 4.6)', async () => {
  await admin.goto('/admin/a-verifier');
  const list = admin.getByRole('list', { name: 'Colis à vérifier' });
  const cards = list.getByRole('listitem');
  await expect(cards.filter({ hasText: WITH_LIVREUR })).toHaveCount(1);
  const urgent = cards.filter({ hasText: AT_DEPOT });
  await expect(urgent).toContainText('Note du livreur : « Téléphone éteint toute la journée »');
  await expect(urgent).toContainText('Vendeur : Boutique Démo');
  // The one under 24 hours comes first.
  await expect(cards.first()).toContainText(AT_DEPOT);
  depotCode = (await urgent.getByRole('link').first().innerText()).trim();

  await urgent.getByRole('button', { name: 'Noter un appel' }).click();
  const dialog = admin.getByRole('dialog');
  await dialog.getByLabel('Pas de réponse').check();
  await dialog.getByLabel('Note (visible par le vendeur)').fill('Messagerie vocale');
  await dialog.getByRole('button', { name: 'Enregistrer l’appel' }).click();
  await expect(dialog).toBeHidden();
  await expect(cards.filter({ hasText: AT_DEPOT })).toContainText(
    /Dernier appel : .* · Pas de réponse · Messagerie vocale \(1\)/,
  );
});

test('the seller sees the badge and the banner under 24 hours', async () => {
  await loginSeller(seller, SELLER_EMAIL, sellerPassword);
  await expect(seller.getByLabel('2 colis à vérifier')).toBeVisible();
  // Next.js has its own role="alert" (the route announcer): the banner by its text.
  const banner = seller.getByRole('alert').filter({ hasText: 'Moins de 24 h pour décider' });
  await expect(banner).toContainText('Moins de 24 h pour décider sur 1 colis');
  await expect(banner).toContainText(AT_DEPOT);
  await expect(banner).not.toContainText(WITH_LIVREUR);
});

test('Relancer with the courier still holding it, the phone corrected (D-70)', async () => {
  await seller.getByRole('link', { name: /À vérifier/ }).click();
  await seller.waitForURL('**/vendeur/a-verifier');
  const card = seller.getByRole('listitem').filter({ hasText: WITH_LIVREUR });
  await expect(card).toContainText('Note du livreur : « Client dit rappeler après 17 h »');
  await card.getByRole('link', { name: 'Décider' }).click();

  await expect(
    seller.getByRole('button', { name: /Changer de client · Disponible au retour au dépôt/ }),
  ).toBeDisabled();
  await seller.getByRole('button', { name: 'Relancer' }).click();
  const dialog = seller.getByRole('dialog', { name: 'Relancer le colis' });
  const date = dialog.getByLabel('Jour de livraison');
  await date.fill((await date.getAttribute('min'))!);
  await dialog.getByLabel('Créneau (facultatif)').selectOption({ label: 'Soir' });
  await dialog.getByLabel('Téléphone', { exact: true }).fill('98765432');
  await dialog.getByRole('button', { name: 'Relancer' }).click();

  await expect(dialog).toBeHidden();
  await expect(seller.getByText(/^Relancé pour .* \(Soir\)$/)).toBeVisible();
  await expect(
    seller.getByText(
      'Informations mises à jour. Faffa Go réimprime l’étiquette au dépôt, avec le même code.',
    ),
  ).toBeVisible();
  await expect(seller.getByText('98765432')).toBeVisible();
});

test('Changer de client at the depot, with the call Faffa Go made (A-17)', async () => {
  await seller.goto(`/vendeur/colis/${depotCode}`);
  const calls = seller.getByRole('region', { name: 'Appels Faffa Go' });
  await expect(calls).toContainText('Pas de réponse');
  await expect(calls).toContainText('Messagerie vocale');

  await seller.getByRole('button', { name: 'Changer de client' }).click();
  const dialog = seller.getByRole('dialog', { name: 'Changer de client' });
  await expect(dialog).toContainText('Frais de changement de client : 1,000 DT');
  await dialog.getByLabel('Nom du destinataire').fill('Salma Nouvelle');
  await dialog.getByLabel('Téléphone', { exact: true }).fill('55111222');
  await dialog.getByLabel('Rechercher une localité').fill('Ennasr');
  await dialog
    .getByRole('button', { name: /Cité Ennasr 1 — / })
    .first()
    .click();
  await dialog.getByLabel('Adresse').fill('5 rue de Rome');
  await dialog.getByLabel('Montant COD (DT)').fill('40,000');
  await dialog.getByRole('button', { name: 'Changer de client' }).click();

  await expect(dialog).toBeHidden();
  await expect(seller.getByText('Salma Nouvelle')).toBeVisible();
  const history = seller.getByRole('region', { name: 'Historique' });
  await expect(history).toContainText('Changement de client');
  await expect(seller.getByRole('button', { name: 'Relancer' })).toHaveCount(0);
  // Nothing waits on the seller any more.
  await seller.goto('/vendeur/a-verifier');
  await expect(seller.getByText('Aucun colis à vérifier.')).toBeVisible();
  await expect(seller.getByLabel(/colis à vérifier$/)).toHaveCount(0);
});

test('Colis keeps the old customer and the call, for the team only', async () => {
  await admin.goto(`/admin/colis/${depotCode}`);
  const changes = admin.getByRole('region', { name: 'Changement de client' });
  await expect(changes).toContainText(`Ancien client : ${AT_DEPOT}`);
  await expect(changes).toContainText('COD 38,000 DT → 40,000 DT');
  const calls = admin.getByRole('region', { name: 'Appels Faffa Go' });
  await expect(calls).toContainText('Pas de réponse');
});
