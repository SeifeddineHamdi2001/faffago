import { randomBytes } from 'node:crypto';
import type { DocumentCounterKind, Prisma } from '@prisma/client';
import {
  BonNumberKind,
  businessDateOf,
  documentDateKey,
  formatBonNumber,
  formatPayslipNumber,
} from '@faffago/shared';

/**
 * The next number of a document for the Tunis day of `now`: BV-, BR- and FP-
 * (Vendeur 4.11, 4.12, D-82). The counter row is taken with an upsert that
 * locks it, inside the caller's transaction, so two documents prepared at the
 * same second never share a number, and a rolled-back one leaves no gap used.
 */
export async function nextDocumentNumber(
  tx: Prisma.TransactionClient,
  kind: DocumentCounterKind,
  now: Date,
): Promise<string> {
  const day = businessDateOf(now);
  const dateKey = documentDateKey(day);
  const rows = await tx.$queryRaw<{ lastValue: number }[]>`
    INSERT INTO "document_counters" ("kind", "dateKey", "lastValue")
    VALUES (${kind}::"DocumentCounterKind", ${dateKey}, 1)
    ON CONFLICT ("kind", "dateKey")
    DO UPDATE SET "lastValue" = "document_counters"."lastValue" + 1
    RETURNING "lastValue"`;
  const sequence = rows[0]!.lastValue;
  switch (kind) {
    case 'BON_VERSEMENT':
      return formatBonNumber(BonNumberKind.BON_VERSEMENT, day, sequence);
    case 'BON_RETOUR':
      return formatBonNumber(BonNumberKind.BON_RETOUR, day, sequence);
    case 'FICHE_PAIE':
      return formatPayslipNumber(day, sequence);
    default:
      throw new Error(`Pas de numérotation pour ${kind}`);
  }
}

/** 128 random bits for a bon's QR (D-80). */
export function newBonToken(): string {
  return randomBytes(16).toString('hex');
}

/** A `AAAA-MM-JJ` key as the date column Prisma reads and writes. */
export function dateColumn(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00.000Z`);
}
