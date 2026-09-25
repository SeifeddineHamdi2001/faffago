import type { Prisma } from '@prisma/client';
import { seed } from '../../prisma/seed';
import { VerifyDeadlineJob } from '../../src/a-verifier/verify-deadline.job';
import { createTestApp, createUser, login, type Fixture, type TestApp } from '../support/test-app';
import { createParcel } from '../support/work-fixtures';

/**
 * À vérifier (Vendeur 4.9, Admin 4.6): the seller's decisions, the 48-hour
 * job, the lists and Appels Faffa Go. Only the seller decides (D-4); the team
 * follows up and logs its calls.
 *
 * The test clock reads 2026-09-25 08:00 UTC (09:00 in Tunis): a relance date
 * is valid from 2026-09-26 to 2026-10-02.
 */

let t: TestApp;
let adminToken: string;
let seller: Fixture;
let sellerToken: string;
let other: Fixture;
let otherToken: string;
let sc: Fixture;
let scToken: string;
let depot: Fixture;
let depotToken: string;
let ali: Fixture;

const ADMIN = { username: 'admin', password: 'Mot-De-Passe-Admin-42' };
const HOUR = 3_600_000;

async function marsa() {
  const delegation = await t.prisma.delegation.findUniqueOrThrow({ where: { code: 'TUN-MARSA' } });
  return t.prisma.localite.findFirstOrThrow({
    where: { delegationId: delegation.id, isOther: false },
    orderBy: { nameFr: 'asc' },
  });
}

/** A parcel of the seller that failed once, with the courier or back at the depot. */
async function failed(
  options: {
    location?: 'AVEC_LE_LIVREUR' | 'AU_DEPOT';
    deadlineInHours?: number;
    owner?: Fixture;
    extra?: Partial<Prisma.ParcelUncheckedCreateInput>;
  } = {},
) {
  const localite = await marsa();
  const owner = options.owner ?? seller;
  const location = options.location ?? 'AVEC_LE_LIVREUR';
  const id = await createParcel(t.prisma, {
    sellerId: owner.sellerId!,
    createdByUserId: owner.id,
    status: 'A_VERIFIER',
    location,
    currentLivreurId: location === 'AVEC_LE_LIVREUR' ? ali.courierId! : null,
    where: { delegationId: localite.delegationId, localiteId: localite.id },
    extra: {
      attemptCount: 1,
      lastFailureReason: 'NE_REPOND_PAS',
      lastFailureNote: 'Client dit rappeler après 17 h',
      verifyDeadlineAt: new Date(t.clock.now().getTime() + (options.deadlineInHours ?? 30) * HOUR),
      ...options.extra,
    },
  });
  return t.prisma.parcel.findUniqueOrThrow({ where: { id } });
}

function decide(code: string, decision: string, body?: unknown, token = sellerToken) {
  return t.request('POST', `/parcels/${code}/${decision}`, { token, body });
}

beforeAll(async () => {
  t = await createTestApp();
  await seed(t.prisma, { log: () => undefined, adminPassword: ADMIN.password });
  seller = await createUser(t.prisma, { role: 'VENDEUR', email: 'av@boutique.tn' });
  other = await createUser(t.prisma, {
    role: 'VENDEUR',
    email: 'av-autre@boutique.tn',
    shopName: 'Autre Boutique',
  });
  sc = await createUser(t.prisma, { role: 'SERVICE_CLIENT', username: 'av.sc' });
  depot = await createUser(t.prisma, { role: 'DEPOT', username: 'av.depot' });
  ali = await createUser(t.prisma, { role: 'LIVREUR' });
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  t.throttle.clear();
  sellerToken = (await login(t, seller)).accessToken;
  otherToken = (await login(t, other)).accessToken;
  scToken = (await login(t, sc)).accessToken;
  depotToken = (await login(t, depot)).accessToken;
  adminToken = (await t.request('POST', '/auth/login/staff', { body: ADMIN })).body.accessToken;
});

describe('Relancer (Vendeur 4.9, D-29, D-70)', () => {
  it('plans the date and slot, stops the clock, and gives one new attempt for free', async () => {
    const p = await failed();

    const response = await decide(p.code, 'relancer', { date: '2026-09-27', slot: 'SOIR' });

    expect(response.status).toBe(200);
    expect(response.body.reprintLabel).toBe(false);
    const after = await t.prisma.parcel.findUniqueOrThrow({ where: { id: p.id } });
    expect(after).toMatchObject({
      status: 'RELANCE',
      location: 'AVEC_LE_LIVREUR',
      relaunchOrigin: 'VENDEUR',
      relaunchSlot: 'SOIR',
      verifyDeadlineAt: null,
      attemptCount: 1,
    });
    expect(after.relaunchDate?.toISOString()).toBe('2026-09-27T00:00:00.000Z');
    expect(await t.prisma.sellerCharge.count({ where: { parcelId: p.id } })).toBe(0);
    const event = await t.prisma.parcelEvent.findFirstOrThrow({
      where: { parcelId: p.id, type: 'DECISION_RELANCER' },
    });
    expect(event).toMatchObject({ actorUserId: seller.id, actorRole: 'VENDEUR' });
    expect(event.metadata).toMatchObject({ relaunchDate: '2026-09-27', relaunchSlot: 'SOIR' });
  });

  it('applies the corrections directly, before and after on the event, and flags the label', async () => {
    const p = await failed();

    const response = await decide(p.code, 'relancer', {
      date: '2026-09-26',
      recipientPhone: '98765432',
      address: '12 rue du Lac, 3e étage',
      courierNote: 'Sonner deux fois',
    });

    expect(response.status).toBe(200);
    expect(response.body.reprintLabel).toBe(true);
    expect(response.body.parcel).toMatchObject({
      recipientPhone: '98765432',
      address: '12 rue du Lac, 3e étage',
      courierNote: 'Sonner deux fois',
    });
    const after = await t.prisma.parcel.findUniqueOrThrow({ where: { id: p.id } });
    expect(after.labelReprintNeeded).toBe(true);
    const event = await t.prisma.parcelEvent.findFirstOrThrow({
      where: { parcelId: p.id, type: 'DECISION_RELANCER' },
    });
    expect(event.metadata).toMatchObject({
      changes: {
        recipientPhone: { before: '29876543', after: '98765432' },
        address: { before: 'Rue de Test', after: '12 rue du Lac, 3e étage' },
        courierNote: { before: null, after: 'Sonner deux fois' },
      },
    });
  });

  it('does not ask for a reprint when only the courier note changes: it is not printed', async () => {
    const p = await failed();
    const response = await decide(p.code, 'relancer', {
      date: '2026-09-26',
      courierNote: 'Appeler avant',
    });
    expect(response.body.reprintLabel).toBe(false);
    expect(
      (await t.prisma.parcel.findUniqueOrThrow({ where: { id: p.id } })).labelReprintNeeded,
    ).toBe(false);
  });

  it('refuses the localité (a change request, D-44), a missing date and a date out of the window', async () => {
    const p = await failed();
    const localite = await marsa();
    expect(
      (await decide(p.code, 'relancer', { date: '2026-09-26', localiteId: localite.id })).status,
    ).toBe(400);
    expect((await decide(p.code, 'relancer', {})).status).toBe(400);

    const late = await decide(p.code, 'relancer', { date: '2026-10-05' });
    expect(late.status).toBe(409);
    expect(late.body.code).toBe('DATE_REPORT_INVALIDE');
    const today = await decide(p.code, 'relancer', { date: '2026-09-25' });
    expect(today.body.code).toBe('DATE_REPORT_INVALIDE');
  });

  it('is refused once the attempts are used up, and for a parcel that waits on nothing', async () => {
    const exhausted = await failed({ extra: { attemptCount: 3 } });
    const response = await decide(exhausted.code, 'relancer', { date: '2026-09-26' });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('TENTATIVES_EPUISEES');

    const decided = await failed();
    await decide(decided.code, 'retourner');
    const again = await decide(decided.code, 'relancer', { date: '2026-09-26' });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('DECISION_IMPOSSIBLE');
  });
});

describe('Changer la date (D-9)', () => {
  it('moves the day of a customer postponement and keeps its origin', async () => {
    const localite = await marsa();
    const id = await createParcel(t.prisma, {
      sellerId: seller.sellerId!,
      createdByUserId: seller.id,
      status: 'RELANCE',
      location: 'AU_DEPOT',
      where: { delegationId: localite.delegationId, localiteId: localite.id },
      extra: {
        attemptCount: 1,
        relaunchDate: new Date('2026-09-26T00:00:00.000Z'),
        relaunchOrigin: 'CLIENT',
        relaunchSlot: 'MATIN',
      },
    });
    const { code } = await t.prisma.parcel.findUniqueOrThrow({ where: { id } });

    const response = await decide(code, 'changer-date', { date: '2026-09-29' });

    expect(response.status).toBe(200);
    const after = await t.prisma.parcel.findUniqueOrThrow({ where: { id } });
    expect(after.relaunchDate?.toISOString()).toBe('2026-09-29T00:00:00.000Z');
    expect(after).toMatchObject({ relaunchOrigin: 'CLIENT', relaunchSlot: 'MATIN' });
  });

  it('is refused for a parcel not Relancé', async () => {
    const p = await failed();
    expect((await decide(p.code, 'changer-date', { date: '2026-09-29' })).body.code).toBe(
      'DECISION_IMPOSSIBLE',
    );
  });
});

describe('Retourner (Vendeur 4.9, A-7)', () => {
  it('makes a return with the courier still holding it, the return fee pending, the clock stopped', async () => {
    const p = await failed();

    const response = await decide(p.code, 'retourner');

    expect(response.status).toBe(200);
    const after = await t.prisma.parcel.findUniqueOrThrow({ where: { id: p.id } });
    expect(after).toMatchObject({
      status: 'RETOUR_AU_DEPOT',
      location: 'AVEC_LE_LIVREUR',
      verifyDeadlineAt: null,
    });
    const charges = await t.prisma.sellerCharge.findMany({ where: { parcelId: p.id } });
    expect(charges).toEqual([
      expect.objectContaining({ type: 'RETOUR', amountMillimes: 5000n, status: 'EN_ATTENTE' }),
    ]);
  });
});

describe('Changer de client (Vendeur 4.9, A-17, D-8, D-72, D-74)', () => {
  async function body() {
    const localite = await marsa();
    return {
      recipientName: 'Nouvelle Cliente',
      recipientPhone: '55111222',
      recipientPhone2: '55111333',
      localiteId: localite.id,
      address: 'Avenue Habib Bourguiba 5',
      landmark: 'Face à la pharmacie',
      codAmountMillimes: '92,500',
      isExchange: false,
      openingAllowed: true,
    };
  }

  it('waits for the depot: "Disponible au retour au dépôt" while the courier has it', async () => {
    const p = await failed({ location: 'AVEC_LE_LIVREUR' });
    const response = await decide(p.code, 'changer-client', await body());
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('CHANGEMENT_CLIENT_AU_RETOUR_DEPOT');
  });

  it('at the depot: a new customer and COD, attempts reset, the 1 DT fee, the old customer kept', async () => {
    const p = await failed({ location: 'AU_DEPOT', extra: { meetingPoint: 'Café du coin' } });

    const response = await decide(p.code, 'changer-client', await body());

    expect(response.status).toBe(200);
    expect(response.body.reprintLabel).toBe(true);
    const after = await t.prisma.parcel.findUniqueOrThrow({ where: { id: p.id } });
    expect(after).toMatchObject({
      status: 'AU_DEPOT',
      location: 'AU_DEPOT',
      attemptCount: 0,
      changeClientCount: 1,
      recipientName: 'Nouvelle Cliente',
      recipientPhone: '55111222',
      codAmountMillimes: 92_500n,
      openingAllowed: true,
      verifyDeadlineAt: null,
      lastFailureReason: null,
      lastFailureNote: null,
      meetingPoint: null,
      labelReprintNeeded: true,
      // The fees stay frozen at creation (CLAUDE.md, Money).
      deliveryFeeMillimes: 7000n,
    });
    const charges = await t.prisma.sellerCharge.findMany({ where: { parcelId: p.id } });
    expect(charges).toEqual([
      expect.objectContaining({
        type: 'CHANGEMENT_CLIENT',
        amountMillimes: 1000n,
        status: 'EN_ATTENTE',
      }),
    ]);
    const history = await t.prisma.parcelClientChange.findFirstOrThrow({
      where: { parcelId: p.id },
    });
    expect(history).toMatchObject({
      previousName: 'Client',
      previousPhone: '29876543',
      previousAddress: 'Rue de Test',
      previousCodMillimes: 85_000n,
      newCodMillimes: 92_500n,
      feeMillimes: 1000n,
      chargeId: charges[0]!.id,
      decidedByUserId: seller.id,
    });
    const event = await t.prisma.parcelEvent.findFirstOrThrow({
      where: { parcelId: p.id, type: 'DECISION_CHANGER_CLIENT' },
    });
    expect(event.metadata).toMatchObject({
      changementClient: { codAvant: '85000', codApres: '92500' },
    });
  });

  it('withdraws a waiting change request filed for the old customer (D-72)', async () => {
    const p = await failed({ location: 'AU_DEPOT' });
    const asked = await t.request('POST', `/parcels/${p.code}/change-requests`, {
      token: sellerToken,
      body: { recipientPhone: '98989898' },
    });
    expect(asked.status).toBe(201);

    await decide(p.code, 'changer-client', await body());

    const request = await t.prisma.sellerChangeRequest.findUniqueOrThrow({
      where: { id: asked.body.id },
    });
    expect(request).toMatchObject({ status: 'RETIREE', handledByUserId: seller.id });
  });

  it('works from a customer postponement back at the depot (D-9)', async () => {
    const p = await failed({
      location: 'AU_DEPOT',
      extra: {
        verifyDeadlineAt: null,
        relaunchDate: new Date('2026-09-28T00:00:00.000Z'),
        relaunchOrigin: 'CLIENT',
      },
    });
    await t.prisma.$transaction(async (tx) => {
      await tx.parcel.update({ where: { id: p.id }, data: { status: 'RELANCE' } });
      await tx.parcelEvent.create({
        data: {
          parcelId: p.id,
          type: 'FORCAGE_STATUT',
          newStatus: 'RELANCE',
          newLocation: 'AU_DEPOT',
          reasonText: 'Fixture de test',
        },
      });
    });

    const response = await decide(p.code, 'changer-client', await body());

    expect(response.status).toBe(200);
    const after = await t.prisma.parcel.findUniqueOrThrow({ where: { id: p.id } });
    expect(after).toMatchObject({ status: 'AU_DEPOT', relaunchDate: null, relaunchOrigin: null });
  });

  it('only once per parcel (D-8)', async () => {
    const p = await failed({ location: 'AU_DEPOT', extra: { changeClientCount: 1 } });
    const response = await decide(p.code, 'changer-client', await body());
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('CHANGEMENT_CLIENT_DEJA_UTILISE');
  });

  it('refuses a deactivated localité (D-27)', async () => {
    const p = await failed({ location: 'AU_DEPOT' });
    const closed = await t.prisma.localite.findFirstOrThrow({
      where: { isOther: false, nameFr: { not: (await marsa()).nameFr } },
    });
    await t.prisma.localite.update({ where: { id: closed.id }, data: { isActive: false } });
    const response = await decide(p.code, 'changer-client', {
      ...(await body()),
      localiteId: closed.id,
    });
    await t.prisma.localite.update({ where: { id: closed.id }, data: { isActive: true } });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('LOCALITE_INACTIVE');
  });
});

describe('who decides (D-4, D-26)', () => {
  it('never the team: every staff role is refused', async () => {
    const p = await failed();
    for (const token of [adminToken, scToken, depotToken]) {
      expect((await decide(p.code, 'retourner', undefined, token)).status).toBe(403);
      expect((await decide(p.code, 'relancer', { date: '2026-09-26' }, token)).status).toBe(403);
    }
    expect((await t.prisma.parcel.findUniqueOrThrow({ where: { id: p.id } })).status).toBe(
      'A_VERIFIER',
    );
  });

  it("another seller's parcel is an unknown code", async () => {
    const p = await failed();
    const response = await decide(p.code, 'retourner', undefined, otherToken);
    expect(response.status).toBe(404);
    expect(response.body.message).toBe('Code inconnu');
  });

  it('a suspended seller still decides (D-25)', async () => {
    const p = await failed();
    await t.prisma.seller.update({
      where: { id: seller.sellerId! },
      data: { accountState: 'SUSPENDU' },
    });
    const response = await decide(p.code, 'retourner');
    await t.prisma.seller.update({
      where: { id: seller.sellerId! },
      data: { accountState: 'ACTIF' },
    });
    expect(response.status).toBe(200);
  });
});

describe('the 48-hour job (Vendeur 4.9, D-30)', () => {
  it('returns every parcel past its deadline, as the system, with the return fee', async () => {
    const due = await failed({ deadlineInHours: -1 });
    const notYet = await failed({ deadlineInHours: 1 });
    const job = t.app.get(VerifyDeadlineJob);

    expect(await job.returnExpired()).toBeGreaterThanOrEqual(1);

    const after = await t.prisma.parcel.findUniqueOrThrow({ where: { id: due.id } });
    expect(after).toMatchObject({
      status: 'RETOUR_AU_DEPOT',
      location: 'AVEC_LE_LIVREUR',
      verifyDeadlineAt: null,
    });
    const event = await t.prisma.parcelEvent.findFirstOrThrow({
      where: { parcelId: due.id, type: 'RETOUR_AUTO_48H' },
    });
    expect(event).toMatchObject({ actorUserId: null, actorRole: null });
    expect(await t.prisma.sellerCharge.count({ where: { parcelId: due.id, type: 'RETOUR' } })).toBe(
      1,
    );
    expect((await t.prisma.parcel.findUniqueOrThrow({ where: { id: notYet.id } })).status).toBe(
      'A_VERIFIER',
    );

    // Run again: nothing is returned twice, no second fee.
    expect(await job.returnExpired()).toBe(0);
    expect(await t.prisma.sellerCharge.count({ where: { parcelId: due.id } })).toBe(1);
  });

  it('reads the server clock: the deadline passes when the clock does', async () => {
    const p = await failed({ deadlineInHours: 2 });
    const job = t.app.get(VerifyDeadlineJob);
    await job.returnExpired();
    expect((await t.prisma.parcel.findUniqueOrThrow({ where: { id: p.id } })).status).toBe(
      'A_VERIFIER',
    );
    t.clock.advance(2 * 3600);
    await job.returnExpired();
    expect((await t.prisma.parcel.findUniqueOrThrow({ where: { id: p.id } })).status).toBe(
      'RETOUR_AU_DEPOT',
    );
  });

  it('never touches a decided parcel or a customer postponement (D-9)', async () => {
    const relanced = await failed({ deadlineInHours: 3 });
    await decide(relanced.code, 'relancer', { date: '2026-09-29' });
    t.clock.advance(10 * 3600);
    await t.app.get(VerifyDeadlineJob).returnExpired();
    expect((await t.prisma.parcel.findUniqueOrThrow({ where: { id: relanced.id } })).status).toBe(
      'RELANCE',
    );
  });
});

describe('the seller’s À vérifier list and summary', () => {
  it('lists his own, soonest first, with the reason, the courier note and what he can do', async () => {
    await t.prisma.parcel.updateMany({
      where: { status: 'A_VERIFIER' },
      data: { verifyDeadlineAt: new Date(t.clock.now().getTime() + 40 * HOUR) },
    });
    const later = await failed({ deadlineInHours: 30 });
    const soon = await failed({ deadlineInHours: 5, location: 'AU_DEPOT' });
    await failed({ owner: other, deadlineInHours: 1 });

    const response = await t.request('GET', '/a-verifier', { token: sellerToken });

    expect(response.status).toBe(200);
    const codes = response.body.items.map((i: { code: string }) => i.code);
    expect(codes.indexOf(soon.code)).toBeLessThan(codes.indexOf(later.code));
    const first = response.body.items.find((i: { code: string }) => i.code === soon.code);
    expect(first).toMatchObject({
      failureReason: 'NE_REPOND_PAS',
      courierFailureNote: 'Client dit rappeler après 17 h',
      attemptCount: 1,
      maxAttempts: 3,
      location: 'AU_DEPOT',
      decisions: { relancer: true, retourner: true, changerDate: false, changerClient: 'OUI' },
    });
    const all = await t.prisma.parcel.count({
      where: { sellerId: seller.sellerId!, status: 'A_VERIFIER' },
    });
    expect(response.body.items).toHaveLength(all);
  });

  it('the summary counts them and names those under 24 hours', async () => {
    const soon = await failed({ deadlineInHours: 3 });
    const response = await t.request('GET', '/a-verifier/resume', { token: sellerToken });
    expect(response.status).toBe(200);
    expect(response.body.count).toBe(
      await t.prisma.parcel.count({ where: { sellerId: seller.sellerId!, status: 'A_VERIFIER' } }),
    );
    expect(response.body.urgent.map((u: { code: string }) => u.code)).toContain(soon.code);
    expect(
      response.body.urgent.every(
        (u: { verifyDeadlineAt: string }) =>
          new Date(u.verifyDeadlineAt).getTime() - t.clock.now().getTime() < 24 * HOUR,
      ),
    ).toBe(true);
  });

  it('is the seller space only', async () => {
    expect((await t.request('GET', '/a-verifier', { token: scToken })).status).toBe(403);
    expect((await t.request('GET', '/a-verifier/resume', { token: adminToken })).status).toBe(403);
  });
});

describe('Service client follow-up and Appels Faffa Go (Admin 4.6, Vendeur 4.8)', () => {
  it('lists every seller’s parcels in À vérifier, with the contacts to call', async () => {
    const mine = await failed({ deadlineInHours: 6 });
    const theirs = await failed({ owner: other, deadlineInHours: 8 });

    const response = await t.request('GET', '/a-verifier/suivi', { token: scToken });

    expect(response.status).toBe(200);
    const row = response.body.items.find((i: { code: string }) => i.code === mine.code);
    expect(row).toMatchObject({
      shopName: 'Boutique Test',
      recipientPhone: '29876543',
      courierFailureNote: 'Client dit rappeler après 17 h',
      lastCall: null,
      callCount: 0,
    });
    expect(response.body.items.map((i: { code: string }) => i.code)).toContain(theirs.code);
  });

  it('is Admin and Service client only', async () => {
    expect((await t.request('GET', '/a-verifier/suivi', { token: adminToken })).status).toBe(200);
    expect((await t.request('GET', '/a-verifier/suivi', { token: depotToken })).status).toBe(403);
    expect((await t.request('GET', '/a-verifier/suivi', { token: sellerToken })).status).toBe(403);
  });

  it('logs a call the seller reads as Faffa Go, and the team reads with the name', async () => {
    const p = await failed();

    const logged = await t.request('POST', `/colis/${p.code}/appels`, {
      token: scToken,
      body: { answered: false, note: 'Messagerie' },
    });

    expect(logged.status).toBe(201);
    expect(logged.body).toMatchObject({ answered: false, note: 'Messagerie' });
    expect(new Date(logged.body.calledAt).toISOString()).toBe(t.clock.now().toISOString());

    const detail = await t.request('GET', `/parcels/${p.code}`, { token: sellerToken });
    expect(detail.body.calls).toEqual([
      { calledAt: logged.body.calledAt, answered: false, note: 'Messagerie' },
    ]);
    expect(JSON.stringify(detail.body.calls)).not.toContain(logged.body.staffName);

    const staff = await t.request('GET', `/colis/${p.code}`, { token: depotToken });
    expect(staff.body.calls[0]).toMatchObject({
      answered: false,
      staffName: logged.body.staffName,
    });

    const follow = await t.request('GET', '/a-verifier/suivi', { token: scToken });
    const row = follow.body.items.find((i: { code: string }) => i.code === p.code);
    expect(row).toMatchObject({ callCount: 1, lastCall: { answered: false, note: 'Messagerie' } });
  });

  it('refuses the depot and the seller, and a parcel not yet picked up', async () => {
    const p = await failed();
    for (const token of [depotToken, sellerToken]) {
      expect(
        (await t.request('POST', `/colis/${p.code}/appels`, { token, body: { answered: true } }))
          .status,
      ).toBe(403);
    }
    const id = await createParcel(t.prisma, {
      sellerId: seller.sellerId!,
      createdByUserId: seller.id,
    });
    const created = await t.prisma.parcel.findUniqueOrThrow({ where: { id } });
    const response = await t.request('POST', `/colis/${created.code}/appels`, {
      token: scToken,
      body: { answered: true },
    });
    expect(response.status).toBe(409);
  });
});

describe('Détail du colis for the seller (D-71)', () => {
  it('shows the courier note, the time left, the decisions and each failure note', async () => {
    const p = await failed({ deadlineInHours: 20 });
    await t.prisma.parcelEvent.create({
      data: {
        parcelId: p.id,
        type: 'ECHEC_LIVRAISON',
        previousStatus: 'A_VERIFIER',
        newStatus: 'A_VERIFIER',
        previousLocation: 'AVEC_LE_LIVREUR',
        newLocation: 'AVEC_LE_LIVREUR',
        reasonCode: 'NE_REPOND_PAS',
        reasonText: 'Client dit rappeler après 17 h',
      },
    });

    const response = await t.request('GET', `/parcels/${p.code}`, { token: sellerToken });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      lastFailureReason: 'NE_REPOND_PAS',
      lastFailureNote: 'Client dit rappeler après 17 h',
      decisions: { relancer: true, retourner: true, changerClient: 'AU_RETOUR_DEPOT' },
    });
    expect(new Date(response.body.verifyDeadlineAt).getTime()).toBe(p.verifyDeadlineAt!.getTime());
    const failure = response.body.timeline.find(
      (e: { type: string }) => e.type === 'ECHEC_LIVRAISON',
    );
    expect(failure.courierNote).toBe('Client dit rappeler après 17 h');
    // Other events never carry free text to the seller.
    expect(
      response.body.timeline
        .filter((e: { type: string }) => e.type !== 'ECHEC_LIVRAISON')
        .every((e: { courierNote: string | null }) => e.courierNote === null),
    ).toBe(true);
  });
});
