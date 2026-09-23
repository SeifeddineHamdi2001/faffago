import type { Role } from '@faffago/shared';
import { apiError } from '../common/errors';

/**
 * Who is calling, as established by the AuthenticationGuard from the database,
 * never from anything the client sends besides its signed token.
 */
export interface UserPrincipal {
  kind: 'user';
  userId: string;
  role: Role;
  sessionId: string;
  /** Set for a VENDEUR: the only seller whose data he may ever see. */
  sellerId: string | null;
  courierId: string | null;
}

/** An admin in "Voir comme le vendeur" (D-5): the seller's view, read-only. */
export interface ImpersonationPrincipal {
  kind: 'impersonation';
  role: typeof Role.VENDEUR;
  adminUserId: string;
  /** The admin's own session. */
  sessionId: string;
  impersonationId: string;
  sellerId: string;
}

export type Principal = UserPrincipal | ImpersonationPrincipal;

/**
 * The seller scope for a seller-space query. It comes from the session, so a
 * seller id in the URL, the body or a header is never what decides.
 */
export function sellerIdOf(principal: Principal): string {
  if (principal.sellerId) return principal.sellerId;
  throw apiError(403, 'NON_AUTORISE', "Vous n'avez pas accès à cette action.");
}
