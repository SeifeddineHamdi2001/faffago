import { createTestApp, createUser, login, type Fixture, type TestApp } from '../support/test-app';
import { cashAtDepot, scanOp, sync } from '../support/money-fixtures';
import { place } from '../support/work-fixtures';

/**
 * Retenue à la source (D-89): a certificate at the bon's first Remis,
 * numbered per year; Annulé when the bon is corrected, a new number at the
 * next Remis; no bon for a CIN uniquement seller without his CIN number; no
 * PDF while Paramètres › Société is incomplete; the month report keeps a
 * past month as it was.
 */

let t: TestApp;
let admin: Fixture;
let depot: Fixture;
let adminToken: string;
let depotToken: string;

async function cinSeller(email: string, cinNumber: string | null = '01234567') {
  const seller = await createUser(t.prisma, { role: 'VENDEUR', email });
  await t.prisma.seller.update({
    where: { id: seller.sellerId! },
    data: { statut: 'CIN_UNIQUEMENT', cinNumber },
  });
  await t.prisma.pickupAddress.create({
    data: {
      sellerId: seller.sellerId!,
      ...(await place(t.prisma)),
      address: '12 rue des Jasmins',
      isDefault: true,
    },
  });
  return seller;
}

async function preparedBon(seller: Fixture) {
  const livreur = await createUser(t.prisma, { role: 'LIVREUR' });
  const parcel = await cashAtDepot(t, {
    seller,
    livreur,
    livreurToken: (await login(t, livreur)).accessToken,
    staffToken: depotToken,
  });
  return t.request('POST', '/bons-versement', {
    token: adminToken,
    body: { sellerId: seller.sellerId, parcelIds: [parcel.id] },
  });
}

async function remis(bon: { id: string; qr: string }) {
  const ramasseur = await createUser(t.prisma, { role: 'RAMASSEUR' });
  const token = (await login(t, ramasseur)).accessToken;
  await t.request('POST', '/caisse/depart', {
    token: depotToken,
    body: { ramasseurId: ramasseur.id, bonsVersement: [bon.id] },
  });
  const [result] = await sync(t, token, [
    scanOp({ action: 'BON_VERSEMENT_REMIS', rawCode: bon.qr }),
  ]);
  if (!result?.ok) throw new Error(`remis ${JSON.stringify(result)}`);
  return token;
}

async function fillSociete() {
  for (const [key, value] of [
    ['societe_raison_sociale', 'Faffa Go SARL'],
    ['societe_matricule_fiscal', '1234567/A/M/000'],
    ['societe_adresse', 'Zone industrielle, Tunis'],
  ]) {
    const response = await t.request('PATCH', `/settings/${key}`, {
      token: adminToken,
      body: { value },
    });
    if (response.status !== 200) throw new Error(`settings ${response.status}`);
  }
}

beforeAll(async () => {
  t = await createTestApp();
  admin = await createUser(t.prisma, { role: 'ADMIN', username: 'rs.admin' });
  depot = await createUser(t.prisma, { role: 'DEPOT', username: 'rs.depot' });
  adminToken = (await login(t, admin)).accessToken;
  depotToken = (await login(t, depot)).accessToken;
});
afterAll(async () => {
  await t.close();
});
beforeEach(() => {
  t.throttle.clear();
});

describe('the CIN number (D-89)', () => {
  it('refuses a bon for a CIN uniquement seller without it, with a clear message', async () => {
    const seller = await cinSeller('sanscin@boutique.tn', null);
    const response = await preparedBon(seller);
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: 'CIN_MANQUANT' });
    expect(response.body.message).toContain('Numéro de CIN manquant');

    // Exceptions lists him, for the admin only.
    const queue = await t.request('GET', '/exceptions', { token: adminToken });
    expect(queue.body.sellersMissingCin).toContainEqual(
      expect.objectContaining({ sellerId: seller.sellerId }),
    );
    expect(
      (await t.request('GET', '/exceptions', { token: depotToken })).body.sellersMissingCin,
    ).toBeNull();

    // The admin records it (Dépôt may not); the bon then goes through.
    expect(
      (
        await t.request('PUT', `/sellers/${seller.sellerId}/cin`, {
          token: depotToken,
          body: { cinNumber: '09876543' },
        })
      ).status,
    ).toBe(403);
    const set = await t.request('PUT', `/sellers/${seller.sellerId}/cin`, {
      token: adminToken,
      body: { cinNumber: '09876543' },
    });
    expect(set.status).toBe(200);
    expect(
      await t.prisma.auditLog.count({
        where: { action: 'MODIFICATION_CIN_VENDEUR', entityId: seller.sellerId! },
      }),
    ).toBe(1);
    const detail = await t.request('GET', `/sellers/${seller.sellerId}`, { token: adminToken });
    expect(detail.body.cinNumber).toBe('09876543');
    expect(
      JSON.stringify(
        (await t.request('GET', `/sellers/${seller.sellerId}`, { token: depotToken })).body,
      ),
    ).not.toContain('09876543');
    expect((await preparedBon(seller)).status).toBe(201);
  });
});

describe('certificates (D-89)', () => {
  it('numbers one at the first Remis, cancels it at a correction, numbers anew at the next Remis', async () => {
    const seller = await cinSeller('certif@boutique.tn');
    const bon = (await preparedBon(seller)).body;
    expect(bon.retenueMillimes).not.toBe('0');
    expect(await t.prisma.retenueCertificate.count({ where: { bonVersementId: bon.id } })).toBe(0);

    const ramasseurToken = await remis(bon);
    const first = await t.prisma.retenueCertificate.findFirstOrThrow({
      where: { bonVersementId: bon.id },
    });
    expect(first).toMatchObject({
      number: expect.stringMatching(/^RS-2026-\d{4}$/),
      year: 2026,
      amountMillimes: BigInt(bon.retenueMillimes),
      baseMillimes: BigInt(bon.baseAfterFeesMillimes),
      rateBps: 300,
      cinNumber: '01234567',
      sellerAddress: expect.stringContaining('12 rue des Jasmins'),
      cancelledAt: null,
    });

    // The seller downloads it — once Paramètres › Société is complete.
    const sellerToken = (await login(t, seller)).accessToken;
    const list = await t.request('GET', '/paiements/certificats', { token: sellerToken });
    expect(list.body).toMatchObject({
      parBon: true,
      annuel: true,
      years: ['2026'],
      certificates: [
        expect.objectContaining({ number: first.number, bonNumber: bon.number, cancelled: false }),
      ],
    });
    const early = await t.request('GET', `/paiements/certificats/${first.id}/pdf`, {
      token: sellerToken,
    });
    expect(early.status).toBe(409);
    expect(early.body.code).toBe('SOCIETE_INCOMPLETE');
    await fillSociete();
    const file = await t.request('GET', `/paiements/certificats/${first.id}/pdf`, {
      token: sellerToken,
    });
    expect(file.status).toBe(200);
    expect((file.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    const yearly = await t.request('GET', '/paiements/certificats/annuel/2026/pdf', {
      token: sellerToken,
    });
    expect(yearly.status).toBe(200);
    // Another seller's certificate does not exist for him (D-26).
    const stranger = await createUser(t.prisma, {
      role: 'VENDEUR',
      email: 'curieux-rs@boutique.tn',
    });
    const strangerToken = (await login(t, stranger)).accessToken;
    expect(
      (await t.request('GET', `/paiements/certificats/${first.id}/pdf`, { token: strangerToken }))
        .status,
    ).toBe(404);

    // Corrected (D-88): Annulé, kept.
    await t.request('POST', `/bons-versement/${bon.id}/corriger`, {
      token: adminToken,
      body: { reason: 'Scanné remis par erreur' },
    });
    expect(
      (await t.prisma.retenueCertificate.findUniqueOrThrow({ where: { id: first.id } }))
        .cancelledAt,
    ).not.toBeNull();

    // Handed over for real: a new number, never the old one.
    const [again] = await sync(t, ramasseurToken, [
      scanOp({ action: 'BON_VERSEMENT_REMIS', rawCode: bon.qr }),
    ]);
    expect(again).toMatchObject({ ok: true });
    const all = await t.prisma.retenueCertificate.findMany({
      where: { bonVersementId: bon.id },
      orderBy: { issuedAt: 'asc' },
    });
    expect(all).toHaveLength(2);
    expect(all[1]!.number).not.toBe(first.number);
    expect(all[1]!.cancelledAt).toBeNull();

    // Same month: the report counts the bon once (the cancelled one never counted).
    const report = await t.request('GET', '/rapports/retenue?mois=2026-09', { token: adminToken });
    expect(report.status).toBe(200);
    const bySeller = report.body.sections[0].rows.find(
      (row: { sellerId: string }) => row.sellerId === seller.sellerId,
    );
    expect(bySeller).toMatchObject({ count: 1, amount: bon.retenueMillimes, cin: '01234567' });
  });

  it('issues nothing for a seller without retenue', async () => {
    const seller = await createUser(t.prisma, { role: 'VENDEUR', email: 'patente-rs@boutique.tn' });
    const bon = (await preparedBon(seller)).body;
    await remis(bon);
    expect(await t.prisma.retenueCertificate.count({ where: { bonVersementId: bon.id } })).toBe(0);
  });
});
