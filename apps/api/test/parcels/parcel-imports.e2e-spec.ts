import { randomUUID } from 'node:crypto';
import { SettingKey } from '@faffago/shared';
import { principalOf } from '../support/principals';
import {
  createTestApp,
  createUser,
  login,
  type ApiResponse,
  type Fixture,
  type TestApp,
} from '../support/test-app';
import { place } from '../support/work-fixtures';

/**
 * Import CSV over HTTP (Vendeur 4.3, D-37). The server evaluates every row
 * again with the shared rules; the rows are created together or not at all,
 * each through the same frozen fees and CREATION event as Créer un colis.
 */

let t: TestApp;
let seller: Fixture;
let otherSeller: Fixture;
let suspended: Fixture;
let admin: Fixture;
let token: string;
let bardo: { delegationId: string; localiteId: string };
let ghazelaMarsa: string;
let closedLocalite: string;

const META = { ip: '127.0.0.1', userAgent: 'jest' };

function cells(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    nom_destinataire: 'Amira Ben Salah',
    telephone: '29876543',
    localite: 'Khaznadar',
    adresse: '12 rue de Marseille',
    description_produit: '2 bracelets',
    montant_cod: '85,000',
    colis_echange: 'non',
    ouverture_autorisee: 'oui',
    ...overrides,
  };
}

function importFile(
  rows: { line: number; cells: Record<string, string>; localiteId?: string | null }[],
  options: { importId?: string; as?: string } = {},
): Promise<ApiResponse> {
  return t.request('POST', '/parcels/imports', {
    token: options.as ?? token,
    body: { importId: options.importId ?? randomUUID(), fileName: 'commandes.csv', rows },
  });
}

beforeAll(async () => {
  t = await createTestApp();
  admin = await createUser(t.prisma, { role: 'ADMIN', username: 'admin.import' });
  seller = await createUser(t.prisma, { role: 'VENDEUR', email: 'vendeur@import.tn' });
  otherSeller = await createUser(t.prisma, { role: 'VENDEUR', email: 'autre@import.tn' });
  suspended = await createUser(t.prisma, {
    role: 'VENDEUR',
    email: 'suspendu@import.tn',
    sellerState: 'SUSPENDU',
  });
  bardo = await place(t.prisma);
  const tunis = await t.prisma.gouvernorat.findFirstOrThrow();
  const ariana = await t.prisma.gouvernorat.create({
    data: { code: 'ARI', nameFr: 'Ariana', nameAr: 'أريانة' },
  });
  const arianaVille = await t.prisma.delegation.create({
    data: { gouvernoratId: ariana.id, code: 'ARI-VILLE', nameFr: 'Ariana Ville', nameAr: 'أريانة' },
  });
  const marsa = await t.prisma.delegation.create({
    data: { gouvernoratId: tunis.id, code: 'TUN-MARSA', nameFr: 'La Marsa', nameAr: 'المرسى' },
  });
  // The same name in two délégations: an ambiguous row without its délégation.
  await t.prisma.localite.create({
    data: { delegationId: arianaVille.id, nameFr: 'Cité El Ghazela' },
  });
  ghazelaMarsa = (
    await t.prisma.localite.create({ data: { delegationId: marsa.id, nameFr: 'Cité El Ghazela' } })
  ).id;
  closedLocalite = (
    await t.prisma.localite.create({
      data: { delegationId: marsa.id, nameFr: 'Ancienne cité', isActive: false },
    })
  ).id;
  await t.settings.update(principalOf(admin), SettingKey.DELIVERY_FEE_MILLIMES, '5500', META);
  await t.settings.update(principalOf(admin), SettingKey.RETURN_FEE_MILLIMES, '2000', META);
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  t.throttle.clear();
  token = (await login(t, seller)).accessToken;
});

describe('POST /parcels/imports (Vendeur 4.3)', () => {
  it('creates every row, with its line, the fees frozen, and a CREATION event each', async () => {
    const response = await importFile([
      { line: 2, cells: cells() },
      { line: 3, cells: cells({ nom_destinataire: 'Karim Jlassi', montant_cod: '0' }) },
      { line: 5, cells: cells({ localite: 'Cité El Ghazela' }), localiteId: ghazelaMarsa },
    ]);
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ fileName: 'commandes.csv', parcelCount: 3 });
    expect(response.body.parcels.map((p: { line: number }) => p.line)).toEqual([2, 3, 5]);

    const parcels = await t.prisma.parcel.findMany({
      where: { importId: response.body.id },
      orderBy: { importLine: 'asc' },
      include: { events: true },
    });
    expect(parcels).toHaveLength(3);
    expect(parcels.map((p) => p.code)).toEqual(
      response.body.parcels.map((p: { code: string }) => p.code),
    );
    for (const parcel of parcels) {
      expect(parcel).toMatchObject({
        sellerId: seller.sellerId,
        status: 'CREE',
        deliveryFeeMillimes: 5500n,
        returnFeeMillimes: 2000n,
        openingAllowed: true,
        isExchange: false,
      });
      expect(parcel.events.map((e) => e.type)).toEqual(['CREATION']);
      expect(parcel.events[0]!.actorUserId).toBe(seller.id);
    }
    expect(parcels[1]!.codAmountMillimes).toBe(0n);
    expect(parcels[2]).toMatchObject({ localiteId: ghazelaMarsa });
  });

  it('creates nothing twice when the same import is sent again', async () => {
    const importId = randomUUID();
    const first = await importFile([{ line: 2, cells: cells() }], { importId });
    const second = await importFile([{ line: 2, cells: cells() }], { importId });
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.parcels).toEqual(first.body.parcels);
    expect(await t.prisma.parcel.count({ where: { importId } })).toBe(1);
  });

  it("refuses another seller's import id without showing his parcels", async () => {
    const importId = randomUUID();
    await importFile([{ line: 2, cells: cells() }], { importId });
    const other = await importFile([{ line: 2, cells: cells() }], {
      importId,
      as: (await login(t, otherSeller)).accessToken,
    });
    expect(other.status).toBe(409);
    expect(JSON.stringify(other.body)).not.toContain('FG-');
  });

  it('creates nothing when one row fails on the server, and says which and why', async () => {
    const before = await t.prisma.parcel.count();
    const response = await importFile([
      { line: 2, cells: cells() },
      { line: 3, cells: cells({ telephone: '1234' }) },
      { line: 4, cells: cells({ localite: 'Cité El Ghazela' }) },
    ]);
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('LIGNES_REFUSEES');
    expect(response.body.rows).toEqual([
      {
        line: 3,
        verdict: 'ERREUR',
        problems: [{ column: 'telephone', message: '8 chiffres, format tunisien' }],
      },
      { line: 4, verdict: 'A_VERIFIER', problems: [] },
    ]);
    expect(await t.prisma.parcel.count()).toBe(before);
  });

  it('refuses a choice outside the options the row offered', async () => {
    const response = await importFile([
      { line: 2, cells: cells({ localite: 'Cité El Ghazela' }), localiteId: bardo.localiteId },
    ]);
    expect(response.status).toBe(422);
    expect(response.body.rows[0].verdict).toBe('A_VERIFIER');
  });

  it('refuses a localité deactivated since the preview (D-27)', async () => {
    const response = await importFile([
      { line: 2, cells: cells({ localite: 'Ancienne cité', delegation: 'TUN-MARSA' }) },
    ]);
    expect(response.status).toBe(422);
    // Not among the active localités: the délégation's list is offered instead.
    expect(response.body.rows[0].verdict).toBe('A_VERIFIER');
    expect(await t.prisma.parcel.count({ where: { localiteId: closedLocalite } })).toBe(0);
  });

  it('refuses a line given twice', async () => {
    const response = await importFile([
      { line: 2, cells: cells() },
      { line: 2, cells: cells() },
    ]);
    expect(response.status).toBe(400);
  });

  it('refuses more than 500 rows (D-37)', async () => {
    const rows = Array.from({ length: 501 }, (_, i) => ({ line: i + 2, cells: cells() }));
    const response = await importFile(rows);
    expect(response.status).toBe(400);
  });

  it('takes 500 rows in one go', async () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({ line: i + 2, cells: cells() }));
    const response = await importFile(rows);
    expect(response.status).toBe(201);
    expect(response.body.parcelCount).toBe(500);
    expect(new Set(response.body.parcels.map((p: { code: string }) => p.code)).size).toBe(500);
  });

  it('refuses a suspended seller (D-25), staff, and "Voir comme le vendeur" (D-5)', async () => {
    const blocked = await importFile([{ line: 2, cells: cells() }], {
      as: (await login(t, suspended)).accessToken,
    });
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('COMPTE_SUSPENDU');

    const adminToken = (await login(t, admin)).accessToken;
    expect((await importFile([{ line: 2, cells: cells() }], { as: adminToken })).status).toBe(403);
    const started = await t.request('POST', '/auth/impersonation', {
      token: adminToken,
      body: { sellerId: seller.sellerId },
    });
    expect(
      (await importFile([{ line: 2, cells: cells() }], { as: started.body.impersonationToken }))
        .status,
    ).toBe(403);
  });
});

describe('GET /parcels/imports/:id', () => {
  it('gives the seller his import, for the result screen and the labels', async () => {
    const created = await importFile([{ line: 2, cells: cells() }]);
    const response = await t.request('GET', `/parcels/imports/${created.body.id}`, { token });
    expect(response.status).toBe(200);
    expect(response.body).toEqual(created.body);
  });

  it('does not exist for another seller (D-26)', async () => {
    const created = await importFile([{ line: 2, cells: cells() }]);
    const response = await t.request('GET', `/parcels/imports/${created.body.id}`, {
      token: (await login(t, otherSeller)).accessToken,
    });
    expect(response.status).toBe(404);
  });
});
