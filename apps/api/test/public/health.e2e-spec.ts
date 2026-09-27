import { createTestApp, type TestApp } from '../support/test-app';

/**
 * The uptime check and the deploy script's smoke test (phase 11): open to
 * anyone, and it says nothing but whether the API reaches its database.
 */

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

describe('GET /health', () => {
  it('needs no login and answers ok once the database replies', async () => {
    const response = await t.request('GET', '/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
