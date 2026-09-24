import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as bffGet, PATCH as bffPatch, POST as bffPost } from '@/app/api/bff/[...path]/route';
import { DELETE as impDelete, POST as impPost } from '@/app/api/impersonation/route';
import { POST as login } from '@/app/api/session/login/[kind]/route';
import { POST as logout } from '@/app/api/session/logout/route';
import { POST as refresh } from '@/app/api/session/refresh/route';

/**
 * The route handlers between the browser and the API. The API is a mocked
 * fetch; what is checked is what reaches the browser.
 */

const SITE = 'https://faffago.tn';
const tokens = {
  accessToken: 'ACCESS-TOKEN',
  accessTokenExpiresAt: '2026-09-25T08:15:00.000Z',
  refreshToken: 'REFRESH-TOKEN',
  refreshTokenExpiresAt: '2026-10-02T08:00:00.000Z',
};

let apiFetch: ReturnType<typeof vi.fn>;

function api(status: number, body: unknown, headers: Record<string, string> = {}) {
  apiFetch.mockResolvedValueOnce(
    new Response(body === null ? null : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    }),
  );
}

function request(
  path: string,
  init: {
    method?: string;
    body?: unknown;
    cookies?: Record<string, string>;
    origin?: string | null;
  } = {},
) {
  const headers = new Headers({ host: 'faffago.tn', 'x-forwarded-for': '41.230.1.2' });
  if (init.origin !== null) headers.set('origin', init.origin ?? SITE);
  if (init.body !== undefined) headers.set('content-type', 'application/json');
  if (init.cookies) {
    headers.set(
      'cookie',
      Object.entries(init.cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join('; '),
    );
  }
  return new NextRequest(`${SITE}${path}`, {
    method: init.method ?? 'POST',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

function params<T>(value: T) {
  return { params: Promise.resolve(value) };
}

beforeEach(() => {
  apiFetch = vi.fn();
  vi.stubGlobal('fetch', apiFetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/session/login/[kind]', () => {
  it('sets the tokens as httpOnly cookies and never puts them in the body', async () => {
    api(200, { ...tokens, user: { id: 'u1', role: 'VENDEUR', firstName: 'A', lastName: 'B' } });
    const response = await login(
      request('/api/session/login/vendeur', { body: { email: 'a@b.tn', password: 'x' } }),
      params({ kind: 'vendeur' }),
    );

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain('ACCESS-TOKEN');
    expect(text).not.toContain('REFRESH-TOKEN');
    expect(JSON.parse(text)).toEqual({
      user: { id: 'u1', role: 'VENDEUR', firstName: 'A', lastName: 'B' },
    });

    expect(response.cookies.get('fg_access')).toMatchObject({
      value: 'ACCESS-TOKEN',
      httpOnly: true,
    });
    expect(response.cookies.get('fg_refresh')).toMatchObject({
      value: 'REFRESH-TOKEN',
      httpOnly: true,
    });
  });

  it('calls the right API login and forwards the client address for throttling', async () => {
    api(200, { ...tokens, user: {} });
    await login(
      request('/api/session/login/staff', { body: { username: 'saif', password: 'x' } }),
      params({ kind: 'staff' }),
    );
    const [url, init] = apiFetch.mock.calls[0]!;
    expect(url).toMatch(/\/api\/auth\/login\/staff$/);
    expect(new Headers(init.headers).get('x-forwarded-for')).toBe('41.230.1.2');
  });

  it('passes the refusal through, Retry-After included', async () => {
    api(
      429,
      {
        code: 'TROP_DE_TENTATIVES',
        message: 'Trop de tentatives. Réessayez dans 4 s.',
        retryAfterSeconds: 4,
      },
      { 'retry-after': '4' },
    );
    const response = await login(
      request('/api/session/login/vendeur', { body: { email: 'a@b.tn', password: 'x' } }),
      params({ kind: 'vendeur' }),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('4');
    expect(await response.json()).toMatchObject({
      code: 'TROP_DE_TENTATIVES',
      retryAfterSeconds: 4,
    });
    expect(response.cookies.get('fg_access')).toBeUndefined();
  });

  it('refuses a request from another origin before calling the API', async () => {
    const response = await login(
      request('/api/session/login/vendeur', { body: {}, origin: 'https://evil.tn' }),
      params({ kind: 'vendeur' }),
    );
    expect(response.status).toBe(403);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('knows only the seller and staff logins; couriers log in from the app', async () => {
    const response = await login(
      request('/api/session/login/coursier', { body: {} }),
      params({ kind: 'coursier' }),
    );
    expect(response.status).toBe(404);
    expect(apiFetch).not.toHaveBeenCalled();
  });
});

describe('POST /api/session/refresh', () => {
  it('rotates through the API and rewrites the cookies', async () => {
    api(200, { ...tokens, accessToken: 'NEW-ACCESS' });
    const response = await refresh(
      request('/api/session/refresh', { cookies: { fg_refresh: 'OLD' } }),
    );
    expect(response.status).toBe(200);
    expect(JSON.parse(apiFetch.mock.calls[0]![1].body)).toEqual({ refreshToken: 'OLD' });
    expect(response.cookies.get('fg_access')?.value).toBe('NEW-ACCESS');
  });

  it('clears the cookies when the API refuses', async () => {
    api(401, { code: 'SESSION_EXPIREE', message: 'Session expirée. Reconnectez-vous.' });
    const response = await refresh(
      request('/api/session/refresh', { cookies: { fg_refresh: 'OLD' } }),
    );
    expect(response.status).toBe(401);
    expect(response.cookies.get('fg_refresh')?.value).toBe('');
  });
});

describe('POST /api/session/logout', () => {
  it('revokes the session in the API and clears every cookie', async () => {
    api(204, null);
    const response = await logout(
      request('/api/session/logout', { cookies: { fg_access: 'A', fg_refresh: 'R' } }),
    );
    expect(response.status).toBe(204);
    expect(apiFetch.mock.calls[0]![0]).toMatch(/\/api\/auth\/logout$/);
    expect(new Headers(apiFetch.mock.calls[0]![1].headers).get('authorization')).toBe('Bearer A');
    expect(response.cookies.get('fg_access')?.value).toBe('');
  });
});

describe('/api/impersonation (D-5)', () => {
  it('stores the impersonation token beside the admin session, not over it', async () => {
    api(201, {
      impersonationToken: 'IMP-TOKEN',
      impersonationId: 'i1',
      expiresAt: '2026-09-25T08:30:00.000Z',
      sellerId: 's1',
      shopName: 'Boutique Démo',
      banner: 'Vous consultez le compte de Boutique Démo',
    });
    const response = await impPost(
      request('/api/impersonation', { body: { sellerId: 's1' }, cookies: { fg_access: 'ADMIN' } }),
    );
    expect(response.status).toBe(201);
    expect(await response.text()).not.toContain('IMP-TOKEN');
    expect(response.cookies.get('fg_imp')).toMatchObject({ value: 'IMP-TOKEN', httpOnly: true });
    expect(response.cookies.get('fg_access')).toBeUndefined();
    expect(new Headers(apiFetch.mock.calls[0]![1].headers).get('authorization')).toBe(
      'Bearer ADMIN',
    );
  });

  it('exits with the impersonation token and clears only its cookies', async () => {
    api(204, null);
    const response = await impDelete(
      request('/api/impersonation', {
        method: 'DELETE',
        cookies: { fg_access: 'ADMIN', fg_imp: 'IMP' },
      }),
    );
    expect(response.status).toBe(204);
    expect(new Headers(apiFetch.mock.calls[0]![1].headers).get('authorization')).toBe('Bearer IMP');
    expect(response.cookies.get('fg_imp')?.value).toBe('');
    expect(response.cookies.get('fg_access')).toBeUndefined();
  });
});

describe('/api/bff/[...path]', () => {
  it('forwards an allowed call with the admin token and returns the API answer', async () => {
    api(200, { password: 'Abcdefghjkmnpq' });
    const response = await bffPost(
      request('/api/bff/accounts/u1/regenerate-password', {
        cookies: { fg_access: 'ADMIN', fg_imp: 'IMP' },
      }),
      params({ path: ['accounts', 'u1', 'regenerate-password'] }),
    );
    expect(response.status).toBe(200);
    expect(apiFetch.mock.calls[0]![0]).toMatch(/\/api\/accounts\/u1\/regenerate-password$/);
    // Never the impersonation token: that one is read-only and seller-only.
    expect(new Headers(apiFetch.mock.calls[0]![1].headers).get('authorization')).toBe(
      'Bearer ADMIN',
    );
  });

  it('passes a refusal through unchanged, blockers included', async () => {
    const blocked = {
      code: 'COURSIER_ENGAGEMENTS_OUVERTS',
      message: 'x',
      blockers: [{ type: 'COLIS_EN_MAIN', count: 1, label: '1 colis en main' }],
    };
    api(409, blocked);
    const response = await bffPost(
      request('/api/bff/accounts/couriers/u1/deactivate', { cookies: { fg_access: 'ADMIN' } }),
      params({ path: ['accounts', 'couriers', 'u1', 'deactivate'] }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual(blocked);
  });

  it('refuses a path outside the allowlist and a cross-origin write', async () => {
    const outside = await bffPost(
      request('/api/bff/auth/impersonation', { cookies: { fg_access: 'ADMIN' } }),
      params({ path: ['auth', 'impersonation'] }),
    );
    expect(outside.status).toBe(404);

    const crossSite = await bffPost(
      request('/api/bff/accounts/staff', {
        cookies: { fg_access: 'ADMIN' },
        origin: 'https://evil.tn',
      }),
      params({ path: ['accounts', 'staff'] }),
    );
    expect(crossSite.status).toBe(403);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('forwards a Paramètres change with PATCH, and checks its origin (D-20)', async () => {
    api(200, { key: 'delivery_fee_millimes', value: '6000', changed: true });
    const response = await bffPatch(
      request('/api/bff/settings/delivery_fee_millimes', {
        method: 'PATCH',
        body: { value: '6000' },
        cookies: { fg_access: 'ADMIN' },
      }),
      params({ path: ['settings', 'delivery_fee_millimes'] }),
    );
    expect(response.status).toBe(200);
    expect(apiFetch.mock.calls[0]![0]).toMatch(/\/api\/settings\/delivery_fee_millimes$/);
    expect(apiFetch.mock.calls[0]![1].method).toBe('PATCH');

    const crossSite = await bffPatch(
      request('/api/bff/settings/delivery_fee_millimes', {
        method: 'PATCH',
        body: { value: '1' },
        cookies: { fg_access: 'ADMIN' },
        origin: 'https://evil.tn',
      }),
      params({ path: ['settings', 'delivery_fee_millimes'] }),
    );
    expect(crossSite.status).toBe(403);
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('reads through GET too', async () => {
    api(200, []);
    const response = await bffGet(
      request('/api/bff/sellers', { method: 'GET', cookies: { fg_access: 'ADMIN' } }),
      params({ path: ['sellers'] }),
    );
    expect(response.status).toBe(200);
  });

  it('passes a document upload through as multipart, bytes and boundary intact (D-32)', async () => {
    api(201, { seller: { id: 's1' }, password: 'x' });
    const boundary = '----faffago-test-boundary';
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3]);
    const crlf = '\r\n';
    const multipart = Buffer.concat([
      Buffer.from(
        [
          `--${boundary}`,
          'Content-Disposition: form-data; name="shopName"',
          '',
          'Bijoux Yasmine',
          `--${boundary}`,
          'Content-Disposition: form-data; name="CIN_RECTO"; filename="r.jpg"',
          'Content-Type: image/jpeg',
          '',
          '',
        ].join(crlf),
      ),
      jpeg,
      Buffer.from(`${crlf}--${boundary}--${crlf}`),
    ]);
    const response = await bffPost(
      new NextRequest(`${SITE}/api/bff/sellers`, {
        method: 'POST',
        headers: {
          host: 'faffago.tn',
          origin: SITE,
          cookie: 'fg_access=ADMIN',
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        body: new Uint8Array(multipart),
      }),
      params({ path: ['sellers'] }),
    );

    expect(response.status).toBe(201);
    const init = apiFetch.mock.calls[0]![1] as RequestInit;
    const sent = new Headers(init.headers);
    expect(sent.get('content-type')).toBe(`multipart/form-data; boundary=${boundary}`);
    expect(sent.get('authorization')).toBe('Bearer ADMIN');
    expect(Buffer.from(init.body as ArrayBuffer).equals(multipart)).toBe(true);
  });

  it('refuses a cross-origin upload before reading it', async () => {
    const response = await bffPost(
      request('/api/bff/sellers', { cookies: { fg_access: 'ADMIN' }, origin: 'https://evil.tn' }),
      params({ path: ['sellers'] }),
    );
    expect(response.status).toBe(403);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('relays a document as a file, with its type, name and no-store, nothing else', async () => {
    apiFetch.mockResolvedValueOnce(
      new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
        status: 200,
        headers: {
          'content-type': 'application/pdf',
          'content-disposition': 'inline; filename="patente.pdf"',
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
          'x-powered-by': 'Express',
          'set-cookie': 'leak=1',
        },
      }),
    );
    const response = await bffGet(
      request('/api/bff/sellers/s1/documents/d1', {
        method: 'GET',
        cookies: { fg_access: 'ADMIN' },
      }),
      params({ path: ['sellers', 's1', 'documents', 'd1'] }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toBe('inline; filename="patente.pdf"');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-powered-by')).toBeNull();
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    );
  });

  it('relays a refused document read as JSON', async () => {
    api(403, { code: 'NON_AUTORISE', message: 'Accès refusé' });
    const response = await bffGet(
      request('/api/bff/sellers/s1/documents/d1', {
        method: 'GET',
        cookies: { fg_access: 'DEPOT' },
      }),
      params({ path: ['sellers', 's1', 'documents', 'd1'] }),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'NON_AUTORISE' });
  });
});
