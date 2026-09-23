import { LOGIN_THROTTLE } from '@faffago/shared';
import { LoginThrottleService } from '../../src/auth/login-throttle.service';
import { TestClock, createTestApp, createUser, type TestApp } from '../support/test-app';

/**
 * Login throttling (D-6, Q10): per identifier and per IP, exponential backoff,
 * no permanent lockout, held in memory.
 */

describe('LoginThrottleService', () => {
  let clock: TestClock;
  let throttle: LoginThrottleService;

  beforeEach(() => {
    clock = new TestClock();
    throttle = new LoginThrottleService(clock);
  });

  const keys = { identifier: 'email:a@b.tn', ip: '10.0.0.1' };

  function fail(times: number, k = keys): void {
    for (let i = 0; i < times; i++) throttle.recordFailure(k);
  }

  it('lets the first five failures through without a wait', () => {
    fail(LOGIN_THROTTLE.freeFailuresPerIdentifier);
    expect(throttle.retryAfterSeconds(keys)).toBe(0);
  });

  it('then doubles the wait: 1 s, 2 s, 4 s', () => {
    fail(LOGIN_THROTTLE.freeFailuresPerIdentifier + 1);
    expect(throttle.retryAfterSeconds(keys)).toBe(1);
    clock.advance(1);
    fail(1);
    expect(throttle.retryAfterSeconds(keys)).toBe(2);
    clock.advance(2);
    fail(1);
    expect(throttle.retryAfterSeconds(keys)).toBe(4);
  });

  it('never blocks for more than 15 minutes, and lets the person in after the wait', () => {
    fail(200);
    expect(throttle.retryAfterSeconds(keys)).toBe(15 * 60);
    clock.advance(15 * 60);
    expect(throttle.retryAfterSeconds(keys)).toBe(0);
  });

  it('clears the identifier on a successful login', () => {
    fail(LOGIN_THROTTLE.freeFailuresPerIdentifier + 3);
    clock.advance(60);
    throttle.recordSuccess(keys);
    fail(1);
    expect(throttle.retryAfterSeconds(keys)).toBe(0);
  });

  it('does not let one good account reset the counter of a whole IP', () => {
    for (let i = 0; i < LOGIN_THROTTLE.freeFailuresPerIp + 1; i++) {
      throttle.recordFailure({ identifier: `email:victime${i}@b.tn`, ip: keys.ip });
    }
    throttle.recordSuccess({ identifier: 'email:complice@b.tn', ip: keys.ip });
    expect(throttle.retryAfterSeconds({ identifier: 'email:autre@b.tn', ip: keys.ip })).toBe(1);
  });

  it('slows an IP trying many identifiers, but not the same accounts from elsewhere', () => {
    for (let i = 0; i < LOGIN_THROTTLE.freeFailuresPerIp + 1; i++) {
      throttle.recordFailure({ identifier: `email:essai${i}@b.tn`, ip: keys.ip });
    }
    expect(throttle.retryAfterSeconds({ identifier: 'email:essai0@b.tn', ip: keys.ip })).toBe(1);
    expect(throttle.retryAfterSeconds({ identifier: 'email:essai0@b.tn', ip: '10.0.0.2' })).toBe(0);
  });

  it('forgets a key after a day without failure, so memory does not grow forever', () => {
    fail(3);
    clock.advance(LOGIN_THROTTLE.forgetAfterSeconds + 1);
    throttle.sweep();
    expect(throttle.size()).toBe(0);
  });
});

describe('throttling on the login endpoints', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('answers 429 with Retry-After, without checking the password', async () => {
    const seller = await createUser(t.prisma, { role: 'VENDEUR', email: 'bruteforce@mail.tn' });
    for (let i = 0; i <= LOGIN_THROTTLE.freeFailuresPerIdentifier; i++) {
      await t.request('POST', '/auth/login/vendeur', {
        body: { email: seller.email, password: 'mauvais' },
      });
    }

    // Even the right password waits: otherwise the 429 would leak nothing
    // but the 200 would confirm a guess.
    const blocked = await t.request('POST', '/auth/login/vendeur', {
      body: { email: seller.email, password: seller.password },
    });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBe('1');
    expect(blocked.body).toMatchObject({
      code: 'TROP_DE_TENTATIVES',
      message: 'Trop de tentatives. Réessayez dans 1 s.',
      retryAfterSeconds: 1,
    });

    t.clock.advance(1);
    const after = await t.request('POST', '/auth/login/vendeur', {
      body: { email: seller.email, password: seller.password },
    });
    expect(after.status).toBe(200);
  });

  it('throttles a courier per phone and per chosen role', async () => {
    t.throttle.clear();
    const livreur = await createUser(t.prisma, { role: 'LIVREUR' });
    for (let i = 0; i <= LOGIN_THROTTLE.freeFailuresPerIdentifier; i++) {
      await t.request('POST', '/auth/login/coursier', {
        body: { role: 'LIVREUR', phone: livreur.phone, password: 'mauvais' },
        headers: { 'x-app-version': '1.0.0' },
      });
    }
    const blocked = await t.request('POST', '/auth/login/coursier', {
      body: { role: 'LIVREUR', phone: livreur.phone, password: livreur.password },
      headers: { 'x-app-version': '1.0.0' },
    });
    expect(blocked.status).toBe(429);
  });
});
