import { APP_VERSION_HEADER, AuthErrorCode } from '@faffago/shared';

export interface Tokens {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

/** A refusal with the API's stable code and its French message. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string,
    readonly body: unknown = null,
  ) {
    super(message);
  }
}

/** No answer at all: offline, or the server unreachable. */
export class NetworkError extends Error {}

export interface ApiDeps {
  baseUrl: string;
  appVersion: string;
  getTokens: () => Tokens | null;
  saveTokens: (tokens: Tokens) => Promise<void>;
  /** The refresh token was refused: back to the login, the queue kept (Q12). */
  onSessionExpired: () => void;
  /** The version is below Paramètres' minimum (tech-stack 5). */
  onUpdateRequired: () => void;
  fetch?: typeof fetch;
  now?: () => number;
}

export interface Api {
  request<T>(method: string, path: string, body?: unknown): Promise<T>;
  /** Without a session: the courier login. */
  publicRequest<T>(method: string, path: string, body?: unknown): Promise<T>;
}

/** Refresh a little before the access token expires, not after a 401. */
const REFRESH_MARGIN_MS = 30_000;

export function createApi(deps: ApiDeps): Api {
  const doFetch = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  let refreshing: Promise<Tokens | null> | null = null;

  async function send(method: string, path: string, body: unknown, token: string | null) {
    const headers: Record<string, string> = { [APP_VERSION_HEADER]: deps.appVersion };
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    try {
      return await doFetch(`${deps.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      throw new NetworkError(error instanceof Error ? error.message : 'network');
    }
  }

  async function read<T>(response: Response): Promise<T> {
    const text = await response.text();
    const parsed: unknown = text ? JSON.parse(text) : null;
    if (response.ok) return parsed as T;
    const { code, message } = (parsed ?? {}) as { code?: string; message?: string };
    if (response.status === 426 || code === AuthErrorCode.VERSION_APP_OBSOLETE) {
      deps.onUpdateRequired();
    }
    throw new ApiError(
      response.status,
      code ?? null,
      message ?? `Erreur ${response.status}`,
      parsed,
    );
  }

  /** One refresh at a time; the others wait for it. */
  function refresh(tokens: Tokens): Promise<Tokens | null> {
    refreshing ??= (async () => {
      try {
        const response = await send(
          'POST',
          '/auth/refresh',
          { refreshToken: tokens.refreshToken },
          null,
        );
        if (response.status === 401) return null;
        const next = await read<Tokens>(response);
        await deps.saveTokens(next);
        return next;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  async function freshToken(): Promise<string | null> {
    const tokens = deps.getTokens();
    if (!tokens) return null;
    if (Date.parse(tokens.accessTokenExpiresAt) - now() > REFRESH_MARGIN_MS)
      return tokens.accessToken;
    const next = await refresh(tokens);
    if (!next) {
      deps.onSessionExpired();
      throw new ApiError(401, AuthErrorCode.SESSION_EXPIREE, 'Session expirée');
    }
    return next.accessToken;
  }

  return {
    async request<T>(method: string, path: string, body?: unknown): Promise<T> {
      const token = await freshToken();
      if (!token) {
        deps.onSessionExpired();
        throw new ApiError(401, AuthErrorCode.SESSION_EXPIREE, 'Session expirée');
      }
      let response = await send(method, path, body, token);
      if (response.status === 401) {
        // Revoked (password regenerated, deactivation) or expired early: one refresh.
        const tokens = deps.getTokens();
        const next = tokens ? await refresh(tokens) : null;
        if (!next) {
          deps.onSessionExpired();
          return read<T>(response);
        }
        response = await send(method, path, body, next.accessToken);
        if (response.status === 401) deps.onSessionExpired();
      }
      return read<T>(response);
    },
    async publicRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
      return read<T>(await send(method, path, body, null));
    },
  };
}
