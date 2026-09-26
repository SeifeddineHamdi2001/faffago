import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { E2E_ADMIN, WEB_URL, copyCredentials, loginSeller, loginStaff } from './support';

/**
 * Phase 10A, notifications and the parcel chat (Vendeur 4.10, 4.13, Admin
 * 4.8, 4.18, Q14 to Q16), on the two failed parcels the test API holds for the
 * demo seller: each was taken out by the demo livreur, who left a message in
 * its chat; one is still with him (the chat is open), the other is back at
 * the depot (read-only for the seller).
 *
 * The team reads the Chats inbox and answers as Faffa Go; the seller is told
 * on the bell, reads it in his chat and answers with a quick reply; the team
 * is told in turn; the seller clears his notifications; Voir comme le
 * vendeur reads the chat and writes nothing.
 */

const SELLER_EMAIL = 'vendeur@boutique-demo.test';

let admin: Page;
let seller: Page;
let openCode = '';
let lockedCode = '';
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

test('the Chats inbox holds the demo chats, each with the livreur’s message unread (Admin 4.8)', async () => {
  await admin.goto('/admin/chats');
  await expect(admin.getByRole('heading', { name: 'Chats' })).toBeVisible();
  await expect(admin.getByText('2 conversations avec du nouveau')).toBeVisible();
  await expect(admin.getByRole('navigation').getByLabel('2 chats avec du nouveau')).toBeVisible();

  const rows = admin.getByRole('main').getByRole('link').filter({ hasText: 'Boutique Démo' });
  await expect(rows).toHaveCount(2);
  const open = rows.filter({ hasText: 'Ouvert' });
  const locked = rows.filter({ hasText: 'Lecture seule' });
  await expect(open).toContainText('Livreur Démo');
  await expect(open).toContainText('Client ne répond pas');
  openCode = /FG-[0-9A-Z]{8}/.exec(await open.innerText())![0];
  lockedCode = /FG-[0-9A-Z]{8}/.exec(await locked.innerText())![0];
  expect(openCode).not.toBe(lockedCode);
});

test('the admin reads the chat and answers as Faffa Go, then it is no longer new', async () => {
  await admin.goto('/admin/chats');
  await admin.getByRole('link', { name: new RegExp(openCode) }).click();
  await expect(admin.getByRole('heading', { name: new RegExp(`Chat ${openCode}`) })).toBeVisible();
  const log = admin.getByRole('log');
  await expect(log).toContainText('Client ne répond pas');
  await expect(log).toContainText('Livreur Démo');
  await expect(admin.getByText('Vos messages apparaissent sous le nom Faffa Go.')).toBeVisible();

  await admin.getByLabel('Votre message').fill('Nous suivons ce colis');
  await admin.getByRole('button', { name: 'Envoyer' }).click();
  await expect(log).toContainText('Nous suivons ce colis');
  await expect(log.getByText('Faffa Go', { exact: true })).toBeVisible();

  // Read: only the other chat is still new.
  await admin.goto('/admin/chats?unread=true');
  await expect(admin.getByText('1 conversation avec du nouveau')).toBeVisible();
  await expect(admin.getByRole('link', { name: new RegExp(lockedCode) })).toBeVisible();
  await expect(admin.getByRole('link', { name: new RegExp(openCode) })).toHaveCount(0);
});

test('the seller is told on the bell, and it leads to the chat of his parcel (Vendeur 4.13)', async () => {
  await admin.goto('/admin/vendeurs');
  await admin
    .getByRole('listitem')
    .filter({ hasText: 'Boutique Démo' })
    .getByRole('button', { name: 'Régénérer le mot de passe' })
    .click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Régénérer' }).click();
  const password = (await copyCredentials(admin)).password;
  await loginSeller(seller, SELLER_EMAIL, password);

  // Two failed deliveries and the team's message.
  await expect(seller.getByRole('link', { name: /^Notifications, 3 non lues$/ })).toBeVisible();
  await seller.getByRole('link', { name: /^Notifications/ }).click();
  await expect(seller.getByRole('heading', { name: 'Notifications' })).toBeVisible();
  await expect(seller.getByTestId('unread-summary')).toHaveText('3 non lues');
  await expect(seller.getByText(/Colis FG-[0-9A-Z]{8} à vérifier · Ne répond pas/)).toBeVisible();
  await expect(seller.getByText(/Colis FG-[0-9A-Z]{8} à vérifier · Injoignable/)).toBeVisible();

  await seller.getByRole('link', { name: `Nouveau message de Faffa Go sur ${openCode}` }).click();
  await seller.waitForURL(`**/vendeur/colis/${openCode}#chat`);
  const chat = seller.getByRole('region', { name: 'Chat du colis' });
  await expect(chat).toContainText('Livreur : Livreur');
  await expect(chat).toContainText('Ouvert');
  const log = chat.getByRole('log');
  // The courier by first name only; the team as Faffa Go.
  await expect(log).toContainText('Client ne répond pas');
  await expect(log.getByText('Livreur', { exact: true })).toBeVisible();
  await expect(log).not.toContainText('Livreur Démo');
  await expect(log).toContainText('Nous suivons ce colis');
  await expect(log.getByText('Faffa Go', { exact: true })).toBeVisible();
});

test('the seller answers with a quick reply, and the team is told (Admin 4.18)', async () => {
  const chat = seller.getByRole('region', { name: 'Chat du colis' });
  await chat.getByRole('button', { name: 'Le client est disponible après 17 h' }).click();
  await expect(chat.getByLabel('Votre message')).toHaveValue('Le client est disponible après 17 h');
  await chat.getByRole('button', { name: 'Envoyer' }).click();
  await expect(chat.getByRole('log')).toContainText('Le client est disponible après 17 h');
  await expect(chat.getByRole('log').getByText('Vous', { exact: true })).toBeVisible();

  // The admin joined this chat, so he is told; the bell counts it.
  await admin.goto('/admin');
  await expect(admin.getByRole('link', { name: /^Notifications, 1 non lue$/ })).toBeVisible();
  await admin.getByRole('link', { name: /^Notifications/ }).click();
  const notice = admin.getByRole('link', { name: `Nouveau message de Boutique Démo sur ${openCode}` });
  await expect(notice).toBeVisible();
  await notice.click();
  await admin.waitForURL(`**/admin/chats/${openCode}`);
  await expect(admin.getByRole('log')).toContainText('Le client est disponible après 17 h');
  // The livreur's other message stays the only thing new in the inbox.
  await expect(admin.getByRole('link', { name: /^Notifications$/ })).toBeVisible();
});

test('a parcel back at the depot has a read-only chat for the seller, the team still writes (Q15)', async () => {
  await seller.goto(`/vendeur/colis/${lockedCode}`);
  const chat = seller.getByRole('region', { name: 'Chat du colis' });
  await expect(chat).toContainText('Lecture seule');
  await expect(chat.getByTestId('chat-refusal')).toHaveText(
    'Le colis est au dépôt : le chat est en lecture seule',
  );
  await expect(chat.getByLabel('Votre message')).toHaveCount(0);
  await expect(chat.getByRole('log')).toContainText('Client ne répond pas');

  await admin.goto(`/admin/chats/${lockedCode}`);
  await admin.getByLabel('Votre message').fill('Nous rappelons le client demain');
  await admin.getByRole('button', { name: 'Envoyer' }).click();
  await expect(admin.getByRole('log')).toContainText('Nous rappelons le client demain');

  // The seller reads it, and is told.
  await seller.reload();
  await expect(chat.getByRole('log')).toContainText('Nous rappelons le client demain');
});

test('the seller clears his notifications: nothing is left unread', async () => {
  await seller.goto('/vendeur/notifications');
  // Two failures and the team's reply at the depot; the message he opened is read.
  await expect(seller.getByTestId('unread-summary')).toHaveText('3 non lues');
  await seller.getByRole('button', { name: 'Tout marquer comme lu' }).click();
  await expect(seller.getByTestId('unread-summary')).toHaveText('Tout est lu.');
  await expect(seller.getByRole('button', { name: 'Tout marquer comme lu' })).toBeDisabled();
  await seller.reload();
  await expect(seller.getByRole('link', { name: 'Notifications', exact: true })).toBeVisible();
  await expect(seller.getByTestId('bell-count')).toHaveCount(0);
});

test('Voir comme le vendeur reads the chat and writes nothing (D-5)', async () => {
  await admin.goto('/admin/vendeurs');
  await admin
    .getByRole('listitem')
    .filter({ hasText: 'Boutique Démo' })
    .getByRole('button', { name: 'Voir comme le vendeur' })
    .click();
  await admin.waitForURL('**/vendeur');

  await admin.goto(`/vendeur/colis/${openCode}`);
  const chat = admin.getByRole('region', { name: 'Chat du colis' });
  await expect(chat.getByRole('log')).toContainText('Le client est disponible après 17 h');
  await expect(chat.getByTestId('chat-refusal')).toHaveText(
    'Vous consultez ce chat en lecture seule.',
  );
  await expect(chat.getByLabel('Votre message')).toHaveCount(0);

  await admin.goto('/vendeur/notifications');
  await expect(admin.getByRole('button', { name: 'Tout marquer comme lu' })).toHaveCount(0);

  await admin
    .getByRole('region', { name: 'Consultation' })
    .getByRole('button', { name: 'Quitter' })
    .click();
  await admin.waitForURL('**/admin/vendeurs');
});
