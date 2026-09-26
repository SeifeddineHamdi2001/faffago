import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { E2E_ADMIN, WEB_URL, loginStaff } from './support';

/**
 * Phase 10B (Admin 4.7, 4.13, D-89): Paramètres › Société, the Rapports with
 * their exports, the rest of the Exceptions queue. Reads only, apart from
 * the Société block, so the other flows keep their data.
 */

let admin: Page;
let context: BrowserContext;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext({
    baseURL: WEB_URL,
    locale: 'fr-FR',
    timezoneId: 'Africa/Tunis',
  });
  admin = await context.newPage();
  await loginStaff(admin, E2E_ADMIN.username, E2E_ADMIN.password);
});

test.afterAll(async () => {
  await context.close();
});

test('Paramètres › Société: the block printed on the certificates (D-89)', async () => {
  await admin.goto('/admin/parametres');
  const section = admin.getByRole('region', { name: 'Société' });
  await section.getByLabel('Raison sociale').fill('Faffa Go SARL');
  await section.getByLabel('Matricule fiscal').fill('1234567/A/M/000');
  await section.getByLabel('Adresse').fill('Zone industrielle, Tunis');
  await section.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(section.getByText('Enregistré')).toBeVisible();
  await admin.reload();
  await expect(
    admin.getByRole('region', { name: 'Société' }).getByLabel('Matricule fiscal'),
  ).toHaveValue('1234567/A/M/000');
});

test('Rapports: the retenue by month, the others by range, each exported (Admin 4.13)', async () => {
  await admin.getByRole('link', { name: 'Rapports', exact: true }).click();
  await expect(admin.getByRole('heading', { name: 'Rapports', level: 1 })).toBeVisible();
  await expect(admin.getByText(/^Retenue à la source · /)).toBeVisible();
  await expect(admin.getByLabel('Mois')).toBeVisible();

  await admin.getByRole('link', { name: 'Argent' }).click();
  await expect(admin.getByRole('region', { name: 'Par jour' })).toBeVisible();
  await expect(admin.getByRole('region', { name: 'Détenu aujourd’hui' })).toContainText(
    'Chez les coursiers',
  );
  const csvHref = await admin.getByRole('link', { name: 'Exporter CSV' }).getAttribute('href');
  const csv = await admin.request.get(csvHref!);
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain('Encaissé par les livreurs (DT)');
  const xlsxHref = await admin.getByRole('link', { name: 'Exporter Excel' }).getAttribute('href');
  const xlsx = await admin.request.get(xlsxHref!);
  expect(xlsx.status()).toBe(200);
  expect(xlsx.headers()['content-type']).toContain('spreadsheetml');

  await admin.getByRole('link', { name: 'Chiffre d’affaires (rapport de gestion)' }).click();
  await expect(admin.getByText(/Rapport de gestion/).first()).toBeVisible();
});

test('Exceptions: the whole queue of Admin 4.7', async () => {
  await admin.getByRole('link', { name: 'Exceptions', exact: true }).click();
  for (const heading of [
    /Colis proche de la limite À vérifier/,
    /Coursier n’ayant pas remis son argent/,
    /Bon en route non remis après 24 h/,
    /Bon signé non archivé après 48 h/,
    /Vendeur CIN uniquement sans numéro de CIN/,
  ]) {
    await expect(admin.getByRole('heading', { name: heading })).toBeVisible();
  }
});
