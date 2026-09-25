import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { E2E_ADMIN, WEB_URL, loginStaff } from './support';

/**
 * Phase 5 as the back office sees it (D-49, D-50), on the demo data the test
 * API seeds (a ramasseur's app comes only in phase 6): the zones and their
 * couriers; a demo parcel found in Colis, taken in at the depot, the scan
 * cancelled and made again; moved to another livreur in Tournées; sent out
 * with "Prévu pour" and taken back; corrected with Forcer un statut; a
 * pickup request planned; the Exceptions queue; a courier marked absent.
 *
 * One flow in order, as the admin, who holds every right of the back office.
 */

const ZONE = 'Banlieue Nord';
const CUSTOMER = 'Amira Démo';

let admin: Page;
let code = '';
const contexts: BrowserContext[] = [];

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: WEB_URL,
    locale: 'fr-FR',
    timezoneId: 'Africa/Tunis',
  });
  contexts.push(context);
  admin = await context.newPage();
  await loginStaff(admin, E2E_ADMIN.username, E2E_ADMIN.password);
});

test.afterAll(async () => {
  for (const context of contexts) await context.close();
});

/** A code scanned by the gun: the keys arrive in a burst, then Enter. */
async function scan(page: Page, value: string) {
  const input = page.getByLabel('Code du colis');
  await input.click();
  await input.pressSequentially(value);
  await input.press('Enter');
}

const result = (page: Page) => page.getByRole('status', { name: 'Résultat du scan' });

test('Paramètres: the zones and their couriers, the délégations (D-51)', async () => {
  await admin.goto('/admin/parametres/zones');
  const zone = admin.getByRole('region', { name: ZONE });
  await expect(zone).toContainText('La Marsa');
  await expect(zone.getByLabel('Livreur titulaire').locator('option:checked')).toHaveText(
    'Livreur Démo',
  );
  await expect(zone.getByLabel('Ramasseur titulaire').locator('option:checked')).toHaveText(
    'Ramasseur Démo',
  );

  await admin.goto('/admin/parametres/geographie');
  const marsa = admin.getByRole('row', { name: 'La Marsa' });
  await expect(marsa.getByLabel('Zone de La Marsa').locator('option:checked')).toHaveText(ZONE);
});

test('Colis: a demo parcel found by its customer, picked up (Admin 4.3)', async () => {
  await admin.goto(`/admin/colis?q=${encodeURIComponent(CUSTOMER)}`);
  const rows = admin.locator('tbody tr');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Boutique Démo');
  await expect(rows.first()).toContainText('Ramassé');
  code = (await rows.first().getByRole('link').innerText()).trim();
  expect(code).toMatch(/^FG-[0-9A-Z]{8}$/);
});

test('Scan: Entrée dépôt, the scan cancelled, then made again (Admin 4.2, D-54)', async () => {
  await admin.goto('/admin/scan');
  await expect(admin.getByRole('button', { name: /Entrée dépôt/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await scan(admin, code);
  await expect(result(admin)).toContainText('Au dépôt · Au dépôt');

  await admin.getByRole('button', { name: 'Annuler le dernier scan' }).click();
  await expect(result(admin)).toContainText('Scan annulé · Ramassé · Avec le ramasseur');
  await expect(admin.getByRole('list', { name: 'Derniers scans' })).toContainText('Annulé');

  await scan(admin, code);
  await expect(result(admin)).toContainText('Au dépôt · Au dépôt');
});

test('Tournées: the parcel under its zone’s livreur, moved to another (D-55)', async () => {
  await admin.goto('/admin/tournees');
  const zone = admin.getByRole('region', { name: ZONE });
  await expect(zone).toContainText('Livreur Démo · titulaire');
  await zone.getByRole('checkbox', { name: code }).check();
  await admin.getByLabel('Livreur', { exact: true }).selectOption({ label: 'Livreur Deux Démo' });
  await admin.getByRole('button', { name: 'Déplacer' }).click();
  await expect(admin.getByRole('status')).toHaveText('1 colis déplacé');
  await expect(admin.getByRole('region', { name: ZONE })).toContainText('→ Livreur Deux Démo');
});

test('Scan: Sortie coursier says who was planned, Retour de tournée takes it back', async () => {
  await admin.goto('/admin/scan');
  await admin.keyboard.press('F2');
  await admin.getByLabel('Coursier').selectOption({ label: 'Livreur Démo' });
  await scan(admin, code);
  await expect(result(admin)).toContainText('En livraison · Avec le livreur');
  await expect(result(admin)).toContainText('Prévu pour Livreur Deux Démo');
  await expect(result(admin)).toBeHidden();

  await admin.keyboard.press('F3');
  await admin.getByLabel('Coursier').selectOption({ label: 'Livreur Démo' });
  await scan(admin, code);
  // Never attempted: back to Au dépôt (A-8).
  await expect(result(admin)).toContainText('Au dépôt · Au dépôt');
});

test('Colis: the whole log, then Forcer un statut with a reason (D-56)', async () => {
  await admin.goto(`/admin/colis/${code}`);
  const log = admin.getByRole('list', { name: 'Journal du colis' });
  for (const text of [
    'Ramassé',
    'Arrivé au dépôt',
    'Scan annulé',
    'Livreur assigné',
    'Parti en livraison',
    'Revenu au dépôt',
  ]) {
    await expect(log).toContainText(text);
  }
  await expect(admin.getByRole('link', { name: /Thermique/ })).toHaveAttribute(
    'href',
    `/api/bff/colis/${code}/label?format=THERMAL`,
  );

  await admin.getByRole('button', { name: 'Forcer un statut' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Forcer un statut' });
  await dialog.getByLabel('Nouvel état').selectOption({ label: 'Ramassé · Avec le ramasseur' });
  await dialog.getByLabel('Raison').fill('Entrée dépôt scannée sur le mauvais colis');
  await dialog.getByRole('button', { name: 'Corriger' }).click();
  await expect(dialog).toBeHidden();
  await expect(admin.getByText('Ramassé · Avec le ramasseur')).toBeVisible();
  await expect(log).toContainText('Statut corrigé par Faffa Go');
});

test('Ramassages: the demo request planned with the zone’s ramasseur (D-58)', async () => {
  await admin.goto('/admin/ramassages');
  const card = admin.getByRole('article', { name: 'Boutique Démo' });
  await expect(card).toContainText('Ramasseur de la zone aujourd’hui : Ramasseur Démo');
  await card.getByRole('button', { name: 'Planifier' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Planifier le ramassage' });
  await expect(dialog.getByLabel('Ramasseur').locator('option:checked')).toHaveText(
    'Ramasseur Démo',
  );
  await dialog.getByRole('button', { name: 'Planifier' }).click();
  await expect(dialog).toBeHidden();

  await admin.goto('/admin/ramassages?statut=PLANIFIE');
  await expect(admin.getByRole('article', { name: 'Boutique Démo' })).toContainText('Planifié le');
});

test('Exceptions: the four rows of phase 5 (D-50)', async () => {
  await admin.goto('/admin/exceptions');
  for (const heading of [
    /Colis au dépôt depuis plus de 48 h sans tournée/,
    /Ramassage planifié non effectué/,
    /Demande de modification du vendeur en attente/,
    /Saisie manuelle du code/,
  ]) {
    await expect(admin.getByRole('heading', { name: heading })).toBeVisible();
  }
});

test('Coursiers: a livreur marked absent for today (D-52)', async () => {
  await admin.goto('/admin/coursiers');
  const row = admin.getByRole('listitem').filter({ hasText: 'Livreur Trois Démo' });
  await row.getByRole('button', { name: 'Absences' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Absences de Livreur Trois Démo' });
  await dialog.getByRole('button', { name: 'Marquer absent' }).click();
  await expect(dialog.getByRole('status')).toContainText('Absent le');
  await dialog.getByRole('button', { name: 'Fermer' }).click();
  await expect(admin.getByRole('listitem').filter({ hasText: 'Livreur Trois Démo' })).toContainText(
    'Absent aujourd’hui',
  );
});
