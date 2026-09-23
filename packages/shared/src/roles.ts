/**
 * Roles. The role lives in the signed JWT and is checked by a guard on every
 * endpoint (tech-stack section 2). Never trust a role sent by the frontend.
 */

export const Role = {
  ADMIN: 'ADMIN',
  DEPOT: 'DEPOT',
  SERVICE_CLIENT: 'SERVICE_CLIENT',
  VENDEUR: 'VENDEUR',
  LIVREUR: 'LIVREUR',
  RAMASSEUR: 'RAMASSEUR',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const ROLE_LABELS_FR: Record<Role, string> = {
  ADMIN: 'Admin',
  DEPOT: 'Dépôt',
  SERVICE_CLIENT: 'Service client',
  VENDEUR: 'Vendeur',
  LIVREUR: 'Livreur',
  RAMASSEUR: 'Ramasseur',
};

export const STAFF_ROLES = [Role.ADMIN, Role.DEPOT, Role.SERVICE_CLIENT] as const;
export const COURIER_ROLES = [Role.LIVREUR, Role.RAMASSEUR] as const;

export function isStaffRole(role: Role): boolean {
  return (STAFF_ROLES as readonly Role[]).includes(role);
}

export function isCourierRole(role: Role): boolean {
  return (COURIER_ROLES as readonly Role[]).includes(role);
}

/**
 * Scheduled jobs (48-hour return, exception detection) act without a user.
 * SYSTEM is not a database role: such events are stored with a null actor.
 */
export const SYSTEM_ACTOR = 'SYSTEM' as const;
export type Actor = Role | typeof SYSTEM_ACTOR;

/**
 * Which login identifier a role uses (A-20).
 * Sellers: email. Staff: username. Couriers: phone plus role choice.
 */
export const LOGIN_IDENTIFIER_BY_ROLE: Record<Role, 'email' | 'username' | 'phone'> = {
  ADMIN: 'username',
  DEPOT: 'username',
  SERVICE_CLIENT: 'username',
  VENDEUR: 'email',
  LIVREUR: 'phone',
  RAMASSEUR: 'phone',
};
