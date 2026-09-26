import {
  COURIER_APP_HEADERS,
  createTestApp,
  createUser,
  login,
  type Fixture,
  type TestApp,
} from '../support/test-app';
import {
  TODAY,
  cashAtDepot,
  close,
  count,
  delivered,
  scanOp,
  stationScan,
  sync,
} from '../support/money-fixtures';
import { place } from '../support/work-fixtures';

/**
 * Bons de versement (Vendeur 4.11, Admin 4.10, A-2, A-3, A-5, D-80): prepared
 * by the admin from the cash at the depot, handed to the ramasseur with its
 * cash, scanned Remis at the seller (the parcels Payé), brought back when not
 * handed over, archived, cancelled while Préparé.
 */

let t: TestApp;
let admin: Fixture;
let depot: Fixture;
let livreur: Fixture;
let ramasseur: Fixture;
let other: Fixture;
let adminToken: string;
let depotToken: string;
let livreurToken: string;
let ramasseurToken: string;
let otherToken: string;

async function newSeller(email: string, statut: 'PATENTE' | 'CIN_UNIQUEMENT' = 'PATENTE') {
  const seller = await createUser(t.prisma, { role: 'VENDEUR', email });
  await t.prisma.seller.update({
    where: { id: seller.sellerId! },
    // A CIN uniquement seller has his CIN number (D-89).
    data: { statut, cinNumber: statut === 'CIN_UNIQUEMENT' ? '01234567' : null },
  });
  return seller;
}

/** One livreur per parcel: his day is counted and closed once (D-79). */
async function atDepot(seller: Fixture, cod?: bigint) {
  const courier = await createUser(t.prisma, { role: 'LIVREUR' });
  return cashAtDepot(t, {
    seller,
    livreur: courier,
    livreurToken: (await login(t, courier)).accessToken,
    staffToken: depotToken,
    cod,
  });
}

async function plannedPickup(seller: Fixture, courier: Fixture, day = TODAY) {
  const address = await t.prisma.pickupAddress.create({
    data: {
      sellerId: seller.sellerId!,
      ...(await place(t.prisma)),
      address: 'Atelier',
      isDefault: true,
    },
  });
  return t.prisma.pickup.create({
    data: {
      sellerId: seller.sellerId!,
      pickupAddressId: address.id,
      status: 'PLANIFIE',
      ramasseurId: courier.courierId!,
      plannedDate: new Date(`${day}T00:00:00.000Z`),
      plannedSlot: 'MATIN',
    },
  });
}

function prepare(seller: Fixture, parcelIds: string[], token = adminToken) {
  return t.request('POST', '/bons-versement', {
    token,
    body: { sellerId: seller.sellerId, parcelIds },
  });
}

function handOut(bonsVersement: string[], to = ramasseur) {
  return t.request('POST', '/caisse/depart', {
    token: depotToken,
    body: { ramasseurId: to.id, bonsVersement },
  });
}

async function remis(qr: string, token = ramasseurToken) {
  const op = scanOp({ action: 'BON_VERSEMENT_REMIS', rawCode: qr });
  const [result] = await sync(t, token, [op]);
  return { result: result!, op };
}

beforeAll(async () => {
  t = await createTestApp();
  admin = await createUser(t.prisma, { role: 'ADMIN', username: 'bv.admin' });
  depot = await createUser(t.prisma, { role: 'DEPOT', username: 'bv.depot' });
  livreur = await createUser(t.prisma, { role: 'LIVREUR' });
  ramasseur = await createUser(t.prisma, { role: 'RAMASSEUR' });
  other = await createUser(t.prisma, { role: 'RAMASSEUR' });
  adminToken = (await login(t, admin)).accessToken;
  depotToken = (await login(t, depot)).accessToken;
  livreurToken = (await login(t, livreur)).accessToken;
  ramasseurToken = (await login(t, ramasseur)).accessToken;
  otherToken = (await login(t, other)).accessToken;
});
afterAll(async () => {
  await t.close();
});
beforeEach(() => {
  t.throttle.clear();
});

describe('Préparer le bon (Admin 4.10)', () => {
  it('pays the parcels at the depot, fees oldest first, the retenue of a CIN seller on its own line', async () => {
    const seller = await newSeller('cin@boutique.tn', 'CIN_UNIQUEMENT');
    // An older return fee, deducted first.
    await t.prisma.sellerCharge.create({
      data: {
        sellerId: seller.sellerId!,
        type: 'RETOUR',
        amountMillimes: 5000n,
        createdAt: new Date('2026-09-20T10:00:00.000Z'),
      },
    });
    const a = await atDepot(seller);
    const b = await atDepot(seller);

    const summary = await t.request('GET', '/paiements-vendeurs', { token: adminToken });
    expect(summary.body).toContainEqual(
      expect.objectContaining({
        seller: expect.objectContaining({ id: seller.sellerId }),
        payableMillimes: '170000',
        payableCount: 2,
        pendingChargesMillimes: '19000',
      }),
    );
    const detail = await t.request('GET', `/paiements-vendeurs/${seller.sellerId}`, {
      token: adminToken,
    });
    expect(detail.body).toMatchObject({ retenueRateBps: 300, soldeDebiteurMillimes: '19000' });
    expect(detail.body.parcels).toHaveLength(2);
    expect(detail.body.charges.map((c: { type: string }) => c.type)).toEqual([
      'RETOUR',
      'LIVRAISON',
      'LIVRAISON',
    ]);

    const response = await prepare(seller, [a.id, b.id]);
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      number: 'BV-2026-0925-01',
      status: 'PREPARE',
      parcelCount: 2,
      totalCodMillimes: '170000',
      totalFeesMillimes: '19000',
      baseAfterFeesMillimes: '151000',
      sellerStatutSnapshot: 'CIN_UNIQUEMENT',
      retenueRateBps: 300,
      // 3 % of 151,000 DT = 4,530 DT (A-3).
      retenueMillimes: '4530',
      netMillimes: '146470',
      visit: null,
    });
    expect(response.body.qr).toMatch(/^BV:[0-9a-f]{32}$/);
    expect(response.body.charges.map((c: { type: string }) => c.type)).toEqual([
      'RETOUR',
      'LIVRAISON',
      'LIVRAISON',
    ]);
    expect(
      await t.prisma.sellerCharge.count({
        where: { sellerId: seller.sellerId!, status: 'DEDUITE' },
      }),
    ).toBe(3);

    // One bon per parcel (A-5a).
    const twice = await prepare(seller, [a.id]);
    expect(twice.status).toBe(409);
    expect(twice.body).toMatchObject({ code: 'COLIS_NON_PAYABLE', reason: 'DEJA_SUR_UN_BON' });

    // A later statut change never touches the bon (D-34).
    await t.prisma.seller.update({ where: { id: seller.sellerId! }, data: { statut: 'PATENTE' } });
    const again = await t.request('GET', `/bons-versement/${response.body.id}`, {
      token: adminToken,
    });
    expect(again.body).toMatchObject({
      sellerStatutSnapshot: 'CIN_UNIQUEMENT',
      retenueMillimes: '4530',
    });
  });

  it('carries a charge that would make the bon negative, and still pays the cash (A-2)', async () => {
    const seller = await newSeller('petit@boutique.tn');
    // A 5,000 DT parcel whose own delivery fee is 7,000 DT.
    const small = await atDepot(seller, 5000n);
    const response = await prepare(seller, [small.id]);
    expect(response.body).toMatchObject({
      totalFeesMillimes: '0',
      netMillimes: '5000',
      charges: [],
    });
    const detail = await t.request('GET', `/paiements-vendeurs/${seller.sellerId}`, {
      token: adminToken,
    });
    expect(detail.body.soldeDebiteurMillimes).toBe('7000');
  });

  it('refuses cash still with the courier, another seller’s parcel, and anyone but the admin', async () => {
    const seller = await newSeller('refus@boutique.tn');
    const stranger = await newSeller('autre@boutique.tn');
    const withCourier = await delivered(t, { seller, livreur, token: livreurToken });
    const theirs = await atDepot(stranger);

    const notCounted = await prepare(seller, [withCourier.id]);
    expect(notCounted.body).toMatchObject({ code: 'COLIS_NON_PAYABLE', reason: 'PAS_ENCAISSE' });
    const notHis = await prepare(seller, [theirs.id]);
    expect(notHis.body).toMatchObject({ code: 'COLIS_NON_PAYABLE', reason: 'AUTRE_VENDEUR' });
    expect((await prepare(stranger, [theirs.id], depotToken)).status).toBe(403);
    expect((await t.request('GET', '/paiements-vendeurs', { token: depotToken })).status).toBe(403);
  });
});

describe('the bon travels (D-80, answers 4 and 5)', () => {
  it('goes with the planned pickup, out with its cash, Remis at the seller, then archived', async () => {
    const seller = await newSeller('voyage@boutique.tn');
    const pickup = await plannedPickup(seller, ramasseur);
    const a = await atDepot(seller);
    const bon = (await prepare(seller, [a.id])).body;
    expect(bon.visit).toMatchObject({
      ramasseur: { userId: ramasseur.id },
      plannedDate: TODAY,
      viaPickup: true,
    });
    expect(
      (await t.prisma.bonVersement.findUniqueOrThrow({ where: { id: bon.id } })).pickupId,
    ).toBe(pickup.id);

    const departure = await t.request('GET', `/caisse/depart/${ramasseur.id}`, {
      token: depotToken,
    });
    expect(departure.body.prevus).toContainEqual(
      expect.objectContaining({ id: bon.id, netMillimes: '78000' }),
    );

    const out = await handOut([bon.id]);
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({
      expected: { bonCashMillimes: '78000', totalMillimes: '78000' },
    });

    const day = await t.request('GET', '/coursier/ramassages', {
      token: ramasseurToken,
      headers: COURIER_APP_HEADERS,
    });
    expect(day.body.open).toContainEqual(
      expect.objectContaining({
        id: pickup.id,
        aEmporter: expect.objectContaining({
          bonsVersement: [
            expect.objectContaining({ number: bon.number, netMillimes: '78000', enMain: true }),
          ],
        }),
      }),
    );
    const cash = await t.request('GET', '/coursier/caisse', {
      token: ramasseurToken,
      headers: COURIER_APP_HEADERS,
    });
    expect(cash.body).toMatchObject({ bonCashMillimes: '78000', aRemettreMillimes: '78000' });

    expect((await remis('BV:' + 'f'.repeat(32))).result).toMatchObject({
      ok: false,
      code: 'BON_INCONNU',
    });
    expect((await remis(bon.qr, otherToken)).result).toMatchObject({
      ok: false,
      code: 'BON_AUTRE_RAMASSEUR',
    });
    const { result, op } = await remis(bon.qr);
    expect(result).toMatchObject({ ok: true, message: `Bon ${bon.number} remis`, parcel: null });

    const parcel = await t.prisma.parcel.findUniqueOrThrow({ where: { id: a.id } });
    expect(parcel.cashStatus).toBe('PAYE');
    expect(parcel.closedAt).not.toBeNull();
    expect(
      await t.prisma.parcelEvent.count({ where: { parcelId: a.id, type: 'PAIEMENT_VENDEUR' } }),
    ).toBe(1);
    expect(await t.prisma.bonVersement.findUniqueOrThrow({ where: { id: bon.id } })).toMatchObject({
      status: 'REMIS',
    });
    // Sent again: the same answer, nothing written twice.
    const [replayed] = await sync(t, ramasseurToken, [op]);
    expect(replayed).toMatchObject({ ok: true, replayed: true });
    // A bon's step is corrected by the admin, never undone from the phone.
    const [undo] = await sync(t, ramasseurToken, [
      { kind: 'ANNULATION', clientScanId: op.clientScanId, deviceTime: '2026-09-25T08:00:20.000Z' },
    ]);
    expect(undo).toMatchObject({ ok: false, code: 'ANNULATION_BON' });

    const session = await t.request('GET', `/caisse/${ramasseur.id}/${TODAY}`, {
      token: depotToken,
    });
    expect(session.body.expected.bonCashMillimes).toBe('0');
    await count(t, depotToken, ramasseur, '0');
    expect((await close(t, depotToken, ramasseur)).body).toMatchObject({
      status: 'CLOTUREE',
      ecartMillimes: '0',
    });

    const archived = await stationScan(t, depotToken, 'ARCHIVAGE_BON', bon.qr);
    expect(archived.status).toBe(201);
    expect(archived.body).toMatchObject({
      accepted: true,
      message: `Bon ${bon.number} archivé`,
      parcel: null,
    });
    const twice = await stationScan(t, depotToken, 'ARCHIVAGE_BON', bon.number);
    expect(twice.body).toMatchObject({ accepted: false, refusal: 'BON_DEJA_ARCHIVE' });

    // The seller's own view: paid, printable; another seller's bon does not exist.
    const sellerToken = (await login(t, seller)).accessToken;
    const paiements = await t.request('GET', '/paiements', { token: sellerToken });
    expect(paiements.body.bons).toContainEqual(
      expect.objectContaining({ id: bon.id, status: 'ARCHIVE' }),
    );
    expect(paiements.body.aRecevoir.parcels).toEqual([]);
    const pdf = await t.request('GET', `/paiements/bons/${bon.id}/pdf`, { token: sellerToken });
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get('content-type')).toContain('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    const stranger = await newSeller('curieux@boutique.tn');
    const strangerToken = (await login(t, stranger)).accessToken;
    expect(
      (await t.request('GET', `/paiements/bons/${bon.id}`, { token: strangerToken })).status,
    ).toBe(404);
  });

  it('comes back with its cash when not handed over, Préparé again; the admin may then cancel it (A-5)', async () => {
    const seller = await newSeller('absent@boutique.tn');
    await plannedPickup(seller, ramasseur, '2026-09-25');
    const a = await atDepot(seller);
    const bon = (await prepare(seller, [a.id])).body;
    const r2 = await createUser(t.prisma, { role: 'RAMASSEUR' });
    expect((await handOut([bon.id], r2)).status).toBe(200);

    const enRoute = await t.request('POST', `/bons-versement/${bon.id}/annuler`, {
      token: adminToken,
      body: { reason: 'Vendeur fermé' },
    });
    expect(enRoute.body.code).toBe('BON_NON_ANNULABLE');

    // The evening: he brings the full cash back.
    await count(t, depotToken, r2, '78,000');
    const closed = await close(t, depotToken, r2);
    expect(closed.body).toMatchObject({ status: 'CLOTUREE', ecartMillimes: '0' });
    const line = await t.prisma.caisseSessionBon.findFirstOrThrow({
      where: { bonVersementId: bon.id },
    });
    expect(line).toMatchObject({
      takenOutMillimes: 78000n,
      remisMillimes: 0n,
      returnedMillimes: 78000n,
    });
    expect(await t.prisma.bonVersement.findUniqueOrThrow({ where: { id: bon.id } })).toMatchObject({
      status: 'PREPARE',
      pickupId: null,
      ramasseurId: null,
    });
    expect((await t.prisma.parcel.findUniqueOrThrow({ where: { id: a.id } })).cashStatus).toBe(
      'AU_DEPOT',
    );

    const byDepot = await t.request('POST', `/bons-versement/${bon.id}/annuler`, {
      token: depotToken,
      body: { reason: 'Erreur de préparation' },
    });
    expect(byDepot.status).toBe(403);
    const cancelled = await t.request('POST', `/bons-versement/${bon.id}/annuler`, {
      token: adminToken,
      body: { reason: 'Erreur de préparation' },
    });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toMatchObject({
      status: 'ANNULE',
      cancelReason: 'Erreur de préparation',
      charges: [],
    });
    expect(
      await t.prisma.sellerCharge.count({
        where: { sellerId: seller.sellerId!, status: 'EN_ATTENTE' },
      }),
    ).toBe(1);
    expect(
      await t.prisma.auditLog.count({
        where: { action: 'ANNULATION_BON_VERSEMENT', entityId: bon.id },
      }),
    ).toBe(1);

    // The parcel is free for a new bon, under a new number.
    const next = await prepare(seller, [a.id]);
    expect(next.status).toBe(201);
    expect(next.body.number).not.toBe(bon.number);
    // A cancelled bon never reached the seller: it does not exist for him.
    const sellerToken = (await login(t, seller)).accessToken;
    expect(
      (await t.request('GET', `/paiements/bons/${bon.id}`, { token: sellerToken })).status,
    ).toBe(404);
  });

  it('waits with no planned pickup until the team assigns a ramasseur and a day: a visit with nothing to pick up', async () => {
    const seller = await newSeller('sanspickup@boutique.tn');
    await t.prisma.pickupAddress.create({
      data: {
        sellerId: seller.sellerId!,
        ...(await place(t.prisma)),
        address: 'Boutique',
        isDefault: true,
      },
    });
    const a = await atDepot(seller);
    const bon = (await prepare(seller, [a.id])).body;
    expect(bon.visit).toBeNull();

    const past = await t.request('POST', `/bons-versement/${bon.id}/affecter`, {
      token: depotToken,
      body: { ramasseurId: other.id, date: '2026-09-24' },
    });
    expect(past.body.code).toBe('DATE_PASSEE');
    const assigned = await t.request('POST', `/bons-versement/${bon.id}/affecter`, {
      token: depotToken,
      body: { ramasseurId: other.id, date: TODAY },
    });
    expect(assigned.status).toBe(200);
    expect(assigned.body.visit).toMatchObject({
      ramasseur: { userId: other.id },
      plannedDate: TODAY,
      viaPickup: false,
    });

    const day = await t.request('GET', '/coursier/ramassages', {
      token: otherToken,
      headers: COURIER_APP_HEADERS,
    });
    expect(day.body.visits).toContainEqual(
      expect.objectContaining({
        sellerId: seller.sellerId,
        address: 'Boutique',
        aEmporter: expect.objectContaining({
          bonsVersement: [expect.objectContaining({ id: bon.id, enMain: false })],
        }),
      }),
    );

    // Planning a pickup later takes the bons waiting for a visit (D-80).
    const request = await t.prisma.pickup.create({
      data: {
        sellerId: seller.sellerId!,
        pickupAddressId: (
          await t.prisma.pickupAddress.findFirstOrThrow({ where: { sellerId: seller.sellerId! } })
        ).id,
        status: 'DEMANDE',
        declaredCount: 3,
      },
    });
    const unassigned = (await prepare(seller, [(await atDepot(seller)).id])).body;
    const planned = await t.request('POST', `/ramassages/${request.id}/plan`, {
      token: depotToken,
      body: { date: TODAY, slot: 'MATIN', ramasseurId: ramasseur.id },
    });
    expect(planned.status).toBe(200);
    expect(
      (await t.prisma.bonVersement.findUniqueOrThrow({ where: { id: unassigned.id } })).pickupId,
    ).toBe(request.id);
    // Already assigned by hand: it keeps its ramasseur and day.
    expect(
      (await t.prisma.bonVersement.findUniqueOrThrow({ where: { id: bon.id } })).pickupId,
    ).toBeNull();
  });
});
