import 'reflect-metadata';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { seed } from '../../prisma/seed';
import { seedDemo, seedDemoFailures, seedDemoOperations } from '../../prisma/seed-demo';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { applyMigrations } from '../migrations';
import { pgliteAdapter } from '../support/pglite-adapter';

/**
 * The API for the browser tests (D-49): the real NestJS app on PGlite, a
 * fresh database in memory on every start. Every migration is applied and
 * the normal seed runs (geography, localités, settings, the first admin),
 * so the tests start where a new installation starts. The demo data follows
 * (D-50): the back office screens of phase 5 need parcels a ramasseur has
 * picked up, and the ramasseur's app only comes in phase 6.
 *
 * Started by Playwright (apps/web/playwright.config.ts), which passes the
 * port, the secrets and the admin's password in the environment. Never used
 * outside the tests: nothing here is kept.
 */
async function main(): Promise<void> {
  const port = Number.parseInt(process.env.API_PORT ?? '3101', 10);
  const storageDir = mkdtempSync(join(tmpdir(), 'faffago-e2e-documents-'));
  process.env.STORAGE_LOCAL_PATH = storageDir;

  const db = await PGlite.create();
  await applyMigrations(db);
  const prisma = new PrismaClient({ adapter: pgliteAdapter(db) });
  await seed(prisma, {
    log: () => undefined,
    adminUsername: process.env.E2E_ADMIN_USERNAME,
    adminPassword: process.env.E2E_ADMIN_PASSWORD,
  });
  await seedDemo(prisma, { nodeEnv: 'test' });
  await seedDemoOperations(prisma, { nodeEnv: 'test' });
  // Phase 7: two failed deliveries waiting on the demo seller.
  await seedDemoFailures(prisma, { nodeEnv: 'test' });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile();
  const app = moduleRef.createNestApplication({ logger: ['error', 'warn'] });
  configureApp(app);
  await app.listen(port, '127.0.0.1');
  console.log(`API de test (PGlite) sur le port ${port}`);

  const stop = async () => {
    await app.close();
    await prisma.$disconnect();
    await db.close();
    rmSync(storageDir, { recursive: true, force: true });
    process.exit(0);
  };
  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
