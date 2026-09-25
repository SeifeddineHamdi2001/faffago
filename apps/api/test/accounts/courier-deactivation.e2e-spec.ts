import {
  COURIER_APP_HEADERS,
  createTestApp,
  createUser,
  login,
  type Fixture,
  type TestApp,
} from '../support/test-app';
import {
  createBonRetour,
  createBonVersement,
  createParcel,
  createPickupWithParcel,
} from '../support/work-fixtures';

/**
 * Désactiver un coursier (Admin 4.15, D-12).
 *
 * Step 1, at once: the account stops receiving work (acceptsWork = false).
 * Step 2: the deactivation itself is refused while anything is still open,
 * and the refusal lists what blocks it.
 */

let t: TestApp;
let admin: Fixture;
let adminToken: string;
let seller: Fixture;

beforeAll(async () => {
  t = await createTestApp();
  admin = await createUser(t.prisma, { role: 'ADMIN', username: 'deact.admin' });
  seller = await createUser(t.prisma, { role: 'VENDEUR', email: 'deact.vendeur@mail.tn' });
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  t.throttle.clear();
  adminToken = (await login(t, admin)).accessToken;
});

function deactivate(courier: Fixture) {
  return t.request('POST', `/accounts/couriers/${courier.id}/deactivate`, { token: adminToken });
}

async function stateOf(courier: Fixture) {
  const user = await t.prisma.user.findUniqueOrThrow({
    where: { id: courier.id },
    include: { courier: true },
  });
  return {
    isActive: user.isActive,
    acceptsWork: user.acceptsWork,
    accountState: user.courier!.accountState,
  };
}

describe('with nothing open', () => {
  it('deactivates, stops new work, and signs the courier out', async () => {
    const livreur = await createUser(t.prisma, { role: 'LIVREUR' });
    const tokens = await login(t, livreur);

    const response = await deactivate(livreur);
    expect(response.status).toBe(200);
    expect(await stateOf(livreur)).toEqual({
      isActive: false,
      acceptsWork: false,
      accountState: 'INACTIF',
    });

    const me = await t.request('GET', '/auth/me', {
      token: tokens.accessToken,
      headers: COURIER_APP_HEADERS,
    });
    expect(me.status).toBe(401);

    const actions = (await t.prisma.auditLog.findMany({ where: { entityId: livreur.id } })).map(
      (entry) => entry.action,
    );
    expect(actions).toEqual(
      expect.arrayContaining(['ARRET_NOUVEAU_TRAVAIL', 'DESACTIVATION_COMPTE']),
    );
  });

  it('keeps the history: the account is never deleted', async () => {
    const ramasseur = await createUser(t.prisma, { role: 'RAMASSEUR' });
    await deactivate(ramasseur);
    expect(await t.prisma.user.findUnique({ where: { id: ramasseur.id } })).not.toBeNull();
  });
});

describe('with work still open', () => {
  it('refuses while the livreur has parcels in his hands, but stops new work at once', async () => {
    const livreur = await createUser(t.prisma, { role: 'LIVREUR' });
    for (let i = 0; i < 2; i++) {
      await createParcel(t.prisma, {
        sellerId: seller.sellerId!,
        createdByUserId: seller.id,
        status: 'EN_LIVRAISON',
        location: 'AVEC_LE_LIVREUR',
        currentLivreurId: livreur.courierId!,
      });
    }

    const response = await deactivate(livreur);
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: 'COURSIER_ENGAGEMENTS_OUVERTS',
      blockers: [{ type: 'COLIS_EN_MAIN', count: 2, label: '2 colis en main' }],
    });
    expect(await stateOf(livreur)).toEqual({
      isActive: true,
      acceptsWork: false,
      accountState: 'ACTIF',
    });

    // He can still log in to hand the parcels over.
    expect((await login(t, livreur)).accessToken).toEqual(expect.any(String));
  });

  it('refuses while cash from a delivery is still with the courier', async () => {
    const livreur = await createUser(t.prisma, { role: 'LIVREUR' });
    await createParcel(t.prisma, {
      sellerId: seller.sellerId!,
      createdByUserId: seller.id,
      status: 'LIVRE',
      location: 'CHEZ_LE_CLIENT',
      cashStatus: 'CHEZ_LE_COURSIER',
      currentLivreurId: livreur.courierId!,
    });
    const response = await deactivate(livreur);
    expect(response.body.blockers).toEqual([
      {
        type: 'ARGENT_CHEZ_LE_COURSIER',
        count: 1,
        label: "1 colis livré dont l'argent n'est pas remis",
      },
    ]);
  });

  it('refuses while the ramasseur carries parcels from a pickup', async () => {
    const ramasseur = await createUser(t.prisma, { role: 'RAMASSEUR' });
    const parcelId = await createParcel(t.prisma, {
      sellerId: seller.sellerId!,
      createdByUserId: seller.id,
      status: 'RAMASSE',
      location: 'AVEC_LE_RAMASSEUR',
    });
    await createPickupWithParcel(t.prisma, {
      sellerId: seller.sellerId!,
      ramasseurId: ramasseur.courierId!,
      parcelId,
    });
    const response = await deactivate(ramasseur);
    expect(response.body.blockers).toEqual([
      { type: 'COLIS_EN_MAIN', count: 1, label: '1 colis en main' },
    ]);
  });

  it('refuses while a bon de versement or a bon de retour is en route with him', async () => {
    const ramasseur = await createUser(t.prisma, { role: 'RAMASSEUR' });
    const bon = {
      sellerId: seller.sellerId!,
      ramasseurId: ramasseur.courierId!,
      preparedByUserId: admin.id,
    };
    await createBonVersement(t.prisma, { ...bon, status: 'EN_ROUTE' });
    await createBonRetour(t.prisma, { ...bon, status: 'EN_ROUTE' });
    // Neither a bon still at the depot nor one already handed over blocks.
    await createBonVersement(t.prisma, { ...bon, status: 'PREPARE' });
    await createBonRetour(t.prisma, { ...bon, status: 'REMIS' });

    const response = await deactivate(ramasseur);
    expect(response.body.blockers).toEqual([
      { type: 'BON_VERSEMENT_EN_ROUTE', count: 1, label: '1 bon de versement en route' },
      { type: 'BON_RETOUR_EN_ROUTE', count: 1, label: '1 bon de retour en route' },
    ]);
  });

  it('lists every blocker at once, not only the first', async () => {
    const livreur = await createUser(t.prisma, { role: 'LIVREUR' });
    const base = { sellerId: seller.sellerId!, createdByUserId: seller.id };
    await createParcel(t.prisma, {
      ...base,
      status: 'EN_LIVRAISON',
      location: 'AVEC_LE_LIVREUR',
      currentLivreurId: livreur.courierId!,
    });
    await createParcel(t.prisma, {
      ...base,
      status: 'LIVRE',
      location: 'CHEZ_LE_CLIENT',
      cashStatus: 'CHEZ_LE_COURSIER',
      currentLivreurId: livreur.courierId!,
    });
    const response = await deactivate(livreur);
    expect(response.body.blockers.map((b: { type: string }) => b.type)).toEqual([
      'COLIS_EN_MAIN',
      'ARGENT_CHEZ_LE_COURSIER',
    ]);
  });

  it("does not count another courier's work", async () => {
    const busy = await createUser(t.prisma, { role: 'LIVREUR' });
    const idle = await createUser(t.prisma, { role: 'LIVREUR' });
    await createParcel(t.prisma, {
      sellerId: seller.sellerId!,
      createdByUserId: seller.id,
      status: 'EN_LIVRAISON',
      location: 'AVEC_LE_LIVREUR',
      currentLivreurId: busy.courierId!,
    });
    expect((await deactivate(idle)).status).toBe(200);
  });

  // Phase 8: the Caisse and the pay.
  it('refuses while a caisse session of the courier is not CLOTUREE', async () => {
    const ramasseur = await createUser(t.prisma, { role: 'RAMASSEUR' });
    await t.prisma.caisseSession.create({
      data: { courierId: ramasseur.courierId!, businessDate: new Date('2026-09-25T00:00:00.000Z') },
    });
    const response = await deactivate(ramasseur);
    expect(response.status).toBe(409);
    expect(response.body.blockers.map((b: { type: string }) => b.type)).toEqual([
      'CAISSE_NON_CLOTUREE',
    ]);
  });

  it('refuses while a payslip of the livreur is A_PAYER', async () => {
    const livreur = await createUser(t.prisma, { role: 'LIVREUR' });
    await t.prisma.payslip.create({
      data: {
        number: `FP-TEST-${livreur.id.slice(0, 8)}`,
        courierId: livreur.courierId!,
        payPlan: 'HEBDOMADAIRE',
        periodStart: new Date('2026-09-14T00:00:00.000Z'),
        periodEnd: new Date('2026-09-20T00:00:00.000Z'),
        parcelCount: 1,
        ratePerParcelMillimes: 3500n,
        grossMillimes: 3500n,
        netMillimes: 3500n,
        preparedByUserId: admin.id,
      },
    });
    const response = await deactivate(livreur);
    expect(response.body.blockers.map((b: { type: string }) => b.type)).toEqual([
      'FICHE_DE_PAIE_A_PAYER',
    ]);
  });

  it('refuses while a debt of the livreur is EN_COURS', async () => {
    const livreur = await createUser(t.prisma, { role: 'LIVREUR' });
    await t.prisma.courierDebt.create({
      data: { courierId: livreur.courierId!, amountMillimes: 5000n, remainingMillimes: 5000n },
    });
    const response = await deactivate(livreur);
    expect(response.body.blockers.map((b: { type: string }) => b.type)).toEqual(['DETTE_EN_COURS']);
  });
});

describe('réactiver', () => {
  it('lets the courier log in and receive work again', async () => {
    const livreur = await createUser(t.prisma, { role: 'LIVREUR' });
    await deactivate(livreur);
    const response = await t.request('POST', `/accounts/couriers/${livreur.id}/activate`, {
      token: adminToken,
    });
    expect(response.status).toBe(200);
    expect(await stateOf(livreur)).toEqual({
      isActive: true,
      acceptsWork: true,
      accountState: 'ACTIF',
    });
    expect((await login(t, livreur)).accessToken).toEqual(expect.any(String));
  });
});

describe('access', () => {
  it('is for the admin only', async () => {
    const depot = await createUser(t.prisma, { role: 'DEPOT', username: 'deact.depot' });
    const livreur = await createUser(t.prisma, { role: 'LIVREUR' });
    const { accessToken } = await login(t, depot);
    const response = await t.request('POST', `/accounts/couriers/${livreur.id}/deactivate`, {
      token: accessToken,
    });
    expect(response.status).toBe(403);
    expect((await stateOf(livreur)).acceptsWork).toBe(true);
  });

  it('only touches courier accounts on this route', async () => {
    const response = await t.request('POST', `/accounts/couriers/${seller.id}/deactivate`, {
      token: adminToken,
    });
    expect(response.status).toBe(404);
  });
});
