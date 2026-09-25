import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
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
 * The courier app's scans (Coursier 4.4, 4.9): Livré and Échec through the
 * queue upload, stored under the phone's UUID, with the phone's clock for the
 * business day (A-12), GPS when there is a fix (D-63), open to an outdated
 * app (D-14); and Annuler le dernier scan on the phone's clock (A-11).
 */

let t: TestApp;
let seller: Fixture;
let ali: Fixture;
let sami: Fixture;
let aliToken: string;

// The test clock: 2026-09-25T08:00Z, 09:00 in Tunis.
const NOW = '2026-09-25T08:00:00.000Z';
const at = (seconds: number) => new Date(Date.parse(NOW) + seconds * 1000).toISOString();

async function carried(
  livreur: Fixture = ali,
  extra: Partial<Prisma.ParcelUncheckedCreateInput> = {},
) {
  const id = await createParcel(t.prisma, {
    sellerId: seller.sellerId!,
    createdByUserId: seller.id,
    status: 'EN_LIVRAISON',
    location: 'AVEC_LE_LIVREUR',
    currentLivreurId: livreur.courierId!,
    extra,
  });
  return t.prisma.parcel.findUniqueOrThrow({ where: { id } });
}

function scanOp(fields: Record<string, unknown>) {
  return {
    kind: 'SCAN',
    clientScanId: randomUUID(),
    source: 'APP_COURSIER',
    deviceTime: NOW,
    gps: { lat: 36.8065, lng: 10.1815, accuracyM: 8 },
    ...fields,
  };
}

async function sync(operations: unknown[], token = aliToken, headers = COURIER_APP_HEADERS) {
  const response = await t.request('POST', '/scans/courier', {
    token,
    body: { operations },
    headers,
  });
  expect(response.status).toBe(200);
  return response.body.results as [Result, ...Result[]];
}

interface Result {
  kind: string;
  id: string;
  ok: boolean;
  replayed: boolean;
  code: string | null;
  message: string;
  parcel: { code: string; status: string } | null;
}

async function reload(id: string) {
  return t.prisma.parcel.findUniqueOrThrow({ where: { id } });
}

beforeAll(async () => {
  t = await createTestApp();
  seller = await createUser(t.prisma, { role: 'VENDEUR', email: 'coursier@boutique.tn' });
  ali = await createUser(t.prisma, { role: 'LIVREUR' });
  sami = await createUser(t.prisma, { role: 'LIVREUR' });
  // One login per file: argon2 is costly, and the test clock does not move.
  aliToken = (await login(t, ali)).accessToken;
});
afterAll(async () => {
  await t.close();
});
beforeEach(() => {
  t.throttle.clear();
});

describe('Livré (Coursier 4.4)', () => {
  it('delivers with the COD confirmed: cash with him, delivery fee tied to the scan', async () => {
    const p = await carried();
    const op = scanOp({ action: 'LIVRE', rawCode: p.code, collectedMillimes: '85000' });

    const [result] = await sync([op]);

    expect(result).toMatchObject({
      kind: 'SCAN',
      id: op.clientScanId,
      ok: true,
      replayed: false,
      parcel: { code: p.code, status: 'LIVRE' },
    });
    expect(await reload(p.id)).toMatchObject({
      status: 'LIVRE',
      location: 'CHEZ_LE_CLIENT',
      cashStatus: 'CHEZ_LE_COURSIER',
      attemptCount: 1,
      courierRateMillimes: 3500n,
    });
    const scan = await t.prisma.scan.findUniqueOrThrow({
      where: { clientScanId: op.clientScanId },
    });
    expect(scan).toMatchObject({
      action: 'LIVRE',
      accepted: true,
      source: 'APP_COURSIER',
      manualEntry: false,
      collectedMillimes: 85000n,
      appVersion: '1.0.0',
      parcelBefore: expect.objectContaining({ status: 'EN_LIVRAISON', cashStatus: null }),
    });
    expect(Number(scan.gpsLat)).toBeCloseTo(36.8065);
    const charges = await t.prisma.sellerCharge.findMany({ where: { parcelId: p.id } });
    expect(charges).toEqual([
      expect.objectContaining({ type: 'LIVRAISON', amountMillimes: 7000n, scanId: scan.id }),
    ]);
    const event = await t.prisma.parcelEvent.findFirstOrThrow({ where: { scanId: scan.id } });
    expect(event).toMatchObject({ type: 'LIVRAISON', source: 'APP_COURSIER', appVersion: '1.0.0' });
  });

  it('answers the same scan sent again with its first result, and writes nothing', async () => {
    const p = await carried();
    const op = scanOp({ action: 'LIVRE', rawCode: p.code, collectedMillimes: '85000' });
    await sync([op]);
    const [again] = await sync([op]);
    expect(again).toMatchObject({ ok: true, replayed: true, parcel: { status: 'LIVRE' } });
    expect(await t.prisma.scan.count({ where: { clientScanId: op.clientScanId } })).toBe(1);
    expect(await t.prisma.sellerCharge.count({ where: { parcelId: p.id } })).toBe(1);

    const other = await carried();
    const [reused] = await sync([{ ...op, rawCode: other.code }]);
    expect(reused).toMatchObject({ ok: false, code: 'SCAN_ID_REUTILISE' });
    expect((await reload(other.id)).status).toBe('EN_LIVRAISON');
  });

  it('refuses an amount other than the COD: no partial payment (A-24)', async () => {
    const p = await carried();
    const op = scanOp({ action: 'LIVRE', rawCode: p.code, collectedMillimes: '80000' });
    const [result] = await sync([op]);
    expect(result).toMatchObject({ ok: false, code: 'MONTANT_DIFFERENT' });
    expect((await reload(p.id)).status).toBe('EN_LIVRAISON');
    expect(
      await t.prisma.scan.findUniqueOrThrow({ where: { clientScanId: op.clientScanId } }),
    ).toMatchObject({ accepted: false, refusalReason: 'MONTANT_DIFFERENT' });
  });

  it('asks for the old item of an échange, then records it collected (A-10)', async () => {
    const p = await carried(ali, { isExchange: true });
    const [refused] = await sync([
      scanOp({ action: 'LIVRE', rawCode: p.code, collectedMillimes: '85000' }),
    ]);
    expect(refused).toMatchObject({ ok: false, code: 'ECHANGE_NON_CONFIRME' });

    const [delivered] = await sync([
      scanOp({
        action: 'LIVRE',
        rawCode: p.code,
        collectedMillimes: '85000',
        exchangeItemCollected: true,
      }),
    ]);
    expect(delivered.ok).toBe(true);
    expect(await reload(p.id)).toMatchObject({
      exchangeItemCollected: true,
      exchangeItemStatus: 'RETOUR_AU_DEPOT',
    });
  });

  it('refuses another livreur’s parcel, and a ramasseur’s action', async () => {
    const p = await carried(sami);
    const [other] = await sync([
      scanOp({ action: 'LIVRE', rawCode: p.code, collectedMillimes: '85000' }),
    ]);
    expect(other).toMatchObject({ ok: false, code: 'COLIS_AUTRE_COURSIER' });

    const [pickup] = await sync([scanOp({ action: 'RAMASSAGE', rawCode: p.code })]);
    expect(pickup).toMatchObject({ ok: false, code: 'ROLE_NON_AUTORISE' });
  });

  it('flags a code typed by hand, for Exceptions (A-22)', async () => {
    const p = await carried();
    const op = scanOp({
      action: 'LIVRE',
      rawCode: p.code.toLowerCase(),
      source: 'SAISIE_MANUELLE',
      collectedMillimes: '85000',
    });
    const [result] = await sync([op]);
    expect(result.ok).toBe(true);
    expect(
      await t.prisma.scan.findUniqueOrThrow({ where: { clientScanId: op.clientScanId } }),
    ).toMatchObject({ manualEntry: true, source: 'SAISIE_MANUELLE' });
  });
});

describe('Échec (Coursier 4.4, D-9)', () => {
  it('sends a failure to À vérifier with its reason and note', async () => {
    const p = await carried();
    const [result] = await sync([
      scanOp({
        action: 'ECHEC',
        rawCode: p.code,
        failureReason: 'NE_REPOND_PAS',
        note: 'Sonné deux fois',
      }),
    ]);
    expect(result).toMatchObject({ ok: true, parcel: { status: 'A_VERIFIER' } });
    const parcel = await reload(p.id);
    expect(parcel).toMatchObject({
      status: 'A_VERIFIER',
      location: 'AVEC_LE_LIVREUR',
      lastFailureReason: 'NE_REPOND_PAS',
      lastFailureNote: 'Sonné deux fois',
      attemptCount: 1,
    });
    // The 48 hours run from the server's time (D-30).
    expect(parcel.verifyDeadlineAt).toEqual(new Date('2026-09-27T08:00:00.000Z'));
  });

  it('plans a customer postponement for its date, not À vérifier (D-9)', async () => {
    const p = await carried();
    const [missing] = await sync([
      scanOp({ action: 'ECHEC', rawCode: p.code, failureReason: 'REPORTE_PAR_LE_CLIENT' }),
    ]);
    expect(missing).toMatchObject({ ok: false, code: 'DATE_REPORT_REQUISE' });

    const [planned] = await sync([
      scanOp({
        action: 'ECHEC',
        rawCode: p.code,
        failureReason: 'REPORTE_PAR_LE_CLIENT',
        postponedTo: '2026-09-28',
        relaunchSlot: 'SOIR',
      }),
    ]);
    expect(planned).toMatchObject({ ok: true, parcel: { status: 'RELANCE' } });
    expect(await reload(p.id)).toMatchObject({
      status: 'RELANCE',
      relaunchDate: new Date('2026-09-28T00:00:00.000Z'),
      relaunchSlot: 'SOIR',
      relaunchOrigin: 'CLIENT',
      verifyDeadlineAt: null,
    });
  });

  it('returns the parcel on the third failure, the return fee tied to the scan (A-6)', async () => {
    const p = await carried(ali, { attemptCount: 2 });
    const op = scanOp({ action: 'ECHEC', rawCode: p.code, failureReason: 'REFUSE' });
    const [result] = await sync([op]);
    expect(result).toMatchObject({ ok: true, parcel: { status: 'RETOUR_AU_DEPOT' } });
    const scan = await t.prisma.scan.findUniqueOrThrow({
      where: { clientScanId: op.clientScanId },
    });
    expect(await t.prisma.sellerCharge.findMany({ where: { parcelId: p.id } })).toEqual([
      expect.objectContaining({ type: 'RETOUR', scanId: scan.id, status: 'EN_ATTENTE' }),
    ]);
  });
});

describe('the phone’s clock and position (A-12, D-63)', () => {
  it('files a scan under the phone’s day and flags a clock more than 15 minutes off', async () => {
    const p = await carried();
    // 23:40 in Tunis the evening before, synced this morning.
    const op = scanOp({
      action: 'ECHEC',
      rawCode: p.code,
      failureReason: 'INJOIGNABLE',
      deviceTime: '2026-09-24T22:40:00.000Z',
    });
    await sync([op]);
    expect(
      await t.prisma.scan.findUniqueOrThrow({ where: { clientScanId: op.clientScanId } }),
    ).toMatchObject({
      businessDate: new Date('2026-09-24T00:00:00.000Z'),
      clockSkewFlagged: true,
    });
  });

  it('records a scan made without a GPS fix (D-63)', async () => {
    const p = await carried();
    const op = scanOp({ action: 'LIVRE', rawCode: p.code, collectedMillimes: '85000', gps: null });
    const [result] = await sync([op]);
    expect(result.ok).toBe(true);
    expect(
      await t.prisma.scan.findUniqueOrThrow({ where: { clientScanId: op.clientScanId } }),
    ).toMatchObject({ gpsLat: null, gpsLng: null, accepted: true });
  });
});

describe('the queue upload (Coursier 4.9, D-14)', () => {
  it('answers each operation in order, an unreadable one without stopping the rest', async () => {
    const a = await carried();
    const b = await carried();
    const results = await sync([
      scanOp({ action: 'LIVRE', rawCode: a.code, collectedMillimes: '85000' }),
      { kind: 'SCAN', clientScanId: 'pas-un-uuid' },
      scanOp({ action: 'ECHEC', rawCode: b.code, failureReason: 'INJOIGNABLE' }),
    ]);
    expect(results.map((r) => [r.ok, r.code])).toEqual([
      [true, null],
      [false, 'OPERATION_INVALIDE'],
      [true, null],
    ]);
    expect(results[1]).toMatchObject({ kind: 'SCAN', id: 'pas-un-uuid' });
  });

  it('lets an outdated app empty its queue, and nothing else', async () => {
    await t.prisma.setting.create({ data: { key: 'courier_min_app_version', value: '1.4.0' } });
    t.settings.clearCache();
    try {
      const p = await carried();
      const [result] = await sync(
        [scanOp({ action: 'LIVRE', rawCode: p.code, collectedMillimes: '85000' })],
        aliToken,
        COURIER_APP_HEADERS,
      );
      expect(result.ok).toBe(true);
      const tour = await t.request('GET', '/coursier/tournee', {
        token: aliToken,
        headers: COURIER_APP_HEADERS,
      });
      expect(tour.status).toBe(426);
      expect(tour.body.code).toBe('VERSION_APP_OBSOLETE');
    } finally {
      await t.prisma.setting.delete({ where: { key: 'courier_min_app_version' } });
      t.settings.clearCache();
    }
  });

  it('is the couriers’ only', async () => {
    const staff = await createUser(t.prisma, { role: 'DEPOT', username: 'coursier.depot' });
    const response = await t.request('POST', '/scans/courier', {
      token: (await login(t, staff)).accessToken,
      body: { operations: [{}] },
    });
    expect(response.status).toBe(403);
    const sellerResponse = await t.request('POST', '/scans/courier', {
      token: (await login(t, seller)).accessToken,
      body: { operations: [{}] },
    });
    expect(sellerResponse.status).toBe(403);
  });
});

describe('Annuler le dernier scan, on the phone’s clock (A-11)', () => {
  it('undoes a Livré within the minute, however late it reaches the server', async () => {
    const p = await carried();
    // The phone was offline for two hours: the scan and the cancellation it
    // made 40 seconds later reach the server together, now.
    const op = scanOp({
      action: 'LIVRE',
      rawCode: p.code,
      collectedMillimes: '85000',
      deviceTime: at(-7200),
    });
    const [delivered, cancelled] = await sync([
      op,
      { kind: 'ANNULATION', clientScanId: op.clientScanId, deviceTime: at(-7160) },
    ]);
    expect(delivered.ok).toBe(true);
    expect(cancelled).toMatchObject({
      kind: 'ANNULATION',
      ok: true,
      parcel: { code: p.code, status: 'EN_LIVRAISON' },
    });
    expect(await reload(p.id)).toMatchObject({
      status: 'EN_LIVRAISON',
      location: 'AVEC_LE_LIVREUR',
      cashStatus: null,
      attemptCount: 0,
      courierRateMillimes: null,
      deliveredAt: null,
    });
    // The fee was owed only for a delivery that happened (A-1).
    expect(await t.prisma.sellerCharge.findMany({ where: { parcelId: p.id } })).toEqual([
      expect.objectContaining({ type: 'LIVRAISON', status: 'ANNULEE' }),
    ]);
    const scan = await t.prisma.scan.findUniqueOrThrow({
      where: { clientScanId: op.clientScanId },
    });
    expect(scan.cancelledByUserId).toBe(ali.id);
    expect(
      await t.prisma.parcelEvent.findFirstOrThrow({
        where: { scanId: scan.id, type: 'ANNULATION_SCAN' },
      }),
    ).toMatchObject({ newStatus: 'EN_LIVRAISON', deviceTime: new Date(at(-7160)) });

    const [again] = await sync([
      { kind: 'ANNULATION', clientScanId: op.clientScanId, deviceTime: at(-7160) },
    ]);
    expect(again).toMatchObject({ ok: true, replayed: true });

    // Delivered again for real: a new scan, a new fee.
    const [redelivered] = await sync([
      scanOp({ action: 'LIVRE', rawCode: p.code, collectedMillimes: '85000', deviceTime: at(90) }),
    ]);
    expect(redelivered.ok).toBe(true);
    expect(await t.prisma.sellerCharge.count({ where: { parcelId: p.id } })).toBe(2);
  });

  it('refuses after the minute of the phone’s clock: only the admin corrects', async () => {
    const p = await carried();
    const op = scanOp({ action: 'LIVRE', rawCode: p.code, collectedMillimes: '85000' });
    await sync([op]);
    const [late] = await sync([
      { kind: 'ANNULATION', clientScanId: op.clientScanId, deviceTime: at(61) },
    ]);
    expect(late).toMatchObject({ ok: false, code: 'ANNULATION_HORS_DELAI' });
    expect((await reload(p.id)).status).toBe('LIVRE');
  });

  it('refuses another courier, and a scan that is not his last', async () => {
    const a = await carried();
    const b = await carried();
    const first = scanOp({ action: 'ECHEC', rawCode: a.code, failureReason: 'INJOIGNABLE' });
    const second = scanOp({ action: 'ECHEC', rawCode: b.code, failureReason: 'INJOIGNABLE' });
    await sync([first, second]);

    const [notLast] = await sync([
      { kind: 'ANNULATION', clientScanId: first.clientScanId, deviceTime: at(10) },
    ]);
    expect(notLast).toMatchObject({ ok: false, code: 'ANNULATION_PAS_DERNIER' });

    const samiToken = (await login(t, sami)).accessToken;
    const [other] = await sync(
      [{ kind: 'ANNULATION', clientScanId: second.clientScanId, deviceTime: at(10) }],
      samiToken,
    );
    expect(other).toMatchObject({ ok: false, code: 'ANNULATION_AUTRE_PERSONNE' });
  });

  it('puts back a third failure: attempts, and the return fee cancelled', async () => {
    const p = await carried(ali, { attemptCount: 2 });
    const op = scanOp({ action: 'ECHEC', rawCode: p.code, failureReason: 'REFUSE' });
    await sync([op]);
    const [cancelled] = await sync([
      { kind: 'ANNULATION', clientScanId: op.clientScanId, deviceTime: at(20) },
    ]);
    expect(cancelled.ok).toBe(true);
    expect(await reload(p.id)).toMatchObject({
      status: 'EN_LIVRAISON',
      attemptCount: 2,
      lastFailureReason: null,
      verifyDeadlineAt: null,
    });
    expect(await t.prisma.sellerCharge.findMany({ where: { parcelId: p.id } })).toEqual([
      expect.objectContaining({ type: 'RETOUR', status: 'ANNULEE' }),
    ]);
  });

  it('refuses a scan it does not know', async () => {
    const [unknown] = await sync([
      { kind: 'ANNULATION', clientScanId: randomUUID(), deviceTime: at(5) },
    ]);
    expect(unknown).toMatchObject({ ok: false, code: 'SCAN_INTROUVABLE' });
  });
});
