import { describe, expect, it } from 'vitest';
import {
  can,
  Permission,
  PERMISSIONS_BY_ROLE,
  ROLES_BY_PERMISSION,
  type Permission as PermissionT,
} from '../permissions.js';
import { Role } from '../roles.js';

/**
 * Admin 2 (v1.11), copied row by row. If this table and the spec ever
 * disagree, the spec wins and this test is the thing to fix first.
 *
 *   Action                                        Admin  Dépôt  Service client
 */
const ADMIN_SECTION_2: [PermissionT, 'Oui' | '—', 'Oui' | '—', 'Oui' | '—'][] = [
  // Scan (entrée, sortie, retours, archivage)
  [Permission.SCAN_DEPOT, 'Oui', 'Oui', '—'],
  // Plan pickups and tours
  [Permission.PLANIFIER_RAMASSAGES_TOURNEES, 'Oui', 'Oui', '—'],
  // Courier cash reconciliation (Caisse)
  [Permission.CAISSE, 'Oui', 'Oui', '—'],
  // À vérifier follow-up, log calls
  [Permission.SUIVI_A_VERIFIER, 'Oui', '—', 'Oui'],
  // Read and join parcel chats
  [Permission.CHATS_STAFF, 'Oui', 'Oui', 'Oui'],
  // Apply seller change requests
  [Permission.DEMANDES_VENDEUR, 'Oui', '—', 'Oui'],
  // Prepare bons de versement — money: Admin only
  [Permission.BONS_VERSEMENT, 'Oui', '—', '—'],
  // Prepare bons de retour — Dépôt too since v1.11 (D-11)
  [Permission.BONS_RETOUR, 'Oui', 'Oui', '—'],
  // Courier pay, cancel a courier debt
  [Permission.PAIE_COURSIERS, 'Oui', '—', '—'],
  // Create / suspend sellers and couriers
  [Permission.GERER_VENDEURS_COURSIERS, 'Oui', '—', '—'],
  // Override a parcel status
  [Permission.FORCER_STATUT, 'Oui', '—', '—'],
  // Paramètres, staff users, reports
  [Permission.PARAMETRES, 'Oui', '—', '—'],
  [Permission.COMPTES_STAFF, 'Oui', '—', '—'],
  [Permission.RAPPORTS, 'Oui', '—', '—'],

  // ── Screens, D-11 (Admin 2 v1.11) ─────────────────────────
  // Aujourd'hui: each role sees the figures of its own work
  [Permission.AUJOURDHUI, 'Oui', 'Oui', 'Oui'],
  // Colis: read for all staff; acting goes through the rows above
  [Permission.COLIS_LECTURE, 'Oui', 'Oui', 'Oui'],
  // Exceptions: read for all staff; each acts with its own permissions
  [Permission.EXCEPTIONS_LECTURE, 'Oui', 'Oui', 'Oui'],
  // Retours: read for all staff; preparing bons de retour is BONS_RETOUR
  [Permission.RETOURS_LECTURE, 'Oui', 'Oui', 'Oui'],
  // Journal d'audit
  [Permission.JOURNAL_AUDIT, 'Oui', '—', '—'],
  // Vendeurs: contact info and parcels only
  [Permission.VENDEURS_LECTURE, 'Oui', 'Oui', 'Oui'],
  // CIN / patente documents: admin only (CLAUDE.md, Security)
  [Permission.VENDEURS_DOCUMENTS, 'Oui', '—', '—'],
  // The seller's email, his login identifier: admin only (D-11)
  [Permission.VENDEURS_EMAIL, 'Oui', '—', '—'],
  // Coursiers: name, phone, zone and today's parcels only
  [Permission.COURSIERS_LECTURE, 'Oui', 'Oui', 'Oui'],
];

const ALL_ROLES = Object.values(Role);
const ALL_PERMISSIONS = Object.values(Permission);

describe('permission matrix — Admin 2', () => {
  it.each(ADMIN_SECTION_2)('%s: Admin %s, Dépôt %s, Service client %s', (permission, a, d, s) => {
    expect(can(Role.ADMIN, permission)).toBe(a === 'Oui');
    expect(can(Role.DEPOT, permission)).toBe(d === 'Oui');
    expect(can(Role.SERVICE_CLIENT, permission)).toBe(s === 'Oui');
  });

  it('gives none of the Admin 2 rows to a seller or a courier', () => {
    for (const [permission] of ADMIN_SECTION_2) {
      expect(can(Role.VENDEUR, permission)).toBe(false);
      expect(can(Role.LIVREUR, permission)).toBe(false);
      expect(can(Role.RAMASSEUR, permission)).toBe(false);
    }
  });
});

describe('permission matrix — outside the Admin 2 table', () => {
  it('keeps money, accounts and settings with the admin (D-11)', () => {
    for (const permission of [
      Permission.BONS_VERSEMENT,
      Permission.PAIE_COURSIERS,
      Permission.GERER_VENDEURS_COURSIERS,
      Permission.COMPTES_STAFF,
      Permission.REGENERER_MOT_DE_PASSE,
      Permission.PARAMETRES,
      Permission.FORCER_STATUT,
      Permission.VENDEURS_DOCUMENTS,
      Permission.VENDEURS_EMAIL,
      Permission.JOURNAL_AUDIT,
    ]) {
      expect(ROLES_BY_PERMISSION[permission]).toEqual([Role.ADMIN]);
    }
  });

  it('lets Dépôt and Admin reprint a label (A-9)', () => {
    expect(ROLES_BY_PERMISSION[Permission.REIMPRIMER_ETIQUETTE]).toEqual([Role.ADMIN, Role.DEPOT]);
  });

  it('keeps Voir comme le vendeur to the admin alone (D-5)', () => {
    expect(ROLES_BY_PERMISSION[Permission.VOIR_COMME_VENDEUR]).toEqual([Role.ADMIN]);
  });

  it('lets nobody but the admin regenerate a password (A-20)', () => {
    expect(ROLES_BY_PERMISSION[Permission.REGENERER_MOT_DE_PASSE]).toEqual([Role.ADMIN]);
  });

  it('gives each non-staff role its own space and nothing else', () => {
    expect(PERMISSIONS_BY_ROLE[Role.VENDEUR]).toEqual([Permission.ESPACE_VENDEUR]);
    expect(PERMISSIONS_BY_ROLE[Role.LIVREUR]).toEqual([Permission.APP_LIVREUR]);
    expect(PERMISSIONS_BY_ROLE[Role.RAMASSEUR]).toEqual([Permission.APP_RAMASSEUR]);
  });

  it('keeps staff out of the seller space; the admin only enters it read-only (D-5)', () => {
    expect(can(Role.ADMIN, Permission.ESPACE_VENDEUR)).toBe(false);
    expect(can(Role.DEPOT, Permission.ESPACE_VENDEUR)).toBe(false);
    expect(can(Role.SERVICE_CLIENT, Permission.ESPACE_VENDEUR)).toBe(false);
  });

  it('keeps livreur and ramasseur work apart (Admin rule 17)', () => {
    expect(can(Role.LIVREUR, Permission.APP_RAMASSEUR)).toBe(false);
    expect(can(Role.RAMASSEUR, Permission.APP_LIVREUR)).toBe(false);
  });
});

describe('permission matrix — deny by default', () => {
  it('encodes no permission that is not listed above', () => {
    const covered = new Set<PermissionT>([
      ...ADMIN_SECTION_2.map(([p]) => p),
      Permission.REIMPRIMER_ETIQUETTE,
      Permission.VOIR_COMME_VENDEUR,
      Permission.REGENERER_MOT_DE_PASSE,
      Permission.ESPACE_VENDEUR,
      Permission.APP_LIVREUR,
      Permission.APP_RAMASSEUR,
    ]);
    expect(new Set(ALL_PERMISSIONS)).toEqual(covered);
  });

  it('refuses an unknown role or an unknown permission', () => {
    expect(can('SUPERADMIN' as Role, Permission.PARAMETRES)).toBe(false);
    expect(can(Role.ADMIN, 'TOUT' as PermissionT)).toBe(false);
    expect(can(undefined as unknown as Role, Permission.PARAMETRES)).toBe(false);
  });

  it('keeps PERMISSIONS_BY_ROLE the exact inverse of ROLES_BY_PERMISSION', () => {
    for (const role of ALL_ROLES) {
      for (const permission of ALL_PERMISSIONS) {
        expect(PERMISSIONS_BY_ROLE[role].includes(permission)).toBe(
          ROLES_BY_PERMISSION[permission].includes(role),
        );
      }
    }
  });

  it('cannot be widened at runtime', () => {
    expect(Object.isFrozen(ROLES_BY_PERMISSION)).toBe(true);
    expect(Object.isFrozen(ROLES_BY_PERMISSION[Permission.PARAMETRES])).toBe(true);
    expect(() => (ROLES_BY_PERMISSION[Permission.PARAMETRES] as Role[]).push(Role.DEPOT)).toThrow();
  });
});
