import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { E2E_ADMIN, WEB_URL, copyCredentials, loginSeller, loginStaff } from './support';

/**
 * Phase 8, money (Admin 4.9, 4.10, 4.12, Vendeur 4.1, 4.11, D-79 to D-84), on
 * the two parcels the test API delivers for the demo seller today, with the
 * demo livreur: the admin counts and closes his caisse, prepares the
 * seller's bon from the cash now at the depot, and hands it to the demo
 * ramasseur with its cash; the seller sees À recevoir, the bon on its way
 * and its badge; Paie coursiers shows the livreur's week.
 */

const SELLER_EMAIL = 'vendeur@boutique-demo.test';

let admin: Page;
let seller: Page;
let sellerPassword = '';
let bonNumber = '';
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

test('the Caisse lists the demo livreur’s day, then it is counted and closed (D-79)', async () => {
  await admin.goto('/admin/caisse');
  const row = admin.getByRole('row').filter({ hasText: 'Livreur Démo' });
  await expect(row).toContainText('105,500 DT');
  await expect(row).toContainText('Ouverte');
  await row.getByRole('link', { name: 'Livreur Démo' }).click();

  await expect(admin.getByRole('heading', { name: 'Livreur Démo' })).toBeVisible();
  await admin.getByLabel('Montant compté (DT)').fill('105,500');
  await admin.getByRole('button', { name: 'Compter' }).click();
  await expect(admin.getByText('Comptée', { exact: true })).toBeVisible();
  await admin.getByRole('button', { name: 'Clôturer' }).click();
  await expect(admin.getByText('Clôturée', { exact: true })).toBeVisible();
  await expect(admin.getByText('Conforme')).toBeVisible();
});

test('the admin prepares the seller’s bon from the cash at the depot (Admin 4.10)', async () => {
  await admin.goto('/admin/paiements');
  await admin.getByRole('link', { name: 'Boutique Démo' }).click();
  await expect(admin.getByRole('checkbox')).not.toHaveCount(0);
  const calc = admin.getByRole('region', { name: 'Calcul du bon' });
  await expect(calc).toContainText('Net payé en espèces');
  await admin.getByRole('button', { name: 'Préparer le bon' }).click();
  const status = admin.getByRole('status');
  await expect(status).toContainText(/Bon BV-\d{4}-\d{4}-\d{2} préparé/);
  bonNumber = /BV-\d{4}-\d{4}-\d{2}/.exec(await status.innerText())![0];
  await expect(status.getByRole('link', { name: 'Imprimer (2 exemplaires)' })).toBeVisible();
});

test('the bon goes out with the demo ramasseur and its cash (answer 5)', async () => {
  await admin.goto('/admin/caisse/depart');
  const option = admin.getByLabel('Ramasseur').locator('option', { hasText: /^Ramasseur Démo/ });
  await admin.getByLabel('Ramasseur').selectOption(await option.getAttribute('value'));
  await admin.getByRole('button', { name: 'Afficher ses bons' }).click();
  const bon = admin.getByRole('checkbox', { name: new RegExp(bonNumber) });
  await bon.check();
  await admin.getByRole('button', { name: 'Remettre au ramasseur' }).click();
  await expect(admin.getByRole('status')).toContainText('remis à Ramasseur.');
});

test('the seller sees À recevoir, and the bon on its way with its badge (Vendeur 4.1, 4.11)', async () => {
  await admin.goto('/admin/vendeurs');
  await admin
    .getByRole('listitem')
    .filter({ hasText: 'Boutique Démo' })
    .getByRole('button', { name: 'Régénérer le mot de passe' })
    .click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Régénérer' }).click();
  sellerPassword = (await copyCredentials(admin)).password;

  await loginSeller(seller, SELLER_EMAIL, sellerPassword);
  await expect(seller.getByRole('region', { name: 'À recevoir' })).toBeVisible();
  await expect(seller.getByRole('region', { name: 'Taux de livraison' })).toBeVisible();
  await expect(seller.getByLabel('1 bon(s) de versement en route')).toBeVisible();

  await seller.getByRole('link', { name: /^Paiements/ }).click();
  const line = seller.getByRole('listitem').filter({ hasText: bonNumber });
  await expect(line).toContainText('En route');
  await expect(line.getByRole('link', { name: 'Imprimer' })).toBeVisible();
});

test('Paie coursiers shows the demo livreur, his week not over yet (Admin 4.12)', async () => {
  await admin.goto('/admin/paie');
  const card = admin.getByRole('article').filter({ hasText: 'Livreur Démo' });
  await expect(card).toContainText('Plan');
  await expect(card.getByRole('button', { name: 'Préparer la fiche' })).toBeDisabled();
});
