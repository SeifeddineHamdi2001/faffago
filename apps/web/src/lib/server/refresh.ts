import type { SessionTokensJson } from '../session-cookies';
import { callApi } from './api';

/**
 * Concurrent refreshes of one token inside this server process share one API
 * call; across processes, the API's 10-second grace window gives them the
 * same new token (D-13).
 */
const inFlight = new Map<string, Promise<SessionTokensJson | null>>();

export function refreshTokens(
  refreshToken: string,
  headers: Record<string, string>,
): Promise<SessionTokensJson | null> {
  const pending = inFlight.get(refreshToken);
  if (pending) return pending;

  const run = callApi<SessionTokensJson>('/auth/refresh', {
    method: 'POST',
    body: { refreshToken },
    headers,
  })
    .then((result) => (result.status === 200 ? result.body : null))
    .finally(() => inFlight.delete(refreshToken));
  inFlight.set(refreshToken, run);
  return run;
}
