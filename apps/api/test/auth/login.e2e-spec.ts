import * as argon2 from 'argon2';
import { COURIER_APP_HEADERS, createTestApp, createUser, type TestApp } from '../support/test-app';

/**
 * Login identifiers (A-20): sellers by email, staff by username, couriers by
 * phone after choosing their role.
 */

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});
beforeEach(() => {
  t.throttle.clear();
});

describe('vendeur: email + password', () => {
  it('logs in whatever the capitalisation of the email (Q13)', async () => {
    const seller = await createUser(t.prisma, { role: 'VENDEUR', email: 'boutique1@mail.tn' });
    const response = await t.request('POST', '/auth/login/vendeur', {
      body: { email: '  Boutique1@MAIL.tn ', password: seller.password },
    });

    expect(response.status).toBe(200);
    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.refreshToken).toEqual(expect.any(String));
    expect(response.body.user).toMatchObject({ id: seller.id, role: 'VENDEUR' });
    // Never anything that could be used to log in again.
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
  });

  it('records the time of the last login', async () => {
    const seller = await createUser(t.prisma, { role: 'VENDEUR', email: 'boutique2@mail.tn' });
    await t.request('POST', '/auth/login/vendeur', {
      body: { email: seller.email, password: seller.password },
    });
    const user = await t.prisma.user.findUniqueOrThrow({ where: { id: seller.id } });
    expect(user.lastLoginAt).toEqual(t.clock.now());
  });

  it('lets a Suspendu seller log in to see his parcels and payments (Vendeur 2.5)', async () => {
    const seller = await createUser(t.prisma, {
      role: 'VENDEUR',
      email: 'suspendu@mail.tn',
      sellerState: 'SUSPENDU',
    });
    const response = await t.request('POST', '/auth/login/vendeur', {
      body: { email: seller.email, password: seller.password },
    });
    expect(response.status).toBe(200);
  });

  it('gives the same answer for an unknown email and a wrong password', async () => {
    const seller = await createUser(t.prisma, { role: 'VENDEUR', email: 'boutique3@mail.tn' });
    const wrongPassword = await t.request('POST', '/auth/login/vendeur', {
      body: { email: seller.email, password: 'pas-le-bon' },
    });
    const unknown = await t.request('POST', '/auth/login/vendeur', {
      body: { email: 'inconnu@mail.tn', password: 'pas-le-bon' },
    });

    expect(wrongPassword.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknown.body);
    expect(unknown.body).toMatchObject({
      code: 'IDENTIFIANTS_INCORRECTS',
      message: 'Identifiant ou mot de passe incorrect',
    });
  });

  it('does not let a staff username log in on the seller form', async () => {
    const admin = await createUser(t.prisma, { role: 'ADMIN', username: 'admin.vendeur' });
    const response = await t.request('POST', '/auth/login/vendeur', {
      body: { email: 'admin.vendeur', password: admin.password },
    });
    expect(response.status).toBe(401);
  });
});

describe('staff: username + password', () => {
  it.each(['ADMIN', 'DEPOT', 'SERVICE_CLIENT'] as const)('logs %s in by username', async (role) => {
    const staff = await createUser(t.prisma, { role, username: `staff.${role.toLowerCase()}` });
    const response = await t.request('POST', '/auth/login/staff', {
      body: { username: staff.username!.toUpperCase(), password: staff.password },
    });
    expect(response.status).toBe(200);
    expect(response.body.user.role).toBe(role);
  });

  it('refuses a deactivated account, but only once the password is right', async () => {
    const staff = await createUser(t.prisma, {
      role: 'DEPOT',
      username: 'depot.inactif',
      isActive: false,
    });

    const wrong = await t.request('POST', '/auth/login/staff', {
      body: { username: staff.username, password: 'pas-le-bon' },
    });
    expect(wrong.body.code).toBe('IDENTIFIANTS_INCORRECTS');

    const right = await t.request('POST', '/auth/login/staff', {
      body: { username: staff.username, password: staff.password },
    });
    expect(right.status).toBe(403);
    expect(right.body).toMatchObject({
      code: 'COMPTE_DESACTIVE',
      message: 'Compte désactivé. Contactez Faffa Go.',
    });
  });

  it('never trims the password', async () => {
    const staff = await createUser(t.prisma, { role: 'DEPOT', username: 'depot.trim' });
    const response = await t.request('POST', '/auth/login/staff', {
      body: { username: staff.username, password: ` ${staff.password} ` },
    });
    expect(response.status).toBe(401);
  });

  it('refuses a malformed body with 400, before any lookup', async () => {
    const response = await t.request('POST', '/auth/login/staff', { body: { username: 'x' } });
    expect(response.status).toBe(400);
  });
});

describe('coursier: role choice + phone + password (Coursier 2)', () => {
  it('lets one phone carry a livreur and a ramasseur account, each with its password', async () => {
    const phone = '55123456';
    const livreur = await createUser(t.prisma, {
      role: 'LIVREUR',
      phone,
      password: 'Livreur-Pass-1',
    });
    const ramasseur = await createUser(t.prisma, {
      role: 'RAMASSEUR',
      phone,
      password: 'Ramasseur-Pass-2',
    });

    const asLivreur = await t.request('POST', '/auth/login/coursier', {
      body: { role: 'LIVREUR', phone: '55 123 456', password: 'Livreur-Pass-1' },
      headers: COURIER_APP_HEADERS,
    });
    expect(asLivreur.status).toBe(200);
    expect(asLivreur.body.user.id).toBe(livreur.id);

    const asRamasseur = await t.request('POST', '/auth/login/coursier', {
      body: { role: 'RAMASSEUR', phone, password: 'Ramasseur-Pass-2' },
      headers: COURIER_APP_HEADERS,
    });
    expect(asRamasseur.body.user.id).toBe(ramasseur.id);

    // The livreur password does not open the ramasseur account.
    const crossed = await t.request('POST', '/auth/login/coursier', {
      body: { role: 'RAMASSEUR', phone, password: 'Livreur-Pass-1' },
      headers: COURIER_APP_HEADERS,
    });
    expect(crossed.status).toBe(401);
  });

  it('says so when the phone has no account for the chosen role', async () => {
    const livreur = await createUser(t.prisma, { role: 'LIVREUR' });
    const response = await t.request('POST', '/auth/login/coursier', {
      body: { role: 'RAMASSEUR', phone: livreur.phone, password: livreur.password },
      headers: COURIER_APP_HEADERS,
    });
    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      code: 'AUCUN_COMPTE_COURSIER',
      message: 'Aucun compte ramasseur pour ce numéro',
    });
  });

  it('refuses a staff or seller role on the courier form', async () => {
    const response = await t.request('POST', '/auth/login/coursier', {
      body: { role: 'ADMIN', phone: '20123456', password: 'x' },
      headers: COURIER_APP_HEADERS,
    });
    expect(response.status).toBe(400);
  });

  it('keeps the former account of a role change open for login (Admin 4.15)', async () => {
    const livreur = await createUser(t.prisma, { role: 'LIVREUR' });
    await t.prisma.user.update({ where: { id: livreur.id }, data: { acceptsWork: false } });
    const response = await t.request('POST', '/auth/login/coursier', {
      body: { role: 'LIVREUR', phone: livreur.phone, password: livreur.password },
      headers: COURIER_APP_HEADERS,
    });
    expect(response.status).toBe(200);
  });

  it('gives the courier app a 90-day session and the web a 7-day one (Q11)', async () => {
    const livreur = await createUser(t.prisma, { role: 'LIVREUR' });
    const response = await t.request('POST', '/auth/login/coursier', {
      body: { role: 'LIVREUR', phone: livreur.phone, password: livreur.password },
      headers: COURIER_APP_HEADERS,
    });
    const days =
      (Date.parse(response.body.refreshTokenExpiresAt) - t.clock.now().getTime()) / 86_400_000;
    expect(days).toBe(90);

    const seller = await createUser(t.prisma, { role: 'VENDEUR', email: 'sept.jours@mail.tn' });
    const web = await t.request('POST', '/auth/login/vendeur', {
      body: { email: seller.email, password: seller.password },
    });
    const webDays =
      (Date.parse(web.body.refreshTokenExpiresAt) - t.clock.now().getTime()) / 86_400_000;
    expect(webDays).toBe(7);
  });
});

describe('minimum courier app version (tech-stack 2 and 5)', () => {
  it('refuses a courier login with no version header', async () => {
    const livreur = await createUser(t.prisma, { role: 'LIVREUR' });
    const response = await t.request('POST', '/auth/login/coursier', {
      body: { role: 'LIVREUR', phone: livreur.phone, password: livreur.password },
    });
    expect(response.status).toBe(426);
    expect(response.body.code).toBe('VERSION_APP_OBSOLETE');
  });

  it('refuses a version below the one in Paramètres, and says which is required', async () => {
    await t.prisma.setting.create({ data: { key: 'courier_min_app_version', value: '1.4.0' } });
    t.settings.clearCache();
    try {
      const livreur = await createUser(t.prisma, { role: 'LIVREUR' });
      const old = await t.request('POST', '/auth/login/coursier', {
        body: { role: 'LIVREUR', phone: livreur.phone, password: livreur.password },
        headers: { 'x-app-version': '1.3.9' },
      });
      expect(old.status).toBe(426);
      expect(old.body).toMatchObject({ code: 'VERSION_APP_OBSOLETE', minimumVersion: '1.4.0' });

      const current = await t.request('POST', '/auth/login/coursier', {
        body: { role: 'LIVREUR', phone: livreur.phone, password: livreur.password },
        headers: { 'x-app-version': '1.10.0' },
      });
      expect(current.status).toBe(200);
    } finally {
      await t.prisma.setting.delete({ where: { key: 'courier_min_app_version' } });
      t.settings.clearCache();
    }
  });

  it('checks the version on every courier request, not only at login', async () => {
    const livreur = await createUser(t.prisma, { role: 'LIVREUR' });
    const { accessToken } = (
      await t.request('POST', '/auth/login/coursier', {
        body: { role: 'LIVREUR', phone: livreur.phone, password: livreur.password },
        headers: COURIER_APP_HEADERS,
      })
    ).body;

    const withoutHeader = await t.request('GET', '/auth/me', { token: accessToken });
    expect(withoutHeader.status).toBe(426);

    const withHeader = await t.request('GET', '/auth/me', {
      token: accessToken,
      headers: COURIER_APP_HEADERS,
    });
    expect(withHeader.status).toBe(200);
  });

  it('does not ask a seller or staff member for an app version', async () => {
    const seller = await createUser(t.prisma, { role: 'VENDEUR', email: 'sans.version@mail.tn' });
    const response = await t.request('POST', '/auth/login/vendeur', {
      body: { email: seller.email, password: seller.password },
    });
    const me = await t.request('GET', '/auth/me', { token: response.body.accessToken });
    expect(me.status).toBe(200);
  });
});

describe('password storage (A-20)', () => {
  it('stores only an argon2id hash', async () => {
    const staff = await createUser(t.prisma, { role: 'DEPOT', username: 'depot.hash' });
    const user = await t.prisma.user.findUniqueOrThrow({ where: { id: staff.id } });
    expect(user.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(await argon2.verify(user.passwordHash, staff.password)).toBe(true);
  });
});
