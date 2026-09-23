import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { forwardedHeaders, secureCookies } from '@/lib/server/api';
import { isSameOrigin } from '@/lib/server/origin';
import { refreshTokens } from '@/lib/server/refresh';
import { forbiddenOrigin, sessionExpired, withCookies } from '@/lib/server/respond';
import { COOKIE, clearedSessionCookies, sessionCookies } from '@/lib/session-cookies';

/** Called by the tab that holds the refresh lock (D-13). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSameOrigin(request.headers)) return forbiddenOrigin();
  const refreshToken = request.cookies.get(COOKIE.REFRESH)?.value;
  if (!refreshToken) return sessionExpired();

  const tokens = await refreshTokens(refreshToken, forwardedHeaders(request.headers));
  if (!tokens) return withCookies(sessionExpired(), clearedSessionCookies());

  return withCookies(
    NextResponse.json({ accessTokenExpiresAt: tokens.accessTokenExpiresAt }),
    sessionCookies(tokens, { secure: secureCookies }),
  );
}
