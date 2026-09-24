import { randomUUID } from 'node:crypto';
import type { ParcelLocation, ParcelStatus, Prisma } from '@prisma/client';
import { seed } from '../../prisma/seed';
import { createTestApp, createUser, login, type Fixture, type TestApp } from '../support/test-app';
import { createParcel } from '../support/work-fixtures';

/**
 * Forcer un statut (Admin 4.3, 4.17, D-56): the admin alone corrects a
 * scanning mistake, with a reason, in one FORCAGE_STATUT event and an audit
 * entry. In phase 5: between Ramassé, Au dépôt and En livraison, or the place
 * of an À vérifier, Relancé or Retour au dépôt parcel; nothing touching money
 * or a return; no effect runs. And cancelling a depot scan after its window,
 * the admin's too (A-11).
 */

let t: TestApp;
let adminToken: string;
let admin: { id: string };
let depot: Fixture;
let depotToken: string;
let seller: Fixture;
let ali: Fixture;

const ADMIN = { username: 'admin', password: 'Mot-De-Passe-Admin-42' };

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

function force(code: string, body: Record<string, unknown>, token = adminToken) {
  return t.request('POST', `/colis/${code}/forcer-statut`, { token, body });
}

async function reload(id: string) {
  return t.prisma.parcel.findUniqueOrThrow({ where: { id } });
}

beforeAll(async () => {
  t = await createTestApp();
  await seed(t.prisma, { log: () => undefined, adminPassword: ADMIN.password });
  admin = await t.prisma.user.findFirstOrThrow({ where: { username: 'admin' } });
  depot = await createUser(t.prisma, { role: 'DEPOT', username: 'force.depot' });
  seller = await createUser(t.prisma, { role: 'VENDEUR', email: 'force@boutique.tn' });
  ali = await createUser(t.prisma, { role: 'LIVREUR' });
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  t.throttle.clear();
  adminToken = (await t.request('POST', '/auth/login/staff', { body: ADMIN })).body.accessToken;
  depotToken = (await login(t, depot)).accessToken;
});

describe('POST /colis/:code/forcer-statut (D-56)', () => {
  it('moves a parcel back to Ramassé, with a FORCAGE_STATUT event and an audit entry', async () => {
    const p = await parcel('AU_DEPOT', 'AU_DEPOT');

    const response = await force(p.code, {
      status: 'RAMASSE',
      location: 'AVEC_LE_RAMASSEUR',
      reason: 'Entrée dépôt scannée sur le mauvais colis',
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      code: p.code,
      status: 'RAMASSE',
      location: 'AVEC_LE_RAMASSEUR',
    });
    expect(await reload(p.id)).toMatchObject({ status: 'RAMASSE', location: 'AVEC_LE_RAMASSEUR' });
    const [event] = await t.prisma.parcelEvent.findMany({
      where: { parcelId: p.id, type: 'FORCAGE_STATUT', actorRole: 'ADMIN' },
    });
    expect(event).toMatchObject({
      previousStatus: 'AU_DEPOT',
      newStatus: 'RAMASSE',
      previousLocation: 'AU_DEPOT',
      newLocation: 'AVEC_LE_RAMASSEUR',
      actorUserId: admin.id,
      reasonText: 'Entrée dépôt scannée sur le mauvais colis',
    });
    const [entry] = await t.prisma.auditLog.findMany({
      where: { entityId: p.id, action: 'FORCAGE_STATUT' },
    });
    expect(entry).toMatchObject({
      actorRole: 'ADMIN',
      before: { status: 'AU_DEPOT', location: 'AU_DEPOT', currentLivreurId: null },
      after: { status: 'RAMASSE', location: 'AVEC_LE_RAMASSEUR', currentLivreurId: null },
      reason: 'Entrée dépôt scannée sur le mauvais colis',
    });
  });

  it('puts a parcel out with the livreur who has it, and back at the depot without him', async () => {
    const p = await parcel('AU_DEPOT', 'AU_DEPOT', { plannedLivreurId: ali.courierId! });
    const out = await force(p.code, {
      status: 'EN_LIVRAISON',
      location: 'AVEC_LE_LIVREUR',
      livreurId: ali.id,
      reason: 'Sorti sans être scanné',
    });
    expect(out.status).toBe(200);
    expect(await reload(p.id)).toMatchObject({
      status: 'EN_LIVRAISON',
      currentLivreurId: ali.courierId,
      plannedLivreurId: null,
    });

    const back = await force(p.code, {
      status: 'AU_DEPOT',
      location: 'AU_DEPOT',
      reason: 'Jamais parti, resté au dépôt',
    });
    expect(back.status).toBe(200);
    expect(await reload(p.id)).toMatchObject({
      status: 'AU_DEPOT',
      location: 'AU_DEPOT',
      currentLivreurId: null,
      attemptCount: 0,
    });
  });

  it('fixes the place of an À vérifier parcel only: no clock, no attempt, no charge', async () => {
    const deadline = new Date('2026-09-27T08:00:00.000Z');
    const p = await parcel('A_VERIFIER', 'AVEC_LE_LIVREUR', {
      currentLivreurId: ali.courierId!,
      attemptCount: 1,
      verifyDeadlineAt: deadline,
    });
    const response = await force(p.code, {
      status: 'A_VERIFIER',
      location: 'AU_DEPOT',
      reason: 'Rendu au dépôt sans scan de retour',
    });
    expect(response.status).toBe(200);
    expect(await reload(p.id)).toMatchObject({
      status: 'A_VERIFIER',
      location: 'AU_DEPOT',
      attemptCount: 1,
      verifyDeadlineAt: deadline,
    });
    expect(await t.prisma.sellerCharge.count({ where: { parcelId: p.id } })).toBe(0);
  });

  it('refuses what phase 5 does not correct, with its reason', async () => {
    const delivered = await parcel('LIVRE', 'CHEZ_LE_CLIENT', { cashStatus: 'CHEZ_LE_COURSIER' });
    const back = await force(delivered.code, {
      status: 'EN_LIVRAISON',
      location: 'AVEC_LE_LIVREUR',
      livreurId: ali.id,
      reason: 'Livré par erreur',
    });
    expect(back.status).toBe(409);
    expect(back.body.code).toBe('FORCAGE_NON_AUTORISE');
    expect((await reload(delivered.id)).status).toBe('LIVRE');

    const atDepot = await parcel('AU_DEPOT', 'AU_DEPOT');
    for (const target of [
      { status: 'LIVRE', location: 'CHEZ_LE_CLIENT' },
      { status: 'RETOUR_AU_DEPOT', location: 'AU_DEPOT' },
      { status: 'A_VERIFIER', location: 'AU_DEPOT' },
      { status: 'AU_DEPOT', location: 'AU_DEPOT' },
    ]) {
      const response = await force(atDepot.code, { ...target, reason: 'Correction de test' });
      expect(response.status).toBe(409);
    }
  });

  it('refuses a livreur who is not one', async () => {
    const p = await parcel('AU_DEPOT', 'AU_DEPOT');
    const response = await force(p.code, {
      status: 'EN_LIVRAISON',
      location: 'AVEC_LE_LIVREUR',
      livreurId: depot.id,
      reason: 'Sorti sans être scanné',
    });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('LIVREUR_INVALIDE');
  });

  it('needs a reason, and the livreur when put with one', async () => {
    const p = await parcel('AU_DEPOT', 'AU_DEPOT');
    expect((await force(p.code, { status: 'RAMASSE', location: 'AVEC_LE_RAMASSEUR' })).status).toBe(
      400,
    );
    expect(
      (
        await force(p.code, {
          status: 'EN_LIVRAISON',
          location: 'AVEC_LE_LIVREUR',
          reason: 'Sorti sans être scanné',
        })
      ).status,
    ).toBe(400);
  });

  it('is the admin’s alone (Admin 2)', async () => {
    const p = await parcel('AU_DEPOT', 'AU_DEPOT');
    const body = { status: 'RAMASSE', location: 'AVEC_LE_RAMASSEUR', reason: 'Correction de test' };
    expect((await force(p.code, body, depotToken)).status).toBe(403);
    const sc = await createUser(t.prisma, { role: 'SERVICE_CLIENT', username: 'force.sc' });
    expect((await force(p.code, body, (await login(t, sc)).accessToken)).status).toBe(403);
  });

  it('answers 404 for an unknown code', async () => {
    const response = await force('FG-ZZZZZZZZ', {
      status: 'RAMASSE',
      location: 'AVEC_LE_RAMASSEUR',
      reason: 'Correction de test',
    });
    expect(response.status).toBe(404);
  });

  it('shows the seller "Statut corrigé par Faffa Go"', async () => {
    const p = await parcel('AU_DEPOT', 'AU_DEPOT');
    await force(p.code, {
      status: 'RAMASSE',
      location: 'AVEC_LE_RAMASSEUR',
      reason: 'Entrée scannée par erreur',
    });
    const seen = await t.request('GET', `/parcels/${p.code}`, {
      token: (await login(t, seller)).accessToken,
    });
    expect(seen.body.timeline.at(-1)).toMatchObject({
      type: 'FORCAGE_STATUT',
      actor: { kind: 'FAFFA_GO' },
    });
  });
});

describe('cancelling a depot scan after its window (A-11, D-56)', () => {
  async function scanned() {
    const p = await parcel('RAMASSE', 'AVEC_LE_RAMASSEUR');
    const response = await t.request('POST', '/scans/depot', {
      token: depotToken,
      body: {
        clientScanId: randomUUID(),
        mode: 'ENTREE_DEPOT',
        rawCode: p.code,
        source: 'WEB_DOUCHETTE',
        deviceTime: t.clock.now().toISOString(),
      },
    });
    expect(response.body.accepted).toBe(true);
    // Past the 60 seconds of the scanner's own cancellation; the sessions
    // opened before have timed out meanwhile.
    t.clock.advance(3600);
    t.throttle.clear();
    adminToken = (await t.request('POST', '/auth/login/staff', { body: ADMIN })).body.accessToken;
    depotToken = (await login(t, depot)).accessToken;
    return { p, scanId: response.body.scanId as string };
  }

  function cancelAsAdmin(scanId: string, reason: unknown, token = adminToken) {
    return t.request('POST', `/scans/depot/${scanId}/cancel-admin`, { token, body: { reason } });
  }

  it('puts the parcel back, with the reason, audited', async () => {
    const { p, scanId } = await scanned();

    const response = await cancelAsAdmin(scanId, 'Colis scanné à la place d’un autre');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ scanId, cancelled: true });
    expect(await reload(p.id)).toMatchObject({ status: 'RAMASSE', location: 'AVEC_LE_RAMASSEUR' });
    const scan = await t.prisma.scan.findUniqueOrThrow({ where: { id: scanId } });
    expect(scan).toMatchObject({
      cancelledByUserId: admin.id,
      cancelReason: 'Colis scanné à la place d’un autre',
    });
    const [event] = await t.prisma.parcelEvent.findMany({
      where: { parcelId: p.id, type: 'ANNULATION_SCAN' },
    });
    expect(event).toMatchObject({
      actorRole: 'ADMIN',
      reasonText: 'Colis scanné à la place d’un autre',
    });
    const [entry] = await t.prisma.auditLog.findMany({
      where: { entityId: scanId, action: 'ANNULATION_SCAN_ADMIN' },
    });
    expect(entry).toMatchObject({
      actorRole: 'ADMIN',
      reason: 'Colis scanné à la place d’un autre',
      before: { status: 'AU_DEPOT', location: 'AU_DEPOT' },
      after: { status: 'RAMASSE', location: 'AVEC_LE_RAMASSEUR' },
    });
  });

  it('refuses once something else happened to the parcel: Forcer un statut then', async () => {
    const { p, scanId } = await scanned();
    await force(p.code, {
      status: 'EN_LIVRAISON',
      location: 'AVEC_LE_LIVREUR',
      livreurId: ali.id,
      reason: 'Sorti sans scan',
    });
    const response = await cancelAsAdmin(scanId, 'Trop tard pour annuler');
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('ANNULATION_COLIS_MODIFIE');
  });

  it('needs a reason, and is the admin’s alone', async () => {
    const { scanId } = await scanned();
    expect((await cancelAsAdmin(scanId, '')).status).toBe(400);
    expect((await cancelAsAdmin(scanId, 'Correction de test', depotToken)).status).toBe(403);
  });

  it('shows the admin which scans he can still cancel on the parcel’s page', async () => {
    const { p, scanId } = await scanned();
    const detail = await t.request('GET', `/colis/${p.code}`, { token: adminToken });
    const entree = detail.body.events.find((e: { type: string }) => e.type === 'ENTREE_DEPOT');
    expect(entree.scan).toMatchObject({ id: scanId, adminCancellable: true });
    await cancelAsAdmin(scanId, 'Correction de test');
    const after = await t.request('GET', `/colis/${p.code}`, { token: adminToken });
    const cancelled = after.body.events.find((e: { type: string }) => e.type === 'ENTREE_DEPOT');
    expect(cancelled.scan).toMatchObject({ cancelled: true, adminCancellable: false });
  });
});
