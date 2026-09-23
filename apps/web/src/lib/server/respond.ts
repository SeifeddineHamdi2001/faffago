import { NextResponse } from 'next/server';
import type { CookieSpec } from '../session-cookies';

export function withCookies<T extends NextResponse>(response: T, cookies: CookieSpec[]): T {
  for (const cookie of cookies) response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}

export function forbiddenOrigin(): NextResponse {
  return NextResponse.json(
    { code: 'ORIGINE_REFUSEE', message: 'Requête refusée.' },
    { status: 403 },
  );
}

export function sessionExpired(): NextResponse {
  return NextResponse.json(
    { code: 'SESSION_EXPIREE', message: 'Session expirée. Reconnectez-vous.' },
    { status: 401 },
  );
}

/** An API answer relayed as is, with Retry-After when the API sent one. */
export function relay(status: number, body: unknown, apiHeaders?: Headers): NextResponse {
  const response =
    status === 204 || body === null
      ? new NextResponse(null, { status })
      : NextResponse.json(body, { status });
  const retryAfter = apiHeaders?.get('retry-after');
  if (retryAfter) response.headers.set('retry-after', retryAfter);
  return response;
}
