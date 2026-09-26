import {
  COURIER_APP_HEADERS,
  createTestApp,
  createUser,
  login,
  type Fixture,
  type TestApp,
} from '../support/test-app';
import { NOW, TODAY, YESTERDAY, close, count, delivered, sync } from '../support/money-fixtures';

/**
 * The Caisse (Admin 4.9, D-79): one session per courier and business day,
 * counted and closed on its own; the cash Au dépôt at Clôturer, a livreur's
 * shortfall his debt, a surplus flagged for the admin, and no scan of a
 * closed day cancelled (A-11).
 */

let t: TestApp;
let admin: Fixture;
let depot: Fixture;
let sc: Fixture;
let seller: Fixture;
let adminToken: string;
let depotToken: string;

async function livreur(): Promise<{ user: Fixture; token: string }> {
  const user = await createUser(t.prisma, { role: 'LIVREUR' });
  return { user, token: (await login(t, user)).accessToken };
}

beforeAll(async () => {
  t = await createTestApp();
  admin = await createUser(t.prisma, { role: 'ADMIN', username: 'caisse.admin' });
  depot = await createUser(t.prisma, { role: 'DEPOT', username: 'caisse.depot' });
  sc = await createUser(t.prisma, { role: 'SERVICE_CLIENT', username: 'caisse.sc' });
  seller = await createUser(t.prisma, { role: 'VENDEUR', email: 'caisse@boutique.tn' });
  adminToken = (await login(t, admin)).accessToken;
  depotToken = (await login(t, depot)).accessToken;
});
afterAll(async () => {
  await t.close();
});
beforeEach(() => {
  t.throttle.clear();
});

describe('Compter and Clôturer (Admin 4.9, D-79)', () => {
  it('counts a livreur’s day, recounts, and closes it: cash Au dépôt, the shortfall his debt', async () => {
    const ali = await livreur();
    const a = await delivered(t, { seller, livreur: ali.user, token: ali.token });
    const b = await delivered(t, { seller, livreur: ali.user, token: ali.token });

    const open = await t.request('GET', `/caisse/${ali.user.id}/${TODAY}`, { token: depotToken });
    expect(open.status).toBe(200);
    expect(open.body).toMatchObject({
      status: 'OUVERTE',
      sessionId: null,
      expected: { deliveryMillimes: '170000', bonCashMillimes: '0', totalMillimes: '170000' },
    });
    expect(open.body.lines).toHaveLength(2);

    const first = await count(t, depotToken, ali.user, '165,000');
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      status: 'COMPTEE',
      countedMillimes: '165000',
      ecartMillimes: '-5000',
    });
    // A recount replaces the first until the session is closed.
    const second = await count(t, depotToken, ali.user, '168,000');
    expect(second.body).toMatchObject({ status: 'COMPTEE', ecartMillimes: '-2000' });

    const closed = await close(t, depotToken, ali.user);
    expect(closed.status).toBe(200);
    expect(closed.body).toMatchObject({
      status: 'CLOTUREE',
      ecartMillimes: '-2000',
      ecartFlagged: false,
    });
    expect(closed.body.debt).toMatchObject({ amountMillimes: '2000', status: 'EN_COURS' });
    // The admin is told of the shortfall (Admin 4.18): the one who checks écarts, not Dépôt.
    const shortfall = await t.prisma.notification.findMany({
      where: { type: 'ECART_CAISSE', params: { path: ['amountMillimes'], equals: '2000' } },
      include: { user: { select: { role: true } } },
    });
    expect(shortfall.map((row) => row.user.role)).toEqual(['ADMIN']);
    expect(shortfall[0]?.params).toMatchObject({ direction: 'MANQUANT', day: TODAY });

    for (const parcel of [a, b]) {
      expect(
        (await t.prisma.parcel.findUniqueOrThrow({ where: { id: parcel.id } })).cashStatus,
      ).toBe('AU_DEPOT');
      const events = await t.prisma.parcelEvent.findMany({
        where: { parcelId: parcel.id, type: 'ENCAISSEMENT_DEPOT' },
      });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ newStatus: 'LIVRE', actorUserId: depot.id });
    }
    const debt = await t.prisma.courierDebt.findFirstOrThrow({
      where: { courierId: ali.user.courierId! },
    });
    expect(debt).toMatchObject({
      amountMillimes: 2000n,
      remainingMillimes: 2000n,
      status: 'EN_COURS',
    });
    const audit = await t.prisma.auditLog.findFirst({
      where: { action: 'CLOTURE_CAISSE', entityId: closed.body.sessionId },
    });
    expect(audit).not.toBeNull();

    const again = await count(t, depotToken, ali.user, '170,000');
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('SESSION_CLOTUREE');
    expect((await close(t, depotToken, ali.user)).body.code).toBe('SESSION_CLOTUREE');
  });

  it('refuses to close an uncounted session, or one whose attendu moved since the count', async () => {
    const sami = await livreur();
    await delivered(t, { seller, livreur: sami.user, token: sami.token });
    expect((await close(t, depotToken, sami.user)).body.code).toBe('SESSION_NON_COMPTEE');

    await count(t, depotToken, sami.user, '85,000');
    // Synced after the count: the depot must count again.
    await delivered(t, { seller, livreur: sami.user, token: sami.token });
    const refused = await close(t, depotToken, sami.user);
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({
      code: 'ATTENDU_MODIFIE',
      message: 'Le montant attendu a changé : recomptez',
    });

    await count(t, depotToken, sami.user, '170,000');
    const closed = await close(t, depotToken, sami.user);
    expect(closed.body).toMatchObject({ status: 'CLOTUREE', ecartMillimes: '0' });
    expect(closed.body.debt).toBeNull();
  });

  it('keeps a day never counted to itself, and counts a Livré synced after its day closed as a scan tardif', async () => {
    const hedi = await livreur();
    await delivered(t, {
      seller,
      livreur: hedi.user,
      token: hedi.token,
      deviceTime: '2026-09-24T15:00:00.000Z',
    });
    // Today's session does not take yesterday's delivery while yesterday is open.
    const today = await t.request('GET', `/caisse/${hedi.user.id}/${TODAY}`, { token: depotToken });
    expect(today.body.lines).toHaveLength(0);

    await count(t, depotToken, hedi.user, '85,000', YESTERDAY);
    expect((await close(t, depotToken, hedi.user, YESTERDAY)).body.status).toBe('CLOTUREE');

    // Made yesterday evening, offline, synced this morning: yesterday is closed.
    const late = await delivered(t, {
      seller,
      livreur: hedi.user,
      token: hedi.token,
      deviceTime: '2026-09-24T20:30:00.000Z',
    });
    const session = await t.request('GET', `/caisse/${hedi.user.id}/${TODAY}`, {
      token: depotToken,
    });
    expect(session.body.lines).toEqual([
      expect.objectContaining({ code: late.code, origin: 'TARDIF', scanDay: YESTERDAY }),
    ]);

    const summary = await t.request('GET', '/caisse', { token: depotToken });
    expect(summary.status).toBe(200);
    expect(summary.body.rows).toContainEqual(
      expect.objectContaining({
        courier: expect.objectContaining({ userId: hedi.user.id }),
        status: 'OUVERTE',
        lateCount: 1,
        expectedMillimes: '85000',
      }),
    );
    const yesterday = await t.request('GET', `/caisse?date=${YESTERDAY}`, { token: depotToken });
    expect(yesterday.body.rows).toContainEqual(
      expect.objectContaining({
        courier: expect.objectContaining({ userId: hedi.user.id }),
        status: 'CLOTUREE',
      }),
    );
  });

  it('flags a surplus without crediting anyone; only the admin checks it, with a note (answer 3)', async () => {
    const nour = await livreur();
    await delivered(t, { seller, livreur: nour.user, token: nour.token });
    await count(t, depotToken, nour.user, '86,500');
    const closed = await close(t, depotToken, nour.user);
    expect(closed.body).toMatchObject({ ecartMillimes: '1500', ecartFlagged: true, debt: null });
    expect(
      await t.prisma.notification.count({
        where: {
          type: 'ECART_CAISSE',
          user: { role: 'ADMIN' },
          params: { path: ['direction'], equals: 'EXCEDENT' },
        },
      }),
    ).toBe(1);
    const sessionId = closed.body.sessionId as string;

    const ecarts = await t.request('GET', '/caisse/ecarts', { token: adminToken });
    expect(ecarts.body.aVerifier).toContainEqual(
      expect.objectContaining({ sessionId, ecartMillimes: '1500' }),
    );
    expect((await t.request('GET', '/caisse/ecarts', { token: depotToken })).status).toBe(403);

    const byDepot = await t.request('POST', `/caisse/sessions/${sessionId}/verifier-ecart`, {
      token: depotToken,
      body: { note: 'Billet retrouvé' },
    });
    expect(byDepot.status).toBe(403);
    const noNote = await t.request('POST', `/caisse/sessions/${sessionId}/verifier-ecart`, {
      token: adminToken,
      body: { note: '' },
    });
    expect(noNote.status).toBe(400);
    const checked = await t.request('POST', `/caisse/sessions/${sessionId}/verifier-ecart`, {
      token: adminToken,
      body: { note: 'Monnaie du client rendue le lendemain' },
    });
    expect(checked.status).toBe(200);
    const twice = await t.request('POST', `/caisse/sessions/${sessionId}/verifier-ecart`, {
      token: adminToken,
      body: { note: 'Monnaie du client rendue le lendemain' },
    });
    expect(twice.body.code).toBe('ECART_DEJA_VERIFIE');
    const after = await t.request('GET', '/caisse/ecarts', { token: adminToken });
    expect(after.body.aVerifier.map((row: { sessionId: string }) => row.sessionId)).not.toContain(
      sessionId,
    );
  });
});

describe('A-11: nothing of a closed day is cancelled from the phone', () => {
  it('refuses Annuler within the minute once his caisse of that day is Clôturée', async () => {
    const lina = await livreur();
    const parcel = await delivered(t, { seller, livreur: lina.user, token: lina.token });
    await count(t, depotToken, lina.user, '85,000');
    await close(t, depotToken, lina.user);

    const [result] = await sync(t, lina.token, [
      {
        kind: 'ANNULATION',
        clientScanId: parcel.clientScanId,
        deviceTime: '2026-09-25T08:00:30.000Z',
      },
    ]);
    expect(result).toMatchObject({ ok: false, code: 'ANNULATION_CAISSE_CLOTUREE' });
    expect((await t.prisma.parcel.findUniqueOrThrow({ where: { id: parcel.id } })).status).toBe(
      'LIVRE',
    );
  });

  it('takes a cancelled Livré out of a counted session: the count must be redone', async () => {
    const omar = await livreur();
    const parcel = await delivered(t, { seller, livreur: omar.user, token: omar.token });
    await count(t, depotToken, omar.user, '85,000');
    const [result] = await sync(t, omar.token, [
      { kind: 'ANNULATION', clientScanId: parcel.clientScanId, deviceTime: NOW },
    ]);
    expect(result).toMatchObject({ ok: true });
    expect((await close(t, depotToken, omar.user)).body.code).toBe('ATTENDU_MODIFIE');
    await count(t, depotToken, omar.user, '0');
    expect((await close(t, depotToken, omar.user)).body).toMatchObject({
      status: 'CLOTUREE',
      lines: [],
    });
  });
});

describe('who may do what (Admin 2, D-11)', () => {
  it('lets Admin and Dépôt count; Service client, a seller or a courier never', async () => {
    const zied = await livreur();
    expect((await t.request('GET', '/caisse', { token: adminToken })).status).toBe(200);
    const scToken = (await login(t, sc)).accessToken;
    expect((await t.request('GET', '/caisse', { token: scToken })).status).toBe(403);
    const sellerToken = (await login(t, seller)).accessToken;
    expect((await count(t, sellerToken, zied.user, '1,000')).status).toBe(403);
    const byCourier = await t.request('POST', `/caisse/${zied.user.id}/${TODAY}/compter`, {
      token: zied.token,
      body: { counted: '1,000' },
      headers: COURIER_APP_HEADERS,
    });
    expect(byCourier.status).toBe(403);
  });

  it('answers 404 for an account that is not a courier', async () => {
    const response = await t.request('GET', `/caisse/${seller.id}/${TODAY}`, { token: depotToken });
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('PAS_UN_COURSIER');
  });
});

describe('Annuler une dette (Admin rule 5)', () => {
  it('is the admin’s, with a note, and cancels what is left', async () => {
    const karim = await livreur();
    await delivered(t, { seller, livreur: karim.user, token: karim.token });
    await count(t, depotToken, karim.user, '80,000');
    const closed = await close(t, depotToken, karim.user);
    const debtId = closed.body.debt.id as string;

    expect(
      (
        await t.request('POST', `/paie/dettes/${debtId}/annuler`, {
          token: depotToken,
          body: { note: 'Argent retrouvé' },
        })
      ).status,
    ).toBe(403);
    const cancelled = await t.request('POST', `/paie/dettes/${debtId}/annuler`, {
      token: adminToken,
      body: { note: 'Argent retrouvé dans la sacoche' },
    });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toMatchObject({ status: 'ANNULEE', amountMillimes: '5000' });
    const again = await t.request('POST', `/paie/dettes/${debtId}/annuler`, {
      token: adminToken,
      body: { note: 'Argent retrouvé dans la sacoche' },
    });
    expect(again.body.code).toBe('DETTE_NON_EN_COURS');
    expect(
      await t.prisma.auditLog.count({ where: { action: 'ANNULATION_DETTE', entityId: debtId } }),
    ).toBe(1);
  });
});
