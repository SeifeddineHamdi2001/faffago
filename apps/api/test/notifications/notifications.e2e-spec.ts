import { seed } from '../../prisma/seed';
import { ParcelEventService } from '../../src/parcels/parcel-event.service';
import { NoticesJob } from '../../src/notices/notices.job';
import { VerifyDeadlineJob } from '../../src/a-verifier/verify-deadline.job';
import { notificationText, type NotificationType } from '@faffago/shared';
import { createTestApp, createUser, login, type Fixture, type TestApp } from '../support/test-app';
import { principalOf } from '../support/principals';
import { createParcel } from '../support/work-fixtures';

/**
 * In-app notifications (Vendeur 4.13, Admin 4.18, Coursier 4.11, A-24): stored
 * as a type and parameters, told in the transaction of the event that caused
 * them, each to the people who can act on it and nobody else.
 *
 * The test clock reads 2026-09-25 08:00 UTC (09:00 in Tunis).
 */

let t: TestApp;
let events: ParcelEventService;
let notices: NoticesJob;
let seller: Fixture;
let other: Fixture;
let admin: Fixture;
let depot: Fixture;
let sc: Fixture;
let ali: Fixture;
let tokens: Record<string, string>;

const HOUR = 3_600_000;
const ADMIN = { username: 'admin', password: 'Mot-De-Passe-Admin-42' };

async function marsa() {
  const delegation = await t.prisma.delegation.findUniqueOrThrow({ where: { code: 'TUN-MARSA' } });
  const localite = await t.prisma.localite.findFirstOrThrow({
    where: { delegationId: delegation.id, isOther: false },
    orderBy: { nameFr: 'asc' },
  });
  return { delegationId: delegation.id, localiteId: localite.id, zoneId: delegation.zoneId };
}

async function parcelOf(
  owner: Fixture,
  input: {
    status: 'EN_LIVRAISON' | 'A_VERIFIER' | 'RELANCE' | 'AU_DEPOT';
    location: 'AVEC_LE_LIVREUR' | 'AU_DEPOT';
    extra?: Record<string, unknown>;
  },
) {
  const where = await marsa();
  const id = await createParcel(t.prisma, {
    sellerId: owner.sellerId!,
    createdByUserId: owner.id,
    status: input.status,
    location: input.location,
    currentLivreurId: input.location === 'AVEC_LE_LIVREUR' ? ali.courierId! : null,
    where: { delegationId: where.delegationId, localiteId: where.localiteId },
    extra: input.extra as never,
  });
  return t.prisma.parcel.findUniqueOrThrow({ where: { id } });
}

function noticesOf(user: Fixture, type?: NotificationType) {
  return t.prisma.notification.findMany({
    where: { userId: user.id, ...(type ? { type } : {}) },
    orderBy: { createdAt: 'asc' },
  });
}

function call(method: string, path: string, user: Fixture, body?: unknown) {
  return t.request(method, path, { token: tokens[user.id], body });
}

beforeAll(async () => {
  t = await createTestApp();
  await seed(t.prisma, { log: () => undefined, adminPassword: ADMIN.password });
  events = t.app.get(ParcelEventService);
  notices = t.app.get(NoticesJob);
  seller = await createUser(t.prisma, { role: 'VENDEUR', email: 'notif@boutique.tn' });
  other = await createUser(t.prisma, {
    role: 'VENDEUR',
    email: 'notif-autre@boutique.tn',
    shopName: 'Autre Boutique',
  });
  depot = await createUser(t.prisma, { role: 'DEPOT', username: 'notif.depot' });
  sc = await createUser(t.prisma, { role: 'SERVICE_CLIENT', username: 'notif.sc' });
  ali = await createUser(t.prisma, { role: 'LIVREUR' });
  const row = await t.prisma.user.findUniqueOrThrow({ where: { username: 'admin' } });
  admin = { id: row.id, role: 'ADMIN', password: ADMIN.password, phone: row.phone, username: 'admin' };
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  t.throttle.clear();
  tokens = {
    [seller.id]: (await login(t, seller)).accessToken,
    [other.id]: (await login(t, other)).accessToken,
    [depot.id]: (await login(t, depot)).accessToken,
    [sc.id]: (await login(t, sc)).accessToken,
    [admin.id]: (await t.request('POST', '/auth/login/staff', { body: ADMIN })).body.accessToken,
  };
});

describe('the bell', () => {
  it('lists a person’s own notifications, newest first, with their unread count', async () => {
    const before = (await call('GET', '/notifications', seller)).body.unreadCount as number;
    await t.prisma.notification.createMany({
      data: [
        { userId: seller.id, type: 'COMPTE_SUSPENDU', params: {} },
        { userId: seller.id, type: 'COLIS_EN_RETOUR', params: { code: 'FG-AAAAAAAA' } },
        { userId: other.id, type: 'COMPTE_REACTIVE', params: {} },
      ],
    });

    const response = await call('GET', '/notifications', seller);

    expect(response.status).toBe(200);
    expect(response.body.unreadCount).toBe(before + 2);
    expect(response.body.items.every((item: { readAt: unknown }) => item.readAt === null)).toBe(true);
    expect(response.body.items.map((item: { type: string }) => item.type)).not.toContain(
      'COMPTE_REACTIVE',
    );
    expect((await call('GET', '/notifications/unread-count', seller)).body).toEqual({
      unreadCount: before + 2,
    });
  });

  it('marks one read, then all, and never touches another person’s', async () => {
    const mine = await t.prisma.notification.create({
      data: { userId: seller.id, type: 'COMPTE_SUSPENDU', params: {} },
    });
    const theirs = await t.prisma.notification.create({
      data: { userId: other.id, type: 'COMPTE_SUSPENDU', params: {} },
    });
    const otherBefore = (await call('GET', '/notifications/unread-count', other)).body.unreadCount;

    const refused = await call('POST', `/notifications/${theirs.id}/read`, seller);
    expect(refused.status).toBe(404);
    expect(
      (await t.prisma.notification.findUniqueOrThrow({ where: { id: theirs.id } })).readAt,
    ).toBeNull();

    const one = await call('POST', `/notifications/${mine.id}/read`, seller);
    expect(one.status).toBe(200);
    expect(
      (await t.prisma.notification.findUniqueOrThrow({ where: { id: mine.id } })).readAt,
    ).not.toBeNull();
    // Reading it again changes nothing.
    expect((await call('POST', `/notifications/${mine.id}/read`, seller)).status).toBe(200);

    const all = await call('POST', '/notifications/read-all', seller);
    expect(all.body).toEqual({ unreadCount: 0 });
    expect((await call('GET', '/notifications?unread=true', seller)).body.items).toEqual([]);
    expect((await call('GET', '/notifications/unread-count', other)).body.unreadCount).toBe(
      otherBefore,
    );
  });

  it('answers every role and refuses nobody signed in, and nobody signed out', async () => {
    for (const user of [seller, depot, sc, admin]) {
      expect((await call('GET', '/notifications', user)).status).toBe(200);
    }
    expect((await t.request('GET', '/notifications')).status).toBe(401);
  });

  it('keeps params, never text, so the app words it in French or Arabic (A-24)', async () => {
    await t.prisma.notification.create({
      data: {
        userId: seller.id,
        type: 'COLIS_A_VERIFIER',
        params: { code: 'FG-ABCD2345', reason: 'REFUSE' },
      },
    });
    const item = (await call('GET', '/notifications', seller)).body.items[0];
    expect(item.params).toEqual({ code: 'FG-ABCD2345', reason: 'REFUSE' });
    expect(notificationText(item.type, item.params, 'fr')).toBe(
      'Colis FG-ABCD2345 à vérifier · Refusé',
    );
  });
});

describe('what a parcel’s events tell the seller (Vendeur 4.13)', () => {
  it('tells him of a failed delivery, with the reason, from the scan’s own transaction', async () => {
    const parcel = await parcelOf(seller, { status: 'EN_LIVRAISON', location: 'AVEC_LE_LIVREUR' });
    const before = (await noticesOf(seller, 'COLIS_A_VERIFIER')).length;

    const result = await events.run({
      parcelId: parcel.id,
      actor: principalOf(ali),
      request: { action: 'SCAN_ECHEC', failureReason: 'NE_REPOND_PAS' },
    });

    expect(result.ok).toBe(true);
    expect(await noticesOf(seller, 'COLIS_A_VERIFIER')).toHaveLength(before + 1);
    const notice = await t.prisma.notification.findFirstOrThrow({ where: { parcelId: parcel.id } });
    expect(notice).toMatchObject({
      userId: seller.id,
      type: 'COLIS_A_VERIFIER',
      params: { code: parcel.code, reason: 'NE_REPOND_PAS' },
    });
  });

  it('tells nobody when the scan is refused', async () => {
    const parcel = await parcelOf(seller, { status: 'AU_DEPOT', location: 'AU_DEPOT' });
    const before = await t.prisma.notification.count();

    const result = await events.run({
      parcelId: parcel.id,
      actor: principalOf(ali),
      request: { action: 'SCAN_ECHEC', failureReason: 'NE_REPOND_PAS' },
    });

    expect(result.ok).toBe(false);
    expect(await t.prisma.notification.count()).toBe(before);
  });

  it('tells him of a customer postponement with the new day (D-9), not of a failure', async () => {
    const parcel = await parcelOf(seller, { status: 'EN_LIVRAISON', location: 'AVEC_LE_LIVREUR' });
    const failures = (await noticesOf(seller, 'COLIS_A_VERIFIER')).length;

    const result = await events.run({
      parcelId: parcel.id,
      actor: principalOf(ali),
      request: {
        action: 'SCAN_ECHEC',
        failureReason: 'REPORTE_PAR_LE_CLIENT',
        postponedTo: new Date('2026-09-28T00:00:00.000Z'),
        relaunchSlot: 'SOIR',
      },
    });

    expect(result.ok).toBe(true);
    expect((await noticesOf(seller, 'COLIS_A_VERIFIER')).length).toBe(failures);
    const notice = await t.prisma.notification.findFirstOrThrow({ where: { parcelId: parcel.id } });
    expect(notice).toMatchObject({
      type: 'COLIS_REPORTE_PAR_CLIENT',
      params: { code: parcel.code, date: '2026-09-28' },
    });
  });

  it('tells him once of a third failure: the return, not an À vérifier before it', async () => {
    const parcel = await parcelOf(seller, {
      status: 'EN_LIVRAISON',
      location: 'AVEC_LE_LIVREUR',
      extra: { attemptCount: 2 },
    });
    const verify = (await noticesOf(seller, 'COLIS_A_VERIFIER')).length;
    const back = (await noticesOf(seller, 'COLIS_EN_RETOUR')).length;

    await events.run({
      parcelId: parcel.id,
      actor: principalOf(ali),
      request: { action: 'SCAN_ECHEC', failureReason: 'INJOIGNABLE' },
    });

    expect((await noticesOf(seller, 'COLIS_A_VERIFIER')).length).toBe(verify);
    expect((await noticesOf(seller, 'COLIS_EN_RETOUR')).length).toBe(back + 1);
    expect(
      (await t.prisma.notification.findFirstOrThrow({ where: { parcelId: parcel.id } })).params,
    ).toEqual({ code: parcel.code });
  });

  it('tells him of the 48-hour return the job makes, once', async () => {
    const parcel = await parcelOf(seller, {
      status: 'A_VERIFIER',
      location: 'AU_DEPOT',
      extra: {
        attemptCount: 1,
        lastFailureReason: 'NE_REPOND_PAS',
        verifyDeadlineAt: new Date(t.clock.now().getTime() - HOUR),
      },
    });
    const before = (await noticesOf(seller, 'COLIS_RETOUR_AUTO_48H')).length;
    const job = t.app.get(VerifyDeadlineJob);

    await job.returnExpired();
    await job.returnExpired();

    expect(await noticesOf(seller, 'COLIS_RETOUR_AUTO_48H')).toHaveLength(before + 1);
    const notice = await t.prisma.notification.findFirstOrThrow({ where: { parcelId: parcel.id } });
    expect(notice.params).toEqual({ code: parcel.code });
  });

  it('does not tell him of what he decided himself', async () => {
    const parcel = await parcelOf(seller, {
      status: 'A_VERIFIER',
      location: 'AU_DEPOT',
      extra: {
        attemptCount: 1,
        lastFailureReason: 'NE_REPOND_PAS',
        verifyDeadlineAt: new Date(t.clock.now().getTime() + 30 * HOUR),
      },
    });
    const before = await t.prisma.notification.count({ where: { userId: seller.id } });

    const response = await call('POST', `/parcels/${parcel.code}/retourner`, seller);

    expect(response.status).toBe(200);
    expect(await t.prisma.notification.count({ where: { userId: seller.id } })).toBe(before);
  });
});

describe('the team and the seller are told of requests and account changes', () => {
  it('tells the admin and Dépôt, not Service client, of a pickup request (Admin 4.18)', async () => {
    const where = await marsa();
    const address = await t.request('POST', '/pickup-addresses', {
      token: tokens[other.id],
      body: { localiteId: where.localiteId, address: '12 rue des Notifications' },
    });
    const admins = (await noticesOf(admin, 'NOUVELLE_DEMANDE_RAMASSAGE')).length;
    const depots = (await noticesOf(depot, 'NOUVELLE_DEMANDE_RAMASSAGE')).length;
    const scs = (await noticesOf(sc, 'NOUVELLE_DEMANDE_RAMASSAGE')).length;

    const requested = await t.request('POST', '/pickups', {
      token: tokens[other.id],
      body: { pickupAddressId: address.body.id, requestedSlot: 'MATIN', declaredCount: 3 },
    });

    expect(requested.status).toBe(201);
    expect((await noticesOf(admin, 'NOUVELLE_DEMANDE_RAMASSAGE')).length).toBe(admins + 1);
    expect((await noticesOf(depot, 'NOUVELLE_DEMANDE_RAMASSAGE')).length).toBe(depots + 1);
    expect((await noticesOf(sc, 'NOUVELLE_DEMANDE_RAMASSAGE')).length).toBe(scs);
    expect(
      await t.prisma.notification.findFirst({
        where: {
          userId: depot.id,
          type: 'NOUVELLE_DEMANDE_RAMASSAGE',
          params: { path: ['pickupId'], equals: requested.body.id },
        },
      }),
    ).toMatchObject({ params: { pickupId: requested.body.id, shopName: 'Autre Boutique' } });

    // Planning it tells the seller, and the ramasseur with the shop.
    const ramasseur = await createUser(t.prisma, { role: 'RAMASSEUR' });
    const planned = await t.request('POST', `/ramassages/${requested.body.id}/plan`, {
      token: tokens[depot.id],
      body: { date: '2026-09-26', slot: 'APRES_MIDI', ramasseurId: ramasseur.id },
    });
    expect(planned.status).toBe(200);
    expect((await noticesOf(other, 'RAMASSAGE_PLANIFIE')).at(-1)?.params).toEqual({
      pickupId: requested.body.id,
      day: '2026-09-26',
      window: 'APRES_MIDI',
    });
    expect((await noticesOf(ramasseur, 'RAMASSAGE_PLANIFIE')).at(-1)?.params).toEqual({
      pickupId: requested.body.id,
      day: '2026-09-26',
      window: 'APRES_MIDI',
      shopName: 'Autre Boutique',
    });
  });

  it('tells the admin and Service client, not Dépôt, of a change request', async () => {
    const parcel = await parcelOf(seller, { status: 'AU_DEPOT', location: 'AU_DEPOT' });
    const admins = (await noticesOf(admin, 'DEMANDE_MODIFICATION')).length;
    const scs = (await noticesOf(sc, 'DEMANDE_MODIFICATION')).length;
    const depots = (await noticesOf(depot, 'DEMANDE_MODIFICATION')).length;

    const asked = await call('POST', `/parcels/${parcel.code}/change-requests`, seller, {
      recipientPhone: '29123456',
    });

    expect(asked.status).toBe(201);
    expect((await noticesOf(admin, 'DEMANDE_MODIFICATION')).length).toBe(admins + 1);
    expect((await noticesOf(sc, 'DEMANDE_MODIFICATION')).length).toBe(scs + 1);
    expect((await noticesOf(depot, 'DEMANDE_MODIFICATION')).length).toBe(depots);
    expect(
      (await t.prisma.notification.findFirstOrThrow({ where: { userId: sc.id, parcelId: parcel.id } }))
        .params,
    ).toEqual({ code: parcel.code, shopName: 'Boutique Test' });
  });

  it('tells the seller his account was suspended, then reactivated', async () => {
    const suspendedBefore = (await noticesOf(other, 'COMPTE_SUSPENDU')).length;
    const reactivatedBefore = (await noticesOf(other, 'COMPTE_REACTIVE')).length;

    const suspended = await call('POST', `/sellers/${other.sellerId}/suspend`, admin);
    expect(suspended.status).toBe(200);
    expect((await noticesOf(other, 'COMPTE_SUSPENDU')).length).toBe(suspendedBefore + 1);

    const back = await call('POST', `/sellers/${other.sellerId}/reactivate`, admin);
    expect(back.status).toBe(200);
    expect((await noticesOf(other, 'COMPTE_REACTIVE')).length).toBe(reactivatedBefore + 1);
  });

  it('tells a livreur what the team put in his column', async () => {
    const parcel = await parcelOf(seller, { status: 'AU_DEPOT', location: 'AU_DEPOT' });
    const before = (await noticesOf(ali, 'NOUVEAUX_COLIS_ASSIGNES')).length;

    const moved = await call('POST', '/tournees/moves', depot, {
      parcelIds: [parcel.id],
      courierId: ali.id,
    });

    expect(moved.status).toBe(200);
    const notices = await noticesOf(ali, 'NOUVEAUX_COLIS_ASSIGNES');
    expect(notices).toHaveLength(before + 1);
    expect(notices.at(-1)?.params).toEqual({ count: 1 });
  });
});

describe('the scheduled notices', () => {
  it('warns the seller and the team 24 hours before the return, once', async () => {
    const soon = await parcelOf(seller, {
      status: 'A_VERIFIER',
      location: 'AU_DEPOT',
      extra: {
        attemptCount: 1,
        lastFailureReason: 'REFUSE',
        verifyDeadlineAt: new Date(t.clock.now().getTime() + 20 * HOUR),
      },
    });
    const later = await parcelOf(seller, {
      status: 'A_VERIFIER',
      location: 'AU_DEPOT',
      extra: {
        attemptCount: 1,
        lastFailureReason: 'REFUSE',
        verifyDeadlineAt: new Date(t.clock.now().getTime() + 40 * HOUR),
      },
    });
    const forSeller = (await noticesOf(seller, 'COLIS_24H_RESTANTES')).length;
    const forAdmin = (await noticesOf(admin, 'COLIS_24H_RESTANTES')).length;
    const forDepot = (await noticesOf(depot, 'COLIS_24H_RESTANTES')).length;

    expect(await notices.warnVerifyDeadlines()).toBe(1);
    expect(await notices.warnVerifyDeadlines()).toBe(0);

    expect((await noticesOf(seller, 'COLIS_24H_RESTANTES')).at(-1)?.params).toEqual({
      code: soon.code,
    });
    expect((await noticesOf(admin, 'COLIS_24H_RESTANTES')).length).toBe(forAdmin + 1);
    expect((await noticesOf(sc, 'COLIS_24H_RESTANTES')).at(-1)?.params).toEqual({
      code: soon.code,
      shopName: 'Boutique Test',
    });
    expect((await noticesOf(seller, 'COLIS_24H_RESTANTES')).length).toBe(forSeller + 1);
    expect((await noticesOf(depot, 'COLIS_24H_RESTANTES')).length).toBe(forDepot);
    expect(
      await t.prisma.notification.count({ where: { parcelId: later.id } }),
    ).toBe(0);
  });

  it('tells a livreur of the relancé parcels waiting for him today, once', async () => {
    const where = await marsa();
    await t.prisma.zoneAssignment.create({
      data: { zoneId: where.zoneId!, courierId: ali.courierId!, role: 'LIVREUR', kind: 'TITULAIRE' },
    });
    await parcelOf(seller, {
      status: 'RELANCE',
      location: 'AU_DEPOT',
      extra: {
        attemptCount: 1,
        relaunchDate: new Date('2026-09-25T00:00:00.000Z'),
        relaunchOrigin: 'CLIENT',
      },
    });
    const before = (await noticesOf(ali, 'COLIS_RELANCE_AUJOURDHUI')).length;

    expect(await notices.relancesToday()).toBe(1);
    expect(await notices.relancesToday()).toBe(0);

    const list = await noticesOf(ali, 'COLIS_RELANCE_AUJOURDHUI');
    expect(list).toHaveLength(before + 1);
    expect(list.at(-1)?.params).toMatchObject({ day: '2026-09-25' });
  });

  it('reminds a livreur, after the depot’s hours, of the parcels he still carries', async () => {
    await parcelOf(seller, { status: 'EN_LIVRAISON', location: 'AVEC_LE_LIVREUR' });
    const before = (await noticesOf(ali, 'RAPPEL_FIN_DE_JOURNEE')).length;

    // 09:00 in Tunis: too early.
    expect(await notices.endOfDayReminders()).toBe(0);
    // 18:00 in Tunis.
    t.clock.advance(9 * 3600);
    expect(await notices.endOfDayReminders()).toBeGreaterThanOrEqual(1);
    expect(await notices.endOfDayReminders()).toBe(0);

    const list = await noticesOf(ali, 'RAPPEL_FIN_DE_JOURNEE');
    expect(list).toHaveLength(before + 1);
    expect(list.at(-1)?.params).toMatchObject({ bons: 0, day: '2026-09-25' });
    expect((list.at(-1)?.params as { parcels: number }).parcels).toBeGreaterThanOrEqual(1);
  });
});
