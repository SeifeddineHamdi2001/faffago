import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { isProxiedPath } from '@/lib/bff';
import { callApi, forwardedHeaders } from '@/lib/server/api';
import { isSameOrigin } from '@/lib/server/origin';
import { forbiddenOrigin, relay, sessionExpired } from '@/lib/server/respond';
import { COOKIE } from '@/lib/session-cookies';

type Context = { params: Promise<{ path: string[] }> };

/**
 * The back office's calls to the API, with the admin's own token. The API
 * checks every permission; this only adds the token the browser cannot see.
 * Never the impersonation token: the seller view is read by server
 * components and has no action to send.
 */
async function forward(request: NextRequest, context: Context, method: string) {
  const { path } = await context.params;
  if (!isProxiedPath(path)) return NextResponse.json({ message: 'Introuvable' }, { status: 404 });
  if (method !== 'GET' && !isSameOrigin(request.headers)) return forbiddenOrigin();

  const token = request.cookies.get(COOKIE.ACCESS)?.value;
  if (!token) return sessionExpired();

  const body = method === 'GET' ? undefined : await request.json().catch(() => undefined);
  const apiPath = `/${path.map(encodeURIComponent).join('/')}${request.nextUrl.search}`;
  const result = await callApi(apiPath, {
    method,
    token,
    body,
    headers: forwardedHeaders(request.headers),
  });
  return relay(result.status, result.body, result.headers);
}

export function GET(request: NextRequest, context: Context) {
  return forward(request, context, 'GET');
}

export function POST(request: NextRequest, context: Context) {
  return forward(request, context, 'POST');
}
