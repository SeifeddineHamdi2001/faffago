import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';

const MIGRATIONS_DIR = join(__dirname, '..', 'prisma', 'migrations');

/**
 * Applies every migration in order, the way `prisma migrate deploy` does.
 *
 * Tests read the migrations rather than pushing the Prisma schema, so what
 * they exercise is exactly what will run on the server: the triggers, the
 * CHECK constraints and the grants, none of which exist in schema.prisma.
 * A new migration is picked up with no change here.
 */
export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => join(MIGRATIONS_DIR, name, 'migration.sql'));
}

export async function applyMigrations(db: PGlite): Promise<void> {
  for (const file of migrationFiles()) {
    // One exec per migration: ALTER TYPE ... ADD VALUE may not be used in the
    // same transaction that adds it, which is also why Prisma keeps them apart.
    await db.exec(readFileSync(file, 'utf8'));
  }
}
