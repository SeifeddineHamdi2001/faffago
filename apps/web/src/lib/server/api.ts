/**
 * Calls from the Next.js server to the NestJS API. Used by the route
 * handlers, the middleware and the server components; never by the browser.
 */

export const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';

export interface ApiResult<T = unknown> {
  status: number;
  body: T;
  headers: Headers;
}

export async function callApi<T = unknown>(
  path: string,
  init: {
    method?: string;
    token?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
): Promise<ApiResult<T>> {
  const headers = new Headers(init.headers);
  if (init.token) headers.set('authorization', `Bearer ${init.token}`);
  if (init.body !== undefined) headers.set('content-type', 'application/json');

  const response = await fetch(`${API_BASE_URL}/api${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
  });
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { message: text };
    }
  }
  return { status: response.status, body: body as T, headers: response.headers };
}

/**
 * The raw answer, for what callApi cannot carry: a multipart upload going in
 * (the seller documents) or a file coming out.
 */
export function fetchApi(
  path: string,
  init: { method: string; token?: string; body?: BodyInit; headers?: Record<string, string> },
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.token) headers.set('authorization', `Bearer ${init.token}`);
  return fetch(`${API_BASE_URL}/api${path}`, {
    method: init.method,
    headers,
    body: init.body,
    cache: 'no-store',
  });
}

/**
 * The browser's address and user agent, for the API's login throttling and
 * its audit entries. The API trusts X-Forwarded-For from loopback only, and
 * the reverse proxy sets it from the real connection (D-6).
 */
export function forwardedHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  const forwardedFor = headers.get('x-forwarded-for');
  const userAgent = headers.get('user-agent');
  if (forwardedFor) out['x-forwarded-for'] = forwardedFor;
  if (userAgent) out['user-agent'] = userAgent;
  return out;
}

export const secureCookies = process.env.NODE_ENV === 'production';
