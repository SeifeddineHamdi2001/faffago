import { z } from 'zod';
import { sumMillimes, type BasisPoints, type Millimes } from './money.js';
import { tunisDayKey } from './seller-dashboard.js';

/**
 * Retenue à la source (Vendeur 2.4, 4.11, Admin 4.13, D-89): the certificates
 * the seller downloads and the monthly report for the tax declaration. The
 * amount itself is computed once and stored on every bon (A-3); these rules
 * only place it in time.
 */

/**
 * Which certificates exist: one per bon and a yearly summary per seller.
 * TO CONFIRM by the accountant (D-89): switching one off is this constant.
 */
export const RETENUE_CERTIFICATES = { PAR_BON: true, ANNUEL: true } as const;

/** `RS-2026-0001`: one sequence per year, given at the bon's first Remis (D-89). */
export function formatRetenueCertificateNumber(year: number, sequence: number): string {
  return `RS-${year}-${String(sequence).padStart(4, '0')}`;
}

/** A Tunisian CIN number: 8 digits, leading zeros kept. */
export const cinNumberSchema = z
  .string()
  .trim()
  .regex(/^\d{8}$/, 'Numéro de CIN : 8 chiffres');

/** Paramètres › Société (D-89): printed on every certificate. */
export interface SocieteInfo {
  raisonSociale: string;
  matriculeFiscal: string;
  adresse: string;
}

export function societeComplete(societe: SocieteInfo): boolean {
  return [societe.raisonSociale, societe.matriculeFiscal, societe.adresse].every(
    (value) => value.trim() !== '',
  );
}

export const RetenueRefusal = {
  /** A bon for a CIN uniquement seller whose CIN number is not recorded. */
  CIN_MANQUANT: 'CIN_MANQUANT',
  SOCIETE_INCOMPLETE: 'SOCIETE_INCOMPLETE',
  CERTIFICAT_INTROUVABLE: 'CERTIFICAT_INTROUVABLE',
} as const;
export type RetenueRefusal = (typeof RetenueRefusal)[keyof typeof RetenueRefusal];

export const RETENUE_REFUSAL_MESSAGES_FR: Record<RetenueRefusal, string> = {
  CIN_MANQUANT:
    'Numéro de CIN manquant : ajoutez-le sur la fiche du vendeur avant de préparer son bon (statut CIN uniquement)',
  SOCIETE_INCOMPLETE:
    'Complétez le bloc Société dans Paramètres (raison sociale, matricule fiscal, adresse) avant de générer un certificat',
  CERTIFICAT_INTROUVABLE: 'Certificat introuvable',
};

// ── The month of a retenue ──────────────────────────────────

/** `AAAA-MM` of the Tunis day of an instant. */
export function monthKeyOf(instant: Date): string {
  return tunisDayKey(instant).slice(0, 7);
}

/** `AAAA` of the Tunis day of an instant. */
export function yearKeyOf(instant: Date): string {
  return tunisDayKey(instant).slice(0, 4);
}

export interface RetenueCertificateFacts {
  id: string;
  number: string;
  sellerId: string;
  bonVersementId: string;
  /** The bon's Remis: the payment date. */
  issuedAt: Date;
  /** The bon corrected out of Remis (D-88): the certificate is Annulé. */
  cancelledAt: Date | null;
  baseMillimes: Millimes;
  rateBps: BasisPoints;
  amountMillimes: Millimes;
}

export const RetenueLineKind = {
  RETENUE: 'RETENUE',
  /** A certificate of an earlier period cancelled in this one: taken back here. */
  REGULARISATION: 'REGULARISATION',
} as const;
export type RetenueLineKind = (typeof RetenueLineKind)[keyof typeof RetenueLineKind];

export const RETENUE_LINE_KIND_LABELS_FR: Record<RetenueLineKind, string> = {
  RETENUE: 'Retenue',
  REGULARISATION: 'Régularisation',
};

export type RetenueLine<T extends RetenueCertificateFacts = RetenueCertificateFacts> = T & {
  kind: RetenueLineKind;
  /** When the line happened: the Remis, or the correction for a régularisation. */
  at: Date;
  signedBaseMillimes: Millimes;
  signedAmountMillimes: Millimes;
};

/**
 * The lines of a period (a month `AAAA-MM` or a year `AAAA`, by `keyOf`), as
 * D-89 decides: a certificate counts in the period of its Remis, and stays
 * there even when its bon is corrected later; the correction shows as a
 * régularisation, the amount taken back, in the period it happens. Issued and
 * cancelled within one period, it never counted.
 */
export function retenueLines<T extends RetenueCertificateFacts>(
  certificates: readonly T[],
  period: string,
  keyOf: (instant: Date) => string,
): RetenueLine<T>[] {
  const lines: RetenueLine<T>[] = [];
  for (const certificate of certificates) {
    const issued = keyOf(certificate.issuedAt);
    const cancelled = certificate.cancelledAt ? keyOf(certificate.cancelledAt) : null;
    if (issued === period && cancelled !== period) {
      lines.push({
        ...certificate,
        kind: RetenueLineKind.RETENUE,
        at: certificate.issuedAt,
        signedBaseMillimes: certificate.baseMillimes,
        signedAmountMillimes: certificate.amountMillimes,
      });
    } else if (cancelled === period && issued < period) {
      lines.push({
        ...certificate,
        kind: RetenueLineKind.REGULARISATION,
        at: certificate.cancelledAt!,
        signedBaseMillimes: -certificate.baseMillimes,
        signedAmountMillimes: -certificate.amountMillimes,
      });
    }
  }
  return lines.sort((a, b) => a.at.getTime() - b.at.getTime());
}

export function retenueTotals(lines: readonly RetenueLine[]): {
  count: number;
  baseMillimes: Millimes;
  amountMillimes: Millimes;
} {
  return {
    count: lines.filter((line) => line.kind === RetenueLineKind.RETENUE).length,
    baseMillimes: sumMillimes(lines.map((line) => line.signedBaseMillimes)),
    amountMillimes: sumMillimes(lines.map((line) => line.signedAmountMillimes)),
  };
}
