import { seed } from '../../prisma/seed';
import { createTestApp, createUser, login, type Fixture, type TestApp } from '../support/test-app';

/**
 * Paramètres › Géographie and Zones (Admin 4.5, 4.16, D-51), and marking a
 * courier absent (D-52): the admin renames gouvernorats and délégations,
 * groups délégations into zones, assigns each zone a livreur and a ramasseur
 * with their backups; the admin and the depot mark a courier absent for a day.
 */

let t: TestApp;
let adminToken: string;
let depot: Fixture;
let serviceClient: Fixture;
let seller: Fixture;

const ADMIN = { username: 'admin', password: 'Mot-De-Passe-Admin-42' };
// The test clock starts at 2026-09-25T08:00Z: 09:00 in Tunis.
const TODAY = '2026-09-25';

beforeAll(async () => {
  t = await createTestApp();
  await seed(t.prisma, { log: () => undefined, adminPassword: ADMIN.password });
  depot = await createUser(t.prisma, { role: 'DEPOT', username: 'zones.depot' });
  serviceClient = await createUser(t.prisma, { role: 'SERVICE_CLIENT', username: 'zones.sc' });
  seller = await createUser(t.prisma, { role: 'VENDEUR', email: 'zones@boutique.tn' });
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  t.throttle.clear();
  const response = await t.request('POST', '/auth/login/staff', { body: ADMIN });
  adminToken = response.body.accessToken;
});

async function tokenOf(user: Fixture): Promise<string> {
  return (await login(t, user)).accessToken;
}

async function delegationOf(code: string) {
  return t.prisma.delegation.findUniqueOrThrow({ where: { code } });
}

async function zoneNamed(name: string) {
  return t.prisma.zone.findUniqueOrThrow({ where: { name } });
}

async function newZone(name: string): Promise<string> {
  const response = await t.request('POST', '/zones', { token: adminToken, body: { name } });
  expect(response.status).toBe(201);
  return response.body.id;
}

const EMPTY = { titulaireId: null, backupId: null };

async function assign(
  zoneId: string,
  body: {
    LIVREUR?: { titulaireId: string | null; backupId: string | null };
    RAMASSEUR?: { titulaireId: string | null; backupId: string | null };
  },
) {
  return t.request('PUT', `/zones/${zoneId}/assignments`, {
    token: adminToken,
    body: { LIVREUR: body.LIVREUR ?? EMPTY, RAMASSEUR: body.RAMASSEUR ?? EMPTY },
  });
}

async function auditOf(entityId: string, action: string) {
  return t.prisma.auditLog.findMany({ where: { entityId, action }, orderBy: { createdAt: 'asc' } });
}

// ─────────────────────────────────────────────────────────────
// Géographie
// ─────────────────────────────────────────────────────────────

describe('GET /geo/admin (Paramètres › Géographie)', () => {
  it('gives the admin every gouvernorat and délégation, with its zone and localité count', async () => {
    const response = await t.request('GET', '/geo/admin', { token: adminToken });

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(4);
    const delegations = response.body.flatMap(
      (g: { delegations: Array<Record<string, unknown>> }) => g.delegations,
    );
    expect(delegations).toHaveLength(48);
    const marsa = delegations.find((d: { code: string }) => d.code === 'TUN-MARSA');
    const zone = await t.prisma.zone.findUniqueOrThrow({
      where: { id: (await delegationOf('TUN-MARSA')).zoneId! },
    });
    expect(marsa).toMatchObject({
      nameFr: 'La Marsa',
      nameAr: expect.any(String),
      zone: { id: zone.id, name: zone.name },
      localiteCount: expect.any(Number),
    });
    expect(marsa.localiteCount).toBeGreaterThan(1);
  });

  it('is the admin’s alone', async () => {
    for (const user of [depot, serviceClient, seller]) {
      expect((await t.request('GET', '/geo/admin', { token: await tokenOf(user) })).status).toBe(
        403,
      );
    }
  });
});

describe('PATCH /gouvernorats/:id (D-51)', () => {
  it('renames in French and Arabic, audited, and the tree shows it at once', async () => {
    const manouba = await t.prisma.gouvernorat.findUniqueOrThrow({ where: { code: 'MAN' } });
    const response = await t.request('PATCH', `/gouvernorats/${manouba.id}`, {
      token: adminToken,
      body: { nameAr: 'منّوبة' },
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ code: 'MAN', nameFr: 'Manouba', nameAr: 'منّوبة' });
    const [entry] = await auditOf(manouba.id, 'MODIFICATION_GOUVERNORAT');
    expect(entry).toMatchObject({
      actorRole: 'ADMIN',
      before: { nameAr: manouba.nameAr },
      after: { nameAr: 'منّوبة' },
    });

    const tree = await t.request('GET', '/geo', { token: await tokenOf(seller) });
    expect(tree.body.gouvernorats).toContainEqual(
      expect.objectContaining({ code: 'MAN', nameAr: 'منّوبة' }),
    );
  });

  it('refuses a French name another gouvernorat has, whatever the accents', async () => {
    const ariana = await t.prisma.gouvernorat.findUniqueOrThrow({ where: { code: 'ARI' } });
    const response = await t.request('PATCH', `/gouvernorats/${ariana.id}`, {
      token: adminToken,
      body: { nameFr: 'TUNIS' },
    });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('GOUVERNORAT_EXISTE');
  });

  it('refuses adding a deactivation, an unknown id and an empty change', async () => {
    const tunis = await t.prisma.gouvernorat.findUniqueOrThrow({ where: { code: 'TUN' } });
    const off = await t.request('PATCH', `/gouvernorats/${tunis.id}`, {
      token: adminToken,
      body: { isActive: false },
    });
    expect(off.status).toBe(400);
    const empty = await t.request('PATCH', `/gouvernorats/${tunis.id}`, {
      token: adminToken,
      body: {},
    });
    expect(empty.status).toBe(400);
    const unknown = await t.request('PATCH', '/gouvernorats/00000000-0000-0000-0000-000000000000', {
      token: adminToken,
      body: { nameAr: 'تونس' },
    });
    expect(unknown.status).toBe(404);
  });

  it('is the admin’s alone', async () => {
    const tunis = await t.prisma.gouvernorat.findUniqueOrThrow({ where: { code: 'TUN' } });
    const response = await t.request('PATCH', `/gouvernorats/${tunis.id}`, {
      token: await tokenOf(depot),
      body: { nameAr: 'تونس' },
    });
    expect(response.status).toBe(403);
  });
});

describe('PATCH /delegations/:id (D-51)', () => {
  it('renames in French and Arabic, audited, and the tree shows it at once', async () => {
    const bardo = await delegationOf('TUN-BARDO');
    const response = await t.request('PATCH', `/delegations/${bardo.id}`, {
      token: adminToken,
      body: { nameFr: 'Bardo', nameAr: 'الباردو' },
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ code: 'TUN-BARDO', nameFr: 'Bardo', nameAr: 'الباردو' });
    const [entry] = await auditOf(bardo.id, 'MODIFICATION_DELEGATION');
    expect(entry).toMatchObject({
      before: { nameFr: 'Le Bardo', nameAr: bardo.nameAr },
      after: { nameFr: 'Bardo', nameAr: 'الباردو' },
    });

    const tree = await t.request('GET', '/geo', { token: await tokenOf(seller) });
    const codes = tree.body.gouvernorats.flatMap(
      (g: { delegations: Array<{ code: string; nameFr: string }> }) => g.delegations,
    );
    expect(codes).toContainEqual(expect.objectContaining({ code: 'TUN-BARDO', nameFr: 'Bardo' }));
  });

  it('refuses a name another délégation of the same gouvernorat has', async () => {
    const bardo = await delegationOf('TUN-BARDO');
    const response = await t.request('PATCH', `/delegations/${bardo.id}`, {
      token: adminToken,
      body: { nameFr: 'la marsa' },
    });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('DELEGATION_EXISTE');
  });

  it('moves a délégation to another zone, and out of every zone', async () => {
    const bardo = await delegationOf('TUN-BARDO');
    const target = await newZone('Zone de passage');

    const moved = await t.request('PATCH', `/delegations/${bardo.id}`, {
      token: adminToken,
      body: { zoneId: target },
    });
    expect(moved.status).toBe(200);
    expect((await delegationOf('TUN-BARDO')).zoneId).toBe(target);
    const [entry] = await auditOf(bardo.id, 'MODIFICATION_DELEGATION');
    expect(entry).toBeDefined();

    const none = await t.request('PATCH', `/delegations/${bardo.id}`, {
      token: adminToken,
      body: { zoneId: null },
    });
    expect(none.status).toBe(200);
    expect((await delegationOf('TUN-BARDO')).zoneId).toBeNull();

    // Put it back where the seed had it, for the tests below.
    await t.request('PATCH', `/delegations/${bardo.id}`, {
      token: adminToken,
      body: { zoneId: bardo.zoneId },
    });
  });

  it('refuses an unknown zone and a deactivated one', async () => {
    const bardo = await delegationOf('TUN-BARDO');
    const unknown = await t.request('PATCH', `/delegations/${bardo.id}`, {
      token: adminToken,
      body: { zoneId: '00000000-0000-0000-0000-000000000000' },
    });
    expect(unknown.status).toBe(404);
    expect(unknown.body.code).toBe('ZONE_INTROUVABLE');

    const closed = await newZone('Zone fermée');
    await t.request('PATCH', `/zones/${closed}`, { token: adminToken, body: { isActive: false } });
    const response = await t.request('PATCH', `/delegations/${bardo.id}`, {
      token: adminToken,
      body: { zoneId: closed },
    });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('ZONE_INACTIVE');
  });

  it('never adds nor deactivates a délégation', async () => {
    const bardo = await delegationOf('TUN-BARDO');
    const response = await t.request('PATCH', `/delegations/${bardo.id}`, {
      token: adminToken,
      body: { isActive: false },
    });
    expect(response.status).toBe(400);
    expect((await t.request('POST', '/delegations', { token: adminToken, body: {} })).status).toBe(
      404,
    );
  });

  it('is the admin’s alone', async () => {
    const bardo = await delegationOf('TUN-BARDO');
    const response = await t.request('PATCH', `/delegations/${bardo.id}`, {
      token: await tokenOf(depot),
      body: { nameAr: 'باردو' },
    });
    expect(response.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────
// Zones
// ─────────────────────────────────────────────────────────────

describe('/zones (D-51)', () => {
  it('lists the zones with their délégations and their four assignments', async () => {
    const response = await t.request('GET', '/zones', { token: adminToken });

    expect(response.status).toBe(200);
    const centre = response.body.find((z: { name: string }) => z.name === 'Tunis Centre');
    expect(centre).toMatchObject({
      isActive: true,
      assignments: {
        LIVREUR: { TITULAIRE: null, BACKUP: null },
        RAMASSEUR: { TITULAIRE: null, BACKUP: null },
      },
    });
    expect(centre.delegations.map((d: { code: string }) => d.code).sort()).toEqual([
      'TUN-BABBHAR',
      'TUN-BABSOUIKA',
      'TUN-MEDINA',
      'TUN-SIDIBECHIR',
    ]);
  });

  it('creates a zone, audited, and refuses a name already taken whatever the case', async () => {
    const response = await t.request('POST', '/zones', {
      token: adminToken,
      body: { name: 'Lac et Berges' },
    });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ name: 'Lac et Berges', isActive: true, delegations: [] });
    expect(await auditOf(response.body.id, 'CREATION_ZONE')).toHaveLength(1);

    const clash = await t.request('POST', '/zones', {
      token: adminToken,
      body: { name: 'LAC ET BERGES' },
    });
    expect(clash.status).toBe(409);
    expect(clash.body.code).toBe('ZONE_EXISTE');
  });

  it('renames a zone, audited', async () => {
    const id = await newZone('Nom provisoire');
    const response = await t.request('PATCH', `/zones/${id}`, {
      token: adminToken,
      body: { name: 'Nom définitif' },
    });
    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Nom définitif');
    const [entry] = await auditOf(id, 'MODIFICATION_ZONE');
    expect(entry).toMatchObject({
      before: { name: 'Nom provisoire' },
      after: { name: 'Nom définitif' },
    });
  });

  it('refuses to deactivate a zone while délégations are attached, then allows it', async () => {
    const id = await newZone('Zone à fermer');
    const kram = await delegationOf('TUN-KRAM');
    await t.request('PATCH', `/delegations/${kram.id}`, {
      token: adminToken,
      body: { zoneId: id },
    });

    const refused = await t.request('PATCH', `/zones/${id}`, {
      token: adminToken,
      body: { isActive: false },
    });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('ZONE_NON_VIDE');

    await t.request('PATCH', `/delegations/${kram.id}`, {
      token: adminToken,
      body: { zoneId: kram.zoneId },
    });
    const off = await t.request('PATCH', `/zones/${id}`, {
      token: adminToken,
      body: { isActive: false },
    });
    expect(off.status).toBe(200);
    expect(off.body.isActive).toBe(false);

    const on = await t.request('PATCH', `/zones/${id}`, {
      token: adminToken,
      body: { isActive: true },
    });
    expect(on.body.isActive).toBe(true);
  });

  it('is the admin’s alone', async () => {
    const depotToken = await tokenOf(depot);
    const zone = await zoneNamed('Tunis Centre');
    expect((await t.request('GET', '/zones', { token: depotToken })).status).toBe(403);
    expect(
      (await t.request('POST', '/zones', { token: depotToken, body: { name: 'Essai' } })).status,
    ).toBe(403);
    expect(
      (
        await t.request('PATCH', `/zones/${zone.id}`, {
          token: depotToken,
          body: { name: 'Essai' },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await t.request('PUT', `/zones/${zone.id}/assignments`, {
          token: depotToken,
          body: { LIVREUR: EMPTY, RAMASSEUR: EMPTY },
        })
      ).status,
    ).toBe(403);
  });
});

describe('PUT /zones/:id/assignments (Admin 4.5, D-51)', () => {
  it('sets the livreur and the ramasseur, titular and backup, audited', async () => {
    const zone = await zoneNamed('Tunis Ouest');
    const ali = await createUser(t.prisma, { role: 'LIVREUR' });
    const sami = await createUser(t.prisma, { role: 'LIVREUR' });
    const hedi = await createUser(t.prisma, { role: 'RAMASSEUR' });

    const response = await assign(zone.id, {
      LIVREUR: { titulaireId: ali.id, backupId: sami.id },
      RAMASSEUR: { titulaireId: hedi.id, backupId: null },
    });

    expect(response.status).toBe(200);
    expect(response.body.assignments).toEqual({
      LIVREUR: {
        TITULAIRE: { id: ali.id, firstName: 'Prénom', lastName: 'Nom' },
        BACKUP: { id: sami.id, firstName: 'Prénom', lastName: 'Nom' },
      },
      RAMASSEUR: {
        TITULAIRE: { id: hedi.id, firstName: 'Prénom', lastName: 'Nom' },
        BACKUP: null,
      },
    });
    const [entry] = await auditOf(zone.id, 'MODIFICATION_AFFECTATIONS_ZONE');
    expect(entry).toMatchObject({
      before: { LIVREUR: { TITULAIRE: null, BACKUP: null } },
      after: { LIVREUR: { TITULAIRE: ali.id, BACKUP: sami.id }, RAMASSEUR: { TITULAIRE: hedi.id } },
    });

    // The whole set is replaced: null clears a slot.
    const cleared = await assign(zone.id, { LIVREUR: { titulaireId: ali.id, backupId: null } });
    expect(cleared.body.assignments.LIVREUR.BACKUP).toBeNull();
    expect(cleared.body.assignments.RAMASSEUR.TITULAIRE).toBeNull();
    expect(await t.prisma.zoneAssignment.count({ where: { zoneId: zone.id } })).toBe(1);
  });

  it('shows the zones on the Coursiers list', async () => {
    const zone = await zoneNamed('Tunis Sud');
    const ali = await createUser(t.prisma, { role: 'LIVREUR' });
    await assign(zone.id, { LIVREUR: { titulaireId: null, backupId: ali.id } });

    const list = await t.request('GET', '/accounts/couriers', { token: adminToken });
    const row = list.body.find((r: { id: string }) => r.id === ali.id);
    expect(row.zones).toEqual([{ name: 'Tunis Sud', role: 'LIVREUR', kind: 'BACKUP' }]);
  });

  it('refuses a courier of the wrong role', async () => {
    const zone = await zoneNamed('Tunis Sud-Ouest');
    const hedi = await createUser(t.prisma, { role: 'RAMASSEUR' });
    const response = await assign(zone.id, { LIVREUR: { titulaireId: hedi.id, backupId: null } });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('AFFECTATION_ROLE_INCORRECT');
  });

  it('refuses someone who is not a courier', async () => {
    const zone = await zoneNamed('Tunis Sud-Ouest');
    const response = await assign(zone.id, { LIVREUR: { titulaireId: depot.id, backupId: null } });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('AFFECTATION_ROLE_INCORRECT');
  });

  it('refuses a courier who takes no new work or is deactivated (D-12)', async () => {
    const zone = await zoneNamed('Tunis Sud-Ouest');
    const stopped = await createUser(t.prisma, { role: 'LIVREUR' });
    await t.prisma.user.update({ where: { id: stopped.id }, data: { acceptsWork: false } });
    const off = await createUser(t.prisma, { role: 'LIVREUR', isActive: false });

    for (const id of [stopped.id, off.id]) {
      const response = await assign(zone.id, { LIVREUR: { titulaireId: id, backupId: null } });
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('COURSIER_INDISPONIBLE');
    }
  });

  it('keeps an assignment already in place when the admin edits another slot', async () => {
    const zone = await zoneNamed('Ariana Centre');
    const ali = await createUser(t.prisma, { role: 'LIVREUR' });
    await assign(zone.id, { LIVREUR: { titulaireId: ali.id, backupId: null } });
    // He stops taking new work (step 1 of a deactivation, D-12) …
    await t.prisma.user.update({ where: { id: ali.id }, data: { acceptsWork: false } });
    const hedi = await createUser(t.prisma, { role: 'RAMASSEUR' });

    // … which does not block the rest of the zone.
    const response = await assign(zone.id, {
      LIVREUR: { titulaireId: ali.id, backupId: null },
      RAMASSEUR: { titulaireId: hedi.id, backupId: null },
    });
    expect(response.status).toBe(200);
  });

  it('refuses the same person as titular and backup', async () => {
    const zone = await zoneNamed('Ariana Nord');
    const ali = await createUser(t.prisma, { role: 'LIVREUR' });
    const response = await assign(zone.id, { LIVREUR: { titulaireId: ali.id, backupId: ali.id } });
    expect(response.status).toBe(400);
  });

  it('refuses a deactivated zone and an unknown one', async () => {
    const closed = await newZone('Zone close');
    await t.request('PATCH', `/zones/${closed}`, { token: adminToken, body: { isActive: false } });
    const ali = await createUser(t.prisma, { role: 'LIVREUR' });

    const inactive = await assign(closed, { LIVREUR: { titulaireId: ali.id, backupId: null } });
    expect(inactive.status).toBe(409);
    expect(inactive.body.code).toBe('ZONE_INACTIVE');

    const unknown = await assign('00000000-0000-0000-0000-000000000000', {});
    expect(unknown.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────
// Absences
// ─────────────────────────────────────────────────────────────

describe('marking a courier absent (D-52)', () => {
  it('lets the depot mark a courier absent for today, audited', async () => {
    const ali = await createUser(t.prisma, { role: 'LIVREUR' });
    const response = await t.request('POST', `/couriers/${ali.id}/absences`, {
      token: await tokenOf(depot),
      body: { date: TODAY, reason: 'Malade' },
    });

    expect(response.status).toBe(201);
    expect(response.body.absence).toEqual({ date: TODAY, reason: 'Malade' });
    const [entry] = await auditOf(ali.id, 'MARQUAGE_ABSENCE');
    expect(entry).toMatchObject({ actorRole: 'DEPOT', after: { date: TODAY, reason: 'Malade' } });

    const list = await t.request('GET', `/couriers/${ali.id}/absences`, {
      token: await tokenOf(serviceClient),
    });
    expect(list.status).toBe(200);
    expect(list.body).toEqual([{ date: TODAY, reason: 'Malade' }]);

    const couriers = await t.request('GET', '/accounts/couriers', { token: adminToken });
    expect(couriers.body.find((r: { id: string }) => r.id === ali.id).absentToday).toBe(true);
  });

  it('lets the admin do it too, for a later day', async () => {
    const ali = await createUser(t.prisma, { role: 'LIVREUR' });
    const response = await t.request('POST', `/couriers/${ali.id}/absences`, {
      token: adminToken,
      body: { date: '2026-09-28' },
    });
    expect(response.status).toBe(201);
    expect(response.body.absence).toEqual({ date: '2026-09-28', reason: null });

    const couriers = await t.request('GET', '/accounts/couriers', { token: adminToken });
    expect(couriers.body.find((r: { id: string }) => r.id === ali.id).absentToday).toBe(false);
  });

  it('refuses the same day twice, a past day and someone who is not a courier', async () => {
    const ali = await createUser(t.prisma, { role: 'LIVREUR' });
    await t.request('POST', `/couriers/${ali.id}/absences`, {
      token: adminToken,
      body: { date: TODAY },
    });

    const twice = await t.request('POST', `/couriers/${ali.id}/absences`, {
      token: adminToken,
      body: { date: TODAY },
    });
    expect(twice.status).toBe(409);
    expect(twice.body.code).toBe('ABSENCE_EXISTE');

    const past = await t.request('POST', `/couriers/${ali.id}/absences`, {
      token: adminToken,
      body: { date: '2026-09-24' },
    });
    expect(past.status).toBe(409);
    expect(past.body.code).toBe('ABSENCE_DATE_PASSEE');

    const notCourier = await t.request('POST', `/couriers/${depot.id}/absences`, {
      token: adminToken,
      body: { date: TODAY },
    });
    expect(notCourier.status).toBe(404);
  });

  it('is for the admin and the depot only', async () => {
    const ali = await createUser(t.prisma, { role: 'LIVREUR' });
    for (const user of [serviceClient, seller]) {
      const response = await t.request('POST', `/couriers/${ali.id}/absences`, {
        token: await tokenOf(user),
        body: { date: TODAY },
      });
      expect(response.status).toBe(403);
    }
  });

  it('removes an absence, audited; a past one stays', async () => {
    const ali = await createUser(t.prisma, { role: 'LIVREUR' });
    await t.request('POST', `/couriers/${ali.id}/absences`, {
      token: adminToken,
      body: { date: TODAY },
    });

    const removed = await t.request('DELETE', `/couriers/${ali.id}/absences/${TODAY}`, {
      token: await tokenOf(depot),
    });
    expect(removed.status).toBe(204);
    expect(await t.prisma.courierAbsence.count({ where: { courierId: ali.courierId } })).toBe(0);
    const [entry] = await auditOf(ali.id, 'SUPPRESSION_ABSENCE');
    expect(entry).toMatchObject({ actorRole: 'DEPOT', before: { date: TODAY } });

    const missing = await t.request('DELETE', `/couriers/${ali.id}/absences/${TODAY}`, {
      token: adminToken,
    });
    expect(missing.status).toBe(404);

    await t.prisma.courierAbsence.create({
      data: { courierId: ali.courierId!, date: new Date('2026-09-20'), createdByUserId: ali.id },
    });
    const past = await t.request('DELETE', `/couriers/${ali.id}/absences/2026-09-20`, {
      token: adminToken,
    });
    expect(past.status).toBe(409);
    expect(past.body.code).toBe('ABSENCE_DATE_PASSEE');
  });

  describe('the ramasseur’s pickups planned for that day (D-52)', () => {
    async function plannedPickup(delegationCode: string, ramasseur: Fixture, day: string) {
      const delegation = await delegationOf(delegationCode);
      const localite = await t.prisma.localite.findFirstOrThrow({
        where: { delegationId: delegation.id, isOther: false },
      });
      const address = await t.prisma.pickupAddress.create({
        data: {
          sellerId: seller.sellerId!,
          delegationId: delegation.id,
          localiteId: localite.id,
          address: 'Entrepôt du vendeur',
        },
      });
      return t.prisma.pickup.create({
        data: {
          sellerId: seller.sellerId!,
          pickupAddressId: address.id,
          status: 'PLANIFIE',
          plannedDate: new Date(day),
          plannedSlot: 'MATIN',
          ramasseurId: ramasseur.courierId!,
        },
      });
    }

    it('move to the backup ramasseur of each pickup’s zone, in the same action', async () => {
      const zone = await zoneNamed('Ben Arous Côte');
      const hedi = await createUser(t.prisma, { role: 'RAMASSEUR' });
      const karim = await createUser(t.prisma, { role: 'RAMASSEUR' });
      await assign(zone.id, { RAMASSEUR: { titulaireId: hedi.id, backupId: karim.id } });

      const today = await plannedPickup('BEN-EZZAHRA', hedi, TODAY);
      const tomorrow = await plannedPickup('BEN-EZZAHRA', hedi, '2026-09-26');

      const response = await t.request('POST', `/couriers/${hedi.id}/absences`, {
        token: await tokenOf(depot),
        body: { date: TODAY },
      });

      expect(response.status).toBe(201);
      expect(response.body.pickupsMoved).toEqual([
        {
          id: today.id,
          shopName: 'Boutique Test',
          ramasseur: { id: karim.id, firstName: 'Prénom' },
        },
      ]);
      expect(response.body.pickupsNotMoved).toEqual([]);
      expect(
        (await t.prisma.pickup.findUniqueOrThrow({ where: { id: today.id } })).ramasseurId,
      ).toBe(karim.courierId);
      expect(
        (await t.prisma.pickup.findUniqueOrThrow({ where: { id: tomorrow.id } })).ramasseurId,
      ).toBe(hedi.courierId);

      const [entry] = await auditOf(hedi.id, 'MARQUAGE_ABSENCE');
      expect(entry!.after).toMatchObject({ pickupsMoved: [today.id] });
    });

    it('stay and are reported when the zone has no backup who can work', async () => {
      const zone = await zoneNamed('Ben Arous Sud');
      const hedi = await createUser(t.prisma, { role: 'RAMASSEUR' });
      const karim = await createUser(t.prisma, { role: 'RAMASSEUR' });
      await assign(zone.id, { RAMASSEUR: { titulaireId: hedi.id, backupId: karim.id } });
      await t.request('POST', `/couriers/${karim.id}/absences`, {
        token: adminToken,
        body: { date: TODAY },
      });
      const pickup = await plannedPickup('BEN-FOUCHANA', hedi, TODAY);

      const response = await t.request('POST', `/couriers/${hedi.id}/absences`, {
        token: adminToken,
        body: { date: TODAY },
      });

      expect(response.status).toBe(201);
      expect(response.body.pickupsMoved).toEqual([]);
      expect(response.body.pickupsNotMoved).toEqual([{ id: pickup.id, shopName: 'Boutique Test' }]);
      expect(
        (await t.prisma.pickup.findUniqueOrThrow({ where: { id: pickup.id } })).ramasseurId,
      ).toBe(hedi.courierId);
    });
  });
});
