import { randomBytes } from 'node:crypto';
import { PrismaClient, type Role } from '@prisma/client';
import * as argon2 from 'argon2';
import {
  ParcelAction,
  ParcelEventType,
  ParcelLocation,
  ParcelStatus,
  Role as SharedRole,
  applyParcelAction,
  generateParcelCode,
  generatePassword,
  parcelWriteFor,
  readPlatformSettings,
  type ParcelSnapshot,
} from '@faffago/shared';

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
 *
 * Then, once the normal seed has put the geography in place, some work for
 * the back office screens (phase 5, D-50): the demo livreurs and ramasseurs
 * assigned to zones, about ten demo parcels picked up (Ramassé) across
 * several zones, and one pickup request to plan.
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
  // Phase 5: enough couriers to fill Tournées and pickups (D-50).
  {
    role: 'LIVREUR',
    login: '50990006',
    firstName: 'Livreur Deux',
    lastName: 'Démo',
    phone: '50990006',
  },
  {
    role: 'LIVREUR',
    login: '50990007',
    firstName: 'Livreur Trois',
    lastName: 'Démo',
    phone: '50990007',
  },
  {
    role: 'RAMASSEUR',
    login: '50990008',
    firstName: 'Ramasseur Deux',
    lastName: 'Démo',
    phone: '50990008',
  },
];

/**
 * Which demo couriers cover which zone, by one délégation of the zone. Ben
 * Arous Côte is left without a courier on purpose: Tournées shows it as
 * "Sans coursier".
 */
export const DEMO_ZONES: ReadonlyArray<{ delegation: string; livreur: string; ramasseur: string }> =
  [
    { delegation: 'TUN-MARSA', livreur: '50990004', ramasseur: '50990005' },
    { delegation: 'TUN-BARDO', livreur: '50990006', ramasseur: '50990005' },
    { delegation: 'ARI-VILLE', livreur: '50990007', ramasseur: '50990008' },
  ];

/** Ten demo parcels, found again by their request id so a second run adds nothing. */
export const DEMO_PARCELS: ReadonlyArray<{
  delegation: string;
  recipientName: string;
  recipientPhone: string;
  address: string;
  codMillimes: bigint;
}> = [
  {
    delegation: 'TUN-MARSA',
    recipientName: 'Amira Démo',
    recipientPhone: '22100001',
    address: '12 rue de la Plage',
    codMillimes: 45000n,
  },
  {
    delegation: 'TUN-MARSA',
    recipientName: 'Sami Démo',
    recipientPhone: '22100002',
    address: '3 avenue Taïeb Mhiri',
    codMillimes: 60000n,
  },
  {
    delegation: 'TUN-MARSA',
    recipientName: 'Leïla Démo',
    recipientPhone: '22100003',
    address: '8 rue du Maroc',
    codMillimes: 32500n,
  },
  {
    delegation: 'TUN-BARDO',
    recipientName: 'Karim Démo',
    recipientPhone: '22100004',
    address: '5 rue de Rome',
    codMillimes: 85000n,
  },
  {
    delegation: 'TUN-BARDO',
    recipientName: 'Hela Démo',
    recipientPhone: '22100005',
    address: '21 avenue Habib Bourguiba',
    codMillimes: 27000n,
  },
  {
    delegation: 'TUN-BARDO',
    recipientName: 'Nizar Démo',
    recipientPhone: '22100006',
    address: '2 impasse des Jasmins',
    codMillimes: 54000n,
  },
  {
    delegation: 'ARI-VILLE',
    recipientName: 'Yasmine Démo',
    recipientPhone: '22100007',
    address: '14 rue Ibn Khaldoun',
    codMillimes: 39900n,
  },
  {
    delegation: 'ARI-VILLE',
    recipientName: 'Walid Démo',
    recipientPhone: '22100008',
    address: '9 cité Ennasr',
    codMillimes: 120000n,
  },
  {
    delegation: 'BEN-EZZAHRA',
    recipientName: 'Sonia Démo',
    recipientPhone: '22100009',
    address: '17 rue de la Gare',
    codMillimes: 48000n,
  },
  {
    delegation: 'BEN-EZZAHRA',
    recipientName: 'Omar Démo',
    recipientPhone: '22100010',
    address: '4 rue des Oliviers',
    codMillimes: 75000n,
  },
];

/** `d0000000-0000-4000-8000-00000000000n`: a request id per demo parcel. */
export function demoParcelRequestId(index: number): string {
  return `d0000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
}
const DEMO_PICKUP_REQUEST_ID = 'd0000000-0000-4000-8000-0000000000aa';

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
    const work = await seedDemoOperations(prisma, { nodeEnv: process.env.NODE_ENV });
    console.log('\n─────────────────────────────────────────────');
    console.log('  Comptes de démonstration. Mots de passe affichés une seule fois.');
    for (const r of results) {
      const password = r.password ?? '(existe déjà, inchangé)';
      console.log(`  ${r.role.padEnd(15)} ${r.login.padEnd(28)} ${password}`);
    }
    console.log(
      `  Affectations de zone : ${work.assignments} · colis ramassés : ${work.parcels} · demandes de ramassage : ${work.pickups}`,
    );
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

export interface DemoOperationsResult {
  assignments: number;
  parcels: number;
  pickups: number;
}

/**
 * The work of phase 5's screens (D-50), development only: zone assignments
 * for the demo couriers where the slot is empty, the demo parcels created by
 * the demo seller and picked up by a demo ramasseur — through the shared
 * state machine, one event per step, as the ramasseur's scan will write them
 * in phase 6 — and one pickup request to plan. Needs the normal seed (the
 * geography) and the demo accounts.
 */
export async function seedDemoOperations(
  prisma: PrismaClient,
  options: { nodeEnv: string | undefined; now?: Date },
): Promise<DemoOperationsResult> {
  if (options.nodeEnv === 'production') {
    throw new Error('db:seed:demo refuse de tourner en production (NODE_ENV=production).');
  }
  const now = options.now ?? new Date();
  const result: DemoOperationsResult = { assignments: 0, parcels: 0, pickups: 0 };

  const courierOf = async (phone: string, role: Role) => {
    const user = await prisma.user.findUnique({
      where: { phone_role: { phone, role } },
      include: { courier: true },
    });
    if (!user?.courier) throw new Error(`Compte de démonstration absent : ${phone}.`);
    return { userId: user.id, courierId: user.courier.id };
  };
  const delegationOf = async (code: string) => {
    const delegation = await prisma.delegation.findUnique({ where: { code } });
    if (!delegation) {
      throw new Error("Géographie absente : lancez d'abord `pnpm --filter @faffago/api db:seed`.");
    }
    return delegation;
  };

  // Zones: titulars where nobody is set yet.
  for (const zone of DEMO_ZONES) {
    const delegation = await delegationOf(zone.delegation);
    if (!delegation.zoneId) continue;
    for (const [role, phone] of [
      ['LIVREUR', zone.livreur],
      ['RAMASSEUR', zone.ramasseur],
    ] as const) {
      const taken = await prisma.zoneAssignment.findUnique({
        where: { zoneId_role_kind: { zoneId: delegation.zoneId, role, kind: 'TITULAIRE' } },
      });
      if (taken) continue;
      const courier = await courierOf(phone, role);
      await prisma.zoneAssignment.create({
        data: { zoneId: delegation.zoneId, courierId: courier.courierId, role, kind: 'TITULAIRE' },
      });
      result.assignments += 1;
    }
  }

  const seller = await prisma.seller.findFirst({
    where: { user: { email: DEMO_SELLER_EMAIL } },
    include: { user: true },
  });
  if (!seller) throw new Error('Vendeur de démonstration absent : lancez seedDemo avant.');
  const { settings } = readPlatformSettings(
    Object.fromEntries((await prisma.setting.findMany()).map((row) => [row.key, row.value])),
  );

  // Parcels: created by the demo seller, picked up by the zone's demo ramasseur.
  for (const [index, demo] of DEMO_PARCELS.entries()) {
    const clientRequestId = demoParcelRequestId(index);
    if (await prisma.parcel.findUnique({ where: { clientRequestId } })) continue;
    const delegation = await delegationOf(demo.delegation);
    const localite = await prisma.localite.findFirstOrThrow({
      where: { delegationId: delegation.id, isOther: false, isActive: true },
      orderBy: { nameFr: 'asc' },
    });
    const ramasseurPhone =
      DEMO_ZONES.find((z) => z.delegation === demo.delegation)?.ramasseur ?? '50990005';
    const ramasseur = await courierOf(ramasseurPhone, 'RAMASSEUR');

    await prisma.$transaction(async (tx) => {
      const parcel = await tx.parcel.create({
        data: {
          code: generateParcelCode(randomBytes),
          sellerId: seller.id,
          recipientName: demo.recipientName,
          recipientPhone: demo.recipientPhone,
          delegationId: delegation.id,
          localiteId: localite.id,
          address: demo.address,
          productDescription: 'Article de démonstration',
          codAmountMillimes: demo.codMillimes,
          deliveryFeeMillimes: settings.deliveryFeeMillimes,
          returnFeeMillimes: settings.returnFeeMillimes,
          changeClientFeeMillimes: settings.changeClientFeeMillimes,
          createdByUserId: seller.userId,
          clientRequestId,
        },
      });
      await tx.parcelEvent.create({
        data: {
          parcelId: parcel.id,
          type: ParcelEventType.CREATION,
          newStatus: ParcelStatus.CREE,
          newLocation: ParcelLocation.CHEZ_LE_VENDEUR,
          actorUserId: seller.userId,
          actorRole: 'VENDEUR',
          serverTime: now,
        },
      });

      const snapshot: ParcelSnapshot = {
        status: parcel.status,
        location: parcel.location,
        cashStatus: parcel.cashStatus,
        attemptCount: parcel.attemptCount,
        changeClientCount: parcel.changeClientCount,
        currentLivreurId: parcel.currentLivreurId,
        isExchange: parcel.isExchange,
        relaunchDate: parcel.relaunchDate,
        relaunchOrigin: parcel.relaunchOrigin,
        relaunchSlot: parcel.relaunchSlot,
      };
      const transition = applyParcelAction(snapshot, {
        action: ParcelAction.SCAN_RAMASSAGE,
        actor: SharedRole.RAMASSEUR,
        actorCourierId: ramasseur.courierId,
        maxAttempts: settings.maxDeliveryAttempts,
        maxClientChanges: settings.maxClientChangesPerParcel,
      });
      if (!transition.ok) throw new Error(`Ramassage refusé : ${transition.message}`);
      const write = parcelWriteFor(transition, {
        now,
        verifyDeadlineHours: settings.verifyDeadlineHours,
        courierRatePerParcelMillimes: settings.courierRatePerParcelMillimes,
        fees: {
          deliveryFeeMillimes: parcel.deliveryFeeMillimes,
          returnFeeMillimes: parcel.returnFeeMillimes,
          changeClientFeeMillimes: parcel.changeClientFeeMillimes,
        },
        failureReason: null,
        failureNote: null,
      });
      await tx.parcel.update({ where: { id: parcel.id }, data: write.columns });
      for (const step of transition.events) {
        await tx.parcelEvent.create({
          data: {
            parcelId: parcel.id,
            type: step.type,
            previousStatus: step.previousStatus,
            newStatus: step.newStatus,
            previousLocation: step.previousLocation,
            newLocation: step.newLocation,
            actorUserId: ramasseur.userId,
            actorRole: 'RAMASSEUR',
            serverTime: now,
          },
        });
      }
    });
    result.parcels += 1;
  }

  // One pickup request to plan, at a demo address.
  if (!(await prisma.pickup.findUnique({ where: { clientRequestId: DEMO_PICKUP_REQUEST_ID } }))) {
    const delegation = await delegationOf('TUN-MARSA');
    const localite = await prisma.localite.findFirstOrThrow({
      where: { delegationId: delegation.id, isOther: false, isActive: true },
      orderBy: { nameFr: 'asc' },
    });
    const address = await prisma.pickupAddress.create({
      data: {
        sellerId: seller.id,
        delegationId: delegation.id,
        localiteId: localite.id,
        address: 'Entrepôt Boutique Démo, 1 rue du Lac',
        isDefault: !(await prisma.pickupAddress.findFirst({ where: { sellerId: seller.id } })),
      },
    });
    await prisma.pickup.create({
      data: {
        sellerId: seller.id,
        pickupAddressId: address.id,
        declaredCount: 3,
        requestedSlot: 'MATIN',
        note: 'Demande de démonstration',
        clientRequestId: DEMO_PICKUP_REQUEST_ID,
      },
    });
    result.pickups += 1;
  }

  return result;
}
