/**
 * The API paths the browser may reach through /api/bff/… : the back office's,
 * and the seller's own parcels. The API decides what each role may do. Everything
 * under /auth has its own route handler (login, refresh, logout,
 * impersonation), so the proxy never touches a token-issuing endpoint.
 */
const PROXIED_ROOTS = new Set([
  'accounts',
  'sellers',
  'settings',
  'parcels',
  'pickups',
  'pickup-addresses',
  'zones',
  'geo',
  'gouvernorats',
  'delegations',
  'localites',
  'couriers',
  'scans',
  'tournees',
  'ramassages',
  'colis',
  'demandes-modification',
]);

export function isProxiedPath(segments: string[]): boolean {
  if (segments.length === 0) return false;
  if (segments.some((s) => s === '..' || s === '.' || s.includes('/'))) return false;
  return PROXIED_ROOTS.has(segments[0]!);
}
