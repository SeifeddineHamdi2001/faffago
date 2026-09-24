import { seed } from '../../prisma/seed';
import { createTestApp, createUser, login, type Fixture, type TestApp } from '../support/test-app';
import { createBonRetour, createBonVersement, createParcel } from '../support/work-fixtures';

/**
 * Ramassages, the team's side (Admin 4.4, A-14, D-52, D-58): the requests
 * sellers made, planned with a day, a window and a ramasseur pre-filled with
 * the one covering the zone of the pickup's address that day; re-planned
 * while planned; never cancelled by the team; À emporter, the bons ready for
 * that seller. Admin and Dépôt.
 */

let t: TestApp;
let depot: Fixture;
let depotToken: string;
let seller: Fixture;
let sellerToken: string;
let otherSeller: Fixture;
let hedi: Fixture;
let karim: Fixture;
let marsaZone: string;

const ADMIN = { username: 'admin', password: 'Mot-De-Passe-Admin-42' };
// The test clock: 2026-09-25T08:00Z, 09:00 in Tunis.
const TODAY = '2026-09-25';
const TOMORROW = '2026-09-26';

async function named(firstName: string, role: 'LIVREUR' | 'RAMASSEUR' = 'RAMASSEUR') {
  const user = await createUser(t.prisma, { role });
  await t.prisma.user.update({ where: { id: user.id }, data: { firstName, lastName: 'Test' } });
  return user;
}

async function localiteIn(code: string) {
  const delegation = await t.prisma.delegation.findUniqueOrThrow({ where: { code } });
  return t.prisma.localite.findFirstOrThrow({
    where: { delegationId: delegation.id, isOther: false },
    orderBy: { nameFr: 'asc' },
  });
}

let addressCounter = 0;
/** A request made by the seller, through his own API, at a new address. */
async function request(
  input: { in?: string; declaredCount?: number; parcelCodes?: string[]; note?: string } = {},
) {
  addressCounter += 1;
  const localite = await localiteIn(input.in ?? 'TUN-MARSA');
  const response = await t.request('POST', '/pickups', {
    token: sellerToken,
    body: {
      newAddress: { localiteId: localite.id, address: `${addressCounter} rue de la Plage` },
      ...(input.parcelCodes
        ? { parcelCodes: input.parcelCodes }
        : { declaredCount: input.declaredCount ?? 3 }),
      requestedSlot: 'APRES_MIDI',
      note: input.note ?? null,
    },
  });
  expect(response.status).toBe(201);
  return response.body.id as string;
}

function plan(id: string, body: Record<string, unknown>, token = depotToken) {
  return t.request('POST', `/ramassages/${id}/plan`, { token, body });
}

async function absent(courier: Fixture, day: string) {
  await t.prisma.courierAbsence.create({
    data: {
      courierId: courier.courierId!,
      date: new Date(`${day}T00:00:00.000Z`),
      createdByUserId: depot.id,
    },
  });
}

beforeAll(async () => {
  t = await createTestApp();
  await seed(t.prisma, { log: () => undefined, adminPassword: ADMIN.password });
  depot = await createUser(t.prisma, { role: 'DEPOT', username: 'ram.depot' });
  seller = await createUser(t.prisma, { role: 'VENDEUR', email: 'ram@boutique.tn' });
  otherSeller = await createUser(t.prisma, {
    role: 'VENDEUR',
    email: 'autre@boutique.tn',
    shopName: 'Autre Boutique',
  });
  hedi = await named('Hédi');
  karim = await named('Karim');
  const marsa = await t.prisma.delegation.findUniqueOrThrow({ where: { code: 'TUN-MARSA' } });
  marsaZone = marsa.zoneId!;
  await t.prisma.zoneAssignment.createMany({
    data: [
      { zoneId: marsaZone, courierId: hedi.courierId!, role: 'RAMASSEUR', kind: 'TITULAIRE' },
      { zoneId: marsaZone, courierId: karim.courierId!, role: 'RAMASSEUR', kind: 'BACKUP' },
    ],
  });
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  t.throttle.clear();
  depotToken = (await login(t, depot)).accessToken;
  sellerToken = (await login(t, seller)).accessToken;
  await t.prisma.courierAbsence.deleteMany();
});

describe('GET /ramassages (Admin 4.4)', () => {
  it('lists the requests with the shop, the place, the zone and the ramasseur to pre-fill', async () => {
    const id = await request({ declaredCount: 4, note: 'Sonner deux fois' });

    const response = await t.request('GET', '/ramassages?status=DEMANDE', { token: depotToken });

    expect(response.status).toBe(200);
    const row = response.body.find((r: { id: string }) => r.id === id);
    expect(row).toMatchObject({
      status: 'DEMANDE',
      shopName: 'Boutique Test',
      contactPhone: seller.phone,
      address: {
        address: expect.stringContaining('rue de la Plage'),
        delegationNameFr: 'La Marsa',
        localiteNameFr: expect.any(String),
        zone: { id: marsaZone, name: expect.any(String) },
      },
      requestedSlot: 'APRES_MIDI',
      note: 'Sonner deux fois',
      expectedCount: 4,
      plannedDate: null,
      plannedSlot: null,
      ramasseur: null,
      suggestion: {
        ramasseur: { id: hedi.id, firstName: 'Hédi', lastName: 'Test' },
        kind: 'TITULAIRE',
      },
    });
  });

  it('filters by status', async () => {
    const id = await request();
    await plan(id, { date: TODAY, slot: 'MATIN', ramasseurId: hedi.id });
    const demandes = await t.request('GET', '/ramassages?status=DEMANDE', { token: depotToken });
    expect(demandes.body.map((r: { id: string }) => r.id)).not.toContain(id);
    const planned = await t.request('GET', '/ramassages?status=PLANIFIE', { token: depotToken });
    expect(planned.body.map((r: { id: string }) => r.id)).toContain(id);
  });

  it('refuses an unknown status', async () => {
    expect((await t.request('GET', '/ramassages?status=PERDU', { token: depotToken })).status).toBe(
      400,
    );
  });
});

describe('the ramasseur to pre-fill (A-14, D-52)', () => {
  function suggestion(id: string, date: string) {
    return t.request('GET', `/ramassages/${id}/suggestion?date=${date}`, { token: depotToken });
  }

  it('is the titular ramasseur of the address’s zone that day, else the backup', async () => {
    const id = await request();
    expect((await suggestion(id, TOMORROW)).body).toEqual({
      ramasseur: { id: hedi.id, firstName: 'Hédi', lastName: 'Test' },
      kind: 'TITULAIRE',
    });
    await absent(hedi, TOMORROW);
    expect((await suggestion(id, TOMORROW)).body).toEqual({
      ramasseur: { id: karim.id, firstName: 'Karim', lastName: 'Test' },
      kind: 'BACKUP',
    });
  });

  it('is nobody when the zone has no ramasseur who can work', async () => {
    const id = await request({ in: 'BEN-EZZAHRA' });
    expect((await suggestion(id, TOMORROW)).body).toEqual({ ramasseur: null, kind: null });
  });

  it('refuses an invalid day', async () => {
    const id = await request();
    expect((await suggestion(id, '26/09/2026')).status).toBe(400);
  });
});

describe('POST /ramassages/:id/plan (Admin 4.4, D-58)', () => {
  it('plans the request: the seller sees the ramasseur’s first name, the day and the window', async () => {
    const id = await request();

    const response = await plan(id, { date: TOMORROW, slot: 'MATIN', ramasseurId: hedi.id });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id,
      status: 'PLANIFIE',
      plannedDate: TOMORROW,
      plannedSlot: 'MATIN',
      ramasseur: { id: hedi.id, firstName: 'Hédi', lastName: 'Test' },
    });
    const row = await t.prisma.pickup.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ plannedByUserId: depot.id, plannedAt: t.clock.now() });

    const seen = await t.request('GET', `/pickups/${id}`, { token: sellerToken });
    expect(seen.body).toMatchObject({
      status: 'PLANIFIE',
      plannedDate: TOMORROW,
      plannedSlot: 'MATIN',
      ramasseurFirstName: 'Hédi',
    });
  });

  it('plans it again while planned: another day, another ramasseur', async () => {
    const id = await request();
    await plan(id, { date: TODAY, slot: 'MATIN', ramasseurId: hedi.id });
    const again = await plan(id, { date: TOMORROW, slot: 'APRES_MIDI', ramasseurId: karim.id });
    expect(again.body).toMatchObject({
      plannedDate: TOMORROW,
      plannedSlot: 'APRES_MIDI',
      ramasseur: { id: karim.id },
    });
  });

  it('refuses a past day', async () => {
    const id = await request();
    const response = await plan(id, { date: '2026-09-24', slot: 'MATIN', ramasseurId: hedi.id });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('DATE_PASSEE');
  });

  it('refuses a ramasseur absent that day, one who takes no work, and a livreur', async () => {
    const id = await request();
    await absent(hedi, TOMORROW);
    const stopped = await named('Nizar');
    await t.prisma.user.update({ where: { id: stopped.id }, data: { acceptsWork: false } });
    const livreur = await named('Ali', 'LIVREUR');

    for (const courier of [hedi, stopped, livreur]) {
      const response = await plan(id, { date: TOMORROW, slot: 'MATIN', ramasseurId: courier.id });
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('COURSIER_INDISPONIBLE');
    }
    // The same ramasseur can be planned on a day he works.
    expect((await plan(id, { date: TODAY, slot: 'MATIN', ramasseurId: hedi.id })).status).toBe(200);
  });

  it('refuses a pickup the seller cancelled, and one already done', async () => {
    const cancelled = await request();
    await t.request('POST', `/pickups/${cancelled}/cancel`, { token: sellerToken });
    const refused = await plan(cancelled, { date: TODAY, slot: 'MATIN', ramasseurId: hedi.id });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('RAMASSAGE_NON_PLANIFIABLE');

    const done = await request();
    await t.prisma.pickup.update({ where: { id: done }, data: { status: 'EFFECTUE' } });
    expect((await plan(done, { date: TODAY, slot: 'MATIN', ramasseurId: hedi.id })).body.code).toBe(
      'RAMASSAGE_NON_PLANIFIABLE',
    );
  });

  it('refuses an unknown pickup and an incomplete plan', async () => {
    const unknown = await plan('00000000-0000-4000-8000-000000000000', {
      date: TODAY,
      slot: 'MATIN',
      ramasseurId: hedi.id,
    });
    expect(unknown.status).toBe(404);
    const id = await request();
    expect((await plan(id, { date: TODAY, slot: 'MATIN' })).status).toBe(400);
  });

  it('gives the team no way to cancel a seller’s request (D-58)', async () => {
    const id = await request();
    const response = await t.request('POST', `/ramassages/${id}/cancel`, { token: depotToken });
    expect(response.status).toBe(404);
    const asStaff = await t.request('POST', `/pickups/${id}/cancel`, { token: depotToken });
    expect(asStaff.status).toBe(403);
  });
});

describe('GET /ramassages/:id: the parcels and À emporter (Admin 4.4)', () => {
  it('lists the parcels announced, and the bons ready for that seller only', async () => {
    const parcelId = await createParcel(t.prisma, {
      sellerId: seller.sellerId!,
      createdByUserId: seller.id,
    });
    const parcel = await t.prisma.parcel.findUniqueOrThrow({ where: { id: parcelId } });
    const id = await request({ parcelCodes: [parcel.code] });
    await createBonVersement(t.prisma, {
      sellerId: seller.sellerId!,
      ramasseurId: hedi.courierId!,
      preparedByUserId: depot.id,
      status: 'PREPARE',
    });
    await createBonVersement(t.prisma, {
      sellerId: seller.sellerId!,
      ramasseurId: hedi.courierId!,
      preparedByUserId: depot.id,
      status: 'EN_ROUTE',
    });
    await createBonRetour(t.prisma, {
      sellerId: seller.sellerId!,
      ramasseurId: hedi.courierId!,
      preparedByUserId: depot.id,
      status: 'PREPARE',
    });
    await createBonVersement(t.prisma, {
      sellerId: otherSeller.sellerId!,
      ramasseurId: hedi.courierId!,
      preparedByUserId: depot.id,
      status: 'PREPARE',
    });

    const response = await t.request('GET', `/ramassages/${id}`, { token: depotToken });

    expect(response.status).toBe(200);
    expect(response.body.parcels).toEqual([
      { code: parcel.code, recipientName: 'Client', status: 'CREE', pickedUp: false },
    ]);
    expect(response.body.aEmporter.bonsVersement).toEqual([
      { number: expect.stringMatching(/^BV-TEST-/), netMillimes: '78000' },
    ]);
    expect(response.body.aEmporter.bonsRetour).toEqual([
      { number: expect.stringMatching(/^BR-TEST-/), parcelCount: 1 },
    ]);
  });

  it('refuses an unknown pickup', async () => {
    const response = await t.request('GET', '/ramassages/00000000-0000-4000-8000-000000000000', {
      token: depotToken,
    });
    expect(response.status).toBe(404);
  });
});

describe('who plans pickups (Admin 2)', () => {
  it('is the admin or the depot, nobody else', async () => {
    const id = await request();
    const sc = await createUser(t.prisma, { role: 'SERVICE_CLIENT', username: 'ram.sc' });
    for (const token of [(await login(t, sc)).accessToken, sellerToken]) {
      expect((await t.request('GET', '/ramassages', { token })).status).toBe(403);
      expect(
        (await plan(id, { date: TODAY, slot: 'MATIN', ramasseurId: hedi.id }, token)).status,
      ).toBe(403);
    }
    const adminToken = (await t.request('POST', '/auth/login/staff', { body: ADMIN })).body
      .accessToken;
    expect(
      (await plan(id, { date: TODAY, slot: 'MATIN', ramasseurId: hedi.id }, adminToken)).status,
    ).toBe(200);
  });
});
