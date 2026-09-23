import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { isStaffRole, Role } from '@faffago/shared';
import { COOKIE } from '../session-cookies';
import type { Me } from '../types';
import { callApi } from './api';

export type Area = 'admin' | 'vendeur';

/**
 * The token a server component reads with. In the seller space, an open
 * "Voir comme le vendeur" wins: the admin sees the seller's view (D-5).
 * The back office always uses the admin's own session.
 */
async function tokenFor(area: Area): Promise<string | undefined> {
  const jar = await cookies();
  if (area === 'vendeur') {
    const impersonation = jar.get(COOKIE.IMP)?.value;
    if (impersonation) return impersonation;
  }
  return jar.get(COOKIE.ACCESS)?.value;
}

function loginPath(area: Area): string {
  return `/${area}/connexion?raison=session-expiree`;
}

/**
 * The account behind the page, or a redirect. The middleware has already
 * refreshed the token; the API checks the role again on every call. Cached
 * per request, so a layout and its page share one /auth/me.
 */
export const requireMe = cache(async (area: Area): Promise<Me> => {
  const token = await tokenFor(area);
  if (!token) redirect(`/${area}/connexion`);

  const result = await callApi<Me>('/auth/me', { token });
  if (result.status !== 200) redirect(loginPath(area));
  const me = result.body;

  if (area === 'admin' && !isStaffRole(me.role)) redirect('/vendeur');
  if (area === 'vendeur' && me.role !== Role.VENDEUR) {
    redirect(isStaffRole(me.role) ? '/admin' : '/vendeur/connexion');
  }
  return me;
});

/** A read for a server component, with the same token and the same redirects. */
export async function serverGet<T>(area: Area, path: string): Promise<T> {
  const token = await tokenFor(area);
  if (!token) redirect(`/${area}/connexion`);
  const result = await callApi<T>(path, { token });
  if (result.status === 401) redirect(loginPath(area));
  if (result.status !== 200) throw new Error(`GET ${path} → ${result.status}`);
  return result.body;
}
