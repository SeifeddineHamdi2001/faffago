import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { callApi, forwardedHeaders, secureCookies } from '@/lib/server/api';
import { isSameOrigin } from '@/lib/server/origin';
import { forbiddenOrigin, relay, withCookies } from '@/lib/server/respond';
import {
  clearedSessionCookies,
  sessionCookies,
  type SessionTokensJson,
} from '@/lib/session-cookies';

/** The two web logins (A-20). Couriers log in from the app (phase 5). */
const KINDS = new Set(['vendeur', 'staff']);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ kind: string }> },
): Promise<NextResponse> {
  const { kind } = await params;
  if (!KINDS.has(kind)) return NextResponse.json({ message: 'Introuvable' }, { status: 404 });
  if (!isSameOrigin(request.headers)) return forbiddenOrigin();

  const result = await callApi<SessionTokensJson & { user: unknown }>(`/auth/login/${kind}`, {
    method: 'POST',
    body: await request.json().catch(() => ({})),
    headers: forwardedHeaders(request.headers),
  });
  if (result.status !== 200) return relay(result.status, result.body, result.headers);

  const { user, ...tokens } = result.body;
  // A new login replaces whatever session the browser had, impersonation included.
  return withCookies(NextResponse.json({ user }), [
    ...clearedSessionCookies(),
    ...sessionCookies(tokens, { secure: secureCookies }),
  ]);
}
