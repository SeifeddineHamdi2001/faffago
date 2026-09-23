import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient, Role, type Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { defaultSettingValues, generatePassword } from '@faffago/shared';

/**
 * Seed: the geography of Grand Tunis and its localités, the initial zones, the
 * platform settings and one admin.
 *
 * Idempotent — running it twice changes nothing — so it is safe to run after
 * every migration. It never undoes the admin's work: localités, zones and
 * settings are only ever created, never overwritten (D-17, D-19, D-20).
 */

/**
 * The four gouvernorats of Grand Tunis and their 48 délégations, as approved in
 * docs/geo-review.md (D-19). The codes are ours, not INS codes, and never
 * change.
 *
 * Names are upserted by code, so a correction here replaces the old spelling in
 * place. When the admin screen for délégations arrives (phase 5), this becomes
 * create-only, like the rest (D-19).
 *
 * The Arabic names have not yet been read by a native speaker; the public site
 * shows them to customers.
 */
export const GRAND_TUNIS: ReadonlyArray<{
  code: string;
  nameFr: string;
  nameAr: string;
  delegations: ReadonlyArray<readonly [code: string, nameFr: string, nameAr: string]>;
}> = [
  {
    code: 'TUN',
    nameFr: 'Tunis',
    nameAr: 'تونس',
    delegations: [
      ['TUN-BABBHAR', 'Bab El Bhar', 'باب بحر'],
      ['TUN-BABSOUIKA', 'Bab Souika', 'باب سويقة'],
      ['TUN-CARTHAGE', 'Carthage', 'قرطاج'],
      ['TUN-ELKHADRA', 'Cité El Khadra', 'حي الخضراء'],
      ['TUN-JEBELJELLOUD', 'Djebel Jelloud', 'جبل الجلود'],
      ['TUN-HRAIRIA', 'El Hrairia', 'الحرايرية'],
      ['TUN-KABARIA', 'El Kabaria', 'الكبارية'],
      ['TUN-MENZAH', 'El Menzah', 'المنزه'],
      ['TUN-OMRANE', 'El Omrane', 'العمران'],
      ['TUN-OMRANESUP', 'El Omrane Supérieur', 'العمران الأعلى'],
      ['TUN-OUARDIA', 'El Ouardia', 'الوردية'],
      ['TUN-SIJOUMI', 'Séjoumi', 'السيجومي'],
      ['TUN-TAHRIR', 'Ettahrir', 'التحرير'],
      ['TUN-ZOUHOUR', 'Ezzouhour', 'الزهور'],
      ['TUN-GOULETTE', 'La Goulette', 'حلق الوادي'],
      ['TUN-MARSA', 'La Marsa', 'المرسى'],
      ['TUN-BARDO', 'Le Bardo', 'باردو'],
      ['TUN-KRAM', 'Le Kram', 'الكرم'],
      ['TUN-MEDINA', 'La Médina', 'المدينة'],
      ['TUN-SIDIBECHIR', 'Sidi El Béchir', 'سيدي البشير'],
      ['TUN-SIDIHASSINE', 'Sidi Hassine', 'سيدي حسين'],
    ],
  },
  {
    code: 'ARI',
    nameFr: 'Ariana',
    nameAr: 'أريانة',
    delegations: [
      ['ARI-VILLE', 'Ariana Ville', 'أريانة المدينة'],
      ['ARI-TADHAMEN', 'Cité Ettadhamen', 'حي التضامن'],
      ['ARI-KALAAT', 'Kalâat el-Andalous', 'قلعة الأندلس'],
      ['ARI-SOUKRA', 'La Soukra', 'سكرة'],
      ['ARI-MNIHLA', 'Mnihla', 'المنيهلة'],
      ['ARI-RAOUED', 'Raoued', 'رواد'],
      ['ARI-SIDITHABET', 'Sidi Thabet', 'سيدي ثابت'],
    ],
  },
  {
    code: 'BEN',
    nameFr: 'Ben Arous',
    nameAr: 'بن عروس',
    delegations: [
      ['BEN-VILLE', 'Ben Arous', 'بن عروس'],
      ['BEN-BOUMHEL', 'Bou Mhel el-Bassatine', 'بومهل البساتين'],
      ['BEN-MOUROUJ', 'El Mourouj', 'المروج'],
      ['BEN-EZZAHRA', 'Ezzahra', 'الزهراء'],
      ['BEN-FOUCHANA', 'Fouchana', 'فوشانة'],
      ['BEN-HAMMAMCHOTT', 'Hammam Chott', 'حمام الشط'],
      ['BEN-HAMMAMLIF', 'Hammam Lif', 'حمام الأنف'],
      ['BEN-MEGRINE', 'Mégrine', 'مقرين'],
      ['BEN-MOHAMEDIA', 'Mohamedia', 'المحمدية'],
      ['BEN-MORNAG', 'Mornag', 'مرناق'],
      ['BEN-MEDINAJEDIDA', 'La Nouvelle Médina', 'المدينة الجديدة'],
      ['BEN-RADES', 'Radès', 'رادس'],
    ],
  },
  {
    code: 'MAN',
    nameFr: 'Manouba',
    nameAr: 'منوبة',
    // Den Den is a localité of La Manouba, not a délégation (D-19).
    delegations: [
      ['MAN-BORJAMRI', 'Borj El Amri', 'برج العامري'],
      ['MAN-DJEDEIDA', 'Djedeida', 'الجديدة'],
      ['MAN-DOUARHICHER', 'Douar Hicher', 'دوار هيشر'],
      ['MAN-BATTAN', 'El Battan', 'البطان'],
      ['MAN-VILLE', 'La Manouba', 'منوبة'],
      ['MAN-MORNAGUIA', 'Mornaguia', 'المرناقية'],
      ['MAN-OUEDELLIL', 'Oued Ellil', 'وادي الليل'],
      ['MAN-TEBOURBA', 'Tebourba', 'طبربة'],
    ],
  },
];

/** Created by the first seed, removed by D-19. */
const RETIRED_DELEGATIONS = ['MAN-DENDEN'];

/**
 * The 15 zones approved in docs/geo-review.md (D-19): small, reassigned rather
 * than redrawn as the team grows. No courier: the admin assigns them.
 */
export const INITIAL_ZONES: ReadonlyArray<{ name: string; delegations: readonly string[] }> = [
  {
    name: 'Tunis Centre',
    delegations: ['TUN-MEDINA', 'TUN-BABBHAR', 'TUN-BABSOUIKA', 'TUN-SIDIBECHIR'],
  },
  {
    name: 'Banlieue Nord',
    delegations: ['TUN-GOULETTE', 'TUN-KRAM', 'TUN-CARTHAGE', 'TUN-MARSA'],
  },
  {
    name: 'Tunis Nord',
    delegations: ['TUN-MENZAH', 'TUN-ELKHADRA', 'TUN-OMRANE', 'TUN-OMRANESUP'],
  },
  { name: 'Tunis Ouest', delegations: ['TUN-BARDO', 'TUN-TAHRIR', 'TUN-ZOUHOUR'] },
  { name: 'Tunis Sud-Ouest', delegations: ['TUN-SIJOUMI', 'TUN-HRAIRIA', 'TUN-SIDIHASSINE'] },
  { name: 'Tunis Sud', delegations: ['TUN-OUARDIA', 'TUN-KABARIA', 'TUN-JEBELJELLOUD'] },
  { name: 'Ariana Centre', delegations: ['ARI-VILLE', 'ARI-SOUKRA'] },
  {
    name: 'Ettadhamen – Douar Hicher',
    delegations: ['ARI-TADHAMEN', 'ARI-MNIHLA', 'MAN-DOUARHICHER'],
  },
  { name: 'Ariana Nord', delegations: ['ARI-RAOUED', 'ARI-KALAAT', 'ARI-SIDITHABET'] },
  {
    name: 'Ben Arous Centre',
    delegations: ['BEN-VILLE', 'BEN-MEDINAJEDIDA', 'BEN-MEGRINE', 'BEN-RADES'],
  },
  { name: 'El Mourouj', delegations: ['BEN-MOUROUJ', 'BEN-BOUMHEL'] },
  { name: 'Ben Arous Côte', delegations: ['BEN-EZZAHRA', 'BEN-HAMMAMLIF', 'BEN-HAMMAMCHOTT'] },
  { name: 'Ben Arous Sud', delegations: ['BEN-FOUCHANA', 'BEN-MOHAMEDIA', 'BEN-MORNAG'] },
  { name: 'Manouba Est', delegations: ['MAN-VILLE', 'MAN-OUEDELLIL'] },
  {
    name: 'Manouba Ouest',
    delegations: ['MAN-MORNAGUIA', 'MAN-BORJAMRI', 'MAN-DJEDEIDA', 'MAN-TEBOURBA', 'MAN-BATTAN'],
  },
];

export const LOCALITES_CSV_PATH = join(__dirname, 'data', 'localites-grand-tunis.csv');

const LOCALITES_CSV_HEADER = [
  'gouvernorat',
  'delegation_code',
  'localite_fr',
  'localite_ar',
  'code_postal',
  'alias',
  'nom_ambigu',
  'a_verifier',
] as const;

export interface LocaliteSeedRow {
  delegationCode: string;
  nameFr: string;
  nameAr: string | null;
  postalCode: string | null;
  aliases: string[];
  isOther: boolean;
  /** Délégation code + French name: how the seed recognises a row it created. */
  sourceKey: string;
}

/**
 * Reads localites-grand-tunis.csv (D-17). The file has no quoted fields; a
 * line with the wrong number of columns stops the seed rather than importing
 * half of it. `nom_ambigu` is not read: ambiguity is computed from the names.
 */
export function parseLocalitesCsv(text: string): LocaliteSeedRow[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines[0] !== LOCALITES_CSV_HEADER.join(',')) {
    throw new Error(`Fichier des localités : en-tête inattendu « ${lines[0] ?? ''} »`);
  }

  const rows: LocaliteSeedRow[] = [];
  lines.slice(1).forEach((line, index) => {
    if (line.trim() === '') return;
    const cells = line.split(',');
    if (cells.length !== LOCALITES_CSV_HEADER.length) {
      throw new Error(
        `Fichier des localités, ligne ${index + 2} : ${cells.length} colonnes au lieu de ` +
          `${LOCALITES_CSV_HEADER.length}`,
      );
    }
    const [, delegationCode, nameFr, nameAr, postalCodes, aliases] = cells.map((cell) =>
      cell.trim(),
    ) as [string, string, string, string, string, string];
    const [postalCode, ...otherPostalCodes] = postalCodes.split('|').filter(Boolean);
    rows.push({
      delegationCode,
      nameFr,
      nameAr: nameAr || null,
      postalCode: postalCode ?? null,
      aliases: [...aliases.split('|').filter(Boolean), ...otherPostalCodes],
      isOther: nameFr === 'Autre',
      sourceKey: `${delegationCode}|${nameFr}`,
    });
  });
  return rows;
}

export interface SeedOptions {
  log?: (message: string) => void;
  adminUsername?: string;
  /** Empty means "generate one" (.env.example ships it empty). */
  adminPassword?: string;
  adminPhone?: string;
  localitesCsv?: string;
}

export interface SeedResult {
  /** Shown once, when the first admin is created; null otherwise. */
  adminPassword: string | null;
  adminUsername: string;
}

async function seedGeography(prisma: PrismaClient, log: (m: string) => void): Promise<void> {
  for (const gouvernorat of GRAND_TUNIS) {
    const row = await prisma.gouvernorat.upsert({
      where: { code: gouvernorat.code },
      update: { nameFr: gouvernorat.nameFr, nameAr: gouvernorat.nameAr },
      create: { code: gouvernorat.code, nameFr: gouvernorat.nameFr, nameAr: gouvernorat.nameAr },
    });
    for (const [code, nameFr, nameAr] of gouvernorat.delegations) {
      await prisma.delegation.upsert({
        where: { code },
        update: { nameFr, nameAr, gouvernoratId: row.id },
        create: { code, nameFr, nameAr, gouvernoratId: row.id },
      });
    }
  }

  for (const code of RETIRED_DELEGATIONS) {
    const retired = await prisma.delegation.findUnique({ where: { code } });
    if (!retired) continue;
    const inUse =
      (await prisma.parcel.count({ where: { delegationId: retired.id } })) +
      (await prisma.pickupAddress.count({ where: { delegationId: retired.id } })) +
      (await prisma.parcelClientChange.count({ where: { previousDelegationId: retired.id } }));
    if (inUse > 0) {
      await prisma.delegation.update({
        where: { id: retired.id },
        data: { isActive: false, zoneId: null },
      });
      log(`  ! ${code} n'est plus une délégation ; encore utilisée, elle est désactivée.`);
    } else {
      await prisma.localite.deleteMany({ where: { delegationId: retired.id } });
      await prisma.delegation.delete({ where: { id: retired.id } });
      log(`  ${code} n'est plus une délégation : supprimée.`);
    }
  }

  const count = await prisma.delegation.count({ where: { isActive: true } });
  log(`Géographie : ${GRAND_TUNIS.length} gouvernorats, ${count} délégations.`);
}

/**
 * Created only when the table is empty, so a zone the admin has renamed,
 * emptied or redrawn is never touched again (D-19).
 */
async function seedZones(prisma: PrismaClient, log: (m: string) => void): Promise<void> {
  if ((await prisma.zone.count()) > 0) {
    log('Zones : déjà en place, inchangées.');
    return;
  }
  await prisma.$transaction(async (tx) => {
    for (const zone of INITIAL_ZONES) {
      const created = await tx.zone.create({ data: { name: zone.name } });
      await tx.delegation.updateMany({
        where: { code: { in: [...zone.delegations] }, zoneId: null },
        data: { zoneId: created.id },
      });
    }
  });
  log(`Zones : ${INITIAL_ZONES.length} zones créées, sans coursier.`);
}

/**
 * Create-only, recognised by the seed key: a localité the admin has renamed or
 * deactivated stays as he left it, and is not created again (D-17).
 */
async function seedLocalites(
  prisma: PrismaClient,
  csv: string,
  log: (m: string) => void,
): Promise<void> {
  const rows = parseLocalitesCsv(csv);
  const delegations = await prisma.delegation.findMany({ select: { id: true, code: true } });
  const delegationIds = new Map(delegations.map((d) => [d.code, d.id]));
  const existing = await prisma.localite.findMany({
    select: { sourceKey: true, delegationId: true, nameFr: true },
  });
  const knownKeys = new Set(existing.map((row) => row.sourceKey));
  const knownNames = new Set(existing.map((row) => `${row.delegationId}|${row.nameFr}`));

  const missing: Prisma.LocaliteCreateManyInput[] = [];
  for (const row of rows) {
    const delegationId = delegationIds.get(row.delegationCode);
    if (!delegationId) {
      throw new Error(`Fichier des localités : délégation inconnue ${row.delegationCode}`);
    }
    // A localité the admin already created under that name is his, not ours.
    if (knownKeys.has(row.sourceKey) || knownNames.has(`${delegationId}|${row.nameFr}`)) continue;
    missing.push({
      delegationId,
      nameFr: row.nameFr,
      nameAr: row.nameAr,
      postalCode: row.postalCode,
      aliases: row.aliases,
      isOther: row.isOther,
      sourceKey: row.sourceKey,
    });
  }
  if (missing.length > 0) await prisma.localite.createMany({ data: missing });
  log(
    `Localités : ${missing.length} créées, ${rows.length - missing.length} déjà en place ` +
      `(${rows.length} dans le fichier).`,
  );
}

async function seedSettings(prisma: PrismaClient, log: (m: string) => void): Promise<void> {
  const values = Object.entries(defaultSettingValues());
  for (const [key, value] of values) {
    // Only created, never updated: a value the admin has set in Paramètres
    // must survive the seed being run again (D-20).
    await prisma.setting.upsert({
      where: { key },
      update: {},
      create: { key, value: value as Prisma.InputJsonValue },
    });
  }
  log(`Paramètres : ${values.length} clés en place.`);
}

async function seedFirstAdmin(prisma: PrismaClient, options: SeedOptions): Promise<SeedResult> {
  const username = options.adminUsername ?? 'admin';
  const existing = await prisma.user.findFirst({ where: { role: Role.ADMIN } });
  if (existing) {
    options.log?.(`Admin : ${existing.username} existe déjà, inchangé.`);
    return { adminPassword: null, adminUsername: existing.username ?? username };
  }

  // `||`, not `??`: .env.example ships the variable empty, meaning "generate one".
  const password = options.adminPassword || generatePassword(randomBytes);
  await prisma.user.create({
    data: {
      role: Role.ADMIN,
      username,
      phone: options.adminPhone ?? '20000000',
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      firstName: 'Admin',
      lastName: 'Faffa Go',
    },
  });
  return { adminPassword: password, adminUsername: username };
}

export async function seed(prisma: PrismaClient, options: SeedOptions = {}): Promise<SeedResult> {
  const log = options.log ?? ((message: string) => console.log(message));
  await seedGeography(prisma, log);
  await seedZones(prisma, log);
  await seedLocalites(
    prisma,
    options.localitesCsv ?? readFileSync(LOCALITES_CSV_PATH, 'utf8'),
    log,
  );
  await seedSettings(prisma, log);
  return seedFirstAdmin(prisma, { ...options, log });
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const result = await seed(prisma, {
      adminUsername: process.env.FAFFAGO_ADMIN_USERNAME,
      adminPassword: process.env.FAFFAGO_ADMIN_PASSWORD,
      adminPhone: process.env.FAFFAGO_ADMIN_PHONE,
    });
    if (result.adminPassword) {
      console.log('\n─────────────────────────────────────────────');
      console.log('  Compte admin créé. Ce mot de passe ne sera plus affiché.');
      console.log(`  Identifiant : ${result.adminUsername}`);
      console.log(`  Mot de passe : ${result.adminPassword}`);
      console.log('─────────────────────────────────────────────\n');
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
