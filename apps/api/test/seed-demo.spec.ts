import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { seed } from '../prisma/seed';
import {
  DEMO_ACCOUNTS,
  DEMO_PARCELS,
  demoParcelRequestId,
  seedDemo,
  seedDemoOperations,
  seedDemoFailures,
  demoFailureRequestId,
  DEMO_FAILURES,
} from '../prisma/seed-demo';
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

describe('seedDemoOperations: work for the back office screens (D-50)', () => {
  let full: PGlite;
  let client: PrismaClient;

  beforeAll(async () => {
    full = await PGlite.create();
    await applyMigrations(full);
    client = new PrismaClient({ adapter: pgliteAdapter(full) });
    await seed(client, { log: () => undefined, adminPassword: 'x-Mot-De-Passe-Admin-42' });
    await seedDemo(client, { nodeEnv: 'development' });
  });
  afterAll(async () => {
    await client.$disconnect();
    await full.close();
  });

  it('refuses to run when NODE_ENV is production', async () => {
    await expect(seedDemoOperations(client, { nodeEnv: 'production' })).rejects.toThrow(
      /production/,
    );
    expect(await client.parcel.count()).toBe(0);
  });

  it('assigns the demo couriers to zones, picks up ten parcels and asks one pickup', async () => {
    const result = await seedDemoOperations(client, { nodeEnv: 'development' });

    expect(result).toEqual({ assignments: 6, parcels: DEMO_PARCELS.length, pickups: 1 });
    const parcels = await client.parcel.findMany({ include: { events: true } });
    expect(parcels).toHaveLength(10);
    for (const parcel of parcels) {
      expect(parcel).toMatchObject({ status: 'RAMASSE', location: 'AVEC_LE_RAMASSEUR' });
      expect(parcel.pickedUpAt).not.toBeNull();
      // Created by the seller, picked up by a ramasseur: one event per step (D-21).
      expect(parcel.events.map((e) => [e.type, e.actorRole]).sort()).toEqual([
        ['CREATION', 'VENDEUR'],
        ['RAMASSAGE', 'RAMASSEUR'],
      ]);
    }
    // Several zones, one of them with no demo courier (Sans coursier in Tournées).
    const delegations = new Set(parcels.map((p) => p.delegationId));
    expect(delegations.size).toBe(4);

    const livreur = await client.user.findUniqueOrThrow({
      where: { phone_role: { phone: '50990004', role: 'LIVREUR' } },
      include: { courier: { include: { zoneAssignments: true } } },
    });
    expect(livreur.courier!.zoneAssignments).toEqual([
      expect.objectContaining({ role: 'LIVREUR', kind: 'TITULAIRE' }),
    ]);
    const pickup = await client.pickup.findFirstOrThrow();
    expect(pickup).toMatchObject({ status: 'DEMANDE', declaredCount: 3, requestedSlot: 'MATIN' });
  });

  it('adds nothing the second time, and keeps an assignment the admin changed', async () => {
    const marsa = await client.delegation.findUniqueOrThrow({ where: { code: 'TUN-MARSA' } });
    await client.zoneAssignment.deleteMany({
      where: { zoneId: marsa.zoneId!, role: 'LIVREUR' },
    });
    const other = await client.user.findUniqueOrThrow({
      where: { phone_role: { phone: '50990007', role: 'LIVREUR' } },
      include: { courier: true },
    });
    await client.zoneAssignment.create({
      data: {
        zoneId: marsa.zoneId!,
        courierId: other.courier!.id,
        role: 'LIVREUR',
        kind: 'TITULAIRE',
      },
    });

    const again = await seedDemoOperations(client, { nodeEnv: 'development' });

    expect(again).toEqual({ assignments: 0, parcels: 0, pickups: 0 });
    expect(await client.parcel.count()).toBe(10);
    expect(
      await client.parcel.findUnique({ where: { clientRequestId: demoParcelRequestId(0) } }),
    ).not.toBeNull();
    const slot = await client.zoneAssignment.findUniqueOrThrow({
      where: {
        zoneId_role_kind: { zoneId: marsa.zoneId!, role: 'LIVREUR', kind: 'TITULAIRE' },
      },
    });
    expect(slot.courierId).toBe(other.courier!.id);
  });

  it('adds two failed deliveries for À vérifier, one back at the depot under 24 hours (phase 7)', async () => {
    const now = new Date('2026-09-25T08:00:00.000Z');
    await expect(seedDemoFailures(client, { nodeEnv: 'production', now })).rejects.toThrow(
      /production/,
    );

    expect(await seedDemoFailures(client, { nodeEnv: 'development', now })).toBe(2);

    const failed = (i: number) =>
      client.parcel.findUniqueOrThrow({
        where: { clientRequestId: demoFailureRequestId(i) },
        include: { events: { orderBy: { sequence: 'asc' } } },
      });
    const withLivreur = await failed(0);
    const atDepot = await failed(1);
    expect(withLivreur).toMatchObject({
      status: 'A_VERIFIER',
      location: 'AVEC_LE_LIVREUR',
      attemptCount: 1,
      lastFailureReason: DEMO_FAILURES[0]!.reason,
      lastFailureNote: DEMO_FAILURES[0]!.note,
    });
    expect(withLivreur.verifyDeadlineAt?.toISOString()).toBe('2026-09-27T06:00:00.000Z');
    expect(atDepot).toMatchObject({ status: 'A_VERIFIER', location: 'AU_DEPOT' });
    expect(atDepot.verifyDeadlineAt!.getTime() - now.getTime()).toBe(8 * 3_600_000);
    expect(atDepot.events.map((e) => e.type)).toEqual([
      'CREATION',
      'RAMASSAGE',
      'ENTREE_DEPOT',
      'SORTIE_COURSIER',
      'ECHEC_LIVRAISON',
      'RETOUR_DE_TOURNEE',
    ]);

    expect(await seedDemoFailures(client, { nodeEnv: 'development', now })).toBe(0);
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
