import { randomBytes } from 'node:crypto';
import { PrismaClient, type Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { generatePassword } from '@faffago/shared';

/**
 * Demo accounts, for development only:
 *
 *   pnpm --filter @faffago/api db:seed:demo
 *
 * One seller, one Dépôt and one Service client, a livreur and a ramasseur, so
 * the screens can be tried before seller creation exists (phase 4). Refused
 * when NODE_ENV=production; never called by the normal seed nor by
 * prisma:deploy. Run the normal seed first: the seller is "created by" the
 * first admin.
 *
 * Idempotent. An account that already exists keeps its password; to get a new
 * one, use Régénérer le mot de passe in the back office.
 */

export interface DemoAccount {
  role: Role;
  /** Username, email or phone: what the person types to log in. */
  login: string;
  firstName: string;
  lastName: string;
  phone: string;
}

/** `.test` is a reserved top-level domain: this address can never be real. */
export const DEMO_SELLER_EMAIL = 'vendeur@boutique-demo.test';

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { role: 'DEPOT', login: 'demo.depot', firstName: 'Dépôt', lastName: 'Démo', phone: '50990001' },
  {
    role: 'SERVICE_CLIENT',
    login: 'demo.sc',
    firstName: 'Service client',
    lastName: 'Démo',
    phone: '50990002',
  },
  {
    role: 'VENDEUR',
    login: DEMO_SELLER_EMAIL,
    firstName: 'Vendeur',
    lastName: 'Démo',
    phone: '50990003',
  },
  { role: 'LIVREUR', login: '50990004', firstName: 'Livreur', lastName: 'Démo', phone: '50990004' },
  {
    role: 'RAMASSEUR',
    login: '50990005',
    firstName: 'Ramasseur',
    lastName: 'Démo',
    phone: '50990005',
  },
];

export interface DemoResult {
  role: Role;
  login: string;
  /** Null when the account already existed and was left untouched. */
  password: string | null;
}

export async function seedDemo(
  prisma: PrismaClient,
  options: { nodeEnv: string | undefined },
): Promise<DemoResult[]> {
  if (options.nodeEnv === 'production') {
    throw new Error('db:seed:demo refuse de tourner en production (NODE_ENV=production).');
  }
  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
    orderBy: { createdAt: 'asc' },
  });
  if (!admin) {
    throw new Error("Aucun admin : lancez d'abord `pnpm --filter @faffago/api db:seed`.");
  }

  const results: DemoResult[] = [];
  for (const account of DEMO_ACCOUNTS) {
    const existing = await prisma.user.findUnique({
      where: { phone_role: { phone: account.phone, role: account.role } },
    });
    if (existing) {
      results.push({ role: account.role, login: account.login, password: null });
      continue;
    }

    const password = generatePassword(randomBytes);
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const isStaff = account.role === 'DEPOT' || account.role === 'SERVICE_CLIENT';
    const isCourier = account.role === 'LIVREUR' || account.role === 'RAMASSEUR';

    await prisma.user.create({
      data: {
        role: account.role,
        username: isStaff ? account.login : null,
        email: account.role === 'VENDEUR' ? account.login : null,
        phone: account.phone,
        firstName: account.firstName,
        lastName: account.lastName,
        passwordHash,
        seller:
          account.role === 'VENDEUR'
            ? {
                create: {
                  shopName: 'Boutique Démo',
                  productCategory: 'AUTRE',
                  contactFullName: 'Vendeur Démo',
                  contactPhone: account.phone,
                  statut: 'CIN_UNIQUEMENT',
                  createdByUserId: admin.id,
                },
              }
            : undefined,
        courier: isCourier
          ? {
              create: {
                cin: '00000000',
                vehicle: 'Moto (démo)',
                payPlan: account.role === 'LIVREUR' ? 'HEBDOMADAIRE' : null,
              },
            }
          : undefined,
      },
    });
    results.push({ role: account.role, login: account.login, password });
  }
  return results;
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const results = await seedDemo(prisma, { nodeEnv: process.env.NODE_ENV });
    console.log('\n─────────────────────────────────────────────');
    console.log('  Comptes de démonstration. Mots de passe affichés une seule fois.');
    for (const r of results) {
      const password = r.password ?? '(existe déjà, inchangé)';
      console.log(`  ${r.role.padEnd(15)} ${r.login.padEnd(28)} ${password}`);
    }
    console.log('─────────────────────────────────────────────\n');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
