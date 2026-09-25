import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { E2E_ADMIN, WEB_URL, loginStaff } from './support';

/**
 * Phase 9, the public site (Landing 2–6): the landing page in French and
 * Arabic with Tarifs and Zones couvertes read from Paramètres, the tracking
 * page for a demo parcel (public fields only), the QR code's /suivi/ address,
 * an unknown code, and Meta Pixel off by default then switched on and off in
 * Paramètres.
 */

const CUSTOMER = 'Amira Démo';

let admin: Page;
let visitor: Page;
let code = '';
const contexts: BrowserContext[] = [];

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  const page = async (locale: string) => {
    const context = await browser.newContext({
      baseURL: WEB_URL,
      locale,
      timezoneId: 'Africa/Tunis',
    });
    contexts.push(context);
    return context.newPage();
  };
  admin = await page('fr-FR');
  visitor = await page('fr-FR');
  await loginStaff(admin, E2E_ADMIN.username, E2E_ADMIN.password);
  // Nothing leaves for Meta during the tests; the request itself is what they check.
  await visitor.route('**/connect.facebook.net/**', (route) => route.abort());
});

test.afterAll(async () => {
  for (const context of contexts) await context.close();
});

test('the landing page, in the browser’s language, with prices and zones from Paramètres', async () => {
  await visitor.goto('/');
  await expect(visitor).toHaveURL(/\/fr$/);
  await expect(visitor.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(visitor.getByRole('heading', { level: 1 })).toContainText(
    'Un échec de livraison n’est pas un retour',
  );

  const prices = visitor.getByRole('region', { name: 'Tarifs' });
  await expect(prices.getByRole('row', { name: /Livraison \(Grand Tunis\)/ })).toContainText(
    '5,500 DT',
  );
  await expect(prices.getByRole('row', { name: /Ramassage/ })).toContainText('Gratuit dès 5 colis');
  await expect(prices).toContainText('retenue à la source de 3 %');

  const zones = visitor.getByRole('region', { name: 'Zones couvertes' });
  await expect(zones.getByRole('heading', { name: 'Ariana' })).toBeVisible();
  await expect(zones).toContainText('La Marsa');

  const contact = visitor.getByRole('region', { name: 'Devenir partenaire' });
  await expect(contact.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute(
    'href',
    'https://wa.me/21699602208',
  );
  await expect(contact.getByRole('link', { name: 'TikTok' })).toBeVisible();
});

test('Arabic in one tap, right to left, and remembered (Landing 5)', async () => {
  await visitor.getByRole('banner').getByRole('link', { name: 'العربية' }).click();
  await expect(visitor).toHaveURL(/\/ar$/);
  await expect(visitor.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(visitor.getByRole('heading', { level: 1 })).toContainText('فشل التوصيل ليس إرجاعاً');
  await expect(visitor.getByRole('region', { name: 'الأسعار' })).toContainText('5,500 DT');

  await visitor.goto('/');
  await expect(visitor).toHaveURL(/\/ar$/);

  await visitor.getByRole('banner').getByRole('link', { name: 'Français' }).click();
  await expect(visitor).toHaveURL(/\/fr$/);
  // The French page's own link to Arabic must not change the choice behind the visitor's back.
  await visitor.goto('/');
  await expect(visitor).toHaveURL(/\/fr$/);
});

test('fits a small phone, 360 px wide, in both languages (Landing 1, mobile first)', async () => {
  await visitor.setViewportSize({ width: 360, height: 740 });
  for (const locale of ['fr', 'ar']) {
    await visitor.goto(`/${locale}`);
    const overflow = await visitor.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, `/${locale} scrolls sideways`).toBeLessThanOrEqual(0);
  }
  await visitor.setViewportSize({ width: 1280, height: 720 });
  await visitor.goto('/fr');
});

test('search engines and link previews: titles, languages, Open Graph, sitemap', async () => {
  await visitor.goto('/fr');
  await expect(visitor).toHaveTitle(/Faffa Go — Livraison contre remboursement/);
  await expect(visitor.locator('link[rel="alternate"][hreflang="ar"]')).toHaveAttribute(
    'href',
    `${WEB_URL}/ar`,
  );
  await expect(visitor.locator('meta[property="og:image"]').first()).toHaveAttribute(
    'content',
    /opengraph-image/,
  );
  const sitemap = await visitor.request.get('/sitemap.xml');
  expect(await sitemap.text()).toContain(`${WEB_URL}/ar`);
  const robots = await visitor.request.get('/robots.txt');
  expect(await robots.text()).toContain('Disallow: /admin');
});

test('a demo parcel tracked from the box: public fields only (Landing 4.1, 4.3)', async () => {
  await admin.goto(`/admin/colis?q=${encodeURIComponent(CUSTOMER)}`);
  code = (await admin.locator('tbody tr').first().getByRole('link').innerText()).trim();
  expect(code).toMatch(/^FG-[0-9A-Z]{8}$/);

  await visitor.goto('/fr');
  // Typed as a customer might: no prefix, in lower case.
  await visitor.getByLabel('Code du colis').fill(code.slice(3).toLowerCase());
  await visitor.getByRole('button', { name: 'Suivre' }).click();
  await expect(visitor).toHaveURL(new RegExp(`/fr/suivi/${code}$`));
  await expect(visitor.getByText(code, { exact: true })).toBeVisible();
  await expect(visitor.getByText('Boutique Démo')).toBeVisible();
  await expect(visitor.getByRole('heading', { level: 1 })).not.toBeEmpty();
  await expect(visitor.locator('main')).not.toContainText(CUSTOMER);
});

test('the address in the label’s QR code opens the page in the visitor’s language (D-36, D-43)', async () => {
  await visitor.goto(`/suivi/${code}`);
  await expect(visitor).toHaveURL(new RegExp(`/fr/suivi/${code}$`));
  await expect(visitor.getByText('Boutique Démo')).toBeVisible();
});

test('an unknown code reads the message of Landing 4.4', async () => {
  await visitor.goto('/fr/suivi/FG-00000000');
  await expect(visitor.locator('main').getByRole('alert')).toContainText(
    'Aucun colis trouvé avec ce code. Vérifiez le code sur l’étiquette.',
  );
});

test('Meta Pixel: off by default, switched on and off again in Paramètres (Landing 6)', async () => {
  await visitor.goto('/fr');
  await expect(visitor.locator('script#meta-pixel')).toHaveCount(0);

  const pixel = async (value: string) => {
    await admin.goto('/admin/parametres');
    const section = admin.getByRole('region', { name: 'Suivi publicitaire' });
    await section.getByLabel('Identifiant Meta Pixel').fill(value);
    await section.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(section.getByText('Enregistré')).toBeVisible();
  };

  await pixel('123456789012345');
  const loaded = visitor.waitForRequest(/connect\.facebook\.net/);
  await visitor.goto('/fr');
  await loaded;

  await pixel('');
  await visitor.goto('/fr');
  await expect(visitor.locator('script#meta-pixel')).toHaveCount(0);
});
