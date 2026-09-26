import ExcelJS from 'exceljs';
import { createTestApp, createUser, login, type Fixture, type TestApp } from '../support/test-app';
import { TODAY, YESTERDAY, cashAtDepot, delivered, scanOp, sync } from '../support/money-fixtures';
import { createParcel } from '../support/work-fixtures';

/**
 * Rapports (Admin 4.13, D-89): the admin alone, each report as JSON, CSV and
 * Excel; and the rest of the Exceptions queue (Admin 4.7).
 */

let t: TestApp;
let admin: Fixture;
let depot: Fixture;
let adminToken: string;
let depotToken: string;
let seller: Fixture;
let bonNet: string;

beforeAll(async () => {
  t = await createTestApp();
  admin = await createUser(t.prisma, { role: 'ADMIN', username: 'rp.admin' });
  depot = await createUser(t.prisma, { role: 'DEPOT', username: 'rp.depot' });
  adminToken = (await login(t, admin)).accessToken;
  depotToken = (await login(t, depot)).accessToken;
  seller = await createUser(t.prisma, { role: 'VENDEUR', email: 'rapports@boutique.tn' });

  // One parcel delivered, counted and paid today.
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
  bonNet = bon.netMillimes;
  const ramasseur = await createUser(t.prisma, { role: 'RAMASSEUR' });
  await t.request('POST', '/caisse/depart', {
    token: depotToken,
    body: { ramasseurId: ramasseur.id, bonsVersement: [bon.id] },
  });
  await sync(t, (await login(t, ramasseur)).accessToken, [
    scanOp({ action: 'BON_VERSEMENT_REMIS', rawCode: bon.qr }),
  ]);
});
afterAll(async () => {
  await t.close();
});
beforeEach(() => {
  t.throttle.clear();
});

const period = `from=${TODAY}&to=${TODAY}`;

describe('Rapports (Admin 4.13)', () => {
  it('is the admin’s alone, and refuses an unreadable period', async () => {
    expect(
      (await t.request('GET', `/rapports/argent?${period}`, { token: depotToken })).status,
    ).toBe(403);
    const backwards = await t.request('GET', `/rapports/argent?from=${TODAY}&to=${YESTERDAY}`, {
      token: adminToken,
    });
    expect(backwards.status).toBe(400);
    expect((await t.request('GET', '/rapports/inconnu', { token: adminToken })).status).toBe(404);
  });

  it('Chiffre d’affaires: the fees charged on the day, deducted beside pending', async () => {
    const report = await t.request('GET', `/rapports/chiffre-affaires?${period}`, {
      token: adminToken,
    });
    expect(report.status).toBe(200);
    expect(report.body.title).toBe('Chiffre d’affaires (rapport de gestion)');
    const [section] = report.body.sections;
    expect(section.rows).toEqual([
      expect.objectContaining({
        row: TODAY,
        LIVRAISON: '7000',
        total: '7000',
        deduit: '7000',
        attente: '0',
      }),
    ]);
  });

  it('Argent: collected, handed over, paid to sellers; what is held now', async () => {
    const report = await t.request('GET', `/rapports/argent?${period}`, { token: adminToken });
    expect(report.body.sections[0].rows).toEqual([
      expect.objectContaining({
        day: TODAY,
        collected: '85000',
        handedOver: '85000',
        paid: bonNet,
      }),
    ]);
    expect(report.body.sections[1].rows[0]).toMatchObject({ label: 'Chez les coursiers' });
  });

  it('Activité: delivered, rates and delay, by seller, zone and livreur', async () => {
    const report = await t.request('GET', `/rapports/activite?${period}`, { token: adminToken });
    const bySeller = report.body.sections[0].rows;
    expect(bySeller).toContainEqual(
      expect.objectContaining({
        label: 'Boutique Test',
        delivered: 1,
        returned: 0,
        deliveryRate: 10000,
      }),
    );
    expect(report.body.sections.map((s: { title: string }) => s.title)).toEqual([
      'Par vendeur',
      'Par zone',
      'Par livreur',
    ]);
  });

  it('Paie coursiers and Écarts ramasseurs answer for their period', async () => {
    expect((await t.request('GET', `/rapports/paie?${period}`, { token: adminToken })).status).toBe(
      200,
    );
    const ecarts = await t.request('GET', '/rapports/ecarts-ramasseurs?mois=2026-09', {
      token: adminToken,
    });
    expect(ecarts.body.period).toBe('Septembre 2026');
    expect(
      (await t.request('GET', '/rapports/retenue?mois=2026-9', { token: adminToken })).status,
    ).toBe(400);
  });

  it('exports CSV and Excel, the amounts exact in millimes', async () => {
    const csv = await t.request('GET', `/rapports/argent?${period}&format=csv`, {
      token: adminToken,
    });
    expect(csv.status).toBe(200);
    expect(csv.headers.get('content-type')).toContain('text/csv');
    expect(csv.headers.get('content-disposition')).toContain('argent-');
    const text = (csv.body as Buffer).toString('utf8');
    expect(text).toContain('Encaissé par les livreurs (DT)');
    expect(text).toContain('85,000');

    const xlsx = await t.request('GET', `/rapports/argent?${period}&format=xlsx`, {
      token: adminToken,
    });
    expect(xlsx.status).toBe(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((xlsx.body as Buffer).buffer as ArrayBuffer);
    const sheet = workbook.worksheets[0]!;
    const values: unknown[] = [];
    sheet.eachRow((row) => values.push(...(row.values as unknown[])));
    expect(values).toContain(85000);
  });
});

describe('Exceptions, the rest of the queue (Admin 4.7, D-89)', () => {
  it('lists a courier’s cash of a past day, bons late, and a parcel near its À vérifier limit', async () => {
    const livreur = await createUser(t.prisma, { role: 'LIVREUR' });
    await delivered(t, {
      seller,
      livreur,
      token: (await login(t, livreur)).accessToken,
      deviceTime: `${YESTERDAY}T10:00:00.000Z`,
    });
    const near = await createParcel(t.prisma, {
      sellerId: seller.sellerId!,
      createdByUserId: seller.id,
      status: 'A_VERIFIER',
      location: 'AU_DEPOT',
      extra: { verifyDeadlineAt: new Date('2026-09-25T20:00:00.000Z') },
    });
    const oldBon = await t.prisma.bonVersement.findFirstOrThrow({
      where: { sellerId: seller.sellerId! },
    });
    await t.prisma.bonVersement.update({
      where: { id: oldBon.id },
      data: { remisAt: new Date('2026-09-22T08:00:00.000Z') },
    });

    const queue = (await t.request('GET', '/exceptions', { token: depotToken })).body;
    expect(queue.cashNotHandedOver).toContainEqual(
      expect.objectContaining({
        courier: expect.objectContaining({ userId: livreur.id }),
        day: YESTERDAY,
        amountMillimes: '85000',
      }),
    );
    expect(queue.verifyNearLimit.map((row: { code: string }) => row.code)).toContain(
      (await t.prisma.parcel.findUniqueOrThrow({ where: { id: near } })).code,
    );
    expect(queue.bonsNotArchived).toContainEqual(
      expect.objectContaining({ number: oldBon.number, kind: 'BON_VERSEMENT' }),
    );
    expect(queue.bonsEnRoute).toEqual([]);
  });
});
