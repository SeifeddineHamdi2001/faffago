import { createTestApp, createUser, login, type Fixture, type TestApp } from '../support/test-app';

/**
 * The lists behind the Vendeurs, Coursiers and Utilisateurs screens (D-11).
 * Dépôt and Service client read a narrowed view; the admin reads everything
 * but the password.
 */

let t: TestApp;
let admin: Fixture;
let seller: Fixture;
let livreur: Fixture;
let inactive: Fixture;
const tokens: Record<string, string> = {};

beforeAll(async () => {
  t = await createTestApp();
  admin = await createUser(t.prisma, { role: 'ADMIN', username: 'list.admin' });
  const depot = await createUser(t.prisma, { role: 'DEPOT', username: 'list.depot' });
  const sc = await createUser(t.prisma, { role: 'SERVICE_CLIENT', username: 'list.sc' });
  seller = await createUser(t.prisma, {
    role: 'VENDEUR',
    email: 'list.vendeur@mail.tn',
    shopName: 'Boutique Liste',
  });
  livreur = await createUser(t.prisma, { role: 'LIVREUR' });
  inactive = await createUser(t.prisma, { role: 'RAMASSEUR', isActive: false });
  await t.prisma.courier.update({
    where: { userId: inactive.id },
    data: { accountState: 'INACTIF' },
  });

  const zone = await t.prisma.zone.create({ data: { name: 'Tunis Nord' } });
  await t.prisma.zoneAssignment.create({
    data: { zoneId: zone.id, courierId: livreur.courierId!, role: 'LIVREUR', kind: 'TITULAIRE' },
  });

  for (const user of [admin, depot, sc, seller]) {
    tokens[user.role] = (await login(t, user)).accessToken;
  }
});
afterAll(async () => {
  await t.close();
});

describe('GET /sellers', () => {
  it('gives Dépôt and Service client the shop and the contact, never the email', async () => {
    for (const role of ['DEPOT', 'SERVICE_CLIENT']) {
      const response = await t.request('GET', '/sellers', { token: tokens[role] });
      expect(response.status).toBe(200);
      const row = response.body.find((s: { id: string }) => s.id === seller.sellerId);
      expect(row).toEqual({
        id: seller.sellerId,
        shopName: 'Boutique Liste',
        contactFullName: 'Prénom Nom',
        contactPhone: seller.phone,
      });
      expect(JSON.stringify(response.body)).not.toContain('list.vendeur@mail.tn');
    }
  });

  it('gives the admin the email, the statut, the account state and the login account', async () => {
    const response = await t.request('GET', '/sellers', { token: tokens.ADMIN });
    const row = response.body.find((s: { id: string }) => s.id === seller.sellerId);
    expect(row).toMatchObject({
      id: seller.sellerId,
      userId: seller.id,
      email: 'list.vendeur@mail.tn',
      statut: 'PATENTE',
      accountState: 'ACTIF',
    });
    expect(JSON.stringify(response.body)).not.toContain('argon2');
  });

  it('is not for sellers', async () => {
    expect((await t.request('GET', '/sellers', { token: tokens.VENDEUR })).status).toBe(403);
  });
});

describe('GET /accounts/couriers', () => {
  it('gives Dépôt name, phone, role, zones, absence and today’s parcels, no account or pay data', async () => {
    const response = await t.request('GET', '/accounts/couriers', { token: tokens.DEPOT });
    expect(response.status).toBe(200);
    const row = response.body.find((c: { id: string }) => c.id === livreur.id);
    expect(row).toEqual({
      id: livreur.id,
      role: 'LIVREUR',
      firstName: 'Prénom',
      lastName: 'Nom',
      phone: livreur.phone,
      zones: [{ name: 'Tunis Nord', role: 'LIVREUR', kind: 'TITULAIRE' }],
      absentToday: false,
      parcelsToday: { withHim: 0, planned: 0 },
    });
  });

  it('shows Dépôt and Service client active couriers only', async () => {
    const response = await t.request('GET', '/accounts/couriers', {
      token: tokens.SERVICE_CLIENT,
    });
    expect(response.body.map((c: { id: string }) => c.id)).not.toContain(inactive.id);
  });

  it('gives the admin every courier, with account state, CIN, vehicle and pay plan', async () => {
    const response = await t.request('GET', '/accounts/couriers', { token: tokens.ADMIN });
    const row = response.body.find((c: { id: string }) => c.id === livreur.id);
    expect(row).toMatchObject({
      isActive: true,
      acceptsWork: true,
      accountState: 'ACTIF',
      cin: '01234567',
      payPlan: 'HEBDOMADAIRE',
    });
    expect(response.body.map((c: { id: string }) => c.id)).toContain(inactive.id);
  });
});

describe('GET /accounts/staff', () => {
  it('lists staff accounts for the admin only', async () => {
    const response = await t.request('GET', '/accounts/staff', { token: tokens.ADMIN });
    expect(response.status).toBe(200);
    expect(response.body.find((u: { id: string }) => u.id === admin.id)).toMatchObject({
      role: 'ADMIN',
      username: 'list.admin',
      isActive: true,
    });
    expect(
      response.body.every((u: { role: string }) =>
        ['ADMIN', 'DEPOT', 'SERVICE_CLIENT'].includes(u.role),
      ),
    ).toBe(true);
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');

    expect((await t.request('GET', '/accounts/staff', { token: tokens.DEPOT })).status).toBe(403);
  });
});
