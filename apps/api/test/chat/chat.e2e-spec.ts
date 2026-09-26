import { randomUUID } from 'node:crypto';
import { seed } from '../../prisma/seed';
import { ParcelEventService } from '../../src/parcels/parcel-event.service';
import {
  COURIER_APP_HEADERS,
  createTestApp,
  createUser,
  login,
  type Fixture,
  type TestApp,
} from '../support/test-app';
import { NOW, sync } from '../support/money-fixtures';
import { principalOf } from '../support/principals';
import { createParcel } from '../support/work-fixtures';

/**
 * The parcel chat (Vendeur 4.10, Coursier 4.8, Admin 4.8, A-23, Q14 to Q16):
 * opened by the Sortie coursier scan, read-only while the parcel is at the
 * depot, reopened with the next livreur, closed for good at the end of the
 * parcel's life. The seller reads a courier by first name only; the ramasseur
 * has no way in; a message from the courier's queue is applied once.
 */

let t: TestApp;
let events: ParcelEventService;
let seller: Fixture;
let other: Fixture;
let ali: Fixture;
let bea: Fixture;
let ramasseur: Fixture;
let depot: Fixture;
let sc: Fixture;
let admin: Fixture;
let tokens: Record<string, string>;

const ADMIN = { username: 'admin', password: 'Mot-De-Passe-Admin-42' };

async function named(role: 'LIVREUR' | 'RAMASSEUR', firstName: string) {
  const user = await createUser(t.prisma, { role });
  await t.prisma.user.update({ where: { id: user.id }, data: { firstName, lastName: 'Ben Ali' } });
  return user;
}

/** A parcel at the depot, ready to go out. */
async function atDepot(owner = seller) {
  const delegation = await t.prisma.delegation.findUniqueOrThrow({ where: { code: 'TUN-MARSA' } });
  const localite = await t.prisma.localite.findFirstOrThrow({
    where: { delegationId: delegation.id, isOther: false },
  });
  const id = await createParcel(t.prisma, {
    sellerId: owner.sellerId!,
    createdByUserId: owner.id,
    status: 'AU_DEPOT',
    location: 'AU_DEPOT',
    where: { delegationId: delegation.id, localiteId: localite.id },
  });
  return t.prisma.parcel.findUniqueOrThrow({ where: { id } });
}

async function act(
  parcelId: string,
  actor: Fixture,
  request: Parameters<ParcelEventService['run']>[0]['request'],
) {
  const result = await events.run({ parcelId, actor: principalOf(actor), request });
  expect(result.ok).toBe(true);
}

function goOut(parcelId: string, courier: Fixture) {
  return act(parcelId, depot, { action: 'SCAN_SORTIE_COURSIER', assignToCourierId: courier.courierId });
}

function get(path: string, user: Fixture) {
  return t.request('GET', `/chat/${path}`, { token: tokens[user.id], headers: headersOf(user) });
}

function headersOf(user: Fixture) {
  return user.role === 'LIVREUR' || user.role === 'RAMASSEUR' ? COURIER_APP_HEADERS : undefined;
}

function write(side: 'seller' | 'staff', code: string, user: Fixture, body: string, id = randomUUID()) {
  return t.request('POST', `/chat/${side}/${code}/messages`, {
    token: tokens[user.id],
    body: { messageId: id, body },
  });
}

/** What a livreur's phone sends: the queue, one message operation. */
function queue(user: Fixture, code: string, body: string, operationId = randomUUID()) {
  return sync(t, tokens[user.id]!, [
    { kind: 'MESSAGE_CHAT', operationId, parcelCode: code, body, deviceTime: NOW },
  ]);
}

function noticesOf(user: Fixture) {
  return t.prisma.notification.findMany({
    where: { userId: user.id, type: 'NOUVEAU_MESSAGE' },
    orderBy: { id: 'asc' },
  });
}

beforeAll(async () => {
  t = await createTestApp();
  await seed(t.prisma, { log: () => undefined, adminPassword: ADMIN.password });
  events = t.app.get(ParcelEventService);
  seller = await createUser(t.prisma, { role: 'VENDEUR', email: 'chat@boutique.tn' });
  other = await createUser(t.prisma, {
    role: 'VENDEUR',
    email: 'chat-autre@boutique.tn',
    shopName: 'Autre Boutique',
  });
  ali = await named('LIVREUR', 'Ali');
  bea = await named('LIVREUR', 'Béa');
  ramasseur = await named('RAMASSEUR', 'Rami');
  depot = await createUser(t.prisma, { role: 'DEPOT', username: 'chat.depot' });
  sc = await createUser(t.prisma, { role: 'SERVICE_CLIENT', username: 'chat.sc' });
  const row = await t.prisma.user.findUniqueOrThrow({ where: { username: 'admin' } });
  admin = { id: row.id, role: 'ADMIN', password: ADMIN.password, phone: row.phone, username: 'admin' };
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  t.throttle.clear();
  tokens = {};
  for (const user of [seller, other, ali, bea, ramasseur, depot, sc]) {
    tokens[user.id] = (await login(t, user)).accessToken;
  }
  tokens[admin.id] = (await t.request('POST', '/auth/login/staff', { body: ADMIN })).body.accessToken;
});

describe('no livreur, no thread (Q14, Q16)', () => {
  it('has no chat before the Sortie coursier scan, and writes nothing', async () => {
    const parcel = await atDepot();

    const view = await get(`seller/${parcel.code}`, seller);
    expect(view.status).toBe(200);
    expect(view.body).toEqual({ thread: null });
    expect((await get(`staff/${parcel.code}`, sc)).body).toEqual({ thread: null });

    const refused = await write('seller', parcel.code, seller, 'Bonjour');
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('CHAT_NON_OUVERT');
    expect(await t.prisma.chatThread.count({ where: { parcelId: parcel.id } })).toBe(0);
  });

  it('is opened by the Sortie coursier scan and points at the livreur who took it', async () => {
    const parcel = await atDepot();

    await goOut(parcel.id, ali);

    const thread = await t.prisma.chatThread.findUniqueOrThrow({ where: { parcelId: parcel.id } });
    expect(thread).toMatchObject({ sellerId: seller.sellerId, courierId: ali.courierId });
    const view = (await get(`seller/${parcel.code}`, seller)).body.thread;
    expect(view).toMatchObject({ state: 'OUVERT', canPost: true, messages: [] });
  });

  it('shows nothing of another seller’s parcel: the code is unknown to him (D-26)', async () => {
    const parcel = await atDepot();
    await goOut(parcel.id, ali);

    expect((await get(`seller/${parcel.code}`, other)).status).toBe(404);
    expect((await write('seller', parcel.code, other, 'Coucou')).status).toBe(404);
  });
});

describe('who reads what', () => {
  it('gives the seller the courier’s first name only, the courier the shop and the phone, the team both in full', async () => {
    const parcel = await atDepot();
    await goOut(parcel.id, ali);
    await write('seller', parcel.code, seller, 'Le client est disponible après 17 h');
    await queue(ali, parcel.code, 'Client ne répond pas');

    const forSeller = (await get(`seller/${parcel.code}`, seller)).body.thread;
    expect(forSeller.courierName).toBe('Ali');
    expect(forSeller.sellerPhone).toBeNull();
    expect(forSeller.messages.map((m: { label: string }) => m.label)).toEqual(['Vous', 'Ali']);

    const forCourier = (await get(`courier/${parcel.code}`, ali)).body.thread;
    expect(forCourier.shopName).toBe('Boutique Test');
    expect(forCourier.sellerPhone).toMatch(/^\d{8}$/);
    expect(forCourier.messages.map((m: { label: string }) => m.label)).toEqual([
      'Boutique Test',
      'Vous',
    ]);

    const forStaff = (await get(`staff/${parcel.code}`, depot)).body.thread;
    expect(forStaff.courierName).toBe('Ali Ben Ali');
    expect(forStaff.messages.map((m: { label: string }) => m.label)).toEqual([
      'Boutique Test',
      'Ali Ben Ali',
    ]);
  });

  it('shuts the other livreur and the ramasseur out (A-23)', async () => {
    const parcel = await atDepot();
    await goOut(parcel.id, ali);

    expect((await get(`courier/${parcel.code}`, bea)).status).toBe(404);
    // The ramasseur holds no chat permission at all.
    expect((await get(`courier/${parcel.code}`, ramasseur)).status).toBe(403);
    expect((await get('courier', ramasseur)).status).toBe(403);
    expect((await get(`staff/${parcel.code}`, ramasseur)).status).toBe(403);
    expect((await get(`seller/${parcel.code}`, ramasseur)).status).toBe(403);
    // Nor can a seller or a livreur use the team's door.
    expect((await get(`staff/${parcel.code}`, seller)).status).toBe(403);
    expect((await get(`staff/${parcel.code}`, ali)).status).toBe(403);
  });
});

describe('writing', () => {
  it('stores a message once however often it is sent, and answers a repeat as the same message', async () => {
    const parcel = await atDepot();
    await goOut(parcel.id, ali);
    const id = randomUUID();

    const first = await write('seller', parcel.code, seller, 'Bonjour', id);
    const again = await write('seller', parcel.code, seller, 'Bonjour', id);

    expect(first.body).toMatchObject({ replayed: false, message: { id, body: 'Bonjour' } });
    expect(again.body).toMatchObject({ replayed: true, message: { id } });
    expect(await t.prisma.chatMessage.count({ where: { id } })).toBe(1);
    // The other side is told once, not twice.
    const told = (await noticesOf(ali)).filter(
      (n) => (n.params as { code: string }).code === parcel.code,
    );
    expect(told).toHaveLength(1);
  });

  it('refuses a message id that belongs to someone else', async () => {
    const parcel = await atDepot();
    await goOut(parcel.id, ali);
    const id = randomUUID();
    await write('seller', parcel.code, seller, 'Bonjour', id);

    const stolen = await write('staff', parcel.code, sc, 'Autre texte', id);

    expect(stolen.status).toBe(409);
    expect(stolen.body.code).toBe('MESSAGE_ID_REUTILISE');
  });

  it('refuses an empty message, a field it does not know, and the sender being sent', async () => {
    const parcel = await atDepot();
    await goOut(parcel.id, ali);
    const post = (body: unknown) =>
      t.request('POST', `/chat/seller/${parcel.code}/messages`, { token: tokens[seller.id], body });

    expect((await post({ messageId: randomUUID(), body: '   ' })).status).toBe(400);
    expect((await post({ body: 'Bonjour' })).status).toBe(400);
    expect(
      (await post({ messageId: randomUUID(), body: 'Bonjour', senderKind: 'FAFFA_GO' })).status,
    ).toBe(400);
  });

  it('tells the other side by the name he may read, and never the ramasseur', async () => {
    const parcel = await atDepot();
    await goOut(parcel.id, ali);
    const forSeller = (await noticesOf(seller)).length;
    const forCourier = (await noticesOf(ali)).length;

    await write('seller', parcel.code, seller, 'Bonjour');
    await queue(ali, parcel.code, 'Je passe dans 10 min');

    const courierNotice = await t.prisma.notification.findFirstOrThrow({
      where: { userId: ali.id, type: 'NOUVEAU_MESSAGE', parcelId: parcel.id },
    });
    expect(courierNotice.params).toEqual({ code: parcel.code, from: 'Boutique Test' });
    expect((await noticesOf(seller)).length).toBe(forSeller + 1);
    expect((await noticesOf(ali)).length).toBe(forCourier + 1);
    const sellerNotice = await t.prisma.notification.findFirstOrThrow({
      where: { userId: seller.id, type: 'NOUVEAU_MESSAGE', parcelId: parcel.id },
    });
    // A first name, never the courier's full name.
    expect(sellerNotice.params).toEqual({ code: parcel.code, from: 'Ali' });
    expect(await noticesOf(ramasseur)).toHaveLength(0);
  });

  it('marks the team’s messages Faffa Go to both sides, and tells the team of the chats it joined', async () => {
    const parcel = await atDepot();
    await goOut(parcel.id, ali);
    const adminBefore = (await noticesOf(admin)).length;

    // Before it joined, a seller’s message does not page the team.
    await write('seller', parcel.code, seller, 'Bonjour');
    expect((await noticesOf(admin)).length).toBe(adminBefore);

    const staff = await write('staff', parcel.code, sc, 'Nous suivons ce colis');
    expect(staff.body.message.label).toBe('Faffa Go');
    expect((await get(`seller/${parcel.code}`, seller)).body.thread.messages.at(-1).label).toBe(
      'Faffa Go',
    );
    expect((await get(`courier/${parcel.code}`, ali)).body.thread.messages.at(-1).label).toBe(
      'Faffa Go',
    );

    // Now that it has joined, the next message from the seller reaches it, not the sender himself.
    await write('seller', parcel.code, seller, 'Merci');
    expect((await noticesOf(admin)).length).toBe(adminBefore + 1);
    expect((await noticesOf(sc)).length).toBeGreaterThanOrEqual(1);
  });
});

describe('the life of a thread (Q15)', () => {
  it('goes read-only at the depot, reopens with the next livreur who reads the history, and closes with the parcel', async () => {
    const parcel = await atDepot();
    await goOut(parcel.id, ali);
    await write('seller', parcel.code, seller, 'Client dispo après 17 h');
    await queue(ali, parcel.code, 'Adresse introuvable');

    // A failed delivery, brought back to the depot.
    await act(parcel.id, ali, { action: 'SCAN_ECHEC', failureReason: 'INJOIGNABLE' });
    await act(parcel.id, depot, { action: 'SCAN_RETOUR_DE_TOURNEE' });

    // Read-only for the seller and the livreur; the team still writes.
    const locked = (await get(`seller/${parcel.code}`, seller)).body.thread;
    expect(locked).toMatchObject({ state: 'VERROUILLE', canPost: false, refusal: 'CHAT_LECTURE_SEULE' });
    expect(locked.messages).toHaveLength(2);
    const refusedSeller = await write('seller', parcel.code, seller, 'Encore là ?');
    expect(refusedSeller.status).toBe(409);
    expect(refusedSeller.body.code).toBe('CHAT_LECTURE_SEULE');
    const refusedQueue = await queue(ali, parcel.code, 'Toujours là');
    expect(refusedQueue[0]).toMatchObject({ ok: false, code: 'CHAT_LECTURE_SEULE' });
    expect((await write('staff', parcel.code, sc, 'Nous rappelons le client')).status).toBe(200);

    // The seller decides a relance; the parcel goes out again with another livreur.
    const retry = await t.request('POST', `/parcels/${parcel.code}/relancer`, {
      token: tokens[seller.id],
      body: { date: '2026-09-26', slot: 'MATIN' },
    });
    expect(retry.status).toBe(200);
    await goOut(parcel.id, bea);

    const thread = await t.prisma.chatThread.findUniqueOrThrow({ where: { parcelId: parcel.id } });
    expect(thread.courierId).toBe(bea.courierId);
    const forBea = (await get(`courier/${parcel.code}`, bea)).body.thread;
    expect(forBea).toMatchObject({ state: 'OUVERT', canPost: true });
    // Béa reads the whole history; Ali's messages keep their sender, by first name.
    expect(forBea.messages.map((m: { label: string }) => m.label)).toEqual([
      'Boutique Test',
      'Ali',
      'Faffa Go',
    ]);
    // Ali has nothing to do with it any more.
    expect((await get(`courier/${parcel.code}`, ali)).status).toBe(404);
    expect((await queue(ali, parcel.code, 'Encore moi'))[0]).toMatchObject({ ok: false });
    // The seller now reads Béa's first name.
    expect((await get(`seller/${parcel.code}`, seller)).body.thread.courierName).toBe('Béa');

    // The parcel's life ends: nobody writes, everybody still reads.
    await t.prisma.$transaction(async (tx) => {
      const before = await tx.parcel.findUniqueOrThrow({ where: { id: parcel.id } });
      await tx.parcel.update({
        where: { id: parcel.id },
        data: { status: 'RETOUR_RECU', location: 'CHEZ_LE_VENDEUR', currentLivreurId: null },
      });
      await tx.parcelEvent.create({
        data: {
          parcelId: parcel.id,
          type: 'RETOUR_RECU',
          previousStatus: before.status,
          newStatus: 'RETOUR_RECU',
          previousLocation: before.location,
          newLocation: 'CHEZ_LE_VENDEUR',
          actorUserId: admin.id,
        },
      });
    });
    const closed = (await get(`seller/${parcel.code}`, seller)).body.thread;
    expect(closed).toMatchObject({ state: 'CLOS', canPost: false, refusal: 'CHAT_CLOS' });
    expect(closed.messages).toHaveLength(3);
    const noOne = await write('staff', parcel.code, sc, 'Trop tard');
    expect(noOne.status).toBe(409);
    expect(noOne.body.code).toBe('CHAT_CLOS');
  });

  it('stays open after Livré until the seller is paid, then closes (Q15)', async () => {
    const parcel = await atDepot();
    await goOut(parcel.id, ali);
    await t.prisma.parcel.findUniqueOrThrow({ where: { id: parcel.id } });
    await sync(t, tokens[ali.id]!, [
      {
        kind: 'SCAN',
        clientScanId: randomUUID(),
        source: 'APP_COURSIER',
        deviceTime: NOW,
        action: 'LIVRE',
        rawCode: parcel.code,
        collectedMillimes: '85000',
      },
    ]);
    expect((await t.prisma.parcel.findUniqueOrThrow({ where: { id: parcel.id } })).status).toBe(
      'LIVRE',
    );

    expect((await get(`seller/${parcel.code}`, seller)).body.thread.state).toBe('OUVERT');

    await t.prisma.$transaction(async (tx) => {
      await tx.parcel.update({ where: { id: parcel.id }, data: { cashStatus: 'PAYE' } });
    });
    expect((await get(`seller/${parcel.code}`, seller)).body.thread.state).toBe('CLOS');
  });
});

describe('the lists', () => {
  it('lists the livreur’s chats with unread ones counted, and clears them when he opens one', async () => {
    const parcel = await atDepot();
    await goOut(parcel.id, ali);
    await write('seller', parcel.code, seller, 'Bonjour');
    await write('seller', parcel.code, seller, 'Vous êtes où ?');

    const list = (await get('courier', ali)).body;
    const row = list.threads.find((thread: { parcelCode: string }) => thread.parcelCode === parcel.code);
    expect(row).toMatchObject({ unread: 2, lastMessage: 'Vous êtes où ?', state: 'OUVERT' });
    expect(list.unreadCount).toBeGreaterThanOrEqual(2);

    await get(`courier/${parcel.code}`, ali);
    const after = (await get('courier', ali)).body.threads.find(
      (thread: { parcelCode: string }) => thread.parcelCode === parcel.code,
    );
    expect(after.unread).toBe(0);
  });

  it('gives the team one inbox of every chat with filters by unread, seller and courier (Admin 4.8)', async () => {
    const mine = await atDepot(seller);
    const theirs = await atDepot(other);
    await goOut(mine.id, ali);
    await goOut(theirs.id, bea);
    await write('seller', mine.code, seller, 'Bonjour');
    await write('seller', theirs.code, other, 'Bonsoir');

    const all = (await get('staff', sc)).body;
    const codes = all.threads.map((thread: { parcelCode: string }) => thread.parcelCode);
    expect(codes).toEqual(expect.arrayContaining([mine.code, theirs.code]));
    expect(all.unreadCount).toBeGreaterThanOrEqual(2);

    const bySeller = (await get(`staff?sellerId=${other.sellerId}`, sc)).body.threads;
    expect(bySeller.map((thread: { parcelCode: string }) => thread.parcelCode)).toEqual([theirs.code]);
    const byCourier = (await get(`staff?courierUserId=${ali.id}`, sc)).body.threads;
    const byCourierCodes = byCourier.map((thread: { parcelCode: string }) => thread.parcelCode);
    expect(byCourierCodes).toContain(mine.code);
    expect(byCourierCodes).not.toContain(theirs.code);

    await get(`staff/${mine.code}`, sc);
    const unread = (await get('staff?unread=true', sc)).body.threads.map(
      (thread: { parcelCode: string }) => thread.parcelCode,
    );
    expect(unread).toContain(theirs.code);
    expect(unread).not.toContain(mine.code);
    // Another person of the team has read nothing: his own unread stays.
    const depotUnread = (await get('staff?unread=true', depot)).body.threads.map(
      (thread: { parcelCode: string }) => thread.parcelCode,
    );
    expect(depotUnread).toContain(mine.code);
    expect((await get('staff/unread', sc)).body.unreadCount).toBeGreaterThanOrEqual(1);
  });
});

describe('the courier’s queue', () => {
  it('applies a message once under the id the phone drew, and answers a repeat as the first answer', async () => {
    const parcel = await atDepot();
    await goOut(parcel.id, ali);
    const id = randomUUID();

    const [first] = await queue(ali, parcel.code, 'Client ne répond pas', id);
    const [again] = await queue(ali, parcel.code, 'Client ne répond pas', id);

    expect(first).toMatchObject({ kind: 'MESSAGE_CHAT', id, ok: true, replayed: false });
    expect(again).toMatchObject({ id, ok: true, replayed: true });
    expect(await t.prisma.chatMessage.count({ where: { id } })).toBe(1);
    const message = await t.prisma.chatMessage.findUniqueOrThrow({ where: { id } });
    expect(message).toMatchObject({ senderUserId: ali.id, senderKind: 'COURSIER' });
  });

  it('keeps a message written offline through a chat that closed meanwhile: one refusal, with why, never sent later', async () => {
    const parcel = await atDepot();
    await goOut(parcel.id, ali);
    await act(parcel.id, ali, { action: 'SCAN_ECHEC', failureReason: 'INJOIGNABLE' });
    await act(parcel.id, depot, { action: 'SCAN_RETOUR_DE_TOURNEE' });
    const id = randomUUID();

    const [first] = await queue(ali, parcel.code, 'Écrit hors ligne', id);
    const [again] = await queue(ali, parcel.code, 'Écrit hors ligne', id);

    expect(first).toMatchObject({ ok: false, code: 'CHAT_LECTURE_SEULE', replayed: false });
    expect(again).toMatchObject({ ok: false, code: 'CHAT_LECTURE_SEULE', replayed: true });
    expect(await t.prisma.chatMessage.count({ where: { id } })).toBe(0);
  });

  it('refuses the ramasseur’s queue a chat message, and a message too long', async () => {
    const parcel = await atDepot();
    await goOut(parcel.id, ali);

    const [refused] = await queue(ramasseur, parcel.code, 'Bonjour');
    expect(refused).toMatchObject({ ok: false });
    expect(
      await t.prisma.chatMessage.count({ where: { senderUserId: ramasseur.id } }),
    ).toBe(0);

    const [tooLong] = await queue(ali, parcel.code, 'a'.repeat(1001));
    expect(tooLong).toMatchObject({ ok: false, code: 'OPERATION_INVALIDE' });
  });

  it('keeps the messages of a queue in the order the phone recorded them', async () => {
    const parcel = await atDepot();
    await goOut(parcel.id, ali);
    const ids = [randomUUID(), randomUUID(), randomUUID()];

    await sync(
      t,
      tokens[ali.id]!,
      ids.map((operationId, index) => ({
        kind: 'MESSAGE_CHAT',
        operationId,
        parcelCode: parcel.code,
        body: `Message ${index + 1}`,
        deviceTime: NOW,
      })),
    );

    const thread = (await get(`courier/${parcel.code}`, ali)).body.thread;
    expect(thread.messages.map((m: { body: string }) => m.body).sort()).toEqual([
      'Message 1',
      'Message 2',
      'Message 3',
    ]);
  });
});
