import { randomUUID } from 'node:crypto';
import type { ParcelLocation, ParcelStatus } from '@prisma/client';
import { seed } from '../../prisma/seed';
import { createTestApp, createUser, login, type Fixture, type TestApp } from '../support/test-app';
import { createParcel } from '../support/work-fixtures';

/**
 * Applying seller change requests (Vendeur 4.6, D-44, D-57): Service client
 * and Admin apply a request as a whole, or refuse it with a reason the seller
 * reads. A new localité waits for the parcel to be at the depot. Applying
 * writes a MODIFICATION_APPLIQUEE event, and flags the label for a reprint
 * when a printed field changed; the team's reprint clears the flag, and the
 * depot's next scan warns until then.
 */

let t: TestApp;
let adminToken: string;
let sc: Fixture;
let scToken: string;
let depot: Fixture;
let depotToken: string;
let seller: Fixture;
let sellerToken: string;
let ali: Fixture;

const ADMIN = { username: 'admin', password: 'Mot-De-Passe-Admin-42' };

async function localiteIn(code: string, nameFr?: string) {
  const delegation = await t.prisma.delegation.findUniqueOrThrow({ where: { code } });
  return t.prisma.localite.findFirstOrThrow({
    where: { delegationId: delegation.id, isOther: false, ...(nameFr ? { nameFr } : {}) },
    orderBy: { nameFr: 'asc' },
  });
}

async function parcel(status: ParcelStatus, location: ParcelLocation) {
  const localite = await localiteIn('TUN-MARSA');
  const id = await createParcel(t.prisma, {
    sellerId: seller.sellerId!,
    createdByUserId: seller.id,
    status,
    location,
    where: { delegationId: localite.delegationId, localiteId: localite.id },
    extra: { plannedLivreurId: status === 'AU_DEPOT' ? ali.courierId! : null },
  });
  return t.prisma.parcel.findUniqueOrThrow({ where: { id } });
}

/** The seller asks, through his own route. */
async function ask(code: string, body: Record<string, unknown>) {
  const response = await t.request('POST', `/parcels/${code}/change-requests`, {
    token: sellerToken,
    body,
  });
  expect(response.status).toBe(201);
  return response.body.id as string;
}

function apply(id: string, token = scToken) {
  return t.request('POST', `/demandes-modification/${id}/apply`, { token });
}

function refuse(id: string, reason: unknown, token = scToken) {
  return t.request('POST', `/demandes-modification/${id}/refuse`, { token, body: { reason } });
}

beforeAll(async () => {
  t = await createTestApp();
  await seed(t.prisma, { log: () => undefined, adminPassword: ADMIN.password });
  sc = await createUser(t.prisma, { role: 'SERVICE_CLIENT', username: 'dm.sc' });
  depot = await createUser(t.prisma, { role: 'DEPOT', username: 'dm.depot' });
  seller = await createUser(t.prisma, { role: 'VENDEUR', email: 'dm@boutique.tn' });
  ali = await createUser(t.prisma, { role: 'LIVREUR' });
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  t.throttle.clear();
  scToken = (await login(t, sc)).accessToken;
  depotToken = (await login(t, depot)).accessToken;
  sellerToken = (await login(t, seller)).accessToken;
  adminToken = (await t.request('POST', '/auth/login/staff', { body: ADMIN })).body.accessToken;
});

describe('GET /demandes-modification (Admin 4.7, D-57)', () => {
  it('lists the waiting requests with each field before and after, and whether it applies now', async () => {
    const p = await parcel('EN_LIVRAISON', 'AVEC_LE_LIVREUR');
    const gammart = await localiteIn('TUN-MARSA', 'Gammart');
    const id = await ask(p.code, {
      recipientPhone: '98765432',
      localiteId: gammart.id,
      note: 'Le client a déménagé',
    });

    const response = await t.request('GET', '/demandes-modification', { token: scToken });

    expect(response.status).toBe(200);
    const row = response.body.find((r: { id: string }) => r.id === id);
    expect(row).toMatchObject({
      status: 'EN_ATTENTE',
      sellerNote: 'Le client a déménagé',
      parcel: {
        code: p.code,
        status: 'EN_LIVRAISON',
        location: 'AVEC_LE_LIVREUR',
        shopName: 'Boutique Test',
      },
      applyRefusal: 'LOCALITE_HORS_DEPOT',
      applyRefusalMessage: 'Nouvelle localité : la demande s’applique quand le colis est au dépôt.',
    });
    expect(row.fields).toEqual(
      expect.arrayContaining([
        { field: 'recipientPhone', before: '29876543', after: '98765432' },
        { field: 'localiteId', before: expect.any(String), after: 'Gammart — La Marsa' },
      ]),
    );
  });

  it('is for Service client and the admin; the depot reads requests on the parcel only', async () => {
    expect((await t.request('GET', '/demandes-modification', { token: adminToken })).status).toBe(
      200,
    );
    expect((await t.request('GET', '/demandes-modification', { token: depotToken })).status).toBe(
      403,
    );
    expect((await t.request('GET', '/demandes-modification', { token: sellerToken })).status).toBe(
      403,
    );
  });
});

describe('POST /demandes-modification/:id/apply (D-57)', () => {
  it('applies a phone and an address as a whole, with a MODIFICATION_APPLIQUEE event', async () => {
    const p = await parcel('EN_LIVRAISON', 'AVEC_LE_LIVREUR');
    const id = await ask(p.code, { recipientPhone: '98765432', address: '9 rue du Lac, 2e étage' });

    const response = await apply(id);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id, status: 'APPLIQUEE' });
    const after = await t.prisma.parcel.findUniqueOrThrow({ where: { id: p.id } });
    expect(after).toMatchObject({
      recipientPhone: '98765432',
      address: '9 rue du Lac, 2e étage',
      status: 'EN_LIVRAISON',
      labelReprintNeeded: true,
    });
    const request = await t.prisma.sellerChangeRequest.findUniqueOrThrow({ where: { id } });
    expect(request).toMatchObject({ status: 'APPLIQUEE', handledByUserId: sc.id });

    const [event] = await t.prisma.parcelEvent.findMany({
      where: { parcelId: p.id, type: 'MODIFICATION_APPLIQUEE' },
    });
    expect(event).toMatchObject({
      actorUserId: sc.id,
      actorRole: 'SERVICE_CLIENT',
      previousStatus: 'EN_LIVRAISON',
      newStatus: 'EN_LIVRAISON',
      metadata: {
        changeRequestId: id,
        recipientPhone: { before: '29876543', after: '98765432' },
        address: { before: 'Rue de Test', after: '9 rue du Lac, 2e étage' },
      },
    });

    // The seller reads it as Faffa Go.
    const seen = await t.request('GET', `/parcels/${p.code}`, { token: sellerToken });
    expect(seen.body.timeline.at(-1)).toMatchObject({
      type: 'MODIFICATION_APPLIQUEE',
      actor: { kind: 'FAFFA_GO' },
    });
    expect(seen.body.changeRequests[0]).toMatchObject({ status: 'APPLIQUEE' });
  });

  it('applies a new localité at the depot: new délégation, the Tournées move undone', async () => {
    const p = await parcel('AU_DEPOT', 'AU_DEPOT');
    const bardo = await localiteIn('TUN-BARDO');
    const id = await ask(p.code, { localiteId: bardo.id });

    expect((await apply(id)).status).toBe(200);
    const after = await t.prisma.parcel.findUniqueOrThrow({ where: { id: p.id } });
    expect(after).toMatchObject({
      localiteId: bardo.id,
      delegationId: bardo.delegationId,
      // Another zone: the move to a livreur of the old one no longer holds (D-55).
      plannedLivreurId: null,
      labelReprintNeeded: true,
    });
  });

  it('keeps a new localité waiting while the livreur carries the parcel (D-44)', async () => {
    const p = await parcel('A_VERIFIER', 'AVEC_LE_LIVREUR');
    const bardo = await localiteIn('TUN-BARDO');
    const id = await ask(p.code, { localiteId: bardo.id });

    const response = await apply(id);
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('LOCALITE_HORS_DEPOT');
    expect((await t.prisma.parcel.findUniqueOrThrow({ where: { id: p.id } })).localiteId).toBe(
      p.localiteId,
    );
    expect((await t.prisma.sellerChangeRequest.findUniqueOrThrow({ where: { id } })).status).toBe(
      'EN_ATTENTE',
    );
  });

  it('refuses a localité deactivated since the request', async () => {
    const p = await parcel('AU_DEPOT', 'AU_DEPOT');
    const kram = await localiteIn('TUN-KRAM');
    const id = await ask(p.code, { localiteId: kram.id });
    await t.prisma.localite.update({ where: { id: kram.id }, data: { isActive: false } });
    try {
      const response = await apply(id);
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('LOCALITE_INACTIVE');
    } finally {
      await t.prisma.localite.update({ where: { id: kram.id }, data: { isActive: true } });
    }
  });

  it('refuses once the parcel is delivered, and a request already handled', async () => {
    const p = await parcel('EN_LIVRAISON', 'AVEC_LE_LIVREUR');
    const id = await ask(p.code, { recipientPhone: '98765432' });
    await t.prisma.$transaction(async (tx) => {
      await tx.parcel.update({
        where: { id: p.id },
        data: { status: 'LIVRE', location: 'CHEZ_LE_CLIENT' },
      });
      await tx.parcelEvent.create({
        data: {
          parcelId: p.id,
          type: 'LIVRAISON',
          newStatus: 'LIVRE',
          newLocation: 'CHEZ_LE_CLIENT',
          actorUserId: ali.id,
        },
      });
    });
    expect((await apply(id)).body.code).toBe('COLIS_HORS_DELAI');

    const q = await parcel('EN_LIVRAISON', 'AVEC_LE_LIVREUR');
    const done = await ask(q.code, { address: '1 rue de Rome' });
    await apply(done);
    const again = await apply(done);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('DEMANDE_TRAITEE');
  });

  it('is for Service client and the admin, not the depot (Admin 2)', async () => {
    const p = await parcel('EN_LIVRAISON', 'AVEC_LE_LIVREUR');
    const id = await ask(p.code, { address: '1 rue de Rome' });
    expect((await apply(id, depotToken)).status).toBe(403);
    expect((await apply(id, sellerToken)).status).toBe(403);
    expect((await apply(id, adminToken)).status).toBe(200);
  });

  it('answers 404 for an unknown request', async () => {
    expect((await apply(randomUUID())).status).toBe(404);
  });
});

describe('POST /demandes-modification/:id/refuse (D-57)', () => {
  it('refuses with a reason the seller reads; the parcel is unchanged', async () => {
    const p = await parcel('EN_LIVRAISON', 'AVEC_LE_LIVREUR');
    const id = await ask(p.code, { recipientPhone: '98765432' });

    const response = await refuse(id, 'Le client nous a confirmé son ancien numéro');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id, status: 'REFUSEE' });
    expect((await t.prisma.parcel.findUniqueOrThrow({ where: { id: p.id } })).recipientPhone).toBe(
      '29876543',
    );
    const seen = await t.request('GET', `/parcels/${p.code}`, { token: sellerToken });
    expect(seen.body.changeRequests[0]).toMatchObject({
      status: 'REFUSEE',
      refusalReason: 'Le client nous a confirmé son ancien numéro',
    });
  });

  it('needs a reason, and refuses a request already handled', async () => {
    const p = await parcel('EN_LIVRAISON', 'AVEC_LE_LIVREUR');
    const id = await ask(p.code, { recipientPhone: '98765432' });
    expect((await refuse(id, '')).status).toBe(400);
    await t.request('POST', `/parcels/${p.code}/change-requests/${id}/withdraw`, {
      token: sellerToken,
    });
    const response = await refuse(id, 'Trop tard');
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('DEMANDE_TRAITEE');
  });
});

describe('the label to reprint (A-9, D-57)', () => {
  async function flagged() {
    const p = await parcel('AU_DEPOT', 'AU_DEPOT');
    await apply(await ask(p.code, { address: '5 avenue Habib Bourguiba' }));
    return p;
  }

  it('shows in Colis and Tournées', async () => {
    const p = await flagged();
    const list = await t.request('GET', `/colis?q=${p.code}`, { token: depotToken });
    expect(list.body.items[0].labelReprintNeeded).toBe(true);
    const detail = await t.request('GET', `/colis/${p.code}`, { token: depotToken });
    expect(detail.body.labelReprintNeeded).toBe(true);
    const tournees = await t.request('GET', '/tournees', { token: depotToken });
    const row = tournees.body.zones
      .flatMap((z: { parcels: Array<{ code: string }> }) => z.parcels)
      .find((r: { code: string }) => r.code === p.code);
    expect(row.labelReprintNeeded).toBe(true);
  });

  it('warns on the next depot scan', async () => {
    const p = await flagged();
    const response = await t.request('POST', '/scans/depot', {
      token: depotToken,
      body: {
        clientScanId: randomUUID(),
        mode: 'SORTIE_COURSIER',
        rawCode: p.code,
        courierId: ali.id,
        source: 'WEB_DOUCHETTE',
        deviceTime: t.clock.now().toISOString(),
      },
    });
    expect(response.body).toMatchObject({ accepted: true, labelReprintNeeded: true });
  });

  it('is cleared by the team’s reprint, not by the seller’s', async () => {
    const p = await flagged();
    await t.request('GET', `/parcels/${p.code}/label?format=A4`, { token: sellerToken });
    expect(
      (await t.prisma.parcel.findUniqueOrThrow({ where: { id: p.id } })).labelReprintNeeded,
    ).toBe(true);

    const response = await t.request('GET', `/colis/${p.code}/label?format=THERMAL`, {
      token: depotToken,
    });
    expect(response.status).toBe(200);
    expect(
      (await t.prisma.parcel.findUniqueOrThrow({ where: { id: p.id } })).labelReprintNeeded,
    ).toBe(false);
  });

  it('is not raised when the request changes nothing on the parcel', async () => {
    const p = await parcel('EN_LIVRAISON', 'AVEC_LE_LIVREUR');
    await t.prisma.parcel.update({ where: { id: p.id }, data: { recipientPhone2: '55111222' } });
    const id = await ask(p.code, { recipientPhone2: '55111222' });
    await apply(id);
    // Nothing changed: the same phone 2.
    expect(
      (await t.prisma.parcel.findUniqueOrThrow({ where: { id: p.id } })).labelReprintNeeded,
    ).toBe(false);
  });
});

describe('the requests on the parcel (Admin 4.3)', () => {
  it('lists the parcel’s requests on its Colis page, for every staff role', async () => {
    const p = await parcel('EN_LIVRAISON', 'AVEC_LE_LIVREUR');
    const id = await ask(p.code, { landmark: 'Derrière la poste' });
    const detail = await t.request('GET', `/colis/${p.code}`, { token: depotToken });
    expect(detail.body.changeRequests).toEqual([
      expect.objectContaining({
        id,
        status: 'EN_ATTENTE',
        fields: [{ field: 'landmark', before: null, after: 'Derrière la poste' }],
        applyRefusal: null,
      }),
    ]);
  });
});
