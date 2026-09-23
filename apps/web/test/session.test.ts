import { describe, expect, it, vi } from 'vitest';
import { isProxiedPath } from '@/lib/bff';
import { createRefresher } from '@/lib/client/refresh';
import { isSameOrigin } from '@/lib/server/origin';
import {
  COOKIE,
  clearedSessionCookies,
  loginPathFor,
  mergeCookieHeader,
  planSession,
  sessionCookies,
} from '@/lib/session-cookies';

const NOW = Date.parse('2026-09-25T08:00:00Z');

describe('planSession', () => {
  it('sends a browser with no refresh token to the login page', () => {
    expect(planSession({ hasRefresh: false, expMs: NOW + 600_000, now: NOW })).toBe('login');
  });

  it('continues while the access token has more than 30 seconds left', () => {
    expect(planSession({ hasRefresh: true, expMs: NOW + 31_000, now: NOW })).toBe('continue');
  });

  it('refreshes when the access token is about to expire, expired or unknown', () => {
    expect(planSession({ hasRefresh: true, expMs: NOW + 30_000, now: NOW })).toBe('refresh');
    expect(planSession({ hasRefresh: true, expMs: NOW - 1, now: NOW })).toBe('refresh');
    expect(planSession({ hasRefresh: true, expMs: undefined, now: NOW })).toBe('refresh');
  });
});

describe('session cookies', () => {
  const tokens = {
    accessToken: 'acc',
    accessTokenExpiresAt: new Date(NOW + 900_000).toISOString(),
    refreshToken: 'ref',
    refreshTokenExpiresAt: new Date(NOW + 7 * 86_400_000).toISOString(),
  };

  it('keeps both tokens httpOnly, and exposes only the expiry to the page', () => {
    const cookies = sessionCookies(tokens, { secure: true });
    const byName = Object.fromEntries(cookies.map((c) => [c.name, c]));

    expect(byName[COOKIE.ACCESS]).toMatchObject({
      value: 'acc',
      options: { httpOnly: true, secure: true, sameSite: 'lax', path: '/' },
    });
    expect(byName[COOKIE.REFRESH]).toMatchObject({ value: 'ref', options: { httpOnly: true } });
    expect(byName[COOKIE.REFRESH]!.options.expires).toEqual(new Date(tokens.refreshTokenExpiresAt));
    // The page reads the expiry to coordinate refreshes; it never sees a token.
    expect(byName[COOKIE.EXP]).toMatchObject({
      value: String(NOW + 900_000),
      options: { httpOnly: false },
    });
  });

  it('clears every session cookie, the impersonation ones included', () => {
    const names = clearedSessionCookies()
      .map((c) => c.name)
      .sort();
    expect(names).toEqual(
      [COOKIE.ACCESS, COOKIE.REFRESH, COOKIE.EXP, COOKIE.IMP, COOKIE.IMP_EXP].sort(),
    );
    expect(clearedSessionCookies().every((c) => c.options.maxAge === 0)).toBe(true);
  });

  it('rewrites the Cookie header so the page sees a token refreshed by the middleware', () => {
    expect(
      mergeCookieHeader('fg_access=old; theme=dark; fg_exp=1', [
        { name: 'fg_access', value: 'new' },
        { name: 'fg_exp', value: '2' },
        { name: 'fg_imp', value: null },
      ]),
    ).toBe('theme=dark; fg_access=new; fg_exp=2');
    expect(mergeCookieHeader(null, [{ name: 'fg_access', value: 'a' }])).toBe('fg_access=a');
  });

  it('knows which login page belongs to each area', () => {
    expect(loginPathFor('/admin/coursiers')).toBe('/admin/connexion');
    expect(loginPathFor('/vendeur')).toBe('/vendeur/connexion');
  });
});

describe('isSameOrigin (CSRF)', () => {
  it('accepts a request whose Origin is this host', () => {
    expect(isSameOrigin(new Headers({ origin: 'https://faffago.tn', host: 'faffago.tn' }))).toBe(
      true,
    );
  });

  it('uses the host the reverse proxy forwarded', () => {
    expect(
      isSameOrigin(
        new Headers({
          origin: 'https://faffago.tn',
          host: '127.0.0.1:3000',
          'x-forwarded-host': 'faffago.tn',
        }),
      ),
    ).toBe(true);
  });

  it('refuses another origin, a missing one, or garbage', () => {
    expect(isSameOrigin(new Headers({ origin: 'https://evil.tn', host: 'faffago.tn' }))).toBe(
      false,
    );
    expect(isSameOrigin(new Headers({ host: 'faffago.tn' }))).toBe(false);
    expect(isSameOrigin(new Headers({ origin: 'null', host: 'faffago.tn' }))).toBe(false);
  });
});

describe('isProxiedPath', () => {
  it('forwards the back office endpoints', () => {
    expect(isProxiedPath(['accounts', 'couriers'])).toBe(true);
    expect(isProxiedPath(['accounts', 'abc', 'regenerate-password'])).toBe(true);
    expect(isProxiedPath(['sellers'])).toBe(true);
  });

  it('never forwards the auth endpoints, which have their own handlers', () => {
    expect(isProxiedPath(['auth', 'impersonation'])).toBe(false);
    expect(isProxiedPath(['auth', 'refresh'])).toBe(false);
    expect(isProxiedPath([])).toBe(false);
    expect(isProxiedPath(['..', 'auth'])).toBe(false);
  });
});

describe('createRefresher — one refresh across tabs (D-13)', () => {
  function setup(initialExp: number) {
    let exp = initialExp;
    const fetchFn = vi.fn(async () => {
      exp = NOW + 900_000;
      return new Response(null, { status: 200 });
    });
    // A minimal navigator.locks: callbacks run one after the other.
    let queue = Promise.resolve<unknown>(undefined);
    const locks = {
      request: <T>(_name: string, cb: () => Promise<T>) => {
        const run = queue.then(cb);
        queue = run.catch(() => undefined);
        return run;
      },
    };
    const refresher = createRefresher({
      readExp: () => exp,
      now: () => NOW,
      fetch: fetchFn,
      locks,
    });
    return { refresher, fetchFn };
  }

  it('does nothing while the access token is fresh', async () => {
    const { refresher, fetchFn } = setup(NOW + 600_000);
    await refresher.ensureFresh();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('refreshes once when three callers find it stale at the same time', async () => {
    const { refresher, fetchFn } = setup(NOW - 1);
    await Promise.all([refresher.ensureFresh(), refresher.ensureFresh(), refresher.ensureFresh()]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith('/api/session/refresh', { method: 'POST' });
  });

  it('reports an expired session when the refresh is refused', async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 401 }));
    const refresher = createRefresher({
      readExp: () => NOW - 1,
      now: () => NOW,
      fetch: fetchFn,
      locks: undefined,
    });
    await expect(refresher.ensureFresh()).rejects.toThrow('SESSION_EXPIREE');
  });
});
