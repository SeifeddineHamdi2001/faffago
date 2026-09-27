import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { DocumentCipher } from './document-cipher';
import type { DocumentStorage } from './document-storage';

export interface DocumentCheckReport {
  checked: number;
  /** A row whose file is not there: the document is lost. */
  missing: string[];
  /** A file whose bytes are not the ones recorded. */
  altered: string[];
  /** A file that does not open with its key (only when a cipher is given). */
  unreadable: string[];
  /** A file with no row: left by a write whose transaction failed. */
  orphans: string[];
}

export function isHealthy(report: DocumentCheckReport): boolean {
  return (
    report.missing.length === 0 && report.altered.length === 0 && report.unreadable.length === 0
  );
}

/**
 * Checks every seller document against its file (D-32). Run after a restore:
 * each row must have its file, with the SHA-256 recorded at upload. With the
 * cipher it also opens each file, which proves the key that was restored is
 * the right one. Orphan files are reported, never deleted.
 */
export async function verifyDocuments(
  prisma: PrismaClient,
  storage: DocumentStorage,
  cipher?: DocumentCipher,
): Promise<DocumentCheckReport> {
  const report: DocumentCheckReport = {
    checked: 0,
    missing: [],
    altered: [],
    unreadable: [],
    orphans: [],
  };
  const rows = await prisma.sellerDocument.findMany({ orderBy: { uploadedAt: 'asc' } });
  const known = new Set<string>();

  for (const row of rows) {
    report.checked += 1;
    known.add(row.storageKey);
    let bytes: Buffer;
    try {
      bytes = await storage.get(row.storageKey);
    } catch {
      report.missing.push(row.storageKey);
      continue;
    }
    if (createHash('sha256').update(bytes).digest('hex') !== row.sha256) {
      report.altered.push(row.storageKey);
      continue;
    }
    if (cipher) {
      try {
        cipher.open(
          {
            keyId: row.encryptionKeyId,
            iv: Buffer.from(row.encryptionIv),
            tag: Buffer.from(row.encryptionTag),
            ciphertext: bytes,
          },
          row.storageKey,
        );
      } catch {
        report.unreadable.push(row.storageKey);
      }
    }
  }

  for await (const key of storage.keys()) {
    if (!known.has(key)) report.orphans.push(key);
  }
  return report;
}
