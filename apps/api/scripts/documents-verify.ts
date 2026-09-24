import { PrismaClient } from '@prisma/client';
import { cipherFromEnv } from '../src/storage/document-cipher';
import { LocalDiskStorage } from '../src/storage/document-storage';
import { isHealthy, verifyDocuments } from '../src/storage/verify-documents';

/**
 * Checks the seller documents against their files (D-32), on the server and
 * above all after a restore:
 *
 *   pnpm --filter @faffago/api documents:verify            files and checksums
 *   pnpm --filter @faffago/api documents:verify --decrypt  also opens each file
 *
 * `--decrypt` needs STORAGE_ENCRYPTION_KEY: it proves the key kept offline is
 * the one the files were encrypted with. Nothing is ever printed but storage
 * keys, and nothing is deleted. Exits 1 when a document is missing, altered
 * or unreadable.
 */

try {
  process.loadEnvFile('../../.env');
} catch {
  // No .env: the variables come from the environment.
}

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const root = process.env.STORAGE_LOCAL_PATH;
  if (!root) throw new Error('STORAGE_LOCAL_PATH doit être défini (voir .env.example).');
  const decrypt = process.argv.includes('--decrypt');
  const cipher = decrypt ? cipherFromEnv((name) => process.env[name]) : undefined;

  const report = await verifyDocuments(prisma, new LocalDiskStorage(root), cipher);
  console.log(`Documents vérifiés : ${report.checked}${decrypt ? ' (déchiffrés)' : ''}`);
  const sections: [string, string[]][] = [
    ['Fichier manquant', report.missing],
    ['Fichier modifié (somme SHA-256 différente)', report.altered],
    ['Fichier illisible avec la clé', report.unreadable],
    ['Fichier sans document (orphelin, conservé)', report.orphans],
  ];
  for (const [title, keys] of sections) {
    if (keys.length === 0) continue;
    console.log(`\n${title} : ${keys.length}`);
    for (const key of keys) console.log(`  ${key}`);
  }
  if (!isHealthy(report)) process.exitCode = 1;
  else console.log('Aucun document manquant, modifié ou illisible.');
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
