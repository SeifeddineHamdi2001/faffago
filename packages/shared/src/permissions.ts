import { Role } from './roles.js';

/**
 * The permission matrix (Admin 2, TO CONFIRM).
 *
 * The API guards check a permission, never a role name, so that when the
 * staff split changes it changes here and nowhere else. Anything not listed is
 * refused: an endpoint with no permission declared does not answer at all.
 *
 * The screens that Admin 2 does not cover — Aujourd'hui, Colis search,
 * Exceptions, Retours, Journal d'audit, reading the Vendeurs and Coursiers
 * pages — are deliberately absent until their access is decided.
 */
export const Permission = {
  // ── Admin 2, one row each ─────────────────────────────────
  /** Scan (entrée, sortie, retours, archivage). */
  SCAN_DEPOT: 'SCAN_DEPOT',
  /** Plan pickups and tours. */
  PLANIFIER_RAMASSAGES_TOURNEES: 'PLANIFIER_RAMASSAGES_TOURNEES',
  /** Courier cash reconciliation (Caisse). */
  CAISSE: 'CAISSE',
  /** À vérifier follow-up, log calls. Never a seller decision (D-4). */
  SUIVI_A_VERIFIER: 'SUIVI_A_VERIFIER',
  /** Read and join parcel chats. */
  CHATS_STAFF: 'CHATS_STAFF',
  /** Apply seller change requests. */
  DEMANDES_VENDEUR: 'DEMANDES_VENDEUR',
  /** Prepare bons de versement and bons de retour. */
  BONS_VERSEMENT_RETOUR: 'BONS_VERSEMENT_RETOUR',
  /** Courier pay, cancel a courier debt. */
  PAIE_COURSIERS: 'PAIE_COURSIERS',
  /** Create / suspend sellers and couriers. */
  GERER_VENDEURS_COURSIERS: 'GERER_VENDEURS_COURSIERS',
  /** Override a parcel status. */
  FORCER_STATUT: 'FORCER_STATUT',
  /** "Paramètres, staff users, reports", split in three. */
  PARAMETRES: 'PARAMETRES',
  COMPTES_STAFF: 'COMPTES_STAFF',
  RAPPORTS: 'RAPPORTS',

  // ── Decided outside the Admin 2 table ─────────────────────
  /** Réimprimer l'étiquette, same code (A-9). */
  REIMPRIMER_ETIQUETTE: 'REIMPRIMER_ETIQUETTE',
  /** Read-only impersonation (D-5). */
  VOIR_COMME_VENDEUR: 'VOIR_COMME_VENDEUR',
  /** Nobody but the admin changes a password (A-20, Q7). */
  REGENERER_MOT_DE_PASSE: 'REGENERER_MOT_DE_PASSE',

  // ── One space per non-staff role ──────────────────────────
  /** The seller's own data only; the service scopes by the token's seller. */
  ESPACE_VENDEUR: 'ESPACE_VENDEUR',
  APP_LIVREUR: 'APP_LIVREUR',
  APP_RAMASSEUR: 'APP_RAMASSEUR',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

const { ADMIN, DEPOT, SERVICE_CLIENT, VENDEUR, LIVREUR, RAMASSEUR } = Role;

function frozen(roles: Role[]): readonly Role[] {
  return Object.freeze(roles);
}

/** The source of truth. A `Record`, so a new permission cannot be left out. */
export const ROLES_BY_PERMISSION: Readonly<Record<Permission, readonly Role[]>> = Object.freeze({
  SCAN_DEPOT: frozen([ADMIN, DEPOT]),
  PLANIFIER_RAMASSAGES_TOURNEES: frozen([ADMIN, DEPOT]),
  CAISSE: frozen([ADMIN, DEPOT]),
  SUIVI_A_VERIFIER: frozen([ADMIN, SERVICE_CLIENT]),
  CHATS_STAFF: frozen([ADMIN, DEPOT, SERVICE_CLIENT]),
  DEMANDES_VENDEUR: frozen([ADMIN, SERVICE_CLIENT]),
  BONS_VERSEMENT_RETOUR: frozen([ADMIN]),
  PAIE_COURSIERS: frozen([ADMIN]),
  GERER_VENDEURS_COURSIERS: frozen([ADMIN]),
  FORCER_STATUT: frozen([ADMIN]),
  PARAMETRES: frozen([ADMIN]),
  COMPTES_STAFF: frozen([ADMIN]),
  RAPPORTS: frozen([ADMIN]),

  REIMPRIMER_ETIQUETTE: frozen([ADMIN, DEPOT]),
  VOIR_COMME_VENDEUR: frozen([ADMIN]),
  REGENERER_MOT_DE_PASSE: frozen([ADMIN]),

  ESPACE_VENDEUR: frozen([VENDEUR]),
  APP_LIVREUR: frozen([LIVREUR]),
  APP_RAMASSEUR: frozen([RAMASSEUR]),
});

/** The same matrix read by role, for the menus ("each role only sees…", Admin 3). */
export const PERMISSIONS_BY_ROLE: Readonly<Record<Role, readonly Permission[]>> = Object.freeze(
  Object.fromEntries(
    Object.values(Role).map((role) => [
      role,
      Object.freeze(
        (Object.keys(ROLES_BY_PERMISSION) as Permission[]).filter((permission) =>
          ROLES_BY_PERMISSION[permission].includes(role),
        ),
      ),
    ]),
  ) as Record<Role, readonly Permission[]>,
);

/** Deny by default: an unknown role or permission is simply refused. */
export function can(role: Role, permission: Permission): boolean {
  if (!Object.prototype.hasOwnProperty.call(ROLES_BY_PERMISSION, permission)) return false;
  return ROLES_BY_PERMISSION[permission].includes(role);
}
