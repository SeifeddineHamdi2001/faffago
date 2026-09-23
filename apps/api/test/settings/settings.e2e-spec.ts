import { DEFAULT_CONTACT_LINKS, SettingKey, defaultSettingValues } from '@faffago/shared';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../../src/audit/audit.service';
import {
  COURIER_APP_HEADERS,
  createTestApp,
  createUser,
  login,
  type Fixture,
  type TestApp,
} from '../support/test-app';
import { createParcel } from '../support/work-fixtures';

/**
 * Paramètres (Admin 4.16, D-20): the admin alone reads and changes them, every
 * change is audited in the same transaction, and a rate change never touches a
 * parcel that already exists (CLAUDE.md, Money).
 */

let t: TestApp;
let admin: Fixture;
let adminToken: string;

beforeAll(async () => {
  t = await createTestApp();
  admin = await createUser(t.prisma, { role: 'ADMIN', username: 'chef.parametres' });
  // The table as a fresh seed leaves it.
  for (const [key, value] of Object.entries(defaultSettingValues())) {
    await t.prisma.setting.create({ data: { key, value: value as Prisma.InputJsonValue } });
  }
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  t.throttle.clear();
  t.settings.clearCache();
  adminToken = (await login(t, admin)).accessToken;
});

async function auditFor(key: string) {
  return t.prisma.auditLog.findMany({
    where: { entityType: 'setting', entityId: key },
    orderBy: { createdAt: 'asc' },
  });
}

function patch(key: string, value: unknown, token = adminToken) {
  return t.request('PATCH', `/settings/${key}`, { token, body: { value } });
}

describe('GET /settings', () => {
  it('gives the admin every setting, money as digit strings', async () => {
    const response = await t.request('GET', '/settings', { token: adminToken });

    expect(response.status).toBe(200);
    expect(response.body.values).toEqual(defaultSettingValues());
    expect(response.body.values.delivery_fee_millimes).toBe('5500');
    expect(response.body.values.contact_links).toEqual(DEFAULT_CONTACT_LINKS);
  });

  it('lists the failure reasons, read-only (D-20)', async () => {
    const response = await t.request('GET', '/settings', { token: adminToken });
    expect(response.body.failureReasons).toEqual([
      { code: 'NE_REPOND_PAS', label: 'Ne répond pas' },
      { code: 'INJOIGNABLE', label: 'Injoignable' },
      { code: 'ADRESSE_INCORRECTE', label: 'Adresse incorrecte' },
      { code: 'REPORTE_PAR_LE_CLIENT', label: 'Reporté par le client' },
      { code: 'REFUSE', label: 'Refusé' },
    ]);
  });

  it.each(['DEPOT', 'SERVICE_CLIENT'] as const)('is refused to %s', async (role) => {
    const staff = await createUser(t.prisma, { role, username: `staff.${role.toLowerCase()}` });
    const { accessToken } = await login(t, staff);
    expect((await t.request('GET', '/settings', { token: accessToken })).status).toBe(403);
    expect((await patch(SettingKey.DELIVERY_FEE_MILLIMES, '1', accessToken)).status).toBe(403);
  });

  it('is refused to a seller and to a courier', async () => {
    const seller = await createUser(t.prisma, { role: 'VENDEUR', email: 'vendeur@param.tn' });
    const sellerToken = (await login(t, seller)).accessToken;
    expect((await t.request('GET', '/settings', { token: sellerToken })).status).toBe(403);

    const livreur = await createUser(t.prisma, { role: 'LIVREUR' });
    const livreurToken = (await login(t, livreur)).accessToken;
    const response = await t.request('GET', '/settings', {
      token: livreurToken,
      headers: COURIER_APP_HEADERS,
    });
    expect(response.status).toBe(403);
  });

  it('is refused without a session', async () => {
    expect((await t.request('GET', '/settings')).status).toBe(401);
  });
});

describe('PATCH /settings/:key', () => {
  it('changes a fee and audits who, before and after', async () => {
    const response = await patch(SettingKey.RETURN_FEE_MILLIMES, '2500');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ key: 'return_fee_millimes', value: '2500', changed: true });
    const row = await t.prisma.setting.findUniqueOrThrow({ where: { key: 'return_fee_millimes' } });
    expect(row.value).toBe('2500');
    expect(row.updatedByUserId).toBe(admin.id);

    const audit = await auditFor('return_fee_millimes');
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: 'MODIFICATION_PARAMETRE',
      actorUserId: admin.id,
      actorRole: 'ADMIN',
      before: { value: '2000' },
      after: { value: '2500' },
    });
  });

  it('audits every change, one entry each', async () => {
    await patch(SettingKey.VERIFY_DEADLINE_HOURS, 72);
    await patch(SettingKey.VERIFY_DEADLINE_HOURS, 48);

    const audit = await auditFor('verify_deadline_hours');
    expect(audit.map((entry) => [entry.before, entry.after])).toEqual([
      [{ value: 48 }, { value: 72 }],
      [{ value: 72 }, { value: 48 }],
    ]);
  });

  it('writes nothing and audits nothing when the value is the same', async () => {
    const response = await patch(SettingKey.MAX_DELIVERY_ATTEMPTS, 3);

    expect(response.status).toBe(200);
    expect(response.body.changed).toBe(false);
    expect(await auditFor('max_delivery_attempts')).toHaveLength(0);
  });

  it('refuses an invalid value with a French reason, and writes nothing', async () => {
    const response = await patch(SettingKey.DELIVERY_FEE_MILLIMES, '5,500');

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALEUR_INVALIDE');
    expect(response.body.message).toMatch(/millimes/);
    const row = await t.prisma.setting.findUniqueOrThrow({
      where: { key: 'delivery_fee_millimes' },
    });
    expect(row.value).toBe('5500');
    expect(await auditFor('delivery_fee_millimes')).toHaveLength(0);
  });

  it('refuses a money value sent as a JSON number (D-20)', async () => {
    expect((await patch(SettingKey.DELIVERY_FEE_MILLIMES, 6000)).status).toBe(400);
  });

  it('refuses a key that does not exist', async () => {
    const response = await patch('frais_mystere', '1');
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('PARAMETRE_INCONNU');
  });

  it('changes the contact links, TikTok included', async () => {
    const links = { ...DEFAULT_CONTACT_LINKS, tiktok: 'https://www.tiktok.com/@faffago' };
    const response = await patch(SettingKey.CONTACT_LINKS, links);

    expect(response.status).toBe(200);
    expect(response.body.value).toEqual(links);
  });

  it('rolls the change back when its audit entry cannot be written', async () => {
    const audit = t.app.get(AuditService);
    const spy = jest.spyOn(audit, 'record').mockRejectedValueOnce(new Error('disque plein'));
    try {
      const response = await patch(SettingKey.PICKUP_FREE_THRESHOLD, 6);
      expect(response.status).toBe(500);
    } finally {
      spy.mockRestore();
    }
    const row = await t.prisma.setting.findUniqueOrThrow({
      where: { key: 'pickup_free_threshold' },
    });
    expect(row.value).toBe(5);
  });

  it('applies a new minimum courier app version at once', async () => {
    const livreur = await createUser(t.prisma, { role: 'LIVREUR' });
    const body = { role: 'LIVREUR', phone: livreur.phone, password: livreur.password };

    expect((await patch(SettingKey.COURIER_MIN_APP_VERSION, '1.1.0')).status).toBe(200);
    try {
      const old = await t.request('POST', '/auth/login/coursier', {
        body,
        headers: COURIER_APP_HEADERS,
      });
      expect(old.status).toBe(426);
    } finally {
      await patch(SettingKey.COURIER_MIN_APP_VERSION, '1.0.0');
    }
  });
});

describe('fees are frozen on existing parcels (CLAUDE.md, Money)', () => {
  it('leaves a parcel created before the change untouched, and gives new parcels the new fee', async () => {
    const seller = await createUser(t.prisma, { role: 'VENDEUR', email: 'gel@param.tn' });
    const parcelId = await createParcel(t.prisma, {
      sellerId: seller.sellerId!,
      createdByUserId: seller.id,
    });
    const before = await t.prisma.parcel.findUniqueOrThrow({ where: { id: parcelId } });

    await patch(SettingKey.DELIVERY_FEE_MILLIMES, '6500');
    await patch(SettingKey.RETURN_FEE_MILLIMES, '3000');
    await patch(SettingKey.CHANGE_CLIENT_FEE_MILLIMES, '1500');

    const after = await t.prisma.parcel.findUniqueOrThrow({ where: { id: parcelId } });
    expect(after.deliveryFeeMillimes).toBe(before.deliveryFeeMillimes);
    expect(after.returnFeeMillimes).toBe(before.returnFeeMillimes);
    expect(after.changeClientFeeMillimes).toBe(before.changeClientFeeMillimes);

    expect(await t.settings.feesForNewParcel()).toEqual({
      deliveryFeeMillimes: 6500n,
      returnFeeMillimes: 3000n,
      changeClientFeeMillimes: 1500n,
    });
  });
});
