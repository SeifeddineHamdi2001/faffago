import { NextResponse, type NextRequest } from 'next/server';
import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE_SECONDS,
  isLocale,
  preferredLocale,
} from '@/lib/locale';
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
  const publicResponse = publicSite(request);
  if (publicResponse) return publicResponse;
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

/**
 * The public site's languages (Landing 5):
 * - `/` and `/suivi/FG-…` open in the remembered language, else the
 *   browser's. `/suivi/*` is the address printed in every label's QR code and
 *   must answer forever (D-43), so it only redirects, it never moves.
 * - `/fr/…` and `/ar/…` remember the language of the page opened.
 * No session is involved: nothing else runs for these paths.
 */
function publicSite(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  if (pathname === '/' || pathname.startsWith('/suivi/')) {
    const locale = preferredLocale(
      request.cookies.get(LOCALE_COOKIE)?.value,
      request.headers.get('accept-language'),
    );
    const url = request.nextUrl.clone();
    url.pathname = pathname === '/' ? `/${locale}` : `/${locale}${pathname}`;
    return NextResponse.redirect(url, 307);
  }
  const first = pathname.split('/')[1];
  if (isLocale(first)) {
    const response = NextResponse.next();
    // A prefetch is the router guessing, not the visitor choosing.
    const prefetch =
      request.headers.has('next-router-prefetch') || request.headers.get('purpose') === 'prefetch';
    if (!prefetch && request.cookies.get(LOCALE_COOKIE)?.value !== first) {
      response.cookies.set(LOCALE_COOKIE, first, {
        path: '/',
        maxAge: LOCALE_COOKIE_MAX_AGE_SECONDS,
        sameSite: 'lax',
        secure: secureCookies,
      });
    }
    return response;
  }
  return null;
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
  matcher: [
    '/admin/:path*',
    '/vendeur/:path*',
    '/api/bff/:path*',
    '/api/impersonation',
    '/',
    '/suivi/:path*',
    '/fr/:path*',
    '/ar/:path*',
  ],
};
