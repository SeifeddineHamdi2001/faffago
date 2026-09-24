import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { isProxiedPath } from '@/lib/bff';
import { fetchApi, forwardedHeaders } from '@/lib/server/api';
import { isSameOrigin } from '@/lib/server/origin';
import { forbiddenOrigin, relay, sessionExpired } from '@/lib/server/respond';
import { COOKIE } from '@/lib/session-cookies';

type Context = { params: Promise<{ path: string[] }> };

/** What a file answer keeps on its way to the browser (the seller documents, D-32). */
const FILE_HEADERS = [
  'content-type',
  'content-disposition',
  'content-length',
  'cache-control',
  'x-content-type-options',
];

/**
 * The back office's calls to the API, with the admin's own token. The API
 * checks every permission; this only adds the token the browser cannot see.
 * Never the impersonation token: the seller view is read by server
 * components and has no action to send.
 *
 * JSON goes both ways; a multipart upload is passed through as sent, and a
 * file answer is relayed with its type, name and no-store headers.
 */
async function forward(request: NextRequest, context: Context, method: string) {
  const { path } = await context.params;
  if (!isProxiedPath(path)) return NextResponse.json({ message: 'Introuvable' }, { status: 404 });
  if (method !== 'GET' && !isSameOrigin(request.headers)) return forbiddenOrigin();

  const token = request.cookies.get(COOKIE.ACCESS)?.value;
  if (!token) return sessionExpired();

  const headers = forwardedHeaders(request.headers);
  let body: BodyInit | undefined;
  if (method !== 'GET') {
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.startsWith('multipart/form-data')) {
      headers['content-type'] = contentType;
      body = await request.arrayBuffer();
    } else {
      const json: unknown = await request.json().catch(() => undefined);
      if (json !== undefined) {
        headers['content-type'] = 'application/json';
        body = JSON.stringify(json);
      }
    }
  }

  const apiPath = `/${path.map(encodeURIComponent).join('/')}${request.nextUrl.search}`;
  const response = await fetchApi(apiPath, { method, token, body, headers });

  const type = response.headers.get('content-type') ?? '';
  if (response.ok && response.status !== 204 && type && !type.includes('json')) {
    const out = new Headers();
    for (const name of FILE_HEADERS) {
      const value = response.headers.get(name);
      if (value) out.set(name, value);
    }
    return new NextResponse(response.body, { status: response.status, headers: out });
  }

  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { message: text };
    }
  }
  return relay(response.status, parsed, response.headers);
}

export function GET(request: NextRequest, context: Context) {
  return forward(request, context, 'GET');
}

export function POST(request: NextRequest, context: Context) {
  return forward(request, context, 'POST');
}

export function PATCH(request: NextRequest, context: Context) {
  return forward(request, context, 'PATCH');
}
