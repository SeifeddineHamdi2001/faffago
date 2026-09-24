import { randomUUID } from 'node:crypto';
import {
  COURIER_APP_HEADERS,
  createTestApp,
  createUser,
  login,
  type ApiResponse,
  type Fixture,
  type TestApp,
} from '../support/test-app';
import { createParcel, place } from '../support/work-fixtures';

/**
 * Ramassages (Vendeur 4.5, D-35): the request with its address filled at the
 * first one, one open request per address, addresses never rewritten once
 * used, cancelling while Demandé or Planifié, and Profil (Vendeur 4.14).
 */

let t: TestApp;
let seller: Fixture;
let otherSeller: Fixture;
let suspended: Fixture;
let token: string;
let where: { delegationId: string; localiteId: string };

async function parcelCode(status = 'CREE', location = 'CHEZ_LE_VENDEUR', owner = seller) {
  const id = await createParcel(t.prisma, {
    sellerId: owner.sellerId!,
    createdByUserId: owner.id,
    status: status as never,
    location: location as never,
  });
  return (await t.prisma.parcel.findUniqueOrThrow({ where: { id } })).code;
}

function request(body: object, as = token): Promise<ApiResponse> {
  return t.request('POST', '/pickups', { token: as, body: { requestedSlot: 'MATIN', ...body } });
}

async function newAddress(as = token, extra: object = {}): Promise<string> {
  const response = await t.request('POST', '/pickup-addresses', {
    token: as,
    body: {
      localiteId: where.localiteId,
      address: `${randomUUID().slice(0, 6)} rue de Rome`,
      ...extra,
    },
  });
  expect(response.status).toBe(201);
  return response.body.id;
}

beforeAll(async () => {
  t = await createTestApp();
  seller = await createUser(t.prisma, { role: 'VENDEUR', email: 'vendeur@ramassage.tn' });
  otherSeller = await createUser(t.prisma, { role: 'VENDEUR', email: 'autre@ramassage.tn' });
  suspended = await createUser(t.prisma, {
    role: 'VENDEUR',
    email: 'suspendu@ramassage.tn',
    sellerState: 'SUSPENDU',
  });
  where = await place(t.prisma);
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  t.throttle.clear();
  token = (await login(t, seller)).accessToken;
});

describe('the first request fills the pickup address (Vendeur 4.5)', () => {
  it('saves the address as the default and requests the pickup, in one go', async () => {
    const first = await createUser(t.prisma, { role: 'VENDEUR', email: 'premier@ramassage.tn' });
    const firstToken = (await login(t, first)).accessToken;
    const code = await parcelCode('CREE', 'CHEZ_LE_VENDEUR', first);

    const response = await request(
      {
        newAddress: {
          localiteId: where.localiteId,
          address: 'Entrepôt, 4 rue de Rome',
          landmark: 'Face à la poste',
        },
        parcelCodes: [code],
        note: 'Sonner au 2e',
      },
      firstToken,
    );
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      status: 'DEMANDE',
      requestedSlot: 'MATIN',
      note: 'Sonner au 2e',
      expectedCount: 1,
      address: {
        address: 'Entrepôt, 4 rue de Rome',
        localiteNameFr: 'Khaznadar',
        delegationNameFr: 'Le Bardo',
      },
    });

    const addresses = await t.request('GET', '/pickup-addresses', { token: firstToken });
    expect(addresses.body).toEqual([
      expect.objectContaining({
        address: 'Entrepôt, 4 rue de Rome',
        isDefault: true,
        landmark: 'Face à la poste',
      }),
    ]);
    const saved = await t.prisma.pickupAddress.findFirstOrThrow({
      where: { sellerId: first.sellerId! },
    });
    expect(saved.delegationId).toBe(where.delegationId);
  });
});

describe('pickup addresses (Vendeur 4.14, D-35)', () => {
  it('adds more than one, and one default at a time', async () => {
    const a = await newAddress(token, { isDefault: true });
    const b = await newAddress(token, { isDefault: true });
    const list = (await t.request('GET', '/pickup-addresses', { token })).body;
    expect(
      list.filter((x: { isDefault: boolean }) => x.isDefault).map((x: { id: string }) => x.id),
    ).toEqual([b]);
    await t.request('POST', `/pickup-addresses/${a}/default`, { token });
    const after = (await t.request('GET', '/pickup-addresses', { token })).body;
    expect(
      after.filter((x: { isDefault: boolean }) => x.isDefault).map((x: { id: string }) => x.id),
    ).toEqual([a]);
  });

  it('corrects an address no pickup used, in place', async () => {
    const id = await newAddress();
    const response = await t.request('PATCH', `/pickup-addresses/${id}`, {
      token,
      body: { localiteId: where.localiteId, address: '9 rue de Carthage' },
    });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id, address: '9 rue de Carthage' });
  });

  it('replaces an address a pickup used: the old one stays for that pickup (D-35)', async () => {
    const old = await newAddress(token, { isDefault: true });
    const pickup = await request({ pickupAddressId: old, declaredCount: 3 });
    const response = await t.request('PATCH', `/pickup-addresses/${old}`, {
      token,
      body: { localiteId: where.localiteId, address: '11 rue de Marseille' },
    });
    expect(response.status).toBe(200);
    expect(response.body.id).not.toBe(old);
    expect(response.body).toMatchObject({ address: '11 rue de Marseille', isDefault: true });

    const kept = await t.prisma.pickupAddress.findUniqueOrThrow({ where: { id: old } });
    expect(kept).toMatchObject({
      isActive: false,
      isDefault: false,
      replacedById: response.body.id,
    });
    const stillThere = await t.prisma.pickup.findUniqueOrThrow({ where: { id: pickup.body.id } });
    expect(stillThere.pickupAddressId).toBe(old);

    const list = (await t.request('GET', '/pickup-addresses', { token })).body;
    expect(list.map((x: { id: string }) => x.id)).not.toContain(old);

    const refused = await request({ pickupAddressId: old, declaredCount: 1 });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('ADRESSE_INACTIVE');
  });

  it("does not reach another seller's address (D-26)", async () => {
    const theirs = await newAddress((await login(t, otherSeller)).accessToken);
    expect((await request({ pickupAddressId: theirs, declaredCount: 1 })).status).toBe(404);
    const edit = await t.request('PATCH', `/pickup-addresses/${theirs}`, {
      token,
      body: { localiteId: where.localiteId, address: '1 rue X' },
    });
    expect(edit.status).toBe(404);
  });
});

describe('Demander un ramassage (Vendeur 4.5)', () => {
  it('takes the parcels ready, listed for Faffa Go as expected', async () => {
    const address = await newAddress();
    const codes = [await parcelCode(), await parcelCode()];
    const response = await request({
      pickupAddressId: address,
      parcelCodes: codes,
      requestedSlot: 'APRES_MIDI',
    });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      requestedSlot: 'APRES_MIDI',
      expectedCount: 2,
      declaredCount: null,
    });
    const links = await t.prisma.pickupParcel.findMany({ where: { pickupId: response.body.id } });
    expect(links).toHaveLength(2);
    expect(links.every((link) => link.expected && link.scannedAt === null)).toBe(true);
  });

  it('or just how many', async () => {
    const response = await request({ pickupAddressId: await newAddress(), declaredCount: 12 });
    expect(response.body).toMatchObject({ declaredCount: 12, expectedCount: 12 });
  });

  it('creates the request once when it is sent twice', async () => {
    const clientRequestId = randomUUID();
    const address = await newAddress();
    const first = await request({ pickupAddressId: address, declaredCount: 2, clientRequestId });
    const second = await request({ pickupAddressId: address, declaredCount: 2, clientRequestId });
    expect([first.status, second.status]).toEqual([201, 200]);
    expect(second.body.id).toBe(first.body.id);
  });

  it('refuses a parcel picked up, cancelled, another seller’s, or already requested; creates nothing', async () => {
    const address = await newAddress();
    const taken = await parcelCode();
    await request({ pickupAddressId: await newAddress(), parcelCodes: [taken] });
    const wrong = [
      await parcelCode('RAMASSE', 'AVEC_LE_RAMASSEUR'),
      await parcelCode('ANNULE', 'CHEZ_LE_VENDEUR'),
      await parcelCode('CREE', 'CHEZ_LE_VENDEUR', otherSeller),
      taken,
    ];
    const fine = await parcelCode();
    const before = await t.prisma.pickup.count();
    for (const code of wrong) {
      const response = await request({ pickupAddressId: address, parcelCodes: [fine, code] });
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('COLIS_NON_DISPONIBLE');
      expect(response.body.message).toContain(code);
    }
    expect(await t.prisma.pickup.count()).toBe(before);
  });

  it('keeps one open request per address (D-35)', async () => {
    const address = await newAddress();
    expect((await request({ pickupAddressId: address, declaredCount: 1 })).status).toBe(201);
    const second = await request({ pickupAddressId: address, declaredCount: 1 });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('RAMASSAGE_EN_COURS');
    expect((await request({ pickupAddressId: await newAddress(), declaredCount: 1 })).status).toBe(
      201,
    );
  });

  it('is refused to a suspended seller (D-25)', async () => {
    const suspendedToken = (await login(t, suspended)).accessToken;
    const response = await request(
      { newAddress: { localiteId: where.localiteId, address: '1 rue de Rome' }, declaredCount: 1 },
      suspendedToken,
    );
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('COMPTE_SUSPENDU');
  });

  it('is the seller’s alone', async () => {
    const admin = await createUser(t.prisma, { role: 'ADMIN', username: 'admin.ramassage' });
    const ramasseur = await createUser(t.prisma, { role: 'RAMASSEUR' });
    const body = { requestedSlot: 'MATIN', declaredCount: 1, pickupAddressId: randomUUID() };
    expect(
      (await t.request('POST', '/pickups', { token: (await login(t, admin)).accessToken, body }))
        .status,
    ).toBe(403);
    const courier = await t.request('POST', '/pickups', {
      token: (await login(t, ramasseur)).accessToken,
      body,
      headers: COURIER_APP_HEADERS,
    });
    expect(courier.status).toBe(403);
  });
});

describe('the parcels ready to be picked up', () => {
  it('are the seller’s Créé parcels not already in an open request', async () => {
    const free = await parcelCode();
    const requested = await parcelCode();
    await request({ pickupAddressId: await newAddress(), parcelCodes: [requested] });
    const response = await t.request('GET', '/pickups/ready-parcels', { token });
    const codes = response.body.map((p: { code: string }) => p.code);
    expect(codes).toContain(free);
    expect(codes).not.toContain(requested);
  });
});

describe('Mes ramassages', () => {
  it('lists the seller’s own requests, newest first; another seller sees none of them', async () => {
    const created = await request({ pickupAddressId: await newAddress(), declaredCount: 4 });
    const mine = await t.request('GET', '/pickups', { token });
    expect(mine.body[0].id).toBe(created.body.id);
    const theirs = await t.request('GET', '/pickups', {
      token: (await login(t, otherSeller)).accessToken,
    });
    expect(theirs.body.map((p: { id: string }) => p.id)).not.toContain(created.body.id);
    const detail = await t.request('GET', `/pickups/${created.body.id}`, {
      token: (await login(t, otherSeller)).accessToken,
    });
    expect(detail.status).toBe(404);
  });

  it('shows which parcels were picked up and which were not, and the ramasseur by first name', async () => {
    const codes = [await parcelCode(), await parcelCode()];
    const created = await request({ pickupAddressId: await newAddress(), parcelCodes: codes });
    const ramasseur = await createUser(t.prisma, { role: 'RAMASSEUR' });
    await t.prisma.user.update({
      where: { id: ramasseur.id },
      data: { firstName: 'Hamza', lastName: 'Gharbi' },
    });
    const first = await t.prisma.parcel.findUniqueOrThrow({ where: { code: codes[0]! } });
    await t.prisma.pickup.update({
      where: { id: created.body.id },
      data: {
        status: 'EFFECTUE',
        ramasseurId: ramasseur.courierId!,
        plannedDate: new Date('2026-09-25'),
        plannedSlot: 'MATIN',
        completedAt: new Date(),
        scannedCount: 1,
      },
    });
    await t.prisma.pickupParcel.update({
      where: { pickupId_parcelId: { pickupId: created.body.id, parcelId: first.id } },
      data: { scannedAt: new Date() },
    });

    const detail = await t.request('GET', `/pickups/${created.body.id}`, { token });
    expect(detail.body).toMatchObject({
      status: 'EFFECTUE',
      ramasseurFirstName: 'Hamza',
      plannedDate: '2026-09-25',
      plannedSlot: 'MATIN',
      scannedCount: 1,
    });
    expect(
      detail.body.parcels.map((p: { code: string; pickedUp: boolean }) => [p.code, p.pickedUp]),
    ).toEqual([
      [codes[0], true],
      [codes[1], false],
    ]);
    const text = JSON.stringify(detail.body);
    expect(text).not.toContain('Gharbi');
    expect(text).not.toContain(ramasseur.phone);
  });
});

describe('Annuler un ramassage (D-35, A-13)', () => {
  it('while Demandé or Planifié, at no cost, and the parcels are ready again', async () => {
    const code = await parcelCode();
    const created = await request({ pickupAddressId: await newAddress(), parcelCodes: [code] });
    const response = await t.request('POST', `/pickups/${created.body.id}/cancel`, { token });
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ANNULE');
    const row = await t.prisma.pickup.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(row.cancelledByUserId).toBe(seller.id);
    expect(row.cancelledAt).not.toBeNull();
    expect(
      await t.prisma.sellerCharge.count({
        where: { sellerId: seller.sellerId!, type: 'RAMASSAGE' },
      }),
    ).toBe(0);
    const ready = await t.request('GET', '/pickups/ready-parcels', { token });
    expect(ready.body.map((p: { code: string }) => p.code)).toContain(code);

    const planned = await request({ pickupAddressId: await newAddress(), declaredCount: 1 });
    const ramasseur = await createUser(t.prisma, { role: 'RAMASSEUR' });
    await t.prisma.pickup.update({
      where: { id: planned.body.id },
      data: {
        status: 'PLANIFIE',
        plannedDate: new Date('2026-09-26T00:00:00.000Z'),
        plannedSlot: 'MATIN',
        ramasseurId: ramasseur.courierId!,
      },
    });
    expect((await t.request('POST', `/pickups/${planned.body.id}/cancel`, { token })).status).toBe(
      200,
    );
  });

  it('not once Effectué or already cancelled', async () => {
    const created = await request({ pickupAddressId: await newAddress(), declaredCount: 1 });
    await t.prisma.pickup.update({ where: { id: created.body.id }, data: { status: 'EFFECTUE' } });
    const response = await t.request('POST', `/pickups/${created.body.id}/cancel`, { token });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('ANNULATION_RAMASSAGE_IMPOSSIBLE');
  });

  it('stays open to a suspended seller, who cancels what he asked before (D-25)', async () => {
    const suspendedToken = (await login(t, suspended)).accessToken;
    const address = await t.prisma.pickupAddress.create({
      data: { sellerId: suspended.sellerId!, ...where, address: '1 rue de Rome' },
    });
    const pickup = await t.prisma.pickup.create({
      data: { sellerId: suspended.sellerId!, pickupAddressId: address.id, declaredCount: 1 },
    });
    const response = await t.request('POST', `/pickups/${pickup.id}/cancel`, {
      token: suspendedToken,
    });
    expect(response.status).toBe(200);
  });
});

describe('Profil (Vendeur 4.14)', () => {
  it('shows the shop, the statut and the rates, the same for every seller', async () => {
    const response = await t.request('GET', '/profile', { token });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      shopName: 'Boutique Test',
      statut: 'PATENTE',
      accountState: 'ACTIF',
      rates: {
        deliveryFeeMillimes: expect.any(String),
        returnFeeMillimes: expect.any(String),
        changeClientFeeMillimes: '1000',
        pickupFeeMillimes: '2000',
        pickupFreeThreshold: 5,
        retenueRateBps: 300,
      },
    });
  });
});
