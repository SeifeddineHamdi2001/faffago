import { ApiError, NetworkError, createApi, type Tokens } from '../src/api/client';

const NOW = Date.parse('2026-09-25T08:00:00.000Z');

function tokens(accessExpiresInMs: number, suffix = '1'): Tokens {
  return {
    accessToken: `access-${suffix}`,
    accessTokenExpiresAt: new Date(NOW + accessExpiresInMs).toISOString(),
    refreshToken: `refresh-${suffix}`,
    refreshTokenExpiresAt: new Date(NOW + 90 * 86_400_000).toISOString(),
  };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

function setup(initial: Tokens | null, responses: Response[]) {
  let current = initial;
  const calls: { url: string; init: RequestInit }[] = [];
  const deps = {
    baseUrl: 'https://api.test/api',
    appVersion: '1.0.0',
    getTokens: () => current,
    saveTokens: jest.fn(async (next: Tokens) => {
      current = next;
    }),
    onSessionExpired: jest.fn(),
    onUpdateRequired: jest.fn(),
    now: () => NOW,
    fetch: jest.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const next = responses.shift();
      if (!next) throw new TypeError('Network request failed');
      return next;
    }) as unknown as typeof fetch,
  };
  return { api: createApi(deps), deps, calls };
}

describe('the API client', () => {
  it('sends the app version and the token', async () => {
    const { api, calls } = setup(tokens(600_000), [json(200, { ok: true })]);
    expect(await api.request('GET', '/coursier/moi')).toEqual({ ok: true });
    expect(calls[0]!.url).toBe('https://api.test/api/coursier/moi');
    expect(calls[0]!.init.headers).toMatchObject({
      'x-app-version': '1.0.0',
      authorization: 'Bearer access-1',
    });
  });

  it('refreshes a token about to expire, before the call (90-day session, Q11)', async () => {
    const { api, deps, calls } = setup(tokens(10_000), [
      json(200, tokens(900_000, '2')),
      json(200, { ok: true }),
    ]);
    await api.request('GET', '/coursier/tournee');
    expect(calls[0]!.url).toBe('https://api.test/api/auth/refresh');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ refreshToken: 'refresh-1' });
    expect(deps.saveTokens).toHaveBeenCalled();
    expect(calls[1]!.init.headers).toMatchObject({ authorization: 'Bearer access-2' });
  });

  it('sends the courier back to the login when the refresh is refused (Q12)', async () => {
    const { api, deps } = setup(tokens(10_000), [json(401, { code: 'SESSION_EXPIREE' })]);
    await expect(api.request('GET', '/coursier/tournee')).rejects.toBeInstanceOf(ApiError);
    expect(deps.onSessionExpired).toHaveBeenCalled();
  });

  it('says an update is required on a 426 (tech-stack 5)', async () => {
    const { api, deps } = setup(tokens(600_000), [
      json(426, { code: 'VERSION_APP_OBSOLETE', message: 'Mise à jour' }),
    ]);
    await expect(api.request('GET', '/coursier/tournee')).rejects.toMatchObject({
      status: 426,
      code: 'VERSION_APP_OBSOLETE',
    });
    expect(deps.onUpdateRequired).toHaveBeenCalled();
  });

  it('tells a network failure apart from a refusal', async () => {
    const { api } = setup(tokens(600_000), []);
    await expect(api.request('GET', '/coursier/tournee')).rejects.toBeInstanceOf(NetworkError);
  });
});
