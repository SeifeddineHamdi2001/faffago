import { isStale } from '../session-cookies';

interface LockManagerLike {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

export interface RefresherDeps {
  /** The access token expiry, from the readable fg_exp cookie. */
  readExp: () => number | undefined;
  now: () => number;
  fetch: (input: string, init: RequestInit) => Promise<Response>;
  /** navigator.locks, shared by every tab of the site. */
  locks: LockManagerLike | undefined;
}

export class SessionExpiredError extends Error {
  constructor() {
    super('SESSION_EXPIREE');
  }
}

/**
 * One refresh at a time across every tab (D-13). A tab takes the lock,
 * re-reads the expiry — another tab may have refreshed while it waited — and
 * refreshes only if it is still stale. Without navigator.locks, calls within
 * the tab still share one refresh, and the API's grace window covers the rest.
 */
export function createRefresher(deps: RefresherDeps) {
  let inTab: Promise<void> | null = null;

  async function refreshIfStale(): Promise<void> {
    if (!isStale(deps.readExp(), deps.now())) return;
    const response = await deps.fetch('/api/session/refresh', { method: 'POST' });
    if (!response.ok) throw new SessionExpiredError();
  }

  return {
    async ensureFresh(): Promise<void> {
      if (!isStale(deps.readExp(), deps.now())) return;
      if (!inTab) {
        const run = deps.locks
          ? deps.locks.request('faffago-refresh', refreshIfStale)
          : refreshIfStale();
        inTab = run.finally(() => {
          inTab = null;
        });
      }
      return inTab;
    },
  };
}
