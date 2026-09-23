/**
 * The API paths the back office may reach through /api/bff/… . Everything
 * under /auth has its own route handler (login, refresh, logout,
 * impersonation), so the proxy never touches a token-issuing endpoint.
 */
const PROXIED_ROOTS = new Set(['accounts', 'sellers', 'settings']);

export function isProxiedPath(segments: string[]): boolean {
  if (segments.length === 0) return false;
  if (segments.some((s) => s === '..' || s === '.' || s.includes('/'))) return false;
  return PROXIED_ROOTS.has(segments[0]!);
}
