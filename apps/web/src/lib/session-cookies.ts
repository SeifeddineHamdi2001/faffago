/**
 * Session cookies of the web app (tech-stack 3, D-13).
 *
 * The browser never holds a token in JavaScript: the access, refresh and
 * impersonation tokens live in httpOnly cookies written by the route
 * handlers and the middleware. Only the access token's expiry is readable,
 * so the tabs can agree on one refresh.
 */

export const COOKIE = {
  ACCESS: 'fg_access',
  REFRESH: 'fg_refresh',
  /** Access token expiry, epoch ms. Readable by the page, holds no secret. */
  EXP: 'fg_exp',
  /** "Voir comme le vendeur" (D-5): its own token, 30 minutes, no refresh. */
  IMP: 'fg_imp',
  IMP_EXP: 'fg_imp_exp',
} as const;

/** Refresh a little before the access token expires, not after. */
export const REFRESH_MARGIN_MS = 30_000;

export interface CookieSpec {
  name: string;
  value: string;
  options: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'lax';
    path: '/';
    expires?: Date;
    maxAge?: number;
  };
}

export interface SessionTokensJson {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export type SessionPlan = 'continue' | 'refresh' | 'login';

export function isStale(expMs: number | undefined, now: number): boolean {
  return expMs === undefined || Number.isNaN(expMs) || expMs - now <= REFRESH_MARGIN_MS;
}

export function planSession(input: {
  hasRefresh: boolean;
  expMs: number | undefined;
  now: number;
}): SessionPlan {
  if (!input.hasRefresh) return 'login';
  return isStale(input.expMs, input.now) ? 'refresh' : 'continue';
}

function base(secure: boolean, httpOnly = true): CookieSpec['options'] {
  return { httpOnly, secure, sameSite: 'lax', path: '/' };
}

export function sessionCookies(tokens: SessionTokensJson, opts: { secure: boolean }): CookieSpec[] {
  const accessExpires = new Date(tokens.accessTokenExpiresAt);
  const refreshExpires = new Date(tokens.refreshTokenExpiresAt);
  return [
    {
      name: COOKIE.ACCESS,
      value: tokens.accessToken,
      options: { ...base(opts.secure), expires: accessExpires },
    },
    {
      name: COOKIE.REFRESH,
      value: tokens.refreshToken,
      options: { ...base(opts.secure), expires: refreshExpires },
    },
    {
      name: COOKIE.EXP,
      value: String(accessExpires.getTime()),
      options: { ...base(opts.secure, false), expires: refreshExpires },
    },
  ];
}

export function impersonationCookies(
  token: string,
  expiresAt: string,
  opts: { secure: boolean },
): CookieSpec[] {
  const expires = new Date(expiresAt);
  return [
    { name: COOKIE.IMP, value: token, options: { ...base(opts.secure), expires } },
    {
      name: COOKIE.IMP_EXP,
      value: String(expires.getTime()),
      options: { ...base(opts.secure), expires },
    },
  ];
}

function cleared(names: string[]): CookieSpec[] {
  return names.map((name) => ({
    name,
    value: '',
    options: { ...base(false, name !== COOKIE.EXP), maxAge: 0 },
  }));
}

export function clearedSessionCookies(): CookieSpec[] {
  return cleared(Object.values(COOKIE));
}

export function clearedImpersonationCookies(): CookieSpec[] {
  return cleared([COOKIE.IMP, COOKIE.IMP_EXP]);
}

/**
 * Rewrites a Cookie request header: a null value removes the cookie. Lets the
 * middleware hand a freshly refreshed token to the page it lets through.
 */
export function mergeCookieHeader(
  header: string | null,
  updates: { name: string; value: string | null }[],
): string {
  const touched = new Set(updates.map((u) => u.name));
  const kept = (header ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part && !touched.has(part.split('=')[0]!));
  for (const { name, value } of updates) {
    if (value !== null) kept.push(`${name}=${value}`);
  }
  return kept.join('; ');
}

export function loginPathFor(pathname: string): '/admin/connexion' | '/vendeur/connexion' {
  return pathname.startsWith('/admin') ? '/admin/connexion' : '/vendeur/connexion';
}
