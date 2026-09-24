import { randomUUID } from 'node:crypto';
import type { ParcelLocation, ParcelStatus, Prisma } from '@prisma/client';
import { seed } from '../../prisma/seed';
import { createTestApp, createUser, login, type Fixture, type TestApp } from '../support/test-app';
import { createParcel, place } from '../support/work-fixtures';

/**
 * Exceptions, first rows (Admin 4.7, A-22, D-50): parcels at the depot more
 * than 48 h without a tour, pickups planned but not done, seller change
 * requests waiting, codes typed by hand. Every staff role reads the queue;
 * each acts with its own rights, on the screen each row leads to.
 */

let t: TestApp;
let depot: Fixture;
let depotToken: string;
let seller: Fixture;
let hedi: Fixture;

const ADMIN = { username: 'admin', password: 'Mot-De-Passe-Admin-42' };
// The test clock: 2026-09-25T08:00Z, 09:00 in Tunis.
const NOW = new Date('2026-09-25T08:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

async function parcel(
  status: ParcelStatus,
  location: ParcelLocation,
  extra: Partial<Prisma.ParcelUncheckedCreateInput> = {},
) {
  const id = await createParcel(t.prisma, {
    sellerId: seller.sellerId!,
    createdByUserId: seller.id,
    status,
    location,
    extra,
  });
  return t.prisma.parcel.findUniqueOrThrow({ where: { id } });
}

/** The parcel's arrival at the depot, at a chosen time: its latest such event. */
async function arrived(parcelId: string, at: Date, status: ParcelStatus = 'AU_DEPOT') {
  await t.prisma.parcelEvent.create({
    data: {
      parcelId,
      type: 'ENTREE_DEPOT',
      previousStatus: 'RAMASSE',
      newStatus: status,
      previousLocation: 'AVEC_LE_RAMASSEUR',
      newLocation: 'AU_DEPOT',
      actorUserId: depot.id,
      actorRole: 'DEPOT',
      serverTime: at,
    },
  });
}

async function exceptions(token = depotToken) {
  const response = await t.request('GET', '/exceptions', { token });
  expect(response.status).toBe(200);
  return response.body;
}

beforeAll(async () => {
  t = await createTestApp();
  await seed(t.prisma, { log: () => undefined, adminPassword: ADMIN.password });
  depot = await createUser(t.prisma, { role: 'DEPOT', username: 'exc.depot' });
  seller = await createUser(t.prisma, { role: 'VENDEUR', email: 'exc@boutique.tn' });
  hedi = await createUser(t.prisma, { role: 'RAMASSEUR' });
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  t.throttle.clear();
  depotToken = (await login(t, depot)).accessToken;
});

describe('parcels at the depot more than 48 h without a tour (Admin 4.7)', () => {
  it('lists those waiting past 48 hours since they arrived, oldest first', async () => {
    const old = await parcel('AU_DEPOT', 'AU_DEPOT');
    await arrived(old.id, hoursAgo(72));
    const late = await parcel('AU_DEPOT', 'AU_DEPOT');
    await arrived(late.id, hoursAgo(49));
    const fresh = await parcel('AU_DEPOT', 'AU_DEPOT');
    await arrived(fresh.id, hoursAgo(47));

    const body = await exceptions();

    const codes = body.depotWaiting.map((r: { code: string }) => r.code);
    expect(codes.indexOf(old.code)).toBeLessThan(codes.indexOf(late.code));
    expect(codes).toContain(late.code);
    expect(codes).not.toContain(fresh.code);
    expect(body.depotWaiting.find((r: { code: string }) => r.code === old.code)).toMatchObject({
      shopName: 'Boutique Test',
      status: 'AU_DEPOT',
      since: hoursAgo(72).toISOString(),
    });
  });

  it('counts a Relancé parcel from its day, and leaves out one planned later or waiting a decision', async () => {
    const relaunched = await parcel('RELANCE', 'AU_DEPOT', {
      relaunchDate: new Date('2026-09-25T00:00:00.000Z'),
      relaunchSlot: 'MATIN',
      relaunchOrigin: 'VENDEUR',
      attemptCount: 1,
    });
    await arrived(relaunched.id, hoursAgo(96), 'RELANCE');
    const later = await parcel('RELANCE', 'AU_DEPOT', {
      relaunchDate: new Date('2026-09-27T00:00:00.000Z'),
      relaunchSlot: 'MATIN',
      relaunchOrigin: 'VENDEUR',
      attemptCount: 1,
    });
    await arrived(later.id, hoursAgo(96), 'RELANCE');
    const waiting = await parcel('A_VERIFIER', 'AU_DEPOT');
    await arrived(waiting.id, hoursAgo(96), 'A_VERIFIER');

    const codes = (await exceptions()).depotWaiting.map((r: { code: string }) => r.code);
    // Due today only since this morning: not 48 h yet.
    expect(codes).not.toContain(relaunched.code);
    expect(codes).not.toContain(later.code);
    expect(codes).not.toContain(waiting.code);
  });
});

describe('pickups planned but not done (Admin 4.7)', () => {
  async function pickup(day: string, status: 'PLANIFIE' | 'EFFECTUE' = 'PLANIFIE') {
    const address = await t.prisma.pickupAddress.create({
      data: { sellerId: seller.sellerId!, ...(await place(t.prisma)), address: `${randomUUID()}` },
    });
    return t.prisma.pickup.create({
      data: {
        sellerId: seller.sellerId!,
        pickupAddressId: address.id,
        status,
        plannedDate: new Date(`${day}T00:00:00.000Z`),
        plannedSlot: 'MATIN',
        ramasseurId: hedi.courierId!,
        declaredCount: 2,
      },
    });
  }

  it('lists those planned for a day already past', async () => {
    const yesterday = await pickup('2026-09-24');
    const today = await pickup('2026-09-25');
    const done = await pickup('2026-09-23', 'EFFECTUE');

    const rows = (await exceptions()).pickupsLate;
    const ids = rows.map((r: { id: string }) => r.id);
    expect(ids).toContain(yesterday.id);
    expect(ids).not.toContain(today.id);
    expect(ids).not.toContain(done.id);
    expect(rows.find((r: { id: string }) => r.id === yesterday.id)).toMatchObject({
      shopName: 'Boutique Test',
      plannedDate: '2026-09-24',
      plannedSlot: 'MATIN',
      ramasseur: { id: hedi.id },
    });
  });
});

describe('seller change requests waiting (Admin 4.7, D-57)', () => {
  it('lists the requests still waiting', async () => {
    const p = await parcel('EN_LIVRAISON', 'AVEC_LE_LIVREUR');
    const request = await t.prisma.sellerChangeRequest.create({
      data: {
        parcelId: p.id,
        sellerId: seller.sellerId!,
        requestedFields: { address: '9 rue du Lac' },
      },
    });
    const rows = (await exceptions()).changeRequests;
    expect(rows).toContainEqual(
      expect.objectContaining({
        id: request.id,
        parcel: expect.objectContaining({ code: p.code }),
      }),
    );
  });
});

describe('codes typed by hand (A-22)', () => {
  it('lists the manual entries of the last 7 days, newest first', async () => {
    const p = await parcel('AU_DEPOT', 'AU_DEPOT');
    const scan = (at: Date, manualEntry: boolean) =>
      t.prisma.scan.create({
        data: {
          clientScanId: randomUUID(),
          action: 'ENTREE_DEPOT',
          rawCode: p.code.toLowerCase(),
          parcelId: p.id,
          actorUserId: depot.id,
          source: manualEntry ? 'SAISIE_MANUELLE' : 'WEB_DOUCHETTE',
          manualEntry,
          accepted: true,
          parcelBefore: { status: 'RAMASSE', location: 'AVEC_LE_RAMASSEUR' },
          deviceTime: at,
          receivedAt: at,
          businessDate: new Date(`${at.toISOString().slice(0, 10)}T00:00:00.000Z`),
        },
      });
    const recent = await scan(hoursAgo(2), true);
    const older = await scan(hoursAgo(24 * 6), true);
    const tooOld = await scan(hoursAgo(24 * 8), true);
    const gun = await scan(hoursAgo(1), false);

    const rows = (await exceptions()).manualEntries;
    const ids = rows.map((r: { scanId: string }) => r.scanId);
    expect(ids.indexOf(recent.id)).toBeLessThan(ids.indexOf(older.id));
    expect(ids).not.toContain(tooOld.id);
    expect(ids).not.toContain(gun.id);
    expect(rows.find((r: { scanId: string }) => r.scanId === recent.id)).toMatchObject({
      action: 'ENTREE_DEPOT',
      accepted: true,
      rawCode: p.code.toLowerCase(),
      parcelCode: p.code,
      actor: { name: 'Prénom Nom', role: 'DEPOT' },
    });
  });
});

describe('who reads Exceptions (D-11)', () => {
  it('is every staff role, never a seller', async () => {
    const sc = await createUser(t.prisma, { role: 'SERVICE_CLIENT', username: 'exc.sc' });
    await exceptions((await login(t, sc)).accessToken);
    const adminToken = (await t.request('POST', '/auth/login/staff', { body: ADMIN })).body
      .accessToken;
    await exceptions(adminToken);
    const response = await t.request('GET', '/exceptions', {
      token: (await login(t, seller)).accessToken,
    });
    expect(response.status).toBe(403);
  });
});
