import { randomUUID } from 'node:crypto';
import type { ParcelLocation, ParcelStatus, Prisma } from '@prisma/client';
import { seed } from '../../prisma/seed';
import { createTestApp, createUser, login, type Fixture, type TestApp } from '../support/test-app';
import { createParcel } from '../support/work-fixtures';

/**
 * Annuler le dernier scan (Admin 4.2, A-11, D-54): the scanner's own last
 * accepted scan, within the window of Paramètres measured on the server
 * clock, while nothing else has happened to the parcel. The parcel goes back
 * to what it was, with an ANNULATION_SCAN event; the scan row stays.
 */

let t: TestApp;
let depot: Fixture;
let depotToken: string;
let otherDepot: Fixture;
let seller: Fixture;
let ali: Fixture;
let sami: Fixture;

const ADMIN = { username: 'admin', password: 'Mot-De-Passe-Admin-42' };
const TODAY = '2026-09-25';

beforeAll(async () => {
  t = await createTestApp();
  await seed(t.prisma, { log: () => undefined, adminPassword: ADMIN.password });
  depot = await createUser(t.prisma, { role: 'DEPOT', username: 'cancel.depot' });
  otherDepot = await createUser(t.prisma, { role: 'DEPOT', username: 'cancel.depot2' });
  seller = await createUser(t.prisma, { role: 'VENDEUR', email: 'cancel@boutique.tn' });
  ali = await createUser(t.prisma, { role: 'LIVREUR' });
  sami = await createUser(t.prisma, { role: 'LIVREUR' });
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  t.throttle.clear();
  depotToken = (await login(t, depot)).accessToken;
});

async function parcel(input: {
  status: ParcelStatus;
  location: ParcelLocation;
  livreur?: Fixture;
  extra?: Partial<Prisma.ParcelUncheckedCreateInput>;
}) {
  const id = await createParcel(t.prisma, {
    sellerId: seller.sellerId!,
    createdByUserId: seller.id,
    status: input.status,
    location: input.location,
    currentLivreurId: input.livreur?.courierId ?? null,
    extra: input.extra,
  });
  return t.prisma.parcel.findUniqueOrThrow({ where: { id } });
}

async function scan(
  body: {
    mode: 'ENTREE_DEPOT' | 'SORTIE_COURSIER' | 'RETOUR_DE_TOURNEE';
    rawCode: string;
    courierId?: string;
  },
  token = depotToken,
): Promise<string> {
  const response = await t.request('POST', '/scans/depot', {
    token,
    body: {
      clientScanId: randomUUID(),
      source: 'WEB_DOUCHETTE',
      deviceTime: t.clock.now().toISOString(),
      ...body,
    },
  });
  expect(response.body.accepted).toBe(true);
  return response.body.scanId;
}

function cancel(scanId: string, token = depotToken) {
  return t.request('POST', `/scans/depot/${scanId}/cancel`, { token });
}

async function reload(id: string) {
  return t.prisma.parcel.findUniqueOrThrow({ where: { id } });
}

describe('cancelling the last scan (D-54)', () => {
  it('puts an Entrée dépôt back: Ramassé with the ramasseur, one ANNULATION_SCAN event', async () => {
    const p = await parcel({ status: 'RAMASSE', location: 'AVEC_LE_RAMASSEUR' });
    const scanId = await scan({ mode: 'ENTREE_DEPOT', rawCode: p.code });
    t.clock.advance(30);

    const response = await cancel(scanId);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      scanId,
      cancelled: true,
      message: 'Scan annulé · Ramassé · Avec le ramasseur',
      parcel: { code: p.code, status: 'RAMASSE', location: 'AVEC_LE_RAMASSEUR' },
    });
    expect(await reload(p.id)).toMatchObject({ status: 'RAMASSE', location: 'AVEC_LE_RAMASSEUR' });

    const row = await t.prisma.scan.findUniqueOrThrow({ where: { id: scanId } });
    expect(row).toMatchObject({ accepted: true, cancelledByUserId: depot.id });
    expect(row.cancelledAt).toEqual(t.clock.now());

    const [last] = await t.prisma.parcelEvent.findMany({
      where: { parcelId: p.id },
      orderBy: { sequence: 'desc' },
      take: 1,
    });
    expect(last).toMatchObject({
      type: 'ANNULATION_SCAN',
      previousStatus: 'AU_DEPOT',
      newStatus: 'RAMASSE',
      previousLocation: 'AU_DEPOT',
      newLocation: 'AVEC_LE_RAMASSEUR',
      scanId,
      actorUserId: depot.id,
      actorRole: 'DEPOT',
      metadata: { scanAnnule: 'ENTREE_DEPOT' },
    });
  });

  it('puts a Sortie coursier back, relance and manual move included', async () => {
    const p = await parcel({
      status: 'RELANCE',
      location: 'AU_DEPOT',
      extra: {
        relaunchDate: new Date(`${TODAY}T00:00:00.000Z`),
        relaunchSlot: 'APRES_MIDI',
        relaunchOrigin: 'CLIENT',
        attemptCount: 1,
        plannedLivreurId: sami.courierId!,
      },
    });
    const scanId = await scan({ mode: 'SORTIE_COURSIER', rawCode: p.code, courierId: ali.id });

    expect((await cancel(scanId)).status).toBe(200);
    expect(await reload(p.id)).toMatchObject({
      status: 'RELANCE',
      location: 'AU_DEPOT',
      currentLivreurId: null,
      plannedLivreurId: sami.courierId,
      relaunchDate: new Date(`${TODAY}T00:00:00.000Z`),
      relaunchSlot: 'APRES_MIDI',
      relaunchOrigin: 'CLIENT',
      attemptCount: 1,
    });
  });

  it('puts a Retour de tournée back: with the livreur again', async () => {
    const p = await parcel({ status: 'EN_LIVRAISON', location: 'AVEC_LE_LIVREUR', livreur: ali });
    const scanId = await scan({ mode: 'RETOUR_DE_TOURNEE', rawCode: p.code, courierId: ali.id });

    expect((await cancel(scanId)).status).toBe(200);
    expect(await reload(p.id)).toMatchObject({
      status: 'EN_LIVRAISON',
      location: 'AVEC_LE_LIVREUR',
      currentLivreurId: ali.courierId,
    });
  });

  it('lets the parcel be scanned again afterwards', async () => {
    const p = await parcel({ status: 'RAMASSE', location: 'AVEC_LE_RAMASSEUR' });
    await cancel(await scan({ mode: 'ENTREE_DEPOT', rawCode: p.code }));
    await scan({ mode: 'ENTREE_DEPOT', rawCode: p.code });
    expect((await reload(p.id)).status).toBe('AU_DEPOT');
  });

  it('answers the same when asked twice, and cancels once', async () => {
    const p = await parcel({ status: 'RAMASSE', location: 'AVEC_LE_RAMASSEUR' });
    const scanId = await scan({ mode: 'ENTREE_DEPOT', rawCode: p.code });
    const first = await cancel(scanId);
    const second = await cancel(scanId);

    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(
      await t.prisma.parcelEvent.count({ where: { parcelId: p.id, type: 'ANNULATION_SCAN' } }),
    ).toBe(1);
  });
});

describe('what cannot be cancelled (A-11, D-54)', () => {
  it('refuses after the window of Paramètres, its last second included', async () => {
    const a = await parcel({ status: 'RAMASSE', location: 'AVEC_LE_RAMASSEUR' });
    const inTime = await scan({ mode: 'ENTREE_DEPOT', rawCode: a.code });
    t.clock.advance(60);
    expect((await cancel(inTime)).status).toBe(200);

    const b = await parcel({ status: 'RAMASSE', location: 'AVEC_LE_RAMASSEUR' });
    const late = await scan({ mode: 'ENTREE_DEPOT', rawCode: b.code });
    t.clock.advance(61);
    const response = await cancel(late);
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: 'ANNULATION_HORS_DELAI',
      message: 'Délai d’annulation dépassé : seul l’admin peut corriger',
    });
    expect((await reload(b.id)).status).toBe('AU_DEPOT');
  });

  it('refuses an older scan of his; the previous one becomes the last once cancelled', async () => {
    const a = await parcel({ status: 'RAMASSE', location: 'AVEC_LE_RAMASSEUR' });
    const b = await parcel({ status: 'RAMASSE', location: 'AVEC_LE_RAMASSEUR' });
    const first = await scan({ mode: 'ENTREE_DEPOT', rawCode: a.code });
    const second = await scan({ mode: 'ENTREE_DEPOT', rawCode: b.code });

    const refused = await cancel(first);
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('ANNULATION_PAS_DERNIER');

    expect((await cancel(second)).status).toBe(200);
    expect((await cancel(first)).status).toBe(200);
  });

  it('ignores refused scans: they are never “the last scan”', async () => {
    const a = await parcel({ status: 'RAMASSE', location: 'AVEC_LE_RAMASSEUR' });
    const accepted = await scan({ mode: 'ENTREE_DEPOT', rawCode: a.code });
    const refused = await t.request('POST', '/scans/depot', {
      token: depotToken,
      body: {
        clientScanId: randomUUID(),
        mode: 'ENTREE_DEPOT',
        rawCode: 'FG-ZZZZZZZZ',
        source: 'WEB_DOUCHETTE',
        deviceTime: t.clock.now().toISOString(),
      },
    });
    expect(refused.body.accepted).toBe(false);

    const cannot = await cancel(refused.body.scanId);
    expect(cannot.status).toBe(409);
    expect(cannot.body.code).toBe('ANNULATION_SCAN_REFUSE');
    expect((await cancel(accepted)).status).toBe(200);
  });

  it('is for the person who scanned only, even another depot or the admin (D-54)', async () => {
    const p = await parcel({ status: 'RAMASSE', location: 'AVEC_LE_RAMASSEUR' });
    const scanId = await scan({ mode: 'ENTREE_DEPOT', rawCode: p.code });

    const other = await cancel(scanId, (await login(t, otherDepot)).accessToken);
    expect(other.status).toBe(409);
    expect(other.body.code).toBe('ANNULATION_AUTRE_PERSONNE');

    const adminToken = (await t.request('POST', '/auth/login/staff', { body: ADMIN })).body
      .accessToken;
    const admin = await cancel(scanId, adminToken);
    expect(admin.body.code).toBe('ANNULATION_AUTRE_PERSONNE');
    expect((await reload(p.id)).status).toBe('AU_DEPOT');
  });

  it('refuses once something else happened to the parcel since', async () => {
    const p = await parcel({ status: 'RAMASSE', location: 'AVEC_LE_RAMASSEUR' });
    const entree = await scan({ mode: 'ENTREE_DEPOT', rawCode: p.code });
    // Another person sends it out meanwhile.
    await scan(
      { mode: 'SORTIE_COURSIER', rawCode: p.code, courierId: ali.id },
      (await login(t, otherDepot)).accessToken,
    );

    const response = await cancel(entree);
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: 'ANNULATION_COLIS_MODIFIE',
      message: 'Le colis a changé depuis ce scan : il ne peut plus être annulé',
    });
    expect((await reload(p.id)).status).toBe('EN_LIVRAISON');
  });

  it('refuses an unknown scan, and is closed to Service client', async () => {
    const unknown = await cancel(randomUUID());
    expect(unknown.status).toBe(404);
    expect(unknown.body.code).toBe('SCAN_INTROUVABLE');

    const p = await parcel({ status: 'RAMASSE', location: 'AVEC_LE_RAMASSEUR' });
    const scanId = await scan({ mode: 'ENTREE_DEPOT', rawCode: p.code });
    const sc = await createUser(t.prisma, { role: 'SERVICE_CLIENT', username: 'cancel.sc' });
    expect((await cancel(scanId, (await login(t, sc)).accessToken)).status).toBe(403);
  });
});
