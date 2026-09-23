import { COOKIE, loginPathFor } from '../session-cookies';
import type { ApiError } from '../types';
import { SessionExpiredError, createRefresher } from './refresh';

export type BffResult<T> = { ok: true; data: T } | { ok: false; status: number; error: ApiError };

function readCookie(name: string): string | undefined {
  const entry = document.cookie.split('; ').find((part) => part.startsWith(`${name}=`));
  return entry?.slice(name.length + 1);
}

let refresher: ReturnType<typeof createRefresher> | null = null;

function getRefresher() {
  refresher ??= createRefresher({
    readExp: () => {
      const value = Number.parseInt(readCookie(COOKIE.EXP) ?? '', 10);
      return Number.isNaN(value) ? undefined : value;
    },
    now: () => Date.now(),
    fetch: (input, init) => fetch(input, init),
    locks: typeof navigator !== 'undefined' ? navigator.locks : undefined,
  });
  return refresher;
}

function toLogin(): never {
  window.location.assign(`${loginPathFor(window.location.pathname)}?raison=session-expiree`);
  throw new SessionExpiredError();
}

/**
 * A back office call from the browser, through /api/bff. Refreshes first if
 * the access token is about to expire — one refresh for all tabs (D-13) — and
 * sends the person to the login page when the session is gone.
 */
export async function bff<T>(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  body?: unknown,
): Promise<BffResult<T>> {
  try {
    await getRefresher().ensureFresh();
  } catch (error) {
    if (error instanceof SessionExpiredError) toLogin();
    throw error;
  }

  const response = await fetch(`/api/bff/${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 401) toLogin();

  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (response.ok) return { ok: true, data: data as T };
  return {
    ok: false,
    status: response.status,
    error: (data as ApiError | null) ?? { message: 'Une erreur est survenue. Réessayez.' },
  };
}
