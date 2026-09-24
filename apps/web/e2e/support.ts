import { expect, type Page } from '@playwright/test';

/** Ports of their own, apart from `pnpm dev` (3000, 3001) (D-49). */
export const WEB_PORT = 3100;
export const API_PORT = 3101;
export const WEB_URL = `http://localhost:${WEB_PORT}`;

/** The first admin the seed creates. A throwaway database: nothing to protect. */
export const E2E_ADMIN = { username: 'admin', password: 'E2e-Admin-Mot-De-Passe-42' };

// ── Files ───────────────────────────────────────────────────

/** A 1 × 1 PNG: a real image, which the API decodes and re-encodes (D-32). */
export const PNG = {
  name: 'cin-recto.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  ),
};

/** The smallest PDF the API accepts, as in its own tests. */
export function pdf(name: string) {
  return {
    name,
    mimeType: 'application/pdf',
    buffer: Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
        '2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
    ),
  };
}

/**
 * Import CSV (Vendeur 4.3, D-37): an Arabic name and address, a localité
 * found in several délégations (settled in the row's dropdown), and a plain
 * French row. The file's lines 2, 3 and 4.
 */
export const IMPORT_CSV = {
  name: 'colis.csv',
  mimeType: 'text/csv',
  buffer: Buffer.from(
    [
      'nom_destinataire;telephone;localite;adresse;description_produit;montant_cod',
      'أمينة بن صالح;29111222;Khaznadar;نهج الحبيب بورقيبة عدد 12، باردو;Robe;45,000',
      'Sami Trabelsi;98222333;Cité Ennasr;5 rue de Rome;Sac;30,000',
      'Leïla Mansour;22333444;Lafayette;12 avenue de Paris;Chaussures;60,000',
    ].join('\r\n') + '\r\n',
    'utf8',
  ),
};

// ── Steps ───────────────────────────────────────────────────

export async function loginStaff(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/admin/connexion');
  await page.getByLabel('Identifiant').fill(username);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL('**/admin');
}

export async function loginSeller(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/vendeur/connexion');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL('**/vendeur');
}

/**
 * "Copier les identifiants" (A-20): the password shown once, the text copied,
 * and the box that only closes once "J'ai noté le mot de passe" is ticked.
 * Returns the password and what reached the clipboard.
 */
export async function copyCredentials(page: Page): Promise<{ password: string; copied: string }> {
  const dialog = page.getByRole('dialog', { name: 'Mot de passe généré' });
  await expect(dialog).toBeVisible();
  const password = (await dialog.locator('dd').nth(1).innerText()).trim();
  expect(password.length).toBeGreaterThanOrEqual(8);

  await dialog.getByRole('button', { name: 'Copier les identifiants' }).click();
  await expect(dialog.getByRole('status')).toHaveText('Copié');
  // The Windows clipboard hands "\n" back as "\r\n".
  const copied = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n');

  const close = dialog.getByRole('button', { name: 'Fermer' });
  await expect(close).toBeDisabled();
  await dialog.getByLabel("J'ai noté le mot de passe").check();
  await close.click();
  await expect(dialog).toBeHidden();
  return { password, copied };
}
