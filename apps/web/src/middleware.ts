import { NextResponse, type NextRequest } from 'next/server';
import { forwardedHeaders, secureCookies } from '@/lib/server/api';
import { refreshTokens } from '@/lib/server/refresh';
import {
  COOKIE,
  clearedImpersonationCookies,
  clearedSessionCookies,
  loginPathFor,
  mergeCookieHeader,
  planSession,
  sessionCookies,
  type CookieSpec,
} from '@/lib/session-cookies';

/**
 * Keeps the session usable before a page or a back office call runs:
 * - no session: the login page of the area (or 401 for /api/bff);
 * - access token about to expire: refreshed here, and handed to the page
 *   through the rewritten Cookie header, so it never reads a stale token;
 * - refresh refused (staff idle 30 min, password regenerated, deactivated):
 *   cookies cleared, login page with "Session expirée".
 * - an impersonation past its 30 minutes: its cookies dropped (D-5).
 *
 * The API still checks the role on every call; this only routes.
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  if (pathname === '/admin/connexion' || pathname === '/vendeur/connexion') {
    return NextResponse.next();
  }
  const isApi = pathname.startsWith('/api/');
  const now = Date.now();
  const updates: { name: string; value: string | null }[] = [];
  const specs: CookieSpec[] = [];

  const impExp = Number.parseInt(request.cookies.get(COOKIE.IMP_EXP)?.value ?? '', 10);
  if (request.cookies.has(COOKIE.IMP) && !(impExp > now)) {
    specs.push(...clearedImpersonationCookies());
    updates.push({ name: COOKIE.IMP, value: null }, { name: COOKIE.IMP_EXP, value: null });
  }

  const refreshToken = request.cookies.get(COOKIE.REFRESH)?.value;
  const exp = Number.parseInt(request.cookies.get(COOKIE.EXP)?.value ?? '', 10);
  const plan = planSession({
    hasRefresh: Boolean(refreshToken),
    expMs: Number.isNaN(exp) ? undefined : exp,
    now,
  });

  if (plan === 'login') return deny(request, isApi, false);

  if (plan === 'refresh') {
    const tokens = await refreshTokens(refreshToken!, forwardedHeaders(request.headers));
    if (!tokens) return deny(request, isApi, true);
    const fresh = sessionCookies(tokens, { secure: secureCookies });
    specs.push(...fresh);
    updates.push(...fresh.map((c) => ({ name: c.name, value: c.value })));
  }

  if (specs.length === 0) return NextResponse.next();

  const headers = new Headers(request.headers);
  headers.set('cookie', mergeCookieHeader(request.headers.get('cookie'), updates));
  const response = NextResponse.next({ request: { headers } });
  for (const c of specs) response.cookies.set(c.name, c.value, c.options);
  return response;
}

function deny(request: NextRequest, isApi: boolean, expired: boolean): NextResponse {
  const response = isApi
    ? NextResponse.json(
        { code: 'SESSION_EXPIREE', message: 'Session expirée. Reconnectez-vous.' },
        { status: 401 },
      )
    : NextResponse.redirect(
        new URL(
          `${loginPathFor(request.nextUrl.pathname)}${expired ? '?raison=session-expiree' : ''}`,
          request.url,
        ),
      );
  for (const c of clearedSessionCookies()) response.cookies.set(c.name, c.value, c.options);
  return response;
}

export const config = {
  matcher: ['/admin/:path*', '/vendeur/:path*', '/api/bff/:path*', '/api/impersonation'],
};
