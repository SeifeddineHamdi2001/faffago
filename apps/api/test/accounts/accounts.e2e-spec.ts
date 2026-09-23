import * as argon2 from 'argon2';
import { GENERATED_PASSWORD_ALPHABET, GENERATED_PASSWORD_LENGTH } from '@faffago/shared';
import {
  COURIER_APP_HEADERS,
  createTestApp,
  createUser,
  login,
  nextPhone,
  type Fixture,
  type TestApp,
} from '../support/test-app';

/**
 * Identifiants et mots de passe (Admin v1.10, A-20, Q7 to Q9).
 */

let t: TestApp;
let admin: Fixture;
let adminToken: string;
let n = 0;

beforeAll(async () => {
  t = await createTestApp();
  admin = await createUser(t.prisma, { role: 'ADMIN', username: 'chef.admin' });
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  t.throttle.clear();
  adminToken = (await login(t, admin)).accessToken;
});

function uniq(prefix: string): string {
  n += 1;
  return `${prefix}.${n}`;
}

function expectGeneratedPassword(password: string): void {
  expect(password).toHaveLength(GENERATED_PASSWORD_LENGTH);
  for (const char of password) expect(GENERATED_PASSWORD_ALPHABET).toContain(char);
}

async function auditFor(entityId: string) {
  return t.prisma.auditLog.findMany({ where: { entityId }, orderBy: { createdAt: 'asc' } });
}

describe('Créer un compte staff', () => {
  it('generates the password, shows it once, and stores only an argon2id hash', async () => {
    const username = uniq('amine');
    const response = await t.request('POST', '/accounts/staff', {
      token: adminToken,
      body: {
        role: 'DEPOT',
        username: username.toUpperCase(),
        firstName: 'Amine',
        lastName: 'K',
        phone: nextPhone(),
      },
    });

    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({ role: 'DEPOT', username });
    expectGeneratedPassword(response.body.password);

    const stored = await t.prisma.user.findUniqueOrThrow({ where: { id: response.body.user.id } });
    expect(stored.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(await argon2.verify(stored.passwordHash, response.body.password)).toBe(true);

    // The account works with the password as shown.
    const loggedIn = await t.request('POST', '/auth/login/staff', {
      body: { username, password: response.body.password },
    });
    expect(loggedIn.status).toBe(200);
  });

  it('audits the creation, without the password', async () => {
    const response = await t.request('POST', '/accounts/staff', {
      token: adminToken,
      body: {
        role: 'SERVICE_CLIENT',
        username: uniq('sc'),
        firstName: 'S',
        lastName: 'C',
        phone: nextPhone(),
      },
    });
    const [entry] = await auditFor(response.body.user.id);

    expect(entry).toMatchObject({
      action: 'CREATION_COMPTE',
      entityType: 'user',
      actorUserId: admin.id,
      actorRole: 'ADMIN',
    });
    const serialised = JSON.stringify(entry);
    expect(serialised).not.toContain(response.body.password);
    expect(serialised).not.toContain('argon2');
  });

  it('is for the admin only', async () => {
    const depot = await createUser(t.prisma, { role: 'DEPOT', username: uniq('depot') });
    const { accessToken } = await login(t, depot);
    const response = await t.request('POST', '/accounts/staff', {
      token: accessToken,
      body: {
        role: 'ADMIN',
        username: uniq('pirate'),
        firstName: 'P',
        lastName: 'P',
        phone: nextPhone(),
      },
    });
    expect(response.status).toBe(403);
  });

  it('refuses a username already taken, whatever its capitalisation', async () => {
    const username = uniq('doublon');
    await createUser(t.prisma, { role: 'DEPOT', username });
    const response = await t.request('POST', '/accounts/staff', {
      token: adminToken,
      body: {
        role: 'DEPOT',
        username: username.toUpperCase(),
        firstName: 'D',
        lastName: 'D',
        phone: nextPhone(),
      },
    });
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: 'IDENTIFIANT_DEJA_UTILISE',
      message: 'Cet identifiant est déjà utilisé.',
    });
  });

  it('refuses a phone already used by another staff member, even in another role (Q8)', async () => {
    const phone = nextPhone();
    await createUser(t.prisma, { role: 'DEPOT', username: uniq('tel'), phone });
    const response = await t.request('POST', '/accounts/staff', {
      token: adminToken,
      body: { role: 'SERVICE_CLIENT', username: uniq('tel'), firstName: 'T', lastName: 'T', phone },
    });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('TELEPHONE_DEJA_UTILISE');
  });

  it('refuses to create a seller or a courier on the staff form', async () => {
    const response = await t.request('POST', '/accounts/staff', {
      token: adminToken,
      body: {
        role: 'LIVREUR',
        username: uniq('x'),
        firstName: 'X',
        lastName: 'X',
        phone: nextPhone(),
      },
    });
    expect(response.status).toBe(400);
  });
});

describe('Créer un coursier (Admin 4.15)', () => {
  it('creates a livreur with his pay plan, able to log in from the app', async () => {
    const phone = nextPhone();
    const response = await t.request('POST', '/accounts/couriers', {
      token: adminToken,
      body: {
        role: 'LIVREUR',
        phone,
        firstName: 'Karim',
        lastName: 'B',
        cin: '09876543',
        vehicle: 'Scooter',
        payPlan: 'HEBDOMADAIRE',
      },
    });
    expect(response.status).toBe(201);
    expectGeneratedPassword(response.body.password);

    const courier = await t.prisma.courier.findUniqueOrThrow({
      where: { userId: response.body.user.id },
    });
    expect(courier).toMatchObject({
      cin: '09876543',
      payPlan: 'HEBDOMADAIRE',
      accountState: 'ACTIF',
    });

    const loggedIn = await t.request('POST', '/auth/login/coursier', {
      body: { role: 'LIVREUR', phone, password: response.body.password },
      headers: COURIER_APP_HEADERS,
    });
    expect(loggedIn.status).toBe(200);
  });

  it('lets the same phone carry a ramasseur account too, but never two livreurs', async () => {
    const phone = nextPhone();
    const body = { phone, firstName: 'K', lastName: 'B', cin: '1' };
    const livreur = await t.request('POST', '/accounts/couriers', {
      token: adminToken,
      body: { ...body, role: 'LIVREUR', payPlan: 'MENSUEL' },
    });
    const ramasseur = await t.request('POST', '/accounts/couriers', {
      token: adminToken,
      body: { ...body, role: 'RAMASSEUR' },
    });
    expect(livreur.status).toBe(201);
    expect(ramasseur.status).toBe(201);
    expect(livreur.body.password).not.toBe(ramasseur.body.password);

    const second = await t.request('POST', '/accounts/couriers', {
      token: adminToken,
      body: { ...body, role: 'LIVREUR', payPlan: 'MENSUEL' },
    });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('TELEPHONE_DEJA_UTILISE');
  });

  it('is for the admin only', async () => {
    const sc = await createUser(t.prisma, { role: 'SERVICE_CLIENT', username: uniq('sc') });
    const { accessToken } = await login(t, sc);
    const response = await t.request('POST', '/accounts/couriers', {
      token: accessToken,
      body: { role: 'RAMASSEUR', phone: nextPhone(), firstName: 'R', lastName: 'R', cin: '1' },
    });
    expect(response.status).toBe(403);
  });
});

describe('Régénérer le mot de passe', () => {
  it('replaces the password, revokes every session, and audits it without the password', async () => {
    const seller = await createUser(t.prisma, {
      role: 'VENDEUR',
      email: `${uniq('regen')}@mail.tn`,
    });
    const phone = await login(t, seller);
    const laptop = await login(t, seller);

    const response = await t.request('POST', `/accounts/${seller.id}/regenerate-password`, {
      token: adminToken,
    });
    expect(response.status).toBe(200);
    expectGeneratedPassword(response.body.password);

    // Every device is out at once, access tokens included.
    for (const device of [phone, laptop]) {
      expect((await t.request('GET', '/auth/me', { token: device.accessToken })).status).toBe(401);
      expect(
        (await t.request('POST', '/auth/refresh', { body: { refreshToken: device.refreshToken } }))
          .status,
      ).toBe(401);
    }

    const oldPassword = await t.request('POST', '/auth/login/vendeur', {
      body: { email: seller.email, password: seller.password },
    });
    expect(oldPassword.status).toBe(401);
    const newPassword = await t.request('POST', '/auth/login/vendeur', {
      body: { email: seller.email, password: response.body.password },
    });
    expect(newPassword.status).toBe(200);

    const entries = await auditFor(seller.id);
    expect(entries.map((e) => e.action)).toContain('REGENERATION_MOT_DE_PASSE');
    expect(JSON.stringify(entries)).not.toContain(response.body.password);
  });

  it('works on a courier account too (Q7)', async () => {
    const ramasseur = await createUser(t.prisma, { role: 'RAMASSEUR' });
    const response = await t.request('POST', `/accounts/${ramasseur.id}/regenerate-password`, {
      token: adminToken,
    });
    expect(response.status).toBe(200);
  });

  it('is for the admin only', async () => {
    const depot = await createUser(t.prisma, { role: 'DEPOT', username: uniq('depot') });
    const victim = await createUser(t.prisma, { role: 'LIVREUR' });
    const { accessToken } = await login(t, depot);
    const response = await t.request('POST', `/accounts/${victim.id}/regenerate-password`, {
      token: accessToken,
    });
    expect(response.status).toBe(403);
  });

  it('answers 404 for an unknown account', async () => {
    const response = await t.request(
      'POST',
      '/accounts/00000000-0000-0000-0000-000000000000/regenerate-password',
      { token: adminToken },
    );
    expect(response.status).toBe(404);
  });
});

describe('the last active admin (Q9)', () => {
  let solo: TestApp;
  let lone: Fixture;
  let loneToken: string;

  beforeAll(async () => {
    solo = await createTestApp();
    lone = await createUser(solo.prisma, { role: 'ADMIN', username: 'seul.admin' });
  });
  afterAll(async () => {
    await solo.close();
  });
  beforeEach(async () => {
    loneToken = (await login(solo, lone)).accessToken;
  });

  it('cannot have his password regenerated from the back office', async () => {
    const response = await solo.request('POST', `/accounts/${lone.id}/regenerate-password`, {
      token: loneToken,
    });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('DERNIER_ADMIN');
    expect(response.body.message).toContain('admin:reset');
  });

  it('cannot be deactivated', async () => {
    const response = await solo.request('POST', `/accounts/staff/${lone.id}/deactivate`, {
      token: loneToken,
    });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('DERNIER_ADMIN');
    const user = await solo.prisma.user.findUniqueOrThrow({ where: { id: lone.id } });
    expect(user.isActive).toBe(true);
  });

  it('may have another admin regenerate his password once there are two (Q9)', async () => {
    const second = await createUser(solo.prisma, { role: 'ADMIN', username: 'second.admin' });
    const response = await solo.request('POST', `/accounts/${second.id}/regenerate-password`, {
      token: loneToken,
    });
    expect(response.status).toBe(200);
    // Deactivate the second one again, so the first is alone for the other tests.
    const off = await solo.request('POST', `/accounts/staff/${second.id}/deactivate`, {
      token: loneToken,
    });
    expect(off.status).toBe(200);
  });

  it('does not count a deactivated admin as a remaining one', async () => {
    await createUser(solo.prisma, { role: 'ADMIN', username: 'admin.inactif', isActive: false });
    const response = await solo.request('POST', `/accounts/staff/${lone.id}/deactivate`, {
      token: loneToken,
    });
    expect(response.status).toBe(409);
  });
});

describe('Désactiver / réactiver un compte staff', () => {
  it('deactivates, signs the account out, and audits before and after', async () => {
    const depot = await createUser(t.prisma, { role: 'DEPOT', username: uniq('partant') });
    const tokens = await login(t, depot);

    const response = await t.request('POST', `/accounts/staff/${depot.id}/deactivate`, {
      token: adminToken,
    });
    expect(response.status).toBe(200);
    expect((await t.request('GET', '/auth/me', { token: tokens.accessToken })).status).toBe(401);

    const [entry] = (await auditFor(depot.id)).filter((e) => e.action === 'DESACTIVATION_COMPTE');
    expect(entry).toMatchObject({ before: { isActive: true }, after: { isActive: false } });

    const back = await t.request('POST', `/accounts/staff/${depot.id}/activate`, {
      token: adminToken,
    });
    expect(back.status).toBe(200);
    expect((await login(t, depot)).accessToken).toEqual(expect.any(String));
  });

  it('only touches staff accounts on this route', async () => {
    const livreur = await createUser(t.prisma, { role: 'LIVREUR' });
    const response = await t.request('POST', `/accounts/staff/${livreur.id}/deactivate`, {
      token: adminToken,
    });
    expect(response.status).toBe(404);
  });
});
