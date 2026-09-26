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
import { createParcel, place } from '../support/work-fixtures';

/**
 * The courier's day (Coursier 4.2 to 4.7, 4.12): the ramasseur's pickups and
 * Terminer le ramassage with the pickup fee (A-13, D-47, D-61); Ma tournée
 * and Retour au dépôt; Ma caisse; Profil; and the Mémoire d'adresse, which
 * couriers and staff read and the seller never does (Coursier 4.3).
 */

let t: TestApp;
let seller: Fixture;
let otherSeller: Fixture;
let ali: Fixture;
let hedi: Fixture;
let aliToken: string;
let hediToken: string;

const NOW = '2026-09-25T08:00:00.000Z';

interface Result {
  kind: string;
  id: string;
  ok: boolean;
  replayed: boolean;
  code: string | null;
  message: string;
  parcel: { code: string; status: string } | null;
}

async function sync(operations: unknown[], token: string) {
  const response = await t.request('POST', '/scans/courier', {
    token,
    body: { operations },
    headers: COURIER_APP_HEADERS,
  });
  expect(response.status).toBe(200);
  return response.body.results as [Result, ...Result[]];
}

function get(path: string, token: string) {
  return t.request('GET', path, { token, headers: COURIER_APP_HEADERS });
}

async function parcel(
  owner: Fixture,
  status: 'CREE' | 'EN_LIVRAISON' | 'LIVRE' | 'A_VERIFIER',
  extra: Partial<Prisma.ParcelUncheckedCreateInput> = {},
) {
  const location = {
    CREE: 'CHEZ_LE_VENDEUR',
    EN_LIVRAISON: 'AVEC_LE_LIVREUR',
    LIVRE: 'CHEZ_LE_CLIENT',
    A_VERIFIER: 'AVEC_LE_LIVREUR',
  } as const;
  const id = await createParcel(t.prisma, {
    sellerId: owner.sellerId!,
    createdByUserId: owner.id,
    status,
    location: location[status],
    currentLivreurId: status === 'CREE' ? null : ali.courierId!,
    cashStatus: status === 'LIVRE' ? 'CHEZ_LE_COURSIER' : null,
    extra,
  });
  return t.prisma.parcel.findUniqueOrThrow({ where: { id } });
}

/** A pickup planned for today with Hédi, listing the parcels given. */
async function pickup(listed: { id: string }[] = [], ramasseur: Fixture = hedi) {
  const address = await t.prisma.pickupAddress.create({
    data: { sellerId: seller.sellerId!, ...(await place(t.prisma)), address: randomUUID() },
  });
  return t.prisma.pickup.create({
    data: {
      sellerId: seller.sellerId!,
      pickupAddressId: address.id,
      status: 'PLANIFIE',
      plannedDate: new Date('2026-09-25T00:00:00.000Z'),
      plannedSlot: 'MATIN',
      ramasseurId: ramasseur.courierId!,
      parcels: { create: listed.map((p) => ({ parcelId: p.id })) },
    },
  });
}

function pickupScan(pickupId: string, code: string) {
  return {
    kind: 'SCAN',
    clientScanId: randomUUID(),
    action: 'RAMASSAGE',
    rawCode: code,
    source: 'APP_COURSIER',
    deviceTime: NOW,
    pickupId,
  };
}

function finish(pickupId: string, operationId: string = randomUUID()) {
  return { kind: 'TERMINER_RAMASSAGE', operationId, pickupId, deviceTime: NOW };
}

beforeAll(async () => {
  t = await createTestApp();
  seller = await createUser(t.prisma, {
    role: 'VENDEUR',
    email: 'journee@boutique.tn',
    shopName: 'Boutique Yasmine',
  });
  otherSeller = await createUser(t.prisma, { role: 'VENDEUR', email: 'autre@journee.tn' });
  ali = await createUser(t.prisma, { role: 'LIVREUR' });
  hedi = await createUser(t.prisma, { role: 'RAMASSEUR' });
  await t.prisma.user.update({
    where: { id: ali.id },
    data: { firstName: 'Ali', lastName: 'Ben Salah' },
  });
  // One login per file: argon2 is costly, and the test clock does not move.
  aliToken = (await login(t, ali)).accessToken;
  hediToken = (await login(t, hedi)).accessToken;
});
afterAll(async () => {
  await t.close();
});
beforeEach(() => {
  t.throttle.clear();
});

describe('Ramassage (Coursier 4.6, D-47)', () => {
  it('picks up a listed parcel and an extra one of the same seller', async () => {
    const listed = await parcel(seller, 'CREE');
    const extra = await parcel(seller, 'CREE');
    const p = await pickup([listed]);

    const results = await sync(
      [pickupScan(p.id, listed.code), pickupScan(p.id, extra.code)],
      hediToken,
    );

    expect(results.map((r) => [r.ok, r.parcel?.status])).toEqual([
      [true, 'RAMASSE'],
      [true, 'RAMASSE'],
    ]);
    const links = await t.prisma.pickupParcel.findMany({ where: { pickupId: p.id } });
    expect(
      links
        .map((l) => ({ parcelId: l.parcelId, expected: l.expected, scanned: l.scannedAt !== null }))
        .sort((a, b) => Number(b.expected) - Number(a.expected)),
    ).toEqual([
      { parcelId: listed.id, expected: true, scanned: true },
      { parcelId: extra.id, expected: false, scanned: true },
    ]);
    expect((await t.prisma.pickup.findUniqueOrThrow({ where: { id: p.id } })).scannedCount).toBe(2);
    expect(await t.prisma.parcel.findUniqueOrThrow({ where: { id: listed.id } })).toMatchObject({
      status: 'RAMASSE',
      location: 'AVEC_LE_RAMASSEUR',
    });
  });

  it('refuses another seller’s parcel, and a pickup that is not his', async () => {
    const foreign = await parcel(otherSeller, 'CREE');
    const own = await parcel(seller, 'CREE');
    const p = await pickup();
    const other = await createUser(t.prisma, { role: 'RAMASSEUR' });
    const notHis = await pickup([], other);

    const results = await sync(
      [pickupScan(p.id, foreign.code), pickupScan(notHis.id, own.code)],
      hediToken,
    );
    expect(results.map((r) => r.code)).toEqual(['COLIS_AUTRE_VENDEUR', 'RAMASSAGE_INTROUVABLE']);
    expect((await t.prisma.parcel.findUniqueOrThrow({ where: { id: own.id } })).status).toBe(
      'CREE',
    );
  });

  it('takes back an extra parcel scanned by mistake, within the minute (A-11)', async () => {
    const extra = await parcel(seller, 'CREE');
    const p = await pickup();
    const scan = pickupScan(p.id, extra.code);
    await sync([scan], hediToken);
    const [cancelled] = await sync(
      [{ kind: 'ANNULATION', clientScanId: scan.clientScanId, deviceTime: NOW }],
      hediToken,
    );
    expect(cancelled.ok).toBe(true);
    expect(await t.prisma.pickupParcel.count({ where: { pickupId: p.id } })).toBe(0);
    expect(await t.prisma.parcel.findUniqueOrThrow({ where: { id: extra.id } })).toMatchObject({
      status: 'CREE',
      location: 'CHEZ_LE_VENDEUR',
      pickedUpAt: null,
    });
  });
});

describe('Terminer le ramassage (A-13, D-61)', () => {
  async function scanned(count: number) {
    const parcels = [];
    for (let i = 0; i < count; i++) parcels.push(await parcel(seller, 'CREE'));
    const p = await pickup(parcels);
    if (count > 0)
      await sync(
        parcels.map((x) => pickupScan(p.id, x.code)),
        hediToken,
      );
    return p;
  }

  it('charges the pickup fee below 5 parcels, deducted later from a bon', async () => {
    const p = await scanned(3);
    const [done] = await sync([finish(p.id)], hediToken);
    expect(done).toMatchObject({
      kind: 'TERMINER_RAMASSAGE',
      ok: true,
      message: 'Ramassage terminé : 3 colis, frais de ramassage 2,000 DT',
    });
    const closed = await t.prisma.pickup.findUniqueOrThrow({ where: { id: p.id } });
    expect(closed).toMatchObject({ status: 'EFFECTUE', scannedCount: 3 });
    expect(closed.completedAt).toEqual(new Date(NOW));
    // The seller is told the pickup is done, with the count (Vendeur 4.13).
    expect(
      await t.prisma.notification.findFirst({
        where: { userId: seller.id, type: 'RAMASSAGE_EFFECTUE' },
      }),
    ).toMatchObject({ params: { pickupId: p.id, count: 3 } });
    const charge = await t.prisma.sellerCharge.findUniqueOrThrow({
      where: { id: closed.feeChargeId! },
    });
    expect(charge).toMatchObject({
      type: 'RAMASSAGE',
      amountMillimes: 2000n,
      status: 'EN_ATTENTE',
      pickupId: p.id,
      sellerId: seller.sellerId,
    });
  });

  it('is free from 5 parcels, extra ones counted (D-47)', async () => {
    const p = await scanned(4);
    const extra = await parcel(seller, 'CREE');
    await sync([pickupScan(p.id, extra.code)], hediToken);
    const [done] = await sync([finish(p.id)], hediToken);
    expect(done).toMatchObject({ ok: true, message: 'Ramassage terminé : 5 colis' });
    const closed = await t.prisma.pickup.findUniqueOrThrow({ where: { id: p.id } });
    expect(closed).toMatchObject({ status: 'EFFECTUE', scannedCount: 5, feeChargeId: null });
    expect(await t.prisma.sellerCharge.count({ where: { pickupId: p.id } })).toBe(0);
  });

  it('treats a visit with no parcel as cancelled, at no cost (A-13)', async () => {
    const listed = await parcel(seller, 'CREE');
    const p = await pickup([listed]);
    const [done] = await sync([finish(p.id)], hediToken);
    expect(done).toMatchObject({ ok: true, message: 'Ramassage clôturé sans colis : aucun frais' });
    expect(await t.prisma.pickup.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({
      status: 'ANNULE',
      cancelledByUserId: hedi.id,
      feeChargeId: null,
    });
    // A visit that produced no pickup is not announced as done.
    expect(
      await t.prisma.notification.count({
        where: { type: 'RAMASSAGE_EFFECTUE', params: { path: ['pickupId'], equals: p.id } },
      }),
    ).toBe(0);
    expect(await t.prisma.sellerCharge.count({ where: { pickupId: p.id } })).toBe(0);
  });

  it('answers the same Terminer again, and refuses a second one or a late scan', async () => {
    const p = await scanned(1);
    const operationId = randomUUID();
    await sync([finish(p.id, operationId)], hediToken);
    const [again] = await sync([finish(p.id, operationId)], hediToken);
    expect(again).toMatchObject({ ok: true, replayed: true });
    expect(await t.prisma.sellerCharge.count({ where: { pickupId: p.id } })).toBe(1);

    const late = await parcel(seller, 'CREE');
    const [second, scan] = await sync([finish(p.id), pickupScan(p.id, late.code)], hediToken);
    expect(second).toMatchObject({ ok: false, code: 'RAMASSAGE_TERMINE' });
    expect(scan).toMatchObject({ ok: false, code: 'RAMASSAGE_TERMINE' });
  });

  it('no longer lets a counted scan be cancelled', async () => {
    const listed = await parcel(seller, 'CREE');
    const p = await pickup([listed]);
    const scan = pickupScan(p.id, listed.code);
    await sync([scan, finish(p.id)], hediToken);
    const [cancelled] = await sync(
      [{ kind: 'ANNULATION', clientScanId: scan.clientScanId, deviceTime: NOW }],
      hediToken,
    );
    expect(cancelled).toMatchObject({ ok: false, code: 'ANNULATION_RAMASSAGE_TERMINE' });
  });

  it('is the ramasseur’s own', async () => {
    const p = await scanned(1);
    const [byLivreur] = await sync([finish(p.id)], aliToken);
    expect(byLivreur).toMatchObject({ ok: false, code: 'ROLE_NON_AUTORISE' });
  });
});

describe('the ramasseur’s day (Coursier 4.6)', () => {
  it('lists his open pickups with the contact to hand cash to, and what he closed today', async () => {
    const listed = await parcel(seller, 'CREE');
    const open = await pickup([listed]);
    const response = await get('/coursier/ramassages', hediToken);
    expect(response.status).toBe(200);
    const view = response.body.open.find((p: { id: string }) => p.id === open.id);
    expect(view).toMatchObject({
      shopName: 'Boutique Yasmine',
      contactName: 'Prénom Nom',
      plannedDate: '2026-09-25',
      plannedSlot: 'MATIN',
      delegationNameFr: 'Le Bardo',
      scannedCount: 0,
      parcels: [{ code: listed.code, expected: true, scanned: false, status: 'CREE' }],
      aEmporter: { bonsVersement: [], bonsRetour: [] },
    });
    expect(response.body.done.length).toBeGreaterThan(0);
    expect((await get('/coursier/ramassages', aliToken)).status).toBe(403);
  });
});

describe('Ma tournée and Retour au dépôt (Coursier 4.2, 4.5)', () => {
  it('shows his stops with what finds the customer, and the failed parcels to bring back', async () => {
    const stop = await parcel(seller, 'EN_LIVRAISON', {
      attemptCount: 1,
      landmark: 'Près de la mosquée',
      courierNote: 'Appeler avant',
      isExchange: true,
    });
    const failed = await parcel(seller, 'A_VERIFIER', { attemptCount: 1 });
    const other = await createUser(t.prisma, { role: 'LIVREUR' });
    const notHis = await createParcel(t.prisma, {
      sellerId: seller.sellerId!,
      createdByUserId: seller.id,
      status: 'EN_LIVRAISON',
      location: 'AVEC_LE_LIVREUR',
      currentLivreurId: other.courierId!,
    });

    const response = await get('/coursier/tournee', aliToken);
    expect(response.status).toBe(200);
    const codes = (list: { code: string }[]) => list.map((s) => s.code);
    expect(codes(response.body.toDeliver)).toContain(stop.code);
    expect(codes(response.body.toBringBack)).toContain(failed.code);
    const notHisCode = (await t.prisma.parcel.findUniqueOrThrow({ where: { id: notHis } })).code;
    expect(codes(response.body.toDeliver)).not.toContain(notHisCode);
    expect(
      response.body.toDeliver.find((s: { code: string }) => s.code === stop.code),
    ).toMatchObject({
      recipientName: 'Client',
      landmark: 'Près de la mosquée',
      sellerNote: 'Appeler avant',
      codAmountMillimes: '85000',
      attemptNumber: 2,
      maxAttempts: 3,
      isExchange: true,
      shopName: 'Boutique Yasmine',
      localiteNameFr: 'Khaznadar',
      delegationNameFr: 'Le Bardo',
    });
    expect((await get('/coursier/tournee', hediToken)).status).toBe(403);
  });

  it('counts the stops done today, a cancelled scan taken back', async () => {
    const before = (await get('/coursier/tournee', aliToken)).body.doneToday as number;
    const a = await parcel(seller, 'EN_LIVRAISON');
    const b = await parcel(seller, 'EN_LIVRAISON');
    const scanB = {
      kind: 'SCAN',
      clientScanId: randomUUID(),
      action: 'ECHEC',
      rawCode: b.code,
      source: 'APP_COURSIER',
      deviceTime: NOW,
      failureReason: 'INJOIGNABLE',
    };
    await sync(
      [
        {
          kind: 'SCAN',
          clientScanId: randomUUID(),
          action: 'LIVRE',
          rawCode: a.code,
          source: 'APP_COURSIER',
          deviceTime: NOW,
          collectedMillimes: '85000',
        },
        scanB,
        { kind: 'ANNULATION', clientScanId: scanB.clientScanId, deviceTime: NOW },
      ],
      aliToken,
    );
    expect((await get('/coursier/tournee', aliToken)).body.doneToday).toBe(before + 1);
  });
});

describe('Ma caisse (Coursier 4.7)', () => {
  it('lists the cash of his deliveries still with him', async () => {
    const before = (await get('/coursier/caisse', aliToken)).body;
    const delivered = await parcel(seller, 'LIVRE');
    const after = (await get('/coursier/caisse', aliToken)).body;
    expect(BigInt(after.totalMillimes) - BigInt(before.totalMillimes)).toBe(85000n);
    expect(after.parcels.map((p: { code: string }) => p.code)).toContain(delivered.code);
    // A ramasseur carries no delivery cash; his bon cash is tested with the bons (D-84).
    expect((await get('/coursier/caisse', hediToken)).body).toEqual({
      parcels: [],
      totalMillimes: '0',
      bons: [],
      bonCashMillimes: '0',
      aRemettreMillimes: '0',
      sessions: [],
    });
  });
});

describe('Profil (Coursier 4.12)', () => {
  it('shows role, zones and pay plan read-only, and keeps his language', async () => {
    const zone = await t.prisma.zone.create({ data: { name: `Zone Profil ${randomUUID()}` } });
    await t.prisma.zoneAssignment.create({
      data: { zoneId: zone.id, courierId: ali.courierId!, role: 'LIVREUR', kind: 'TITULAIRE' },
    });
    const response = await get('/coursier/moi', aliToken);
    expect(response.body).toMatchObject({
      firstName: 'Ali',
      role: 'LIVREUR',
      payPlan: 'HEBDOMADAIRE',
      langue: 'FR',
      zones: [{ name: zone.name, kind: 'TITULAIRE' }],
      rules: { scanCancelWindowSeconds: 60, maxDeliveryAttempts: 3 },
    });
    const changed = await t.request('PATCH', '/coursier/moi/langue', {
      token: aliToken,
      headers: COURIER_APP_HEADERS,
      body: { langue: 'AR' },
    });
    expect(changed.body).toEqual({ langue: 'AR' });
    expect((await get('/coursier/moi', hediToken)).body.payPlan).toBeNull();
  });
});

describe('Mémoire d’adresse (Coursier 4.3)', () => {
  function note(parcelCode: string, fields: { note?: string; meetingPoint?: string }) {
    return {
      kind: 'NOTE_ADRESSE',
      operationId: randomUUID(),
      parcelCode,
      deviceTime: NOW,
      ...fields,
    };
  }

  it('saves a note after a delivery; the next courier to that number reads it', async () => {
    const phone = '98111222';
    const delivered = await parcel(seller, 'LIVRE', { recipientPhone: phone });
    const [saved] = await sync(
      [note(delivered.code, { note: 'Immeuble bleu à côté de la pharmacie, 2e étage' })],
      aliToken,
    );
    expect(saved).toMatchObject({ kind: 'NOTE_ADRESSE', ok: true });

    const next = await parcel(seller, 'EN_LIVRAISON', { recipientPhone: phone });
    const tour = (await get('/coursier/tournee', aliToken)).body;
    expect(tour.toDeliver.find((s: { code: string }) => s.code === next.code).memory).toMatchObject(
      {
        note: 'Immeuble bleu à côté de la pharmacie, 2e étage',
        deliveredHere: true,
      },
    );

    // Staff read it on the parcel; the seller never does.
    const depot = await createUser(t.prisma, { role: 'DEPOT', username: 'memoire.depot' });
    const colis = await t.request('GET', `/colis/${next.code}`, {
      token: (await login(t, depot)).accessToken,
    });
    expect(colis.body.addressMemory).toMatchObject({ deliveredHere: true });
    const sellerView = await t.request('GET', `/parcels/${next.code}`, {
      token: (await login(t, seller)).accessToken,
    });
    expect(sellerView.status).toBe(200);
    expect(JSON.stringify(sellerView.body)).not.toContain('Immeuble bleu');
  });

  it('keeps a note for after the delivery, but takes a meeting point on the way', async () => {
    const stop = await parcel(seller, 'EN_LIVRAISON', { recipientPhone: '97333444' });
    const [early, meeting] = await sync(
      [note(stop.code, { note: 'Trop tôt' }), note(stop.code, { meetingPoint: 'Café de la gare' })],
      aliToken,
    );
    expect(early).toMatchObject({ ok: false, code: 'NOTE_APRES_LIVRAISON' });
    expect(meeting?.ok).toBe(true);
    expect((await t.prisma.parcel.findUniqueOrThrow({ where: { id: stop.id } })).meetingPoint).toBe(
      'Café de la gare',
    );
    expect(
      await t.prisma.addressMemory.findUniqueOrThrow({ where: { customerPhone: '97333444' } }),
    ).toMatchObject({ meetingPoint: 'Café de la gare', note: '' });
  });

  it('refuses another courier’s parcel and an empty note', async () => {
    const other = await createUser(t.prisma, { role: 'LIVREUR' });
    const notHis = await createParcel(t.prisma, {
      sellerId: seller.sellerId!,
      createdByUserId: seller.id,
      status: 'LIVRE',
      location: 'CHEZ_LE_CLIENT',
      currentLivreurId: other.courierId!,
    });
    const code = (await t.prisma.parcel.findUniqueOrThrow({ where: { id: notHis } })).code;
    const [foreign, empty] = await sync(
      [note(code, { note: 'Rien' }), note(code, { note: '  ' })],
      aliToken,
    );
    expect(foreign).toMatchObject({ ok: false, code: 'COLIS_AUTRE_COURSIER' });
    expect(empty).toMatchObject({ ok: false, code: 'NOTE_VIDE' });
  });
});
