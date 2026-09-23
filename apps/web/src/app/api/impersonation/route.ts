import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { callApi, forwardedHeaders, secureCookies } from '@/lib/server/api';
import { isSameOrigin } from '@/lib/server/origin';
import { forbiddenOrigin, relay, sessionExpired, withCookies } from '@/lib/server/respond';
import { COOKIE, clearedImpersonationCookies, impersonationCookies } from '@/lib/session-cookies';

interface Started {
  impersonationToken: string;
  expiresAt: string;
  [key: string]: unknown;
}

/**
 * Voir comme le vendeur (D-5). The impersonation token sits in its own cookie
 * beside the admin's session: the seller space reads with it, the back office
 * keeps using the admin's own.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSameOrigin(request.headers)) return forbiddenOrigin();
  const token = request.cookies.get(COOKIE.ACCESS)?.value;
  if (!token) return sessionExpired();

  const result = await callApi<Started>('/auth/impersonation', {
    method: 'POST',
    token,
    body: await request.json().catch(() => ({})),
    headers: forwardedHeaders(request.headers),
  });
  if (result.status !== 201) return relay(result.status, result.body, result.headers);

  const { impersonationToken, ...view } = result.body;
  return withCookies(
    NextResponse.json(view, { status: 201 }),
    impersonationCookies(impersonationToken, view.expiresAt, { secure: secureCookies }),
  );
}

/** Quitter, from the banner. The end is audited by the API. */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  if (!isSameOrigin(request.headers)) return forbiddenOrigin();
  const token = request.cookies.get(COOKIE.IMP)?.value;
  if (token) {
    await callApi('/auth/impersonation', {
      method: 'DELETE',
      token,
      headers: forwardedHeaders(request.headers),
    }).catch(() => undefined);
  }
  return withCookies(new NextResponse(null, { status: 204 }), clearedImpersonationCookies());
}
