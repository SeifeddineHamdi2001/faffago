/**
 * CSRF guard for every state-changing route handler: the Origin header must
 * be this site. SameSite=Lax cookies already stop most cross-site posts; this
 * closes the rest. Behind the reverse proxy, the public host arrives in
 * X-Forwarded-Host.
 */
export function isSameOrigin(headers: Headers): boolean {
  const origin = headers.get('origin');
  const host = headers.get('x-forwarded-host') ?? headers.get('host');
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
