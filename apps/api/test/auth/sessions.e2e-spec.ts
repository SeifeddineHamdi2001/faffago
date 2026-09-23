import {
  createTestApp,
  createUser,
  login,
  COURIER_APP_HEADERS,
  type TestApp,
} from '../support/test-app';

/**
 * Session lifetimes (Q11): web 7 days, staff idle logout 30 minutes, sellers no
 * idle logout, couriers 90 days. Refresh tokens rotate and slide.
 */

let t: TestApp;
let n = 0;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});
beforeEach(() => {
  t.throttle.clear();
});

const MINUTE = 60;
const DAY = 24 * 60 * MINUTE;

function staff(role: 'ADMIN' | 'DEPOT' | 'SERVICE_CLIENT' = 'DEPOT') {
  n += 1;
  return createUser(t.prisma, { role, username: `session.${n}` });
}

function seller() {
  n += 1;
  return createUser(t.prisma, { role: 'VENDEUR', email: `session${n}@mail.tn` });
}

describe('refresh', () => {
  it('rotates the refresh token and slides the expiry', async () => {
    const user = await seller();
    const first = await login(t, user);

    t.clock.advance(6 * DAY);
    const refreshed = await t.request('POST', '/auth/refresh', {
      body: { refreshToken: first.refreshToken },
    });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.refreshToken).not.toBe(first.refreshToken);
    const daysLeft =
      (Date.parse(refreshed.body.refreshTokenExpiresAt) - t.clock.now().getTime()) / (DAY * 1000);
    expect(daysLeft).toBe(7);

    const me = await t.request('GET', '/auth/me', { token: refreshed.body.accessToken });
    expect(me.status).toBe(200);
  });

  it('refuses a refresh token past its expiry', async () => {
    const user = await seller();
    const tokens = await login(t, user);
    t.clock.advance(7 * DAY + 1);
    const response = await t.request('POST', '/auth/refresh', {
      body: { refreshToken: tokens.refreshToken },
    });
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('SESSION_EXPIREE');
  });

  it('revokes the whole session when an old refresh token comes back after 10 seconds', async () => {
    const user = await seller();
    const first = await login(t, user);
    const second = await t.request('POST', '/auth/refresh', {
      body: { refreshToken: first.refreshToken },
    });

    // Someone replays the token that was already swapped, past the grace window.
    t.clock.advance(11);
    const replay = await t.request('POST', '/auth/refresh', {
      body: { refreshToken: first.refreshToken },
    });
    expect(replay.status).toBe(401);

    // The legitimate device is signed out too: the token was evidently copied.
    const legit = await t.request('POST', '/auth/refresh', {
      body: { refreshToken: second.body.refreshToken },
    });
    expect(legit.status).toBe(401);
    const me = await t.request('GET', '/auth/me', { token: second.body.accessToken });
    expect(me.status).toBe(401);
  });

  describe('10-second grace window (D-13)', () => {
    it('returns the same new token when the just-rotated one comes back', async () => {
      const user = await seller();
      const first = await login(t, user);
      const a = await t.request('POST', '/auth/refresh', {
        body: { refreshToken: first.refreshToken },
      });
      t.clock.advance(9);
      const b = await t.request('POST', '/auth/refresh', {
        body: { refreshToken: first.refreshToken },
      });

      expect(b.status).toBe(200);
      expect(b.body.refreshToken).toBe(a.body.refreshToken);
      // The session is intact: the new token still works.
      const next = await t.request('POST', '/auth/refresh', {
        body: { refreshToken: a.body.refreshToken },
      });
      expect(next.status).toBe(200);
    });

    it('serves two tabs refreshing at the same instant with one token', async () => {
      const user = await staff();
      const first = await login(t, user);
      const [a, b] = await Promise.all([
        t.request('POST', '/auth/refresh', { body: { refreshToken: first.refreshToken } }),
        t.request('POST', '/auth/refresh', { body: { refreshToken: first.refreshToken } }),
      ]);
      expect([a.status, b.status]).toEqual([200, 200]);
      expect(a.body.refreshToken).toBe(b.body.refreshToken);
      expect((await t.request('GET', '/auth/me', { token: b.body.accessToken })).status).toBe(200);
    });

    it('does not serve a session that was logged out in the meantime', async () => {
      const user = await seller();
      const first = await login(t, user);
      const a = await t.request('POST', '/auth/refresh', {
        body: { refreshToken: first.refreshToken },
      });
      await t.request('POST', '/auth/logout', { token: a.body.accessToken });
      const b = await t.request('POST', '/auth/refresh', {
        body: { refreshToken: first.refreshToken },
      });
      expect(b.status).toBe(401);
    });
  });

  it('refuses a made-up refresh token', async () => {
    const response = await t.request('POST', '/auth/refresh', {
      body: { refreshToken: 'nimporte-quoi' },
    });
    expect(response.status).toBe(401);
  });

  it('keeps a courier logged in for 90 days, sliding with each refresh', async () => {
    const livreur = await createUser(t.prisma, { role: 'LIVREUR' });
    let tokens = await login(t, livreur);
    for (let i = 0; i < 3; i++) {
      t.clock.advance(80 * DAY);
      const response = await t.request('POST', '/auth/refresh', {
        body: { refreshToken: tokens.refreshToken },
        headers: COURIER_APP_HEADERS,
      });
      expect(response.status).toBe(200);
      tokens = response.body;
    }
  });

  it('holds a courier refresh to the minimum app version as well', async () => {
    const livreur = await createUser(t.prisma, { role: 'LIVREUR' });
    const tokens = await login(t, livreur);
    const response = await t.request('POST', '/auth/refresh', {
      body: { refreshToken: tokens.refreshToken },
    });
    expect(response.status).toBe(426);
  });
});

describe('access token', () => {
  it('expires after 15 minutes; the refresh token then takes over', async () => {
    const user = await seller();
    const tokens = await login(t, user);
    t.clock.advance(15 * MINUTE + 1);
    const me = await t.request('GET', '/auth/me', { token: tokens.accessToken });
    expect(me.status).toBe(401);
  });

  it('refuses a token signed with another secret, or with alg none', async () => {
    const user = await seller();
    const { accessToken } = await login(t, user);
    const [header, payload] = accessToken.split('.');

    const forged = `${header}.${payload}.${Buffer.from('faux').toString('base64url')}`;
    expect((await t.request('GET', '/auth/me', { token: forged })).status).toBe(401);

    const none = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${payload}.`;
    expect((await t.request('GET', '/auth/me', { token: none })).status).toBe(401);
  });

  it('refuses a refresh token used as an access token', async () => {
    const user = await seller();
    const { refreshToken } = await login(t, user);
    expect((await t.request('GET', '/auth/me', { token: refreshToken })).status).toBe(401);
  });
});

describe('staff idle logout: 30 minutes (Q11)', () => {
  it('keeps an active staff session alive past 30 minutes', async () => {
    const user = await staff();
    let tokens = await login(t, user);
    for (let i = 0; i < 4; i++) {
      t.clock.advance(14 * MINUTE);
      const response = await t.request('POST', '/auth/refresh', {
        body: { refreshToken: tokens.refreshToken },
      });
      expect(response.status).toBe(200);
      tokens = response.body;
    }
  });

  it('logs staff out after 30 minutes without a request', async () => {
    const user = await staff();
    const tokens = await login(t, user);
    t.clock.advance(30 * MINUTE + 1);
    const response = await t.request('POST', '/auth/refresh', {
      body: { refreshToken: tokens.refreshToken },
    });
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('SESSION_EXPIREE');

    const session = await t.prisma.refreshToken.findFirstOrThrow({ where: { userId: user.id } });
    expect(session.revokedAt).not.toBeNull();
    expect(session.revokedReason).toBe('INACTIVITE');
  });

  it('counts every request as activity, not only refreshes', async () => {
    const user = await staff();
    const tokens = await login(t, user);
    t.clock.advance(14 * MINUTE);
    expect((await t.request('GET', '/auth/me', { token: tokens.accessToken })).status).toBe(200);
    t.clock.advance(20 * MINUTE);
    // 34 minutes since login, 20 since the last request.
    const response = await t.request('POST', '/auth/refresh', {
      body: { refreshToken: tokens.refreshToken },
    });
    expect(response.status).toBe(200);
  });

  it('never logs a seller out for inactivity', async () => {
    const user = await seller();
    const tokens = await login(t, user);
    t.clock.advance(6 * DAY);
    const response = await t.request('POST', '/auth/refresh', {
      body: { refreshToken: tokens.refreshToken },
    });
    expect(response.status).toBe(200);
  });
});

describe('revocation takes effect at the next request', () => {
  it('signs out every device of a deactivated account at once', async () => {
    const user = await staff();
    const phone = await login(t, user);
    const laptop = await login(t, user);

    await t.prisma.user.update({ where: { id: user.id }, data: { isActive: false } });

    expect((await t.request('GET', '/auth/me', { token: phone.accessToken })).status).toBe(401);
    expect((await t.request('GET', '/auth/me', { token: laptop.accessToken })).status).toBe(401);
  });

  it('logs out only the current device', async () => {
    const user = await seller();
    const phone = await login(t, user);
    const laptop = await login(t, user);

    const logout = await t.request('POST', '/auth/logout', { token: phone.accessToken });
    expect(logout.status).toBe(204);

    expect((await t.request('GET', '/auth/me', { token: phone.accessToken })).status).toBe(401);
    expect(
      (await t.request('POST', '/auth/refresh', { body: { refreshToken: phone.refreshToken } }))
        .status,
    ).toBe(401);
    expect((await t.request('GET', '/auth/me', { token: laptop.accessToken })).status).toBe(200);
  });
});

describe('GET /auth/me', () => {
  it('returns the role and the permissions the menus are built from', async () => {
    const user = await staff('SERVICE_CLIENT');
    const { accessToken } = await login(t, user);
    const me = await t.request('GET', '/auth/me', { token: accessToken });
    expect(me.body).toMatchObject({
      id: user.id,
      role: 'SERVICE_CLIENT',
      readOnly: false,
      impersonation: null,
    });
    expect(me.body.permissions).toEqual([
      'SUIVI_A_VERIFIER',
      'CHATS_STAFF',
      'DEMANDES_VENDEUR',
      'AUJOURDHUI',
      'COLIS_LECTURE',
      'EXCEPTIONS_LECTURE',
      'RETOURS_LECTURE',
      'VENDEURS_LECTURE',
      'COURSIERS_LECTURE',
    ]);
  });

  it('gives a seller his shop and account state', async () => {
    const user = await seller();
    const { accessToken } = await login(t, user);
    const me = await t.request('GET', '/auth/me', { token: accessToken });
    expect(me.body.seller).toEqual({
      id: user.sellerId,
      shopName: 'Boutique Test',
      accountState: 'ACTIF',
    });
  });
});
