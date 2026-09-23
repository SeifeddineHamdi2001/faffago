import { seed } from '../../prisma/seed';
import {
  COURIER_APP_HEADERS,
  createTestApp,
  createUser,
  login,
  type Fixture,
  type TestApp,
} from '../support/test-app';
import { createParcel } from '../support/work-fixtures';

/**
 * The geography API (D-17): the gouvernorat → délégation → localité tree every
 * signed-in user reads, and Paramètres › Localités, where the admin adds,
 * renames and deactivates localités and finds the parcels filed under Autre.
 */

let t: TestApp;
let adminToken: string;
let depot: Fixture;
let seller: Fixture;

const ADMIN = { username: 'admin', password: 'Mot-De-Passe-Admin-42' };

beforeAll(async () => {
  t = await createTestApp();
  await seed(t.prisma, { log: () => undefined, adminPassword: ADMIN.password });
  depot = await createUser(t.prisma, { role: 'DEPOT', username: 'geo.depot' });
  seller = await createUser(t.prisma, { role: 'VENDEUR', email: 'geo@boutique.tn' });
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  t.throttle.clear();
  const response = await t.request('POST', '/auth/login/staff', { body: ADMIN });
  adminToken = response.body.accessToken;
});

async function tokenOf(user: Fixture): Promise<string> {
  return (await login(t, user)).accessToken;
}

async function delegationId(code: string): Promise<string> {
  return (await t.prisma.delegation.findUniqueOrThrow({ where: { code } })).id;
}

async function localiteId(code: string, nameFr: string): Promise<string> {
  const id = await delegationId(code);
  return (
    await t.prisma.localite.findUniqueOrThrow({
      where: { delegationId_nameFr: { delegationId: id, nameFr } },
    })
  ).id;
}

interface TreeDelegation {
  code: string;
  nameFr: string;
  localites: Array<{ id: string; nameFr: string; isOther: boolean }>;
}

async function tree(token: string) {
  const response = await t.request('GET', '/geo', { token });
  expect(response.status).toBe(200);
  const delegations: TreeDelegation[] = response.body.gouvernorats.flatMap(
    (g: { delegations: TreeDelegation[] }) => g.delegations,
  );
  return { body: response.body, delegations };
}

describe('GET /geo', () => {
  it('gives a seller the whole active tree, localités with their Arabic names', async () => {
    const { body, delegations } = await tree(await tokenOf(seller));

    expect(body.gouvernorats.map((g: { code: string }) => g.code).sort()).toEqual([
      'ARI',
      'BEN',
      'MAN',
      'TUN',
    ]);
    expect(delegations).toHaveLength(48);
    expect(delegations.flatMap((d) => d.localites)).toHaveLength(938);

    const sidiBechir = delegations.find((d) => d.code === 'TUN-SIDIBECHIR')!;
    expect(sidiBechir.localites).toContainEqual(
      expect.objectContaining({ nameFr: 'Maakel Ezzaïm', nameAr: 'معقل الزعيم' }),
    );
  });

  it('puts Autre last in every délégation', async () => {
    const { delegations } = await tree(await tokenOf(seller));
    for (const delegation of delegations) {
      expect(delegation.localites.at(-1)).toMatchObject({ nameFr: 'Autre', isOther: true });
    }
  });

  it('never tells a seller about zones or seed keys', async () => {
    const response = await t.request('GET', '/geo', { token: await tokenOf(seller) });
    const text = JSON.stringify(response.body);
    // Keys, not words: "Zone Industrielle" is a localité name.
    expect(text).not.toContain('"zoneId"');
    expect(text).not.toContain('"zone"');
    expect(text).not.toContain('"sourceKey"');
  });

  it('is open to staff and to the courier app', async () => {
    expect((await t.request('GET', '/geo', { token: await tokenOf(depot) })).status).toBe(200);
    const livreur = await createUser(t.prisma, { role: 'LIVREUR' });
    const response = await t.request('GET', '/geo', {
      token: await tokenOf(livreur),
      headers: COURIER_APP_HEADERS,
    });
    expect(response.status).toBe(200);
  });

  it('is closed without a session', async () => {
    expect((await t.request('GET', '/geo')).status).toBe(401);
  });
});

describe('POST /localites (Paramètres, D-17)', () => {
  it('lets the admin add a localité, audited, and shows it at once', async () => {
    const response = await t.request('POST', '/localites', {
      token: adminToken,
      body: {
        delegationId: await delegationId('TUN-MARSA'),
        nameFr: 'Les Jardins de Gammarth',
        aliases: ['Jardins Gammarth'],
        postalCode: '1057',
      },
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      nameFr: 'Les Jardins de Gammarth',
      nameAr: null,
      aliases: ['Jardins Gammarth'],
      isActive: true,
      isOther: false,
    });
    const audit = await t.prisma.auditLog.findMany({ where: { entityId: response.body.id } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: 'CREATION_LOCALITE', actorRole: 'ADMIN' });

    const { delegations } = await tree(await tokenOf(seller));
    const marsa = delegations.find((d) => d.code === 'TUN-MARSA')!;
    expect(marsa.localites.map((l) => l.nameFr)).toContain('Les Jardins de Gammarth');
  });

  it('refuses a name the délégation already has, whatever the case or accents', async () => {
    const response = await t.request('POST', '/localites', {
      token: adminToken,
      body: { delegationId: await delegationId('TUN-MARSA'), nameFr: 'GAMMART' },
    });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('LOCALITE_EXISTE');
  });

  it('refuses an unknown délégation', async () => {
    const response = await t.request('POST', '/localites', {
      token: adminToken,
      body: { delegationId: '00000000-0000-0000-0000-000000000000', nameFr: 'Nulle Part' },
    });
    expect(response.status).toBe(404);
  });

  it('is the admin’s alone', async () => {
    const body = { delegationId: await delegationId('TUN-MARSA'), nameFr: 'Essai' };
    expect(
      (await t.request('POST', '/localites', { token: await tokenOf(depot), body })).status,
    ).toBe(403);
    expect(
      (await t.request('POST', '/localites', { token: await tokenOf(seller), body })).status,
    ).toBe(403);
  });
});

describe('PATCH /localites/:id', () => {
  it('renames, fills the Arabic name and the aliases, audited before and after', async () => {
    const id = await localiteId('TUN-MARSA', 'Gammart');
    const response = await t.request('PATCH', `/localites/${id}`, {
      token: adminToken,
      body: { nameFr: 'Gammarth', nameAr: 'قمرت', aliases: ['Gammart'] },
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      nameFr: 'Gammarth',
      nameAr: 'قمرت',
      aliases: ['Gammart'],
    });
    const [entry] = await t.prisma.auditLog.findMany({
      where: { entityId: id, action: 'MODIFICATION_LOCALITE' },
    });
    expect(entry).toMatchObject({
      before: { nameFr: 'Gammart', nameAr: null, aliases: [] },
      after: { nameFr: 'Gammarth', nameAr: 'قمرت', aliases: ['Gammart'] },
    });
  });

  it('clears the Arabic name with null, so screens fall back to French', async () => {
    const id = await localiteId('TUN-MARSA', 'Gammarth');
    const response = await t.request('PATCH', `/localites/${id}`, {
      token: adminToken,
      body: { nameAr: null },
    });
    expect(response.body.nameAr).toBeNull();
  });

  it('deactivates a localité: it leaves the tree, and comes back when reactivated', async () => {
    const id = await localiteId('TUN-MARSA', 'Cité Des Mimosas');
    const off = await t.request('PATCH', `/localites/${id}`, {
      token: adminToken,
      body: { isActive: false },
    });
    expect(off.status).toBe(200);
    let marsa = (await tree(await tokenOf(seller))).delegations.find(
      (d) => d.code === 'TUN-MARSA',
    )!;
    expect(marsa.localites.map((l) => l.id)).not.toContain(id);

    await t.request('PATCH', `/localites/${id}`, { token: adminToken, body: { isActive: true } });
    marsa = (await tree(await tokenOf(seller))).delegations.find((d) => d.code === 'TUN-MARSA')!;
    expect(marsa.localites.map((l) => l.id)).toContain(id);
  });

  it('never renames nor deactivates an Autre row', async () => {
    const id = await localiteId('TUN-MARSA', 'Autre');
    for (const body of [{ nameFr: 'Divers' }, { isActive: false }]) {
      const response = await t.request('PATCH', `/localites/${id}`, { token: adminToken, body });
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('LOCALITE_AUTRE_FIXE');
    }
  });

  it('refuses a rename onto a name the délégation already has', async () => {
    const id = await localiteId('TUN-MARSA', 'Sidi Daoud');
    const response = await t.request('PATCH', `/localites/${id}`, {
      token: adminToken,
      body: { nameFr: 'Marsa Safsaf' },
    });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('LOCALITE_EXISTE');
  });

  it('refuses an unknown localité and an empty change', async () => {
    const unknown = await t.request('PATCH', '/localites/00000000-0000-0000-0000-000000000000', {
      token: adminToken,
      body: { isActive: false },
    });
    expect(unknown.status).toBe(404);

    const id = await localiteId('TUN-MARSA', 'Sidi Daoud');
    const empty = await t.request('PATCH', `/localites/${id}`, { token: adminToken, body: {} });
    expect(empty.status).toBe(400);
  });
});

describe('GET /localites (Paramètres)', () => {
  it('lists a délégation’s localités for the admin, deactivated ones included', async () => {
    const id = await localiteId('TUN-MARSA', 'Cité Aziza');
    await t.request('PATCH', `/localites/${id}`, { token: adminToken, body: { isActive: false } });

    const response = await t.request(
      'GET',
      `/localites?delegationId=${await delegationId('TUN-MARSA')}`,
      { token: adminToken },
    );
    expect(response.status).toBe(200);
    expect(response.body).toContainEqual(
      expect.objectContaining({ id, nameFr: 'Cité Aziza', isActive: false }),
    );
  });

  it('is the admin’s alone', async () => {
    expect((await t.request('GET', '/localites', { token: await tokenOf(depot) })).status).toBe(
      403,
    );
  });
});

describe('GET /localites/autre/parcels (D-17)', () => {
  it('lists the parcels filed under Autre, so missing localités can be added', async () => {
    const marsa = await delegationId('TUN-MARSA');
    const autre = await localiteId('TUN-MARSA', 'Autre');
    const gammarth = await localiteId('TUN-MARSA', 'Gammarth');
    const create = async (localite: string, address: string) =>
      t.prisma.parcel.findUniqueOrThrow({
        where: {
          id: await createParcel(t.prisma, {
            sellerId: seller.sellerId!,
            createdByUserId: seller.id,
            where: { delegationId: marsa, localiteId: localite },
            address,
          }),
        },
      });
    const underAutre = await create(autre, 'Cité Nouvelle, près de la mosquée');
    await create(gammarth, 'Rue de la Plage');

    const response = await t.request('GET', '/localites/autre/parcels', { token: adminToken });

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      expect.objectContaining({
        code: underAutre.code,
        address: 'Cité Nouvelle, près de la mosquée',
        delegation: { code: 'TUN-MARSA', nameFr: 'La Marsa' },
        shopName: 'Boutique Test',
      }),
    ]);
  });

  it('is the admin’s alone', async () => {
    const response = await t.request('GET', '/localites/autre/parcels', {
      token: await tokenOf(depot),
    });
    expect(response.status).toBe(403);
  });
});
