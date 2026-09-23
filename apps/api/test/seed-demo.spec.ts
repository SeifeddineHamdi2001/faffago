import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { DEMO_ACCOUNTS, seedDemo } from '../prisma/seed-demo';
import { pgliteAdapter } from './support/pglite-adapter';
import { applyMigrations } from './migrations';

/**
 * db:seed:demo — demo accounts to try the screens before seller creation
 * exists (phase 4). Never in production, never by the normal seed.
 */

let db: PGlite;
let prisma: PrismaClient;

beforeAll(async () => {
  db = await PGlite.create();
  await applyMigrations(db);
  const adapter = pgliteAdapter(db);
  prisma = new PrismaClient({ adapter });
  await prisma.user.create({
    data: {
      role: 'ADMIN',
      username: 'admin',
      phone: '20000000',
      passwordHash: 'x',
      firstName: 'Admin',
      lastName: 'Faffa Go',
    },
  });
});
afterAll(async () => {
  await prisma.$disconnect();
  await db.close();
});

describe('seedDemo', () => {
  it('refuses to run when NODE_ENV is production, and writes nothing', async () => {
    await expect(seedDemo(prisma, { nodeEnv: 'production' })).rejects.toThrow(/production/);
    expect(await prisma.user.count()).toBe(1);
  });

  it('creates clearly named demo accounts and returns their passwords once', async () => {
    const created = await seedDemo(prisma, { nodeEnv: 'development' });

    expect(created.map((a) => a.login).sort()).toEqual(DEMO_ACCOUNTS.map((a) => a.login).sort());
    const seller = await prisma.seller.findFirstOrThrow({ include: { user: true } });
    expect(seller.shopName).toBe('Boutique Démo');

    for (const account of created) {
      expect(account.password).toEqual(expect.any(String));
      const user = await prisma.user.findFirstOrThrow({
        where: {
          OR: [{ username: account.login }, { email: account.login }, { phone: account.login }],
          role: account.role,
        },
      });
      expect(`${user.firstName} ${user.lastName}`).toContain('Démo');
      expect(await argon2.verify(user.passwordHash, account.password!)).toBe(true);
    }
    expect(await prisma.user.findFirst({ where: { username: 'demo.depot' } })).not.toBeNull();
    expect(await prisma.user.findFirst({ where: { username: 'demo.sc' } })).not.toBeNull();
  });

  it('is idempotent and never changes an existing password', async () => {
    const before = await prisma.user.findFirstOrThrow({ where: { username: 'demo.depot' } });
    const second = await seedDemo(prisma, { nodeEnv: 'development' });

    expect(second.every((a) => a.password === null)).toBe(true);
    const after = await prisma.user.findFirstOrThrow({ where: { username: 'demo.depot' } });
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(await prisma.seller.count()).toBe(1);
  });

  it('needs the first admin from the normal seed', async () => {
    const empty = await PGlite.create();
    await applyMigrations(empty);
    const adapter = pgliteAdapter(empty);
    const client = new PrismaClient({ adapter });
    await expect(seedDemo(client, { nodeEnv: 'development' })).rejects.toThrow(/db:seed/);
    await client.$disconnect();
    await empty.close();
  });
});

describe('never run by the normal seed or by prisma:deploy', () => {
  const apiRoot = join(__dirname, '..');

  it('is not imported by the normal seed', () => {
    const seed = readFileSync(join(apiRoot, 'prisma', 'seed.ts'), 'utf8');
    expect(seed).not.toMatch(/seed-demo/);
  });

  it('is not the Prisma seed, nor part of prisma:deploy', () => {
    const pkg = JSON.parse(readFileSync(join(apiRoot, 'package.json'), 'utf8'));
    expect(pkg.prisma.seed).not.toMatch(/seed-demo/);
    expect(pkg.scripts['prisma:deploy']).not.toMatch(/seed/);
    expect(pkg.scripts['db:seed']).not.toMatch(/seed-demo/);
    expect(pkg.scripts['db:seed:demo']).toMatch(/seed-demo/);
  });
});
