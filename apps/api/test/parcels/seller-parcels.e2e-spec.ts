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
 * The seller's parcels over HTTP (Vendeur 4.2, 4.6): Créer un colis,
 * Modifier and Annuler, Demander une modification. Every status change goes
 * through the parcel event service; another seller's parcel does not exist
 * (D-26); a suspended seller still edits and cancels (D-25).
 */

let t: TestApp;
let seller: Fixture;
let otherSeller: Fixture;
let suspended: Fixture;
let admin: Fixture;
let livreur: Fixture;
let token: string;
let bardo: { delegationId: string; localiteId: string };
let marsa: { delegationId: string; localiteId: string };
let closedLocaliteId: string;

const form = () => ({
  recipientName: 'Amira Ben Salah',
  recipientPhone: '29 876 543',
  recipientPhone2: null,
  localiteId: bardo.localiteId,
  address: '12 rue de Marseille',
  landmark: 'En face de la pharmacie',
  productDescription: '2 bracelets',
  pieceCount: 2,
  codAmountMillimes: '85,000',
  isExchange: false,
  openingAllowed: true,
  courierNote: 'Sonner deux fois',
});

beforeAll(async () => {
  t = await createTestApp();
  admin = await createUser(t.prisma, { role: 'ADMIN', username: 'admin.colis' });
  seller = await createUser(t.prisma, { role: 'VENDEUR', email: 'vendeur@colis.tn' });
  otherSeller = await createUser(t.prisma, { role: 'VENDEUR', email: 'autre@colis.tn' });
  suspended = await createUser(t.prisma, {
    role: 'VENDEUR',
    email: 'suspendu@colis.tn',
    sellerState: 'SUSPENDU',
  });
  livreur = await createUser(t.prisma, { role: 'LIVREUR' });

  bardo = await place(t.prisma);
  const tunis = await t.prisma.gouvernorat.findFirstOrThrow();
  const delegation = await t.prisma.delegation.create({
    data: { gouvernoratId: tunis.id, code: 'TUN-MARSA', nameFr: 'La Marsa', nameAr: 'المرسى' },
  });
  const sidiBou = await t.prisma.localite.create({
    data: { delegationId: delegation.id, nameFr: 'Sidi Bou Saïd', postalCode: '2026' },
  });
  marsa = { delegationId: delegation.id, localiteId: sidiBou.id };
  closedLocaliteId = (
    await t.prisma.localite.create({
      data: { delegationId: delegation.id, nameFr: 'Ancienne cité', isActive: false },
    })
  ).id;
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  t.throttle.clear();
  token = (await login(t, seller)).accessToken;
});

function create(body: unknown, as = token, headers: Record<string, string> = {}) {
  return t.request('POST', '/parcels', { token: as, body, headers });
}

async function created(): Promise<{ id: string; code: string }> {
  const response = await create(form());
  expect(response.status).toBe(201);
  return response.body;
}

/** A parcel of the seller already further along, written as the depot would leave it. */
async function parcelIn(status: string, location: string, owner = seller): Promise<string> {
  const id = await createParcel(t.prisma, {
    sellerId: owner.sellerId!,
    createdByUserId: owner.id,
    status: status as never,
    location: location as never,
    cashStatus: status === 'LIVRE' ? 'CHEZ_LE_COURSIER' : null,
  });
  return (await t.prisma.parcel.findUniqueOrThrow({ where: { id } })).code;
}

function events(parcelId: string) {
  return t.prisma.parcelEvent.findMany({ where: { parcelId }, orderBy: { serverTime: 'asc' } });
}

describe('Créer un colis (Vendeur 4.2)', () => {
  it('creates the parcel with its code, the fees frozen, and its CREATION event', async () => {
    const response = await create(form());
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      status: 'CREE',
      location: 'CHEZ_LE_VENDEUR',
      recipientName: 'Amira Ben Salah',
      recipientPhone: '29876543',
      codAmountMillimes: '85000',
      localite: { id: bardo.localiteId, nameFr: 'Khaznadar' },
      delegation: { id: bardo.delegationId, nameFr: 'Le Bardo', gouvernoratNameFr: 'Tunis' },
      changeRequests: [],
    });
    expect(response.body.code).toMatch(/^FG-[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(typeof response.body.deliveryFeeMillimes).toBe('string');
    expect((await events(response.body.id)).map((e) => e.type)).toEqual(['CREATION']);
  });

  it('creates it once when the same request comes twice', async () => {
    const clientRequestId = randomUUID();
    const first = await create({ ...form(), clientRequestId });
    const second = await create({ ...form(), clientRequestId });
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.code).toBe(first.body.code);
    expect(await t.prisma.parcel.count({ where: { clientRequestId } })).toBe(1);
  });

  it("refuses another seller's request id without showing his parcel", async () => {
    const clientRequestId = randomUUID();
    await create({ ...form(), clientRequestId });
    const other = await create(
      { ...form(), clientRequestId },
      (await login(t, otherSeller)).accessToken,
    );
    expect(other.status).toBe(409);
    expect(other.body.code).toBe('REQUETE_DEJA_UTILISEE');
    expect(JSON.stringify(other.body)).not.toContain('FG-');
  });

  it('refuses a malformed form with the field at fault', async () => {
    const response = await create({ ...form(), recipientPhone: '1234' });
    expect(response.status).toBe(400);
    expect(response.body.issues[0].path).toBe('recipientPhone');
  });

  it('refuses a deactivated localité (D-27) and a suspended seller (D-25)', async () => {
    const closed = await create({ ...form(), localiteId: closedLocaliteId });
    expect(closed.body.code).toBe('LOCALITE_INACTIVE');
    const response = await create(form(), (await login(t, suspended)).accessToken);
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('COMPTE_SUSPENDU');
  });

  it('is the seller’s alone: staff, couriers and "Voir comme le vendeur" are refused', async () => {
    expect((await create(form(), (await login(t, admin)).accessToken)).status).toBe(403);
    expect(
      (await create(form(), (await login(t, livreur)).accessToken, COURIER_APP_HEADERS)).status,
    ).toBe(403);
    const adminToken = (await login(t, admin)).accessToken;
    const started = await t.request('POST', '/auth/impersonation', {
      token: adminToken,
      body: { sellerId: seller.sellerId },
    });
    expect((await create(form(), started.body.impersonationToken)).status).toBe(403);
  });
});

describe('reading a parcel', () => {
  it('shows the seller his parcel by code', async () => {
    const { code } = await created();
    const response = await t.request('GET', `/parcels/${code}`, { token });
    expect(response.status).toBe(200);
    expect(response.body.code).toBe(code);
  });

  it('accepts the code typed loosely', async () => {
    const { code } = await created();
    const response = await t.request('GET', `/parcels/${code.toLowerCase().replace('-', '')}`, {
      token,
    });
    expect(response.body.code).toBe(code);
  });

  it("answers another seller's code exactly like an unknown one (D-26)", async () => {
    const { code } = await created();
    const other = await t.request('GET', `/parcels/${code}`, {
      token: (await login(t, otherSeller)).accessToken,
    });
    const unknown = await t.request('GET', '/parcels/FG-00000000', { token });
    expect(other.status).toBe(404);
    expect(other.body).toEqual(unknown.body);
    expect(other.body.message).toBe('Code inconnu');
  });

  it('is open to "Voir comme le vendeur", read-only (D-5)', async () => {
    const { code } = await created();
    const adminToken = (await login(t, admin)).accessToken;
    const started = await t.request('POST', '/auth/impersonation', {
      token: adminToken,
      body: { sellerId: seller.sellerId },
    });
    const response = await t.request('GET', `/parcels/${code}`, {
      token: started.body.impersonationToken,
    });
    expect(response.status).toBe(200);
  });
});

describe('Modifier (Vendeur 4.6, D-41)', () => {
  function modify(code: string, body: unknown, as = token) {
    return t.request('PATCH', `/parcels/${code}`, { token: as, body });
  }

  it('changes the fields, the délégation with the localité, and never the fees', async () => {
    const { id, code } = await created();
    const before = await t.prisma.parcel.findUniqueOrThrow({ where: { id } });

    const response = await modify(code, {
      codAmountMillimes: '92,500',
      localiteId: marsa.localiteId,
      recipientPhone: '98 765 432',
    });
    expect(response.status).toBe(200);
    expect(response.body.reprintLabel).toBe(true);
    expect(response.body.changedFields.sort()).toEqual(
      ['codAmountMillimes', 'localiteId', 'recipientPhone'].sort(),
    );

    const after = await t.prisma.parcel.findUniqueOrThrow({ where: { id } });
    expect(after).toMatchObject({
      codAmountMillimes: 92500n,
      localiteId: marsa.localiteId,
      delegationId: marsa.delegationId,
      recipientPhone: '98765432',
      status: 'CREE',
      deliveryFeeMillimes: before.deliveryFeeMillimes,
      returnFeeMillimes: before.returnFeeMillimes,
      changeClientFeeMillimes: before.changeClientFeeMillimes,
    });
  });

  it('records what changed, before and after, in a MODIFICATION_VENDEUR event', async () => {
    const { id, code } = await created();
    await modify(code, { codAmountMillimes: '90,000', courierNote: 'Appeler avant' });
    const [, modification] = await events(id);
    expect(modification).toMatchObject({
      type: 'MODIFICATION_VENDEUR',
      previousStatus: 'CREE',
      newStatus: 'CREE',
      actorUserId: seller.id,
    });
    expect(modification!.metadata).toEqual({
      changes: {
        codAmountMillimes: { before: '85000', after: '90000' },
        courierNote: { before: 'Sonner deux fois', after: 'Appeler avant' },
      },
    });
  });

  it('asks for no reprint when nothing printed changed', async () => {
    const { code } = await created();
    const response = await modify(code, { productDescription: '3 bracelets' });
    expect(response.body.reprintLabel).toBe(false);
  });

  it('writes nothing when nothing changed', async () => {
    const { id, code } = await created();
    const response = await modify(code, { address: '12 rue de Marseille' });
    expect(response.status).toBe(200);
    expect(response.body.changedFields).toEqual([]);
    expect(await events(id)).toHaveLength(1);
  });

  it('is refused once the parcel is picked up, and changes nothing', async () => {
    const code = await parcelIn('RAMASSE', 'AVEC_LE_RAMASSEUR');
    const response = await modify(code, { address: '14 rue de Rome' });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('MODIFICATION_IMPOSSIBLE');
    const parcel = await t.prisma.parcel.findUniqueOrThrow({ where: { code } });
    expect(parcel.address).toBe('Rue de Test');
  });

  it('refuses a move to a deactivated localité (D-27)', async () => {
    const { code } = await created();
    const response = await modify(code, { localiteId: closedLocaliteId });
    expect(response.body.code).toBe('LOCALITE_INACTIVE');
  });

  it('does not exist for another seller (D-26), and stays open to a suspended one (D-25)', async () => {
    const { code } = await created();
    const other = await modify(
      code,
      { address: '1 rue X' },
      (await login(t, otherSeller)).accessToken,
    );
    expect(other.status).toBe(404);

    const mine = await parcelIn('CREE', 'CHEZ_LE_VENDEUR', suspended);
    const response = await modify(
      mine,
      { address: '1 rue du Lac' },
      (await login(t, suspended)).accessToken,
    );
    expect(response.status).toBe(200);
  });
});

describe('Annuler (Vendeur 4.6, D-28)', () => {
  function cancel(code: string, as = token): Promise<ApiResponse> {
    return t.request('POST', `/parcels/${code}/cancel`, { token: as });
  }

  it('before pickup: Annulé, closed, no fee', async () => {
    const { id, code } = await created();
    const response = await cancel(code);
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ANNULE');
    const parcel = await t.prisma.parcel.findUniqueOrThrow({ where: { id } });
    expect(parcel.cancelledAt).not.toBeNull();
    expect(parcel.closedAt).not.toBeNull();
    expect(await t.prisma.sellerCharge.count({ where: { parcelId: id } })).toBe(0);
    expect((await events(id)).map((e) => e.type)).toEqual(['CREATION', 'ANNULATION']);
  });

  it('after pickup: a return, charged the frozen return fee, marked Après ramassage', async () => {
    const code = await parcelIn('AU_DEPOT', 'AU_DEPOT');
    const parcel = await t.prisma.parcel.findUniqueOrThrow({ where: { code } });
    const response = await cancel(code);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'RETOUR_AU_DEPOT', location: 'AU_DEPOT' });

    const charges = await t.prisma.sellerCharge.findMany({ where: { parcelId: parcel.id } });
    expect(charges).toEqual([
      expect.objectContaining({
        type: 'RETOUR',
        amountMillimes: parcel.returnFeeMillimes,
        status: 'EN_ATTENTE',
      }),
    ]);
    const last = (await events(parcel.id)).at(-1)!;
    expect(last).toMatchObject({ type: 'ANNULATION', newStatus: 'RETOUR_AU_DEPOT' });
    expect(last.metadata).toEqual({ annulation: 'APRES_RAMASSAGE' });
  });

  it.each([
    ['LIVRE', 'CHEZ_LE_CLIENT'],
    ['ANNULE', 'CHEZ_LE_VENDEUR'],
    ['RETOUR_AU_DEPOT', 'AU_DEPOT'],
  ])('is refused once %s, and writes nothing', async (status, location) => {
    const code = await parcelIn(status, location);
    const parcel = await t.prisma.parcel.findUniqueOrThrow({ where: { code } });
    const response = await cancel(code);
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('ANNULATION_IMPOSSIBLE');
    expect(await events(parcel.id)).toHaveLength(1);
  });

  it('stays open to a suspended seller (D-25), closed to another seller (D-26)', async () => {
    const mine = await parcelIn('CREE', 'CHEZ_LE_VENDEUR', suspended);
    expect((await cancel(mine, (await login(t, suspended)).accessToken)).status).toBe(200);
    const { code } = await created();
    expect((await cancel(code, (await login(t, otherSeller)).accessToken)).status).toBe(404);
  });
});

describe('Demander une modification (Vendeur 4.6)', () => {
  function request(code: string, body: unknown, as = token) {
    return t.request('POST', `/parcels/${code}/change-requests`, { token: as, body });
  }

  it('files the request for Faffa Go, and the parcel shows it waiting', async () => {
    const code = await parcelIn('AU_DEPOT', 'AU_DEPOT');
    const response = await request(code, {
      recipientPhone: '98 765 432',
      address: '3 rue de Carthage',
      note: 'Le client a déménagé',
    });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      status: 'EN_ATTENTE',
      requestedFields: { recipientPhone: '98765432', address: '3 rue de Carthage' },
      sellerNote: 'Le client a déménagé',
    });

    const parcel = await t.request('GET', `/parcels/${code}`, { token });
    expect(parcel.body.changeRequests).toHaveLength(1);
    // Nothing on the parcel changes until Faffa Go applies it (phase 5).
    expect(parcel.body.recipientPhone).toBe('29876543');
  });

  it('points to Modifier before pickup', async () => {
    const { code } = await created();
    const response = await request(code, { address: '3 rue de Carthage' });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('DEMANDE_AVANT_RAMASSAGE');
  });

  it.each([
    ['LIVRE', 'CHEZ_LE_CLIENT'],
    ['RETOUR_AU_DEPOT', 'AU_DEPOT'],
  ])('is refused once %s', async (status, location) => {
    const code = await parcelIn(status, location);
    const response = await request(code, { address: '3 rue de Carthage' });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('DEMANDE_IMPOSSIBLE');
  });

  it('asks for a phone or an address', async () => {
    const code = await parcelIn('AU_DEPOT', 'AU_DEPOT');
    expect((await request(code, { note: 'Rien' })).status).toBe(400);
  });

  it('does not exist for another seller (D-26)', async () => {
    const code = await parcelIn('AU_DEPOT', 'AU_DEPOT');
    const response = await request(
      code,
      { address: '3 rue de Carthage' },
      (await login(t, otherSeller)).accessToken,
    );
    expect(response.status).toBe(404);
  });
});
