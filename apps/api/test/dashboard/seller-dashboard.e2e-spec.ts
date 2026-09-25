import { randomUUID } from 'node:crypto';
import type { FailureReason, ParcelEventType } from '@prisma/client';
import {
  COURIER_APP_HEADERS,
  createTestApp,
  createUser,
  login,
  type Fixture,
  type TestApp,
} from '../support/test-app';
import { createParcel, place } from '../support/work-fixtures';

/**
 * Tableau de bord (Vendeur 4.1, D-48): what happened to the seller's parcels
 * over a period of Tunis days. Distinct parcels per tile, a cancelled scan
 * taken back, a status correction counted nowhere, a postponement (D-9)
 * under Reportés and never under Échecs.
 *
 * The test clock reads 2026-09-25 09:00 in Tunis.
 */

let t: TestApp;
let admin: Fixture;
let livreur: Fixture;
let sellers = 0;

const ZERO = {
  CREES: 0,
  RAMASSES: 0,
  EN_LIVRAISON: 0,
  LIVRES: 0,
  ECHECS: 0,
  REPORTES: 0,
};

/** A seller of his own, so each test counts only its own events. */
async function newSeller(): Promise<{ seller: Fixture; token: string }> {
  sellers += 1;
  const seller = await createUser(t.prisma, {
    role: 'VENDEUR',
    email: `tableau${sellers}@bord.tn`,
  });
  return { seller, token: (await login(t, seller)).accessToken };
}

async function parcelOf(seller: Fixture): Promise<string> {
  return createParcel(t.prisma, { sellerId: seller.sellerId!, createdByUserId: seller.id });
}

/**
 * An event written at a chosen server time. Only the dashboard reads it: the
 * parcel's own status is not moved, which the database allows (D-21 checks
 * parcels, not events).
 */
async function happened(
  parcelId: string,
  type: ParcelEventType,
  at: string,
  options: { reason?: FailureReason; cancelledScan?: boolean; deviceTime?: string } = {},
): Promise<void> {
  let scanId: string | undefined;
  if (options.cancelledScan !== undefined) {
    const scan = await t.prisma.scan.create({
      data: {
        clientScanId: randomUUID(),
        action: 'LIVRE',
        rawCode: 'FG-TEST',
        parcelId,
        actorUserId: livreur.id,
        source: 'APP_COURSIER',
        accepted: true,
        parcelBefore: { status: 'EN_LIVRAISON', location: 'AVEC_LE_LIVREUR' },
        collectedMillimes: 85000n,
        deviceTime: new Date(at),
        businessDate: new Date(`${at.slice(0, 10)}T00:00:00.000Z`),
        ...(options.cancelledScan
          ? { cancelledAt: new Date(at), cancelledByUserId: livreur.id }
          : {}),
      },
    });
    scanId = scan.id;
  }
  await t.prisma.parcelEvent.create({
    data: {
      parcelId,
      type,
      actorUserId: livreur.id,
      reasonCode: options.reason ?? null,
      scanId,
      deviceTime: options.deviceTime ? new Date(options.deviceTime) : null,
      serverTime: new Date(at),
    },
  });
}

function dashboard(token: string, query = '') {
  return t.request('GET', `/dashboard${query}`, { token });
}

beforeAll(async () => {
  t = await createTestApp();
  await place(t.prisma);
  admin = await createUser(t.prisma, { role: 'ADMIN', username: 'admin.tableau' });
  livreur = await createUser(t.prisma, { role: 'LIVREUR' });
});
afterAll(async () => {
  await t.close();
});
beforeEach(() => {
  t.throttle.clear();
});

describe('the counts (Vendeur 4.1, D-48)', () => {
  it('shows today by default, one tile per kind of event', async () => {
    const { seller, token } = await newSeller();
    const [a, b, c, d] = await Promise.all([1, 2, 3, 4].map(() => parcelOf(seller)));
    await happened(a!, 'CREATION', '2026-09-25T07:00:00.000Z');
    await happened(a!, 'RAMASSAGE', '2026-09-25T08:00:00.000Z');
    await happened(b!, 'SORTIE_COURSIER', '2026-09-25T06:00:00.000Z');
    await happened(b!, 'LIVRAISON', '2026-09-25T07:30:00.000Z');
    await happened(c!, 'ECHEC_LIVRAISON', '2026-09-25T07:40:00.000Z', { reason: 'NE_REPOND_PAS' });
    await happened(d!, 'ECHEC_LIVRAISON', '2026-09-25T07:50:00.000Z', {
      reason: 'REPORTE_PAR_LE_CLIENT',
    });

    const response = await dashboard(token);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      from: '2026-09-25',
      to: '2026-09-25',
      counts: { CREES: 1, RAMASSES: 1, EN_LIVRAISON: 1, LIVRES: 1, ECHECS: 1, REPORTES: 1 },
    });
  });

  it('cuts the day at midnight in Tunis, not in UTC', async () => {
    const { seller, token } = await newSeller();
    const late = await parcelOf(seller);
    const early = await parcelOf(seller);
    // 23:30 UTC on the 24th is 00:30 on the 25th in Tunis.
    await happened(late, 'CREATION', '2026-09-24T23:30:00.000Z');
    // 22:59 UTC on the 24th is 23:59 on the 24th in Tunis.
    await happened(early, 'CREATION', '2026-09-24T22:59:59.000Z');

    expect((await dashboard(token)).body.counts.CREES).toBe(1);
    const yesterday = await dashboard(token, '?from=2026-09-24&to=2026-09-24');
    expect(yesterday.body.counts.CREES).toBe(1);
  });

  it('files an offline scan under the day it was made on the phone (A-12)', async () => {
    const { seller, token } = await newSeller();
    // Scanned at 23:40 in Tunis on the 24th, synced at 09:00 on the 25th.
    await happened(await parcelOf(seller), 'LIVRAISON', '2026-09-25T08:00:00.000Z', {
      deviceTime: '2026-09-24T22:40:00.000Z',
    });
    expect((await dashboard(token)).body.counts.LIVRES).toBe(0);
    const yesterday = await dashboard(token, '?from=2026-09-24&to=2026-09-24');
    expect(yesterday.body.counts.LIVRES).toBe(1);
  });

  it('counts a 7-day range, both ends included', async () => {
    const { seller, token } = await newSeller();
    const days = ['2026-09-18', '2026-09-19', '2026-09-22', '2026-09-25', '2026-09-26'];
    for (const day of days) {
      await happened(await parcelOf(seller), 'LIVRAISON', `${day}T10:00:00.000Z`);
    }
    const response = await dashboard(token, '?from=2026-09-19&to=2026-09-25');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ from: '2026-09-19', to: '2026-09-25' });
    expect(response.body.counts.LIVRES).toBe(3);
  });

  it('counts a range that crosses a month', async () => {
    const { seller, token } = await newSeller();
    const days = [
      '2026-08-27',
      '2026-08-28',
      '2026-08-31',
      '2026-09-01',
      '2026-09-03',
      '2026-09-04',
    ];
    for (const day of days) {
      await happened(await parcelOf(seller), 'SORTIE_COURSIER', `${day}T10:00:00.000Z`);
    }
    // The first instant of 2026-08-28 in Tunis is 23:00 UTC on the 27th.
    await happened(await parcelOf(seller), 'SORTIE_COURSIER', '2026-08-27T23:00:00.000Z');
    const response = await dashboard(token, '?from=2026-08-28&to=2026-09-03');
    expect(response.body.counts.EN_LIVRAISON).toBe(5);
  });

  it('puts a customer postponement under Reportés, not under Échecs (D-9)', async () => {
    const { seller, token } = await newSeller();
    const reported = await parcelOf(seller);
    const failedThenReported = await parcelOf(seller);
    await happened(reported, 'ECHEC_LIVRAISON', '2026-09-25T07:00:00.000Z', {
      reason: 'REPORTE_PAR_LE_CLIENT',
    });
    await happened(failedThenReported, 'ECHEC_LIVRAISON', '2026-09-25T07:10:00.000Z', {
      reason: 'INJOIGNABLE',
    });
    await happened(failedThenReported, 'ECHEC_LIVRAISON', '2026-09-25T07:20:00.000Z', {
      reason: 'REPORTE_PAR_LE_CLIENT',
    });

    const response = await dashboard(token);
    expect(response.body.counts).toEqual({ ...ZERO, ECHECS: 1, REPORTES: 2 });
  });

  it('counts each parcel once per tile', async () => {
    const { seller, token } = await newSeller();
    const parcel = await parcelOf(seller);
    await happened(parcel, 'ECHEC_LIVRAISON', '2026-09-19T10:00:00.000Z', { reason: 'REFUSE' });
    await happened(parcel, 'ECHEC_LIVRAISON', '2026-09-22T10:00:00.000Z', {
      reason: 'NE_REPOND_PAS',
    });
    await happened(parcel, 'SORTIE_COURSIER', '2026-09-19T08:00:00.000Z');
    await happened(parcel, 'SORTIE_COURSIER', '2026-09-22T08:00:00.000Z');

    const response = await dashboard(token, '?from=2026-09-19&to=2026-09-25');
    expect(response.body.counts).toEqual({ ...ZERO, EN_LIVRAISON: 1, ECHECS: 1 });
  });

  it('takes a cancelled scan back, and counts a status correction nowhere', async () => {
    const { seller, token } = await newSeller();
    const cancelled = await parcelOf(seller);
    const kept = await parcelOf(seller);
    const corrected = await parcelOf(seller);
    await happened(cancelled, 'LIVRAISON', '2026-09-25T07:00:00.000Z', { cancelledScan: true });
    await happened(kept, 'LIVRAISON', '2026-09-25T07:05:00.000Z', { cancelledScan: false });
    await happened(corrected, 'FORCAGE_STATUT', '2026-09-25T07:10:00.000Z');

    const response = await dashboard(token);
    expect(response.body.counts).toEqual({ ...ZERO, LIVRES: 1 });
  });

  it('never counts another seller’s parcels', async () => {
    const { seller } = await newSeller();
    const { token: otherToken } = await newSeller();
    await happened(await parcelOf(seller), 'CREATION', '2026-09-25T07:00:00.000Z');
    expect((await dashboard(otherToken)).body.counts).toEqual(ZERO);
  });
});

describe('the period (D-48)', () => {
  it('refuses a range over 366 days', async () => {
    const { token } = await newSeller();
    const tooLong = await dashboard(token, '?from=2025-09-24&to=2026-09-25');
    expect(tooLong.status).toBe(400);
    const year = await dashboard(token, '?from=2025-09-25&to=2026-09-25');
    expect(year.status).toBe(200);
  });

  it('refuses one day without the other, a range backwards, a day that does not exist', async () => {
    const { token } = await newSeller();
    for (const query of [
      '?from=2026-09-19',
      '?to=2026-09-19',
      '?from=2026-09-25&to=2026-09-24',
      '?from=2026-02-30&to=2026-03-02',
    ]) {
      expect((await dashboard(token, query)).status).toBe(400);
    }
  });
});

describe('who may read it', () => {
  it('is the seller’s, and open to "Voir comme le vendeur" (D-5)', async () => {
    const { seller } = await newSeller();
    await happened(await parcelOf(seller), 'CREATION', '2026-09-25T07:00:00.000Z');
    const started = await t.request('POST', '/auth/impersonation', {
      token: (await login(t, admin)).accessToken,
      body: { sellerId: seller.sellerId },
    });
    const response = await dashboard(started.body.impersonationToken);
    expect(response.status).toBe(200);
    expect(response.body.counts.CREES).toBe(1);
  });

  it('is refused to every other role, and to no one logged in', async () => {
    const depot = await createUser(t.prisma, { role: 'DEPOT', username: 'depot.tableau' });
    expect((await dashboard((await login(t, admin)).accessToken)).status).toBe(403);
    expect((await dashboard((await login(t, depot)).accessToken)).status).toBe(403);
    const courier = await t.request('GET', '/dashboard', {
      token: (await login(t, livreur)).accessToken,
      headers: COURIER_APP_HEADERS,
    });
    expect(courier.status).toBe(403);
    expect((await t.request('GET', '/dashboard')).status).toBe(401);
  });
});
