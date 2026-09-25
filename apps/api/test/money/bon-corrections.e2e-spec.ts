import { createTestApp, createUser, login, type Fixture, type TestApp } from '../support/test-app';
import {
  TODAY,
  cashAtDepot,
  close,
  count,
  scanOp,
  stationScan,
  sync,
} from '../support/money-fixtures';
import { createParcel } from '../support/work-fixtures';

/**
 * Corriger un bon (D-88): a bon de versement scanned Remis, or a line of a
 * bon de retour scanned Retour reçu, by mistake. The admin alone, a reason,
 * one transaction, audited; refused once Archivé; no fee changes. A closed
 * caisse is never rewritten: the ramasseur's surplus explains the bon, what
 * it does not cover is his shortfall for HR. The seller reads "Correction
 * Faffa Go", never the reason.
 */

let t: TestApp;
let admin: Fixture;
let depot: Fixture;
let adminToken: string;
let depotToken: string;

async function newSeller(email: string) {
  return createUser(t.prisma, { role: 'VENDEUR', email });
}

async function newRamasseur() {
  const courier = await createUser(t.prisma, { role: 'RAMASSEUR' });
  return { courier, token: (await login(t, courier)).accessToken };
}

/** A bon de versement of one parcel (78,000 DT net), handed to the ramasseur and scanned Remis. */
async function bonRemis(seller: Fixture, ramasseur: { courier: Fixture; token: string }) {
  const livreur = await createUser(t.prisma, { role: 'LIVREUR' });
  const parcel = await cashAtDepot(t, {
    seller,
    livreur,
    livreurToken: (await login(t, livreur)).accessToken,
    staffToken: depotToken,
  });
  const bon = (
    await t.request('POST', '/bons-versement', {
      token: adminToken,
      body: { sellerId: seller.sellerId, parcelIds: [parcel.id] },
    })
  ).body;
  const out = await t.request('POST', '/caisse/depart', {
    token: depotToken,
    body: { ramasseurId: ramasseur.courier.id, bonsVersement: [bon.id] },
  });
  if (out.status !== 200) throw new Error(`départ ${out.status}`);
  const op = scanOp({ action: 'BON_VERSEMENT_REMIS', rawCode: bon.qr });
  const [result] = await sync(t, ramasseur.token, [op]);
  if (!result?.ok) throw new Error(`remis ${JSON.stringify(result)}`);
  return { bon, parcel };
}

function correct(bonId: string, reason: string, token = adminToken) {
  return t.request('POST', `/bons-versement/${bonId}/corriger`, { token, body: { reason } });
}

beforeAll(async () => {
  t = await createTestApp();
  admin = await createUser(t.prisma, { role: 'ADMIN', username: 'corr.admin' });
  depot = await createUser(t.prisma, { role: 'DEPOT', username: 'corr.depot' });
  adminToken = (await login(t, admin)).accessToken;
  depotToken = (await login(t, depot)).accessToken;
});
afterAll(async () => {
  await t.close();
});
beforeEach(() => {
  t.throttle.clear();
});

describe('a bon de versement scanned Remis by mistake', () => {
  it('goes back En route with the ramasseur while his caisse is open, the cash expected again', async () => {
    const seller = await newSeller('corr-ouverte@boutique.tn');
    const ramasseur = await newRamasseur();
    const { bon, parcel } = await bonRemis(seller, ramasseur);
    const scanId = (await t.prisma.bonVersement.findUniqueOrThrow({ where: { id: bon.id } }))
      .remisScanId!;

    // The admin alone, and never without a reason.
    expect((await correct(bon.id, 'Vendeur absent', depotToken)).status).toBe(403);
    expect((await correct(bon.id, '')).status).toBe(400);

    const response = await correct(bon.id, 'Vendeur absent, scanné par erreur');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'EN_ROUTE', remisAt: null });
    expect(response.body.corrections).toEqual([
      expect.objectContaining({
        statusBefore: 'REMIS',
        statusAfter: 'EN_ROUTE',
        caisseClosed: false,
        shortfallMillimes: '0',
        reason: 'Vendeur absent, scanné par erreur',
      }),
    ]);

    // Unpaid again, reopened, one event, the fees untouched.
    const after = await t.prisma.parcel.findUniqueOrThrow({ where: { id: parcel.id } });
    expect(after).toMatchObject({ status: 'LIVRE', cashStatus: 'AU_DEPOT', closedAt: null });
    const event = await t.prisma.parcelEvent.findFirstOrThrow({
      where: { parcelId: parcel.id, type: 'CORRECTION_BON' },
    });
    expect(event).toMatchObject({
      actorRole: 'ADMIN',
      reasonText: 'Vendeur absent, scanné par erreur',
    });
    expect(
      await t.prisma.sellerCharge.findMany({
        where: { parcelId: parcel.id },
        select: { status: true },
      }),
    ).toEqual([{ status: 'DEDUITE' }]);
    expect(await t.prisma.scan.findUniqueOrThrow({ where: { id: scanId } })).toMatchObject({
      cancelReason: 'Vendeur absent, scanné par erreur',
      cancelledByUserId: admin.id,
    });
    expect(
      await t.prisma.auditLog.count({
        where: { action: 'CORRECTION_BON_VERSEMENT', entityId: bon.id },
      }),
    ).toBe(1);

    // His caisse expects the cash again.
    const session = await t.request('GET', `/caisse/${ramasseur.courier.id}/${TODAY}`, {
      token: depotToken,
    });
    expect(session.body.expected.bonCashMillimes).toBe('78000');

    // The seller: "Correction Faffa Go", never the reason.
    const sellerToken = (await login(t, seller)).accessToken;
    const paiements = await t.request('GET', '/paiements', { token: sellerToken });
    const mine = paiements.body.bons.find((b: { id: string }) => b.id === bon.id);
    expect(mine).toMatchObject({ status: 'EN_ROUTE' });
    expect(mine.correctedAt).not.toBeNull();
    const detail = await t.request('GET', `/paiements/bons/${bon.id}`, { token: sellerToken });
    expect(detail.body.corrections).toBeUndefined();
    expect(JSON.stringify(detail.body)).not.toContain('scanné par erreur');
    const timeline = await t.request('GET', `/parcels/${parcel.code}`, { token: sellerToken });
    expect(timeline.body.timeline).toContainEqual(
      expect.objectContaining({ type: 'CORRECTION_BON', actor: { kind: 'FAFFA_GO' } }),
    );
    expect(JSON.stringify(timeline.body)).not.toContain('scanné par erreur');

    // Handed over for real later the same day: Remis again, and his caisse balances.
    const [again] = await sync(t, ramasseur.token, [
      scanOp({ action: 'BON_VERSEMENT_REMIS', rawCode: bon.qr }),
    ]);
    expect(again).toMatchObject({ ok: true });
    expect((await t.prisma.parcel.findUniqueOrThrow({ where: { id: parcel.id } })).cashStatus).toBe(
      'PAYE',
    );
    await count(t, depotToken, ramasseur.courier, '0');
    expect((await close(t, depotToken, ramasseur.courier)).body).toMatchObject({
      status: 'CLOTUREE',
      ecartMillimes: '0',
    });
  });

  it('once his caisse is closed, goes back Préparé, explained by his surplus of the same amount', async () => {
    const seller = await newSeller('corr-surplus@boutique.tn');
    const ramasseur = await newRamasseur();
    const { bon, parcel } = await bonRemis(seller, ramasseur);
    // He brought the cash back: counted 78,000 DT against 0 expected.
    await count(t, depotToken, ramasseur.courier, '78,000');
    const closed = await close(t, depotToken, ramasseur.courier);
    expect(closed.body).toMatchObject({ ecartMillimes: '78000', ecartFlagged: true });

    const response = await correct(bon.id, 'Bon rapporté, scanné remis par erreur');
    expect(response.body).toMatchObject({ status: 'PREPARE', visit: null });
    expect(response.body.corrections[0]).toMatchObject({
      caisseClosed: true,
      coveredBySurplusMillimes: '78000',
      shortfallMillimes: '0',
    });
    expect((await t.prisma.parcel.findUniqueOrThrow({ where: { id: parcel.id } })).cashStatus).toBe(
      'AU_DEPOT',
    );

    // The closed session is not rewritten; its surplus is explained and checked.
    const session = await t.prisma.caisseSession.findUniqueOrThrow({
      where: { id: closed.body.sessionId },
    });
    expect(session).toMatchObject({
      status: 'CLOTUREE',
      ecartMillimes: 78000n,
      countedMillimes: 78000n,
      ecartNote: `Expliqué par la correction du bon ${bon.number}`,
    });
    expect(session.ecartCheckedAt).not.toBeNull();
    const ecarts = await t.request('GET', '/caisse/ecarts', { token: adminToken });
    expect(ecarts.body.aVerifier.map((row: { sessionId: string }) => row.sessionId)).not.toContain(
      session.id,
    );
    expect(
      ecarts.body.bonsCorriges.map((row: { bonNumber: string }) => row.bonNumber),
    ).not.toContain(bon.number);
  });

  it('with no matching surplus, records the missing amount as his shortfall, for HR', async () => {
    const seller = await newSeller('corr-manquant@boutique.tn');
    const ramasseur = await newRamasseur();
    const { bon } = await bonRemis(seller, ramasseur);
    await count(t, depotToken, ramasseur.courier, '0');
    expect((await close(t, depotToken, ramasseur.courier)).body.ecartMillimes).toBe('0');

    const response = await correct(bon.id, 'Le vendeur n’a jamais reçu le bon');
    expect(response.body).toMatchObject({ status: 'PREPARE' });
    expect(response.body.corrections[0]).toMatchObject({
      coveredBySurplusMillimes: '0',
      shortfallMillimes: '78000',
    });
    const ecarts = await t.request('GET', '/caisse/ecarts', { token: adminToken });
    expect(ecarts.body.bonsCorriges).toContainEqual(
      expect.objectContaining({
        bonNumber: bon.number,
        day: TODAY,
        courier: expect.objectContaining({ userId: ramasseur.courier.id }),
        shortfallMillimes: '78000',
        reason: 'Le vendeur n’a jamais reçu le bon',
      }),
    );
    // A livreur's debt it is not: ramasseurs are paid by HR outside the app.
    expect(
      await t.prisma.courierDebt.count({ where: { courierId: ramasseur.courier.courierId! } }),
    ).toBe(0);

    // Préparé now: nothing to correct any more.
    expect((await correct(bon.id, 'Encore une fois')).body.code).toBe('BON_NON_REMIS');
  });

  it('is refused once the signed copy is archived', async () => {
    const seller = await newSeller('corr-archive@boutique.tn');
    const ramasseur = await newRamasseur();
    const { bon } = await bonRemis(seller, ramasseur);
    expect((await stationScan(t, depotToken, 'ARCHIVAGE_BON', bon.qr)).body.accepted).toBe(true);
    const refused = await correct(bon.id, 'Trop tard pour corriger');
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('BON_ARCHIVE');
    expect(await t.prisma.bonCorrection.count({ where: { bonVersementId: bon.id } })).toBe(0);
  });
});

describe('a return scanned Retour reçu by mistake', () => {
  async function bonRetourOut(seller: Fixture, ramasseur: { courier: Fixture }, n: number) {
    const codes: string[] = [];
    for (let i = 0; i < n; i += 1) {
      const id = await createParcel(t.prisma, {
        sellerId: seller.sellerId!,
        createdByUserId: seller.id,
        status: 'RETOUR_AU_DEPOT',
        location: 'AU_DEPOT',
      });
      const parcel = await t.prisma.parcel.findUniqueOrThrow({ where: { id } });
      await stationScan(t, depotToken, 'PREPARATION_RETOURS', parcel.code);
      codes.push(parcel.code);
    }
    const bon = await t.prisma.bonRetour.findFirstOrThrow({
      where: { sellerId: seller.sellerId!, status: 'PREPARE' },
    });
    await t.request('POST', '/caisse/depart', {
      token: depotToken,
      body: { ramasseurId: ramasseur.courier.id, bonsRetour: [bon.id] },
    });
    return { bon, codes };
  }

  function correctLine(bonId: string, parcelCode: string, token = adminToken) {
    return t.request('POST', `/bons-retour/${bonId}/corriger`, {
      token,
      body: { parcelCode, itemType: 'COLIS', reason: 'Scanné chez le mauvais vendeur' },
    });
  }

  it('goes back Retour en route with him while his caisse is open, then to the depot at his Clôturer', async () => {
    const seller = await newSeller('corr-retour@boutique.tn');
    const ramasseur = await newRamasseur();
    const { bon, codes } = await bonRetourOut(seller, ramasseur, 1);
    const [received] = await sync(t, ramasseur.token, [
      scanOp({ action: 'RETOUR_RECU', rawCode: codes[0] }),
    ]);
    expect(received).toMatchObject({ ok: true });
    expect((await t.prisma.bonRetour.findUniqueOrThrow({ where: { id: bon.id } })).status).toBe(
      'REMIS',
    );

    expect((await correctLine(bon.id, codes[0]!, depotToken)).status).toBe(403);
    const response = await correctLine(bon.id, codes[0]!);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'EN_ROUTE', pendingCount: 1 });
    const parcel = await t.prisma.parcel.findFirstOrThrow({ where: { code: codes[0]! } });
    expect(parcel).toMatchObject({
      status: 'RETOUR_EN_ROUTE',
      location: 'AVEC_LE_RAMASSEUR',
      closedAt: null,
    });
    expect(
      await t.prisma.parcelEvent.findFirstOrThrow({
        where: { parcelId: parcel.id, type: 'CORRECTION_BON' },
      }),
    ).toMatchObject({ previousStatus: 'RETOUR_RECU', newStatus: 'RETOUR_EN_ROUTE' });
    // No fee changes: only the return fee charged when the return was decided, if any.
    expect(await t.prisma.sellerCharge.count({ where: { parcelId: parcel.id } })).toBe(0);

    // Public tracking forgets the mistaken Retour reçu.
    const tracking = await t.request('GET', `/public/tracking/${parcel.code}`);
    expect(JSON.stringify(tracking.body.timeline)).not.toContain('RETOURNE');

    // The evening: not handed over after all, back at the depot (D-81).
    await count(t, depotToken, ramasseur.courier, '0');
    await close(t, depotToken, ramasseur.courier);
    expect(await t.prisma.parcel.findUniqueOrThrow({ where: { id: parcel.id } })).toMatchObject({
      status: 'RETOUR_AU_DEPOT',
      location: 'AU_DEPOT',
    });
  });

  it('goes back to the depot, the bon Préparé, once his caisse is closed; and a line never received is refused', async () => {
    const seller = await newSeller('corr-retour-close@boutique.tn');
    const ramasseur = await newRamasseur();
    const { bon, codes } = await bonRetourOut(seller, ramasseur, 2);
    await sync(t, ramasseur.token, [
      scanOp({ action: 'RETOUR_RECU', rawCode: codes[0] }),
      scanOp({ action: 'RETOUR_RECU', rawCode: codes[1] }),
    ]);
    await count(t, depotToken, ramasseur.courier, '0');
    await close(t, depotToken, ramasseur.courier);

    const response = await correctLine(bon.id, codes[0]!);
    expect(response.body).toMatchObject({ status: 'PREPARE', visit: null, pendingCount: 1 });
    expect(await t.prisma.parcel.findFirstOrThrow({ where: { code: codes[0]! } })).toMatchObject({
      status: 'RETOUR_AU_DEPOT',
      location: 'AU_DEPOT',
    });
    expect(
      await t.prisma.auditLog.count({
        where: { action: 'CORRECTION_BON_RETOUR', entityId: bon.id },
      }),
    ).toBe(1);
    // A line never received is not corrected.
    expect((await correctLine(bon.id, codes[0]!)).body.code).toBe('LIGNE_NON_RECUE');

    // The seller's Retours: the bon, marked corrected.
    const sellerToken = (await login(t, seller)).accessToken;
    const retours = await t.request('GET', '/retours', { token: sellerToken });
    const mine = retours.body.bons.find((b: { id: string }) => b.id === bon.id);
    expect(mine.correctedAt).not.toBeNull();
  });
});
