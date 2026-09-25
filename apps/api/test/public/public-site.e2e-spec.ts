import { createTestApp, createUser, login, type Fixture, type TestApp } from '../support/test-app';
import { place } from '../support/work-fixtures';

/**
 * Tarifs, Zones couvertes and contact links (Landing 3, 2.6, 2.8): read from
 * Paramètres and the géographie, never from the admin's full settings payload.
 */

let t: TestApp;
let admin: Fixture;

beforeAll(async () => {
  t = await createTestApp();
  await place(t.prisma);
  admin = await createUser(t.prisma, { role: 'ADMIN', username: 'admin.site' });
});
afterAll(async () => {
  await t.close();
});

describe('GET /public/site-info', () => {
  it('needs no login, and gives the fees, the contact links and the zones served', async () => {
    const response = await t.request('GET', '/public/site-info');
    expect(response.status).toBe(200);
    expect(response.body.fees).toMatchObject({
      deliveryFeeMillimes: '5500',
      returnFeeMillimes: '2000',
      changeClientFeeMillimes: '1000',
      pickupFeeMillimes: '2000',
      pickupFreeThreshold: 5,
      retenueRateBps: 300,
    });
    expect(response.body.contactLinks.phone).toBe('+216 99 602 208');
    expect(response.body.zones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          gouvernorat: expect.objectContaining({ nameFr: 'Tunis' }),
          delegations: expect.arrayContaining([expect.objectContaining({ nameFr: 'Le Bardo' })]),
        }),
      ]),
    );
  });

  it('is off by default (no Meta Pixel id)', async () => {
    const response = await t.request('GET', '/public/site-info');
    expect(response.body.metaPixelId).toBe('');
  });

  it('follows the admin’s Meta Pixel id once set, without any other field of GET /settings leaking', async () => {
    const { accessToken } = await login(t, admin);
    const saved = await t.request('PATCH', '/settings/meta_pixel_id', {
      token: accessToken,
      body: { value: '123456789012345' },
    });
    expect(saved.status).toBe(200);
    const response = await t.request('GET', '/public/site-info');
    expect(response.body.metaPixelId).toBe('123456789012345');
    expect(response.body.courierMinAppVersion).toBeUndefined();
    expect(response.body.values).toBeUndefined();
  });
});
