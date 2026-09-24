import { randomUUID } from 'node:crypto';
import type { ParcelLocation, ParcelStatus, Prisma } from '@prisma/client';
import { seed } from '../../prisma/seed';
import { createTestApp, createUser, login, type Fixture, type TestApp } from '../support/test-app';
import { createParcel } from '../support/work-fixtures';

/**
 * The depot's scan station (Admin 4.2, D-50, D-53): Entrée dépôt, Sortie
 * coursier and Retour de tournée. Every scan carries the browser's UUID and is
 * idempotent; every scan is validated against the parcel as it is, with a
 * clear reason when refused; refused scans are stored too.
 */

let t: TestApp;
let depot: Fixture;
let depotToken: string;
let seller: Fixture;
let ali: Fixture;
let sami: Fixture;
let hedi: Fixture;

const ADMIN = { username: 'admin', password: 'Mot-De-Passe-Admin-42' };
// The test clock: 2026-09-25T08:00Z, 09:00 in Tunis.
const TODAY = '2026-09-25';

async function placeIn(code: string) {
  const delegation = await t.prisma.delegation.findUniqueOrThrow({ where: { code } });
  const localite = await t.prisma.localite.findFirstOrThrow({
    where: { delegationId: delegation.id, isOther: false },
  });
  return { delegationId: delegation.id, localiteId: localite.id, zoneId: delegation.zoneId! };
}

async function named(role: 'LIVREUR' | 'RAMASSEUR', firstName: string): Promise<Fixture> {
  const user = await createUser(t.prisma, { role });
  await t.prisma.user.update({ where: { id: user.id }, data: { firstName, lastName: 'Test' } });
  return user;
}

async function titular(zoneId: string, courier: Fixture): Promise<void> {
  await t.prisma.zoneAssignment.deleteMany({ where: { zoneId, role: 'LIVREUR' } });
  await t.prisma.zoneAssignment.create({
    data: { zoneId, courierId: courier.courierId!, role: 'LIVREUR', kind: 'TITULAIRE' },
  });
}

beforeAll(async () => {
  t = await createTestApp();
  await seed(t.prisma, { log: () => undefined, adminPassword: ADMIN.password });
  depot = await createUser(t.prisma, { role: 'DEPOT', username: 'scan.depot' });
  seller = await createUser(t.prisma, { role: 'VENDEUR', email: 'scan@boutique.tn' });
  ali = await named('LIVREUR', 'Ali');
  sami = await named('LIVREUR', 'Sami');
  hedi = await named('RAMASSEUR', 'Hédi');
  await titular((await placeIn('TUN-MARSA')).zoneId, ali);
  await titular((await placeIn('TUN-BARDO')).zoneId, sami);
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  t.throttle.clear();
  depotToken = (await login(t, depot)).accessToken;
});

async function parcel(input: {
  status: ParcelStatus;
  location: ParcelLocation;
  in?: string;
  livreur?: Fixture;
  extra?: Partial<Prisma.ParcelUncheckedCreateInput>;
}) {
  const where = await placeIn(input.in ?? 'TUN-MARSA');
  const id = await createParcel(t.prisma, {
    sellerId: seller.sellerId!,
    createdByUserId: seller.id,
    status: input.status,
    location: input.location,
    currentLivreurId: input.livreur?.courierId ?? null,
    where: { delegationId: where.delegationId, localiteId: where.localiteId },
    extra: input.extra,
  });
  return t.prisma.parcel.findUniqueOrThrow({ where: { id } });
}

function scan(
  body: {
    mode: 'ENTREE_DEPOT' | 'SORTIE_COURSIER' | 'RETOUR_DE_TOURNEE';
    rawCode: string;
    courierId?: string | null;
    clientScanId?: string;
    source?: string;
    deviceTime?: string;
  },
  token = depotToken,
) {
  return t.request('POST', '/scans/depot', {
    token,
    body: {
      clientScanId: body.clientScanId ?? randomUUID(),
      source: 'WEB_DOUCHETTE',
      deviceTime: t.clock.now().toISOString(),
      ...body,
    },
  });
}

async function reload(id: string) {
  return t.prisma.parcel.findUniqueOrThrow({ where: { id } });
}

async function scanRow(clientScanId: string) {
  return t.prisma.scan.findUniqueOrThrow({ where: { clientScanId } });
}

// ─────────────────────────────────────────────────────────────

describe('Entrée dépôt', () => {
  it('takes a Ramassé parcel in: Au dépôt, one event tied to the scan', async () => {
    const p = await parcel({ status: 'RAMASSE', location: 'AVEC_LE_RAMASSEUR' });
    const clientScanId = randomUUID();

    const response = await scan({ mode: 'ENTREE_DEPOT', rawCode: p.code, clientScanId });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      clientScanId,
      mode: 'ENTREE_DEPOT',
      accepted: true,
      replayed: false,
      refusal: null,
      message: 'Au dépôt · Au dépôt',
      manualEntry: false,
      clockSkewFlagged: false,
      parcel: {
        code: p.code,
        status: 'AU_DEPOT',
        location: 'AU_DEPOT',
        shopName: 'Boutique Test',
        delegationNameFr: 'La Marsa',
      },
      // The window of Paramètres, 60 s, from the server's reception (D-54).
      cancellableUntil: '2026-09-25T08:01:00.000Z',
      serverTime: '2026-09-25T08:00:00.000Z',
    });
    expect(await reload(p.id)).toMatchObject({ status: 'AU_DEPOT', location: 'AU_DEPOT' });

    const row = await scanRow(clientScanId);
    expect(row).toMatchObject({
      action: 'ENTREE_DEPOT',
      accepted: true,
      parcelId: p.id,
      actorUserId: depot.id,
      source: 'WEB_DOUCHETTE',
      manualEntry: false,
      businessDate: new Date(`${TODAY}T00:00:00.000Z`),
      parcelBefore: expect.objectContaining({ status: 'RAMASSE', location: 'AVEC_LE_RAMASSEUR' }),
    });
    const events = await t.prisma.parcelEvent.findMany({ where: { scanId: row.id } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'ENTREE_DEPOT',
      previousStatus: 'RAMASSE',
      newStatus: 'AU_DEPOT',
      actorRole: 'DEPOT',
      source: 'WEB_DOUCHETTE',
    });
  });

  it('reads the QR code’s tracking link as well as the bare code (D-36)', async () => {
    const p = await parcel({ status: 'RAMASSE', location: 'AVEC_LE_RAMASSEUR' });
    const response = await scan({
      mode: 'ENTREE_DEPOT',
      rawCode: `https://www.mirely.store/suivi/${p.code}`,
      source: 'WEB_CAMERA',
    });
    expect(response.body.accepted).toBe(true);
  });

  it('takes in a parcel cancelled while the ramasseur carried it, status unchanged (D-28)', async () => {
    const p = await parcel({ status: 'RETOUR_AU_DEPOT', location: 'AVEC_LE_RAMASSEUR' });
    const response = await scan({ mode: 'ENTREE_DEPOT', rawCode: p.code });
    expect(response.body.accepted).toBe(true);
    expect(await reload(p.id)).toMatchObject({ status: 'RETOUR_AU_DEPOT', location: 'AU_DEPOT' });
  });

  it('refuses an unknown code, and keeps the refused scan', async () => {
    const clientScanId = randomUUID();
    const response = await scan({ mode: 'ENTREE_DEPOT', rawCode: 'FG-ZZZZZZZZ', clientScanId });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      accepted: false,
      refusal: 'CODE_INCONNU',
      message: 'Code inconnu',
      parcel: null,
      cancellableUntil: null,
    });
    expect(await scanRow(clientScanId)).toMatchObject({
      accepted: false,
      refusalReason: 'CODE_INCONNU',
      parcelId: null,
      parcelBefore: null,
    });
  });

  it('refuses what is not a parcel code at all', async () => {
    const response = await scan({ mode: 'ENTREE_DEPOT', rawCode: 'bonjour' });
    expect(response.body.refusal).toBe('CODE_INCONNU');
  });

  it('refuses a delivered parcel and a parcel already at the depot, with their reason', async () => {
    const delivered = await parcel({ status: 'LIVRE', location: 'CHEZ_LE_CLIENT' });
    const refused = await scan({ mode: 'ENTREE_DEPOT', rawCode: delivered.code });
    expect(refused.body).toMatchObject({
      accepted: false,
      refusal: 'COLIS_DEJA_LIVRE',
      message: 'Colis déjà livré',
      parcel: { code: delivered.code, status: 'LIVRE' },
    });
    expect((await reload(delivered.id)).status).toBe('LIVRE');

    const atDepot = await parcel({ status: 'AU_DEPOT', location: 'AU_DEPOT' });
    const wrongMode = await scan({ mode: 'ENTREE_DEPOT', rawCode: atDepot.code });
    expect(wrongMode.body).toMatchObject({ refusal: 'MAUVAIS_MODE', message: 'Mauvais mode' });
    const row = await t.prisma.scan.findFirstOrThrow({
      where: { parcelId: atDepot.id, accepted: false },
    });
    expect(row.refusalReason).toBe('MAUVAIS_MODE');
  });
});

describe('the same scan sent twice (tech-stack 2)', () => {
  it('returns the first result and writes nothing more', async () => {
    const p = await parcel({ status: 'RAMASSE', location: 'AVEC_LE_RAMASSEUR' });
    const clientScanId = randomUUID();
    const first = await scan({ mode: 'ENTREE_DEPOT', rawCode: p.code, clientScanId });
    const second = await scan({ mode: 'ENTREE_DEPOT', rawCode: p.code, clientScanId });

    expect(second.status).toBe(200);
    expect(second.body).toEqual({ ...first.body, replayed: true });
    expect(await t.prisma.scan.count({ where: { clientScanId } })).toBe(1);
    expect(
      await t.prisma.parcelEvent.count({ where: { parcelId: p.id, type: 'ENTREE_DEPOT' } }),
    ).toBe(1);
  });

  it('returns a refusal again as it was', async () => {
    const clientScanId = randomUUID();
    const first = await scan({ mode: 'ENTREE_DEPOT', rawCode: 'FG-YYYYYYYY', clientScanId });
    const second = await scan({ mode: 'ENTREE_DEPOT', rawCode: 'FG-YYYYYYYY', clientScanId });
    expect(second.body).toEqual({ ...first.body, replayed: true });
  });

  it('refuses the same id for another parcel or another mode (D-53)', async () => {
    const a = await parcel({ status: 'RAMASSE', location: 'AVEC_LE_RAMASSEUR' });
    const b = await parcel({ status: 'RAMASSE', location: 'AVEC_LE_RAMASSEUR' });
    const clientScanId = randomUUID();
    await scan({ mode: 'ENTREE_DEPOT', rawCode: a.code, clientScanId });

    for (const body of [
      { mode: 'ENTREE_DEPOT' as const, rawCode: b.code },
      { mode: 'RETOUR_DE_TOURNEE' as const, rawCode: a.code, courierId: ali.id },
    ]) {
      const response = await scan({ ...body, clientScanId });
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        accepted: false,
        refusal: 'SCAN_ID_REUTILISE',
        message: 'Identifiant de scan déjà utilisé pour un autre scan',
      });
    }
    expect(await t.prisma.scan.count({ where: { clientScanId } })).toBe(1);
    expect((await reload(b.id)).status).toBe('RAMASSE');
  });

  it('refuses the same id sent by another person', async () => {
    const p = await parcel({ status: 'RAMASSE', location: 'AVEC_LE_RAMASSEUR' });
    const clientScanId = randomUUID();
    await scan({ mode: 'ENTREE_DEPOT', rawCode: p.code, clientScanId });
    t.throttle.clear();
    const adminToken = (await t.request('POST', '/auth/login/staff', { body: ADMIN })).body
      .accessToken;
    const response = await scan(
      { mode: 'ENTREE_DEPOT', rawCode: p.code, clientScanId },
      adminToken,
    );
    expect(response.body.refusal).toBe('SCAN_ID_REUTILISE');
  });
});

describe('Sortie coursier', () => {
  it('sends a parcel out with the chosen livreur, who is the one planned', async () => {
    const p = await parcel({ status: 'AU_DEPOT', location: 'AU_DEPOT' });
    const clientScanId = randomUUID();

    const response = await scan({
      mode: 'SORTIE_COURSIER',
      rawCode: p.code,
      courierId: ali.id,
      clientScanId,
    });

    expect(response.body).toMatchObject({
      accepted: true,
      message: 'En livraison · Avec le livreur',
      courier: { id: ali.id, firstName: 'Ali', lastName: 'Test' },
      plannedFor: null,
    });
    expect(await reload(p.id)).toMatchObject({
      status: 'EN_LIVRAISON',
      location: 'AVEC_LE_LIVREUR',
      currentLivreurId: ali.courierId,
    });
    expect((await scanRow(clientScanId)).targetCourierId).toBe(ali.courierId);
  });

  it('accepts another livreur than the one planned, and says who was planned (D-53)', async () => {
    const p = await parcel({ status: 'AU_DEPOT', location: 'AU_DEPOT', in: 'TUN-BARDO' });
    const response = await scan({ mode: 'SORTIE_COURSIER', rawCode: p.code, courierId: ali.id });
    expect(response.body).toMatchObject({
      accepted: true,
      courier: { id: ali.id },
      plannedFor: { id: sami.id, firstName: 'Sami', lastName: 'Test' },
    });
    expect((await reload(p.id)).currentLivreurId).toBe(ali.courierId);
  });

  it('reads a manual move as the plan, and clears it once the parcel is out (D-55)', async () => {
    const p = await parcel({
      status: 'AU_DEPOT',
      location: 'AU_DEPOT',
      extra: { plannedLivreurId: sami.courierId! },
    });
    const response = await scan({ mode: 'SORTIE_COURSIER', rawCode: p.code, courierId: ali.id });
    expect(response.body.plannedFor).toMatchObject({ id: sami.id });
    expect((await reload(p.id)).plannedLivreurId).toBeNull();
    expect(
      (await t.prisma.scan.findFirstOrThrow({ where: { parcelId: p.id } })).parcelBefore,
    ).toMatchObject({
      plannedLivreurId: sami.courierId,
    });
  });

  it('sends out a Relancé parcel and keeps its date in what it was before', async () => {
    const p = await parcel({
      status: 'RELANCE',
      location: 'AU_DEPOT',
      extra: {
        relaunchDate: new Date(`${TODAY}T00:00:00.000Z`),
        relaunchSlot: 'MATIN',
        relaunchOrigin: 'VENDEUR',
        attemptCount: 1,
      },
    });
    const clientScanId = randomUUID();
    const response = await scan({
      mode: 'SORTIE_COURSIER',
      rawCode: p.code,
      courierId: ali.id,
      clientScanId,
    });
    expect(response.body.accepted).toBe(true);
    expect(await reload(p.id)).toMatchObject({ status: 'EN_LIVRAISON', relaunchDate: null });
    expect((await scanRow(clientScanId)).parcelBefore).toEqual({
      status: 'RELANCE',
      location: 'AU_DEPOT',
      currentLivreurId: null,
      plannedLivreurId: null,
      relaunchDate: TODAY,
      relaunchSlot: 'MATIN',
      relaunchOrigin: 'VENDEUR',
    });
  });

  it('refuses without a courier chosen', async () => {
    const p = await parcel({ status: 'AU_DEPOT', location: 'AU_DEPOT' });
    const response = await scan({ mode: 'SORTIE_COURSIER', rawCode: p.code });
    expect(response.body).toMatchObject({
      accepted: false,
      refusal: 'COURSIER_NON_PRECISE',
      message: 'Choisissez un coursier avant de scanner',
    });
  });

  it('refuses a livreur absent today, one who takes no new work, and a ramasseur (D-53)', async () => {
    const absent = await named('LIVREUR', 'Walid');
    await t.prisma.courierAbsence.create({
      data: {
        courierId: absent.courierId!,
        date: new Date(`${TODAY}T00:00:00.000Z`),
        createdByUserId: depot.id,
      },
    });
    const stopped = await named('LIVREUR', 'Nizar');
    await t.prisma.user.update({ where: { id: stopped.id }, data: { acceptsWork: false } });
    const p = await parcel({ status: 'AU_DEPOT', location: 'AU_DEPOT' });

    for (const courier of [absent, stopped, hedi]) {
      const response = await scan({
        mode: 'SORTIE_COURSIER',
        rawCode: p.code,
        courierId: courier.id,
      });
      expect(response.body).toMatchObject({ accepted: false, refusal: 'COURSIER_INDISPONIBLE' });
    }
    expect(await reload(p.id)).toMatchObject({ status: 'AU_DEPOT', currentLivreurId: null });
  });

  it('refuses a parcel that is not at the depot', async () => {
    const p = await parcel({ status: 'RAMASSE', location: 'AVEC_LE_RAMASSEUR' });
    const response = await scan({ mode: 'SORTIE_COURSIER', rawCode: p.code, courierId: ali.id });
    expect(response.body.refusal).toBe('MAUVAIS_MODE');
  });
});

describe('Retour de tournée', () => {
  it('takes back a failed parcel: still À vérifier, now at the depot', async () => {
    const p = await parcel({ status: 'A_VERIFIER', location: 'AVEC_LE_LIVREUR', livreur: ali });
    const response = await scan({ mode: 'RETOUR_DE_TOURNEE', rawCode: p.code, courierId: ali.id });
    expect(response.body).toMatchObject({ accepted: true, message: 'À vérifier · Au dépôt' });
    expect(await reload(p.id)).toMatchObject({ status: 'A_VERIFIER', location: 'AU_DEPOT' });
  });

  it('takes back a parcel never attempted: Au dépôt again, attempts untouched (A-8)', async () => {
    const p = await parcel({ status: 'EN_LIVRAISON', location: 'AVEC_LE_LIVREUR', livreur: ali });
    const response = await scan({ mode: 'RETOUR_DE_TOURNEE', rawCode: p.code, courierId: ali.id });
    expect(response.body.accepted).toBe(true);
    expect(await reload(p.id)).toMatchObject({
      status: 'AU_DEPOT',
      location: 'AU_DEPOT',
      currentLivreurId: null,
      attemptCount: 0,
    });
  });

  it('refuses a parcel another livreur carries (D-53)', async () => {
    const p = await parcel({ status: 'A_VERIFIER', location: 'AVEC_LE_LIVREUR', livreur: sami });
    const response = await scan({ mode: 'RETOUR_DE_TOURNEE', rawCode: p.code, courierId: ali.id });
    expect(response.body).toMatchObject({
      accepted: false,
      refusal: 'COLIS_AUTRE_COURSIER',
      message: "Colis d'un autre coursier",
    });
    expect((await reload(p.id)).location).toBe('AVEC_LE_LIVREUR');
  });

  it('takes back from a livreur who stopped taking work: he must still hand parcels over', async () => {
    const leaving = await named('LIVREUR', 'Karim');
    await t.prisma.user.update({ where: { id: leaving.id }, data: { acceptsWork: false } });
    const p = await parcel({ status: 'A_VERIFIER', location: 'AVEC_LE_LIVREUR', livreur: leaving });
    const response = await scan({
      mode: 'RETOUR_DE_TOURNEE',
      rawCode: p.code,
      courierId: leaving.id,
    });
    expect(response.body.accepted).toBe(true);
  });

  it('refuses without a courier chosen, and a parcel already at the depot', async () => {
    const out = await parcel({ status: 'A_VERIFIER', location: 'AVEC_LE_LIVREUR', livreur: ali });
    expect((await scan({ mode: 'RETOUR_DE_TOURNEE', rawCode: out.code })).body.refusal).toBe(
      'COURSIER_NON_PRECISE',
    );
    const home = await parcel({ status: 'AU_DEPOT', location: 'AU_DEPOT' });
    expect(
      (await scan({ mode: 'RETOUR_DE_TOURNEE', rawCode: home.code, courierId: ali.id })).body
        .refusal,
    ).toBe('MAUVAIS_MODE');
  });
});

describe('what a scan records (A-12, A-22)', () => {
  it('flags manual entry on the scan and its event', async () => {
    const p = await parcel({ status: 'RAMASSE', location: 'AVEC_LE_RAMASSEUR' });
    const clientScanId = randomUUID();
    const response = await scan({
      mode: 'ENTREE_DEPOT',
      rawCode: p.code.toLowerCase(),
      source: 'SAISIE_MANUELLE',
      clientScanId,
    });
    expect(response.body).toMatchObject({ accepted: true, manualEntry: true });
    const row = await scanRow(clientScanId);
    expect(row).toMatchObject({ manualEntry: true, source: 'SAISIE_MANUELLE' });
    const [event] = await t.prisma.parcelEvent.findMany({ where: { scanId: row.id } });
    expect(event!.source).toBe('SAISIE_MANUELLE');
  });

  it('flags a device clock far from the server, and still accepts the scan', async () => {
    const p = await parcel({ status: 'RAMASSE', location: 'AVEC_LE_RAMASSEUR' });
    const clientScanId = randomUUID();
    const skewed = new Date(t.clock.now().getTime() - 20 * 60_000).toISOString();
    const response = await scan({
      mode: 'ENTREE_DEPOT',
      rawCode: p.code,
      deviceTime: skewed,
      clientScanId,
    });
    expect(response.body).toMatchObject({ accepted: true, clockSkewFlagged: true });
    expect(await scanRow(clientScanId)).toMatchObject({
      clockSkewFlagged: true,
      deviceTime: new Date(skewed),
    });
  });
});

describe('who scans at the depot (Admin 2)', () => {
  it('is the admin or the depot, nobody else', async () => {
    const p = await parcel({ status: 'RAMASSE', location: 'AVEC_LE_RAMASSEUR' });
    const sc = await createUser(t.prisma, { role: 'SERVICE_CLIENT', username: 'scan.sc' });
    for (const user of [sc, seller]) {
      const response = await scan(
        { mode: 'ENTREE_DEPOT', rawCode: p.code },
        (await login(t, user)).accessToken,
      );
      expect(response.status).toBe(403);
    }
    t.throttle.clear();
    const adminToken = (await t.request('POST', '/auth/login/staff', { body: ADMIN })).body
      .accessToken;
    const response = await scan({ mode: 'ENTREE_DEPOT', rawCode: p.code }, adminToken);
    expect(response.body.accepted).toBe(true);
  });

  it('refuses a malformed scan with 400', async () => {
    const response = await t.request('POST', '/scans/depot', {
      token: depotToken,
      body: { mode: 'ENTREE_DEPOT', rawCode: 'FG-8K2QX7AB' },
    });
    expect(response.status).toBe(400);
  });
});
