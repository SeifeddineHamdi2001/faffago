import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, Role } from '@prisma/client';
import { CLOCK, type Clock } from '../common/clock';

/** Actions written to the Journal d'audit (Admin 4.17). */
export const AuditAction = {
  CREATION_COMPTE: 'CREATION_COMPTE',
  REGENERATION_MOT_DE_PASSE: 'REGENERATION_MOT_DE_PASSE',
  DESACTIVATION_COMPTE: 'DESACTIVATION_COMPTE',
  /** Step 1 of a courier deactivation: no new work from now on (D-12). */
  ARRET_NOUVEAU_TRAVAIL: 'ARRET_NOUVEAU_TRAVAIL',
  REACTIVATION_COMPTE: 'REACTIVATION_COMPTE',
  VOIR_COMME_VENDEUR_DEBUT: 'VOIR_COMME_VENDEUR_DEBUT',
  VOIR_COMME_VENDEUR_FIN: 'VOIR_COMME_VENDEUR_FIN',
  /** Paramètres (Admin 4.16, D-20): one entry per changed setting. */
  MODIFICATION_PARAMETRE: 'MODIFICATION_PARAMETRE',
  /** Paramètres › Localités (D-17). */
  CREATION_LOCALITE: 'CREATION_LOCALITE',
  MODIFICATION_LOCALITE: 'MODIFICATION_LOCALITE',
  /** Paramètres › Géographie and Zones (D-51). */
  MODIFICATION_GOUVERNORAT: 'MODIFICATION_GOUVERNORAT',
  MODIFICATION_DELEGATION: 'MODIFICATION_DELEGATION',
  CREATION_ZONE: 'CREATION_ZONE',
  MODIFICATION_ZONE: 'MODIFICATION_ZONE',
  MODIFICATION_AFFECTATIONS_ZONE: 'MODIFICATION_AFFECTATIONS_ZONE',
  /** Forcer un statut, and a depot scan cancelled after its window (D-56). */
  FORCAGE_STATUT: 'FORCAGE_STATUT',
  ANNULATION_SCAN_ADMIN: 'ANNULATION_SCAN_ADMIN',
  /** A courier absent for a day, and its removal (D-52). */
  MARQUAGE_ABSENCE: 'MARQUAGE_ABSENCE',
  SUPPRESSION_ABSENCE: 'SUPPRESSION_ABSENCE',
  /** Vendeurs (Admin 4.14): shop and contact corrections. */
  MODIFICATION_VENDEUR: 'MODIFICATION_VENDEUR',
  /** Applies to the bons prepared after it (D-34). */
  CHANGEMENT_STATUT_VENDEUR: 'CHANGEMENT_STATUT_VENDEUR',
  /** A different contact person, with his CIN (D-42). */
  CHANGEMENT_CONTACT_VENDEUR: 'CHANGEMENT_CONTACT_VENDEUR',
  SUSPENSION_VENDEUR: 'SUSPENSION_VENDEUR',
  REACTIVATION_VENDEUR: 'REACTIVATION_VENDEUR',
  /** Every upload and every view of a CIN or patente (D-32). */
  AJOUT_DOCUMENT_VENDEUR: 'AJOUT_DOCUMENT_VENDEUR',
  CONSULTATION_DOCUMENT_VENDEUR: 'CONSULTATION_DOCUMENT_VENDEUR',
  // ── Money (phase 8) ──
  /** A courier's caisse closed: attendu, compté, écart (D-79). */
  CLOTURE_CAISSE: 'CLOTURE_CAISSE',
  /** A positive écart checked by the admin, with a note (D-79). */
  VERIFICATION_ECART: 'VERIFICATION_ECART',
  /** A courier debt cancelled by the admin, with a note (Admin rule 5). */
  ANNULATION_DETTE: 'ANNULATION_DETTE',
  /** Annuler le bon (A-5). */
  ANNULATION_BON_VERSEMENT: 'ANNULATION_BON_VERSEMENT',
  /** A livreur's pay plan, applying from the next period (A-16). */
  CHANGEMENT_PLAN_PAIE: 'CHANGEMENT_PLAN_PAIE',
  /** A bon scanned Remis, or a return scanned Retour reçu, by mistake, corrected (D-88). */
  CORRECTION_BON_VERSEMENT: 'CORRECTION_BON_VERSEMENT',
  CORRECTION_BON_RETOUR: 'CORRECTION_BON_RETOUR',
  /** A fiche de paie marked Payée (Admin 4.12). */
  PAIEMENT_FICHE: 'PAIEMENT_FICHE',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export interface AuditActor {
  userId: string;
  role: Role;
}

export interface AuditEntry {
  /** Null for the system (a scheduled job). */
  actor: AuditActor | null;
  action: AuditAction;
  entityType: string;
  entityId: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  reason?: string;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Appends to `audit_log`. Always called with the transaction of the change it
 * records, so an action and its audit entry commit or roll back together.
 * Never pass a password or a hash in `before` / `after`.
 */
@Injectable()
export class AuditService {
  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  async record(tx: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
    await tx.auditLog.create({
      data: {
        actorUserId: entry.actor?.userId ?? null,
        actorRole: entry.actor?.role ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        before: entry.before,
        after: entry.after,
        reason: entry.reason,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
        createdAt: this.clock.now(),
      },
    });
  }
}
