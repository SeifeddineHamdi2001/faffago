import { Role } from './roles.js';

/**
 * The permission matrix (Admin 2 v1.11, D-11).
 *
 * The API guards check a permission, never a role name, so that when the
 * staff split changes it changes here and nowhere else. Anything not listed is
 * refused: an endpoint with no permission declared does not answer at all.
 *
 * A *_LECTURE permission opens a screen; acting on it always needs the
 * permission of the action itself. What a screen shows can still depend on
 * the role: Aujourd'hui shows each role the figures of its own work, and the
 * Vendeurs and Coursiers pages hide documents, pay and debts from anyone
 * without VENDEURS_DOCUMENTS or PAIE_COURSIERS.
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
  /** Prepare bons de versement. Money: the admin alone (Admin rule 1). */
  BONS_VERSEMENT: 'BONS_VERSEMENT',
  /** Prepare bons de retour. Admin and Dépôt since Admin 2 v1.11 (D-11). */
  BONS_RETOUR: 'BONS_RETOUR',
  /** Courier pay, cancel a courier debt. */
  PAIE_COURSIERS: 'PAIE_COURSIERS',
  /** Mark a positive caisse écart as checked, with a note: the admin (D-79, answer 3). */
  CAISSE_ECARTS: 'CAISSE_ECARTS',
  /** Create / suspend sellers and couriers. */
  GERER_VENDEURS_COURSIERS: 'GERER_VENDEURS_COURSIERS',
  /** Override a parcel status. */
  FORCER_STATUT: 'FORCER_STATUT',
  /** "Paramètres, staff users, reports", split in three. */
  PARAMETRES: 'PARAMETRES',
  COMPTES_STAFF: 'COMPTES_STAFF',
  RAPPORTS: 'RAPPORTS',

  // ── Screens (D-11) ────────────────────────────────────────
  /** Aujourd'hui. Each role sees the figures of its own work. */
  AUJOURDHUI: 'AUJOURDHUI',
  /** Colis: search and detail. */
  COLIS_LECTURE: 'COLIS_LECTURE',
  EXCEPTIONS_LECTURE: 'EXCEPTIONS_LECTURE',
  RETOURS_LECTURE: 'RETOURS_LECTURE',
  JOURNAL_AUDIT: 'JOURNAL_AUDIT',
  /** Vendeurs: contact info and parcels. Never the documents. */
  VENDEURS_LECTURE: 'VENDEURS_LECTURE',
  /** CIN / patente / auto-entrepreneur documents (CLAUDE.md, Security). */
  VENDEURS_DOCUMENTS: 'VENDEURS_DOCUMENTS',
  /** The seller's email, which is his login identifier (D-11). */
  VENDEURS_EMAIL: 'VENDEURS_EMAIL',
  /** Coursiers: name, phone, zone, today's parcels. Pay and debts need PAIE_COURSIERS. */
  COURSIERS_LECTURE: 'COURSIERS_LECTURE',

  // ── Decided outside the Admin 2 table ─────────────────────
  /** Réimprimer l'étiquette, same code (A-9). */
  REIMPRIMER_ETIQUETTE: 'REIMPRIMER_ETIQUETTE',
  /** Read-only impersonation (D-5). */
  VOIR_COMME_VENDEUR: 'VOIR_COMME_VENDEUR',
  /** Nobody but the admin changes a password (A-20, Q7). */
  REGENERER_MOT_DE_PASSE: 'REGENERER_MOT_DE_PASSE',
  /** Correct a bon scanned Remis, or a return scanned Retour reçu, by mistake (D-88). */
  CORRIGER_BON: 'CORRIGER_BON',

  // ── One space per non-staff role ──────────────────────────
  /** The seller's own data only; the service scopes by the token's seller. */
  ESPACE_VENDEUR: 'ESPACE_VENDEUR',
  APP_LIVREUR: 'APP_LIVREUR',
  APP_RAMASSEUR: 'APP_RAMASSEUR',
  /** What both couriers use: the scan queue, Profil. Each service narrows by role. */
  APP_COURSIER: 'APP_COURSIER',
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
  BONS_VERSEMENT: frozen([ADMIN]),
  BONS_RETOUR: frozen([ADMIN, DEPOT]),
  PAIE_COURSIERS: frozen([ADMIN]),
  CAISSE_ECARTS: frozen([ADMIN]),
  GERER_VENDEURS_COURSIERS: frozen([ADMIN]),
  FORCER_STATUT: frozen([ADMIN]),
  PARAMETRES: frozen([ADMIN]),
  COMPTES_STAFF: frozen([ADMIN]),
  RAPPORTS: frozen([ADMIN]),

  AUJOURDHUI: frozen([ADMIN, DEPOT, SERVICE_CLIENT]),
  COLIS_LECTURE: frozen([ADMIN, DEPOT, SERVICE_CLIENT]),
  EXCEPTIONS_LECTURE: frozen([ADMIN, DEPOT, SERVICE_CLIENT]),
  RETOURS_LECTURE: frozen([ADMIN, DEPOT, SERVICE_CLIENT]),
  JOURNAL_AUDIT: frozen([ADMIN]),
  VENDEURS_LECTURE: frozen([ADMIN, DEPOT, SERVICE_CLIENT]),
  VENDEURS_DOCUMENTS: frozen([ADMIN]),
  VENDEURS_EMAIL: frozen([ADMIN]),
  COURSIERS_LECTURE: frozen([ADMIN, DEPOT, SERVICE_CLIENT]),

  REIMPRIMER_ETIQUETTE: frozen([ADMIN, DEPOT]),
  VOIR_COMME_VENDEUR: frozen([ADMIN]),
  REGENERER_MOT_DE_PASSE: frozen([ADMIN]),
  CORRIGER_BON: frozen([ADMIN]),

  ESPACE_VENDEUR: frozen([VENDEUR]),
  APP_LIVREUR: frozen([LIVREUR]),
  APP_RAMASSEUR: frozen([RAMASSEUR]),
  APP_COURSIER: frozen([LIVREUR, RAMASSEUR]),
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
