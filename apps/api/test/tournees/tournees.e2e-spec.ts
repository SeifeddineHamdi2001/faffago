import type { ParcelLocation, ParcelStatus, Prisma } from '@prisma/client';
import { seed } from '../../prisma/seed';
import { createTestApp, createUser, login, type Fixture, type TestApp } from '../support/test-app';
import { createParcel } from '../support/work-fixtures';

/**
 * Tournées (Admin 4.5, D-52, D-55): the parcels at the depot due today, in
 * their zone's column under the livreur covering the zone today; manual moves
 * to another courier, written as AFFECTATION_LIVREUR events the seller never
 * reads; each courier's load before dispatch. Admin and Dépôt.
 */

let t: TestApp;
let depot: Fixture;
let depotToken: string;
let seller: Fixture;
let ali: Fixture;
let sami: Fixture;
let karim: Fixture;
let walid: Fixture;
let marsaZone: string;
let bardoZone: string;

const ADMIN = { username: 'admin', password: 'Mot-De-Passe-Admin-42' };
// The test clock: 2026-09-25T08:00Z, 09:00 in Tunis.
const TODAY = '2026-09-25';

async function placeIn(code: string) {
  const delegation = await t.prisma.delegation.findUniqueOrThrow({ where: { code } });
  const localite = await t.prisma.localite.findFirstOrThrow({
    where: { delegationId: delegation.id, isOther: false },
    orderBy: { nameFr: 'asc' },
  });
  return { delegationId: delegation.id, localiteId: localite.id, zoneId: delegation.zoneId };
}

async function named(firstName: string, role: 'LIVREUR' | 'RAMASSEUR' = 'LIVREUR') {
  const user = await createUser(t.prisma, { role });
  await t.prisma.user.update({ where: { id: user.id }, data: { firstName, lastName: 'Test' } });
  return user;
}

async function assign(zoneId: string, kind: 'TITULAIRE' | 'BACKUP', courier: Fixture) {
  await t.prisma.zoneAssignment.create({
    data: { zoneId, courierId: courier.courierId!, role: 'LIVREUR', kind },
  });
}

beforeAll(async () => {
  t = await createTestApp();
  await seed(t.prisma, { log: () => undefined, adminPassword: ADMIN.password });
  depot = await createUser(t.prisma, { role: 'DEPOT', username: 'tour.depot' });
  seller = await createUser(t.prisma, { role: 'VENDEUR', email: 'tour@boutique.tn' });
  ali = await named('Ali');
  sami = await named('Sami');
  karim = await named('Karim');
  walid = await named('Walid');
  marsaZone = (await placeIn('TUN-MARSA')).zoneId!;
  bardoZone = (await placeIn('TUN-BARDO')).zoneId!;
  await assign(marsaZone, 'TITULAIRE', ali);
  await assign(marsaZone, 'BACKUP', sami);
  await assign(bardoZone, 'TITULAIRE', karim);
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  t.throttle.clear();
  depotToken = (await login(t, depot)).accessToken;
  // Each test starts with an empty depot and nobody absent.
  await t.prisma.parcel.updateMany({
    where: { location: 'AU_DEPOT' },
    data: { plannedLivreurId: null },
  });
  await t.prisma.courierAbsence.deleteMany();
});

let made: string[] = [];
afterEach(async () => {
  // Parcels leave the depot the only way a fixture can: by a new event (D-21).
  for (const id of made) {
    await t.prisma.$transaction(async (tx) => {
      const p = await tx.parcel.update({
        where: { id },
        data: { status: 'LIVRE', location: 'CHEZ_LE_CLIENT', plannedLivreurId: null },
      });
      await tx.parcelEvent.create({
        data: {
          parcelId: p.id,
          type: 'FORCAGE_STATUT',
          newStatus: 'LIVRE',
          newLocation: 'CHEZ_LE_CLIENT',
          actorUserId: seller.id,
        },
      });
    });
  }
  made = [];
});

async function parcel(input: {
  in: string;
  status?: ParcelStatus;
  location?: ParcelLocation;
  extra?: Partial<Prisma.ParcelUncheckedCreateInput>;
}) {
  const where = await placeIn(input.in);
  const id = await createParcel(t.prisma, {
    sellerId: seller.sellerId!,
    createdByUserId: seller.id,
    status: input.status ?? 'AU_DEPOT',
    location: input.location ?? 'AU_DEPOT',
    where: { delegationId: where.delegationId, localiteId: where.localiteId },
    extra: input.extra,
  });
  made.push(id);
  return t.prisma.parcel.findUniqueOrThrow({ where: { id } });
}

function relance(day: string): Partial<Prisma.ParcelUncheckedCreateInput> {
  return {
    relaunchDate: new Date(`${day}T00:00:00.000Z`),
    relaunchSlot: 'MATIN',
    relaunchOrigin: 'VENDEUR',
    attemptCount: 1,
  };
}

async function tournees(token = depotToken) {
  const response = await t.request('GET', '/tournees', { token });
  expect(response.status).toBe(200);
  return response.body;
}

interface ZoneColumn {
  id: string;
  name: string;
  livreur: { id: string; firstName: string } | null;
  livreurKind: string | null;
  parcels: Array<{ code: string; plannedLivreur: { id: string } | null; moved: boolean }>;
}

function column(body: { zones: ZoneColumn[] }, zoneId: string) {
  return body.zones.find((z) => z.id === zoneId);
}

function codes(col: { parcels: Array<{ code: string }> } | undefined) {
  return (col?.parcels ?? []).map((p) => p.code).sort();
}

describe('GET /tournees (Admin 4.5)', () => {
  it('puts each parcel due today in its zone, under the livreur covering it', async () => {
    const atDepot = await parcel({ in: 'TUN-MARSA' });
    const dueToday = await parcel({ in: 'TUN-MARSA', status: 'RELANCE', extra: relance(TODAY) });
    const overdue = await parcel({
      in: 'TUN-MARSA',
      status: 'RELANCE',
      extra: relance('2026-09-23'),
    });
    const tomorrow = await parcel({
      in: 'TUN-MARSA',
      status: 'RELANCE',
      extra: relance('2026-09-26'),
    });
    const bardo = await parcel({ in: 'TUN-BARDO' });
    // Not ready to go out.
    await parcel({ in: 'TUN-MARSA', status: 'A_VERIFIER', location: 'AU_DEPOT' });
    await parcel({ in: 'TUN-MARSA', status: 'RAMASSE', location: 'AVEC_LE_RAMASSEUR' });

    const body = await tournees();

    expect(body.date).toBe(TODAY);
    const marsa = column(body, marsaZone)!;
    expect(marsa).toMatchObject({
      livreur: { id: ali.id, firstName: 'Ali', lastName: 'Test' },
      livreurKind: 'TITULAIRE',
    });
    expect(codes(marsa)).toEqual([atDepot.code, dueToday.code, overdue.code].sort());
    expect(codes(marsa)).not.toContain(tomorrow.code);
    expect(marsa.parcels.find((p) => p.code === dueToday.code)).toMatchObject({
      status: 'RELANCE',
      relaunchDate: TODAY,
      relaunchSlot: 'MATIN',
      attemptCount: 1,
      delegationNameFr: 'La Marsa',
      localiteNameFr: expect.any(String),
      shopName: 'Boutique Test',
      plannedLivreur: { id: ali.id },
      moved: false,
    });
    expect(codes(column(body, bardoZone))).toEqual([bardo.code]);
  });

  it('lists only the zones that have parcels to go out', async () => {
    await parcel({ in: 'TUN-MARSA' });
    const body = await tournees();
    expect(body.zones.map((z: ZoneColumn) => z.id)).toEqual([marsaZone]);
  });

  it('switches to the backup livreur when the titular is absent today (D-52)', async () => {
    await parcel({ in: 'TUN-MARSA' });
    await t.prisma.courierAbsence.create({
      data: {
        courierId: ali.courierId!,
        date: new Date(`${TODAY}T00:00:00.000Z`),
        createdByUserId: depot.id,
      },
    });
    const marsa = column(await tournees(), marsaZone)!;
    expect(marsa).toMatchObject({ livreur: { id: sami.id }, livreurKind: 'BACKUP' });
  });

  it('shows a zone nobody covers as Sans coursier, and a délégation without zone as Sans zone', async () => {
    const nobody = await parcel({ in: 'BEN-EZZAHRA' });
    const kram = await t.prisma.delegation.findUniqueOrThrow({ where: { code: 'TUN-KRAM' } });
    await t.prisma.delegation.update({ where: { id: kram.id }, data: { zoneId: null } });
    try {
      const noZone = await parcel({ in: 'TUN-KRAM' });
      const body = await tournees();

      const ezzahra = column(body, (await placeIn('BEN-EZZAHRA')).zoneId!)!;
      expect(ezzahra).toMatchObject({ livreur: null, livreurKind: null });
      expect(codes(ezzahra)).toEqual([nobody.code]);
      expect(body.sansZone.map((p: { code: string }) => p.code)).toEqual([noZone.code]);
      expect(body.withoutCourier).toBe(2);
    } finally {
      await t.prisma.delegation.update({ where: { id: kram.id }, data: { zoneId: kram.zoneId } });
    }
  });

  it('gives each courier’s load before dispatch', async () => {
    await parcel({ in: 'TUN-MARSA' });
    await parcel({ in: 'TUN-MARSA' });
    await parcel({ in: 'TUN-BARDO' });
    const body = await tournees();
    expect(body.loads).toEqual([
      { courier: { id: ali.id, firstName: 'Ali', lastName: 'Test' }, count: 2 },
      { courier: { id: karim.id, firstName: 'Karim', lastName: 'Test' }, count: 1 },
    ]);
    expect(body.withoutCourier).toBe(0);
  });

  it('is for the admin and the depot only', async () => {
    const sc = await createUser(t.prisma, { role: 'SERVICE_CLIENT', username: 'tour.sc' });
    for (const user of [sc, seller]) {
      const response = await t.request('GET', '/tournees', {
        token: (await login(t, user)).accessToken,
      });
      expect(response.status).toBe(403);
    }
    const adminToken = (await t.request('POST', '/auth/login/staff', { body: ADMIN })).body
      .accessToken;
    expect((await t.request('GET', '/tournees', { token: adminToken })).status).toBe(200);
  });
});

describe('POST /tournees/moves (D-55)', () => {
  function move(parcelIds: string[], courierId: string | null, token = depotToken) {
    return t.request('POST', '/tournees/moves', { token, body: { parcelIds, courierId } });
  }

  it('moves parcels to another courier: his load, an AFFECTATION_LIVREUR event each', async () => {
    const a = await parcel({ in: 'TUN-MARSA' });
    const b = await parcel({ in: 'TUN-MARSA' });

    const response = await move([a.id, b.id], karim.id);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ moved: 2 });
    expect(
      (await t.prisma.parcel.findUniqueOrThrow({ where: { id: a.id } })).plannedLivreurId,
    ).toBe(karim.courierId);
    const body = await tournees();
    const marsa = column(body, marsaZone)!;
    // The parcel stays in its zone's column, planned for Karim.
    expect(marsa.parcels.find((p) => p.code === a.code)).toMatchObject({
      plannedLivreur: { id: karim.id },
      moved: true,
    });
    expect(body.loads).toEqual([
      { courier: { id: karim.id, firstName: 'Karim', lastName: 'Test' }, count: 2 },
    ]);

    const [event] = await t.prisma.parcelEvent.findMany({
      where: { parcelId: a.id, type: 'AFFECTATION_LIVREUR' },
    });
    expect(event).toMatchObject({
      previousStatus: 'AU_DEPOT',
      newStatus: 'AU_DEPOT',
      previousLocation: 'AU_DEPOT',
      newLocation: 'AU_DEPOT',
      actorUserId: depot.id,
      actorRole: 'DEPOT',
      metadata: { livreurPrevu: karim.courierId },
    });
  });

  it('puts parcels back under their zone’s livreur with null', async () => {
    const a = await parcel({ in: 'TUN-MARSA' });
    await move([a.id], karim.id);
    expect((await move([a.id], null)).body).toEqual({ moved: 1 });

    expect(
      (await t.prisma.parcel.findUniqueOrThrow({ where: { id: a.id } })).plannedLivreurId,
    ).toBeNull();
    const marsa = column(await tournees(), marsaZone)!;
    expect(marsa.parcels[0]).toMatchObject({ plannedLivreur: { id: ali.id }, moved: false });
  });

  it('writes nothing for a parcel already planned for that courier', async () => {
    const a = await parcel({ in: 'TUN-MARSA' });
    await move([a.id], karim.id);
    expect((await move([a.id], karim.id)).body).toEqual({ moved: 0 });
    expect(
      await t.prisma.parcelEvent.count({ where: { parcelId: a.id, type: 'AFFECTATION_LIVREUR' } }),
    ).toBe(1);
  });

  it('never shows the planning on the seller’s timeline', async () => {
    const a = await parcel({ in: 'TUN-MARSA' });
    await move([a.id], karim.id);
    const response = await t.request('GET', `/parcels/${a.code}`, {
      token: (await login(t, seller)).accessToken,
    });
    expect(response.status).toBe(200);
    expect(response.body.timeline.map((e: { type: string }) => e.type)).not.toContain(
      'AFFECTATION_LIVREUR',
    );
  });

  it('refuses the whole move when one parcel is not waiting for a tour', async () => {
    const a = await parcel({ in: 'TUN-MARSA' });
    const waiting = await parcel({ in: 'TUN-MARSA', status: 'A_VERIFIER', location: 'AU_DEPOT' });
    const later = await parcel({
      in: 'TUN-MARSA',
      status: 'RELANCE',
      extra: relance('2026-09-27'),
    });

    const response = await move([a.id, waiting.id, later.id], karim.id);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: 'COLIS_HORS_TOURNEE',
      codes: [waiting.code, later.code].sort(),
    });
    expect(
      (await t.prisma.parcel.findUniqueOrThrow({ where: { id: a.id } })).plannedLivreurId,
    ).toBeNull();
  });

  it('refuses a parcel that does not exist', async () => {
    const response = await move(['00000000-0000-4000-8000-000000000000'], karim.id);
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('COLIS_HORS_TOURNEE');
  });

  it('refuses a courier who cannot go out today, and a ramasseur (D-53)', async () => {
    const a = await parcel({ in: 'TUN-MARSA' });
    await t.prisma.courierAbsence.create({
      data: {
        courierId: walid.courierId!,
        date: new Date(`${TODAY}T00:00:00.000Z`),
        createdByUserId: depot.id,
      },
    });
    const hedi = await named('Hédi', 'RAMASSEUR');
    for (const courier of [walid, hedi]) {
      const response = await move([a.id], courier.id);
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('COURSIER_INDISPONIBLE');
    }
  });

  it('is for the admin and the depot only', async () => {
    const a = await parcel({ in: 'TUN-MARSA' });
    const sc = await createUser(t.prisma, { role: 'SERVICE_CLIENT', username: 'tour.sc2' });
    const response = await move([a.id], karim.id, (await login(t, sc)).accessToken);
    expect(response.status).toBe(403);
  });
});

describe('the Coursiers list: today’s parcels (D-11)', () => {
  it('gives each livreur the parcels he carries and those planned for him', async () => {
    await parcel({ in: 'TUN-MARSA' });
    await parcel({ in: 'TUN-MARSA' });
    await parcel({
      in: 'TUN-BARDO',
      status: 'EN_LIVRAISON',
      location: 'AVEC_LE_LIVREUR',
      extra: { currentLivreurId: ali.courierId! },
    });

    const response = await t.request('GET', '/accounts/couriers', { token: depotToken });
    const row = response.body.find((r: { id: string }) => r.id === ali.id);
    expect(row.parcelsToday).toEqual({ withHim: 1, planned: 2 });
    const hedi = response.body.find((r: { role: string }) => r.role === 'RAMASSEUR');
    expect(hedi?.parcelsToday ?? null).toBeNull();
  });
});
