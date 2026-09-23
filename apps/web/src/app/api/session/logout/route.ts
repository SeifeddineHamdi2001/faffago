import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { callApi, forwardedHeaders } from '@/lib/server/api';
import { isSameOrigin } from '@/lib/server/origin';
import { forbiddenOrigin, withCookies } from '@/lib/server/respond';
import { COOKIE, clearedSessionCookies } from '@/lib/session-cookies';

/** Se déconnecter: revokes this device's session, then forgets it here. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSameOrigin(request.headers)) return forbiddenOrigin();
  const token = request.cookies.get(COOKIE.ACCESS)?.value;
  if (token) {
    // An already expired session has nothing left to revoke.
    await callApi('/auth/logout', {
      method: 'POST',
      token,
      headers: forwardedHeaders(request.headers),
    }).catch(() => undefined);
  }
  return withCookies(new NextResponse(null, { status: 204 }), clearedSessionCookies());
}
