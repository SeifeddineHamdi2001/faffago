import { NoticesJob } from '../../src/notices/notices.job';
import {
  COURIER_APP_HEADERS,
  createTestApp,
  createUser,
  login,
  type Fixture,
  type TestApp,
} from '../support/test-app';
import { close, count, delivered } from '../support/money-fixtures';

/**
 * Livreur pay (Admin 4.12, Coursier 4.10, A-15, A-16, D-82): a fiche is due
 * once its period has ended and every caisse of it is closed; it pays each
 * parcel at the rate frozen at delivery and deducts the debts when prepared.
 * The clock starts on Friday 25 September 2026, in the week of the 21st.
 */

let t: TestApp;
let admin: Fixture;
let depot: Fixture;
let seller: Fixture;

const MONDAY = '2026-09-22';

async function weeklyLivreur() {
  const user = await createUser(t.prisma, { role: 'LIVREUR' });
  await t.prisma.courier.update({
    where: { id: user.courierId! },
    data: { payPlan: 'HEBDOMADAIRE', payPlanSince: new Date('2026-01-01T00:00:00.000Z') },
  });
  return user;
}

const token = async (user: Fixture) => (await login(t, user)).accessToken;

beforeAll(async () => {
  t = await createTestApp();
  admin = await createUser(t.prisma, { role: 'ADMIN', username: 'paie.admin' });
  depot = await createUser(t.prisma, { role: 'DEPOT', username: 'paie.depot' });
  seller = await createUser(t.prisma, { role: 'VENDEUR', email: 'paie@boutique.tn' });
});
afterAll(async () => {
  await t.close();
});
beforeEach(() => {
  t.throttle.clear();
});

describe('Paie coursiers (Admin 4.12, D-82)', () => {
  it('pays the week once it is over, at the frozen rates, minus his debt; then Payée', async () => {
    const ali = await weeklyLivreur();
    const aliToken = await token(ali);
    const depotToken = await token(depot);
    // Two deliveries on Tuesday; the rate changes afterwards (A-15).
    const deviceTime = `${MONDAY}T09:00:00.000Z`;
    await delivered(t, { seller, livreur: ali, token: aliToken, deviceTime });
    await delivered(t, { seller, livreur: ali, token: aliToken, deviceTime });
    await t.prisma.parcel.updateMany({
      where: { currentLivreurId: ali.courierId! },
      data: { courierRateMillimes: 4000n },
    });
    await count(t, depotToken, ali, '165,000', MONDAY);
    await close(t, depotToken, ali, MONDAY);

    let adminToken = await token(admin);
    const early = await t.request('GET', '/paie', { token: adminToken });
    expect(early.body).toContainEqual(
      expect.objectContaining({
        livreur: expect.objectContaining({ userId: ali.id }),
        currentPeriod: { start: '2026-09-21', end: '2026-09-27' },
        due: false,
      }),
    );
    const tooSoon = await t.request('POST', '/paie/fiches', {
      token: adminToken,
      body: { livreurId: ali.id },
    });
    expect(tooSoon.body.code).toBe('FICHE_NON_DUE');

    // Monday the 28th: last week is over.
    t.clock.advance(3 * 86_400);
    adminToken = await token(admin);
    const overview = await t.request('GET', '/paie', { token: adminToken });
    expect(overview.body).toContainEqual(
      expect.objectContaining({
        livreur: expect.objectContaining({ userId: ali.id }),
        duePeriod: { start: '2026-09-21', end: '2026-09-27' },
        due: true,
        parcelCount: 2,
        grossMillimes: '8000',
        deductionsMillimes: '5000',
        netMillimes: '3000',
        debtsMillimes: '5000',
      }),
    );

    // The admin is told the fiche is due, once per period (Admin 4.18).
    const noticesJob = t.app.get(NoticesJob);
    expect(await noticesJob.couriersDueForPay()).toBeGreaterThanOrEqual(1);
    expect(await noticesJob.couriersDueForPay()).toBe(0);
    expect(
      await t.prisma.notification.findMany({
        where: { type: 'COURSIER_A_PAYER', params: { path: ['day'], equals: '2026-09-27' } },
        include: { user: { select: { role: true } } },
      }),
    ).toEqual([expect.objectContaining({ user: { role: 'ADMIN' } })]);

    const prepared = await t.request('POST', '/paie/fiches', {
      token: adminToken,
      body: { livreurId: ali.id },
    });
    expect(prepared.status).toBe(201);
    expect(prepared.body).toMatchObject({
      number: 'FP-2026-0928-01',
      status: 'A_PAYER',
      period: { start: '2026-09-21', end: '2026-09-27' },
      parcelCount: 2,
      rates: [{ rateMillimes: '4000', count: 2, totalMillimes: '8000' }],
      grossMillimes: '8000',
      deductionsMillimes: '5000',
      netMillimes: '3000',
      deductions: [expect.objectContaining({ amountMillimes: '5000', caisseDay: MONDAY })],
    });
    const debt = await t.prisma.courierDebt.findFirstOrThrow({
      where: { courierId: ali.courierId! },
    });
    expect(debt).toMatchObject({ remainingMillimes: 0n, status: 'DEDUITE' });

    const again = await t.request('POST', '/paie/fiches', {
      token: adminToken,
      body: { livreurId: ali.id },
    });
    expect(again.body.code).toBe('FICHE_NON_DUE');

    const pdf = await t.request('GET', `/paie/fiches/${prepared.body.id}/pdf`, {
      token: adminToken,
    });
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    const paid = await t.request('POST', `/paie/fiches/${prepared.body.id}/payer`, {
      token: adminToken,
    });
    expect(paid.body.status).toBe('PAYEE');
    expect(
      await t.prisma.auditLog.count({
        where: { action: 'PAIEMENT_FICHE', entityId: prepared.body.id },
      }),
    ).toBe(1);

    t.clock.advance(-3 * 86_400);
  });

  it('waits while a caisse of the period is not closed, and carries a debt bigger than the pay', async () => {
    const sami = await weeklyLivreur();
    const samiToken = await token(sami);
    const depotToken = await token(depot);
    await delivered(t, {
      seller,
      livreur: sami,
      token: samiToken,
      deviceTime: `${MONDAY}T09:00:00.000Z`,
    });
    await t.prisma.courierDebt.create({
      data: { courierId: sami.courierId!, amountMillimes: 10_000n, remainingMillimes: 10_000n },
    });

    t.clock.advance(3 * 86_400);
    let adminToken = await token(admin);
    const waiting = await t.request('GET', '/paie', { token: adminToken });
    expect(waiting.body).toContainEqual(
      expect.objectContaining({
        livreur: expect.objectContaining({ userId: sami.id }),
        due: false,
        cashWithCourierCount: 1,
      }),
    );
    t.clock.advance(-3 * 86_400);

    await count(t, depotToken, sami, '85,000', MONDAY);
    await close(t, depotToken, sami, MONDAY);
    t.clock.advance(3 * 86_400);
    adminToken = await token(admin);
    const slip = await t.request('POST', '/paie/fiches', {
      token: adminToken,
      body: { livreurId: sami.id },
    });
    expect(slip.body).toMatchObject({
      grossMillimes: '3500',
      deductionsMillimes: '3500',
      netMillimes: '0',
    });
    const debt = await t.prisma.courierDebt.findFirstOrThrow({
      where: { courierId: sami.courierId! },
    });
    expect(debt).toMatchObject({ remainingMillimes: 6500n, status: 'EN_COURS' });
    t.clock.advance(-3 * 86_400);
  });

  it('changes a plan from the day after the current period, audited (A-16, answer 8)', async () => {
    const nour = await weeklyLivreur();
    const adminToken = await token(admin);
    const changed = await t.request('PATCH', `/paie/livreurs/${nour.id}/plan`, {
      token: adminToken,
      body: { payPlan: 'MENSUEL' },
    });
    expect(changed.status).toBe(200);
    expect(changed.body).toEqual({
      payPlan: 'HEBDOMADAIRE',
      pendingPayPlan: 'MENSUEL',
      pendingPayPlanFrom: '2026-09-28',
    });
    expect(
      await t.prisma.auditLog.count({ where: { action: 'CHANGEMENT_PLAN_PAIE' } }),
    ).toBeGreaterThan(0);
    const ramasseur = await createUser(t.prisma, { role: 'RAMASSEUR' });
    const refused = await t.request('PATCH', `/paie/livreurs/${ramasseur.id}/plan`, {
      token: adminToken,
      body: { payPlan: 'MENSUEL' },
    });
    expect(refused.body.code).toBe('PAS_UN_LIVREUR');
    const depotToken = await token(depot);
    expect((await t.request('GET', '/paie', { token: depotToken })).status).toBe(403);
  });
});

describe('Mes gains (Coursier 4.10, D-82)', () => {
  it('shows the livreur what the next fiche would pay, and the next payment date', async () => {
    const lina = await weeklyLivreur();
    const linaToken = await token(lina);
    await delivered(t, { seller, livreur: lina, token: linaToken });
    await delivered(t, { seller, livreur: lina, token: linaToken });
    await t.prisma.courierDebt.create({
      data: { courierId: lina.courierId!, amountMillimes: 2_000n, remainingMillimes: 2_000n },
    });

    const gains = await t.request('GET', '/coursier/gains', {
      token: linaToken,
      headers: COURIER_APP_HEADERS,
    });
    expect(gains.status).toBe(200);
    expect(gains.body).toMatchObject({
      payPlan: 'HEBDOMADAIRE',
      period: { start: '2026-09-21', end: '2026-09-27' },
      nextPaymentDate: '2026-09-28',
      parcelCount: 2,
      grossMillimes: '7000',
      debtsMillimes: '2000',
      dueMillimes: '5000',
      fiches: [],
    });

    const ramasseur = await createUser(t.prisma, { role: 'RAMASSEUR' });
    const ramasseurToken = await token(ramasseur);
    expect(
      (
        await t.request('GET', '/coursier/gains', {
          token: ramasseurToken,
          headers: COURIER_APP_HEADERS,
        })
      ).status,
    ).toBe(403);
  });
});
