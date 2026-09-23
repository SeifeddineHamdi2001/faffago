import { randomBytes } from 'node:crypto';
import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { DEFAULT_SETTINGS, SettingKey, generatePassword } from '@faffago/shared';

/**
 * Seed: the geography of Grand Tunis, the platform settings and one admin.
 *
 * It is idempotent — running it twice changes nothing — so it is safe to run
 * after every migration.
 *
 * It deliberately creates no zone: the admin groups délégations into zones in
 * Paramètres, with a livreur and a ramasseur each (Admin 4.16). Inventing them
 * here would be inventing an operating model.
 */

const prisma = new PrismaClient();

/**
 * The four gouvernorats of Grand Tunis with their délégations.
 *
 * Both names are stored: each interface shows the one for its language, and
 * the public site lists the zones served in French and in Arabic (A-18).
 *
 * TO VERIFY — the Arabic spellings below are the standard official names, but
 * the team should read through them once before launch, as the public site
 * shows them to Tunisian customers.
 */
const GRAND_TUNIS: Array<{
  code: string;
  nameFr: string;
  nameAr: string;
  delegations: Array<[code: string, nameFr: string, nameAr: string]>;
}> = [
  {
    code: 'TUN',
    nameFr: 'Tunis',
    nameAr: 'تونس',
    delegations: [
      ['TUN-BABBHAR', 'Bab Bhar', 'باب بحر'],
      ['TUN-BABSOUIKA', 'Bab Souika', 'باب سويقة'],
      ['TUN-CARTHAGE', 'Carthage', 'قرطاج'],
      ['TUN-ELKHADRA', 'Cité El Khadra', 'حي الخضراء'],
      ['TUN-JEBELJELLOUD', 'Djebel Jelloud', 'جبل الجلود'],
      ['TUN-HRAIRIA', 'El Hrairia', 'الحرايرية'],
      ['TUN-KABARIA', 'El Kabaria', 'القبارية'],
      ['TUN-MENZAH', 'El Menzah', 'المنزه'],
      ['TUN-OMRANE', 'El Omrane', 'العمران'],
      ['TUN-OMRANESUP', 'El Omrane Supérieur', 'العمران الأعلى'],
      ['TUN-OUARDIA', 'El Ouardia', 'الوردية'],
      ['TUN-SIJOUMI', 'Essijoumi', 'السيجومي'],
      ['TUN-TAHRIR', 'Ettahrir', 'التحرير'],
      ['TUN-ZOUHOUR', 'Ezzouhour', 'الزهور'],
      ['TUN-GOULETTE', 'La Goulette', 'حلق الوادي'],
      ['TUN-MARSA', 'La Marsa', 'المرسى'],
      ['TUN-BARDO', 'Le Bardo', 'باردو'],
      ['TUN-KRAM', 'Le Kram', 'الكرم'],
      ['TUN-MEDINA', 'Médina', 'المدينة'],
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
      ['ARI-TADHAMEN', 'Ettadhamen', 'التضامن'],
      ['ARI-KALAAT', 'Kalâat el-Andalous', 'قلعة الأندلس'],
      ['ARI-SOUKRA', 'La Soukra', 'سكرة'],
      ['ARI-MNIHLA', 'Mnihla', 'منيهلة'],
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
      ['BEN-MEDINAJEDIDA', 'Nouvelle Médina', 'المدينة الجديدة'],
      ['BEN-RADES', 'Radès', 'رادس'],
    ],
  },
  {
    code: 'MAN',
    nameFr: 'Manouba',
    nameAr: 'منوبة',
    delegations: [
      ['MAN-BORJAMRI', 'Borj El Amri', 'برج العامري'],
      ['MAN-DENDEN', 'Den Den', 'دندان'],
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

async function seedGeography(): Promise<void> {
  for (const gouvernorat of GRAND_TUNIS) {
    const row = await prisma.gouvernorat.upsert({
      where: { code: gouvernorat.code },
      update: { nameFr: gouvernorat.nameFr, nameAr: gouvernorat.nameAr },
      create: {
        code: gouvernorat.code,
        nameFr: gouvernorat.nameFr,
        nameAr: gouvernorat.nameAr,
      },
    });

    for (const [code, nameFr, nameAr] of gouvernorat.delegations) {
      await prisma.delegation.upsert({
        where: { code },
        update: { nameFr, nameAr, gouvernoratId: row.id },
        create: { code, nameFr, nameAr, gouvernoratId: row.id },
      });
    }
  }

  const count = await prisma.delegation.count();
  console.log(`Géographie : ${GRAND_TUNIS.length} gouvernorats, ${count} délégations.`);
}

async function seedSettings(): Promise<void> {
  const values: Array<[string, unknown]> = [
    [SettingKey.DELIVERY_FEE_MILLIMES, Number(DEFAULT_SETTINGS.deliveryFeeMillimes)],
    [SettingKey.RETURN_FEE_MILLIMES, Number(DEFAULT_SETTINGS.returnFeeMillimes)],
    [SettingKey.CHANGE_CLIENT_FEE_MILLIMES, Number(DEFAULT_SETTINGS.changeClientFeeMillimes)],
    [SettingKey.PICKUP_FEE_MILLIMES, Number(DEFAULT_SETTINGS.pickupFeeMillimes)],
    [SettingKey.PICKUP_FREE_THRESHOLD, DEFAULT_SETTINGS.pickupFreeThreshold],
    [SettingKey.RETENUE_RATE_BPS, DEFAULT_SETTINGS.retenueRateBps],
    [
      SettingKey.COURIER_RATE_PER_PARCEL_MILLIMES,
      Number(DEFAULT_SETTINGS.courierRatePerParcelMillimes),
    ],
    [SettingKey.VERIFY_DEADLINE_HOURS, DEFAULT_SETTINGS.verifyDeadlineHours],
    [SettingKey.MAX_DELIVERY_ATTEMPTS, DEFAULT_SETTINGS.maxDeliveryAttempts],
    [SettingKey.MAX_CLIENT_CHANGES_PER_PARCEL, DEFAULT_SETTINGS.maxClientChangesPerParcel],
    [SettingKey.SCAN_CANCEL_WINDOW_SECONDS, DEFAULT_SETTINGS.scanCancelWindowSeconds],
    [SettingKey.CLOCK_SKEW_FLAG_MINUTES, DEFAULT_SETTINGS.clockSkewFlagMinutes],
    [SettingKey.COURIER_MIN_APP_VERSION, DEFAULT_SETTINGS.courierMinAppVersion],
    [SettingKey.CONTACT_LINKS, { phone: '', whatsapp: '', facebook: '', instagram: '' }],
  ];

  for (const [key, value] of values) {
    // Only created, never updated: a rate the admin has already set in
    // Paramètres must survive the seed being run again.
    await prisma.setting.upsert({
      where: { key },
      update: {},
      create: { key, value: value as never },
    });
  }

  console.log(`Paramètres : ${values.length} clés en place.`);
  if (DEFAULT_SETTINGS.deliveryFeeMillimes === 0n || DEFAULT_SETTINGS.returnFeeMillimes === 0n) {
    console.log(
      '  ! Frais de livraison, frais de retour et tarif coursier sont à 0 : ' +
        'ils ne figurent pas dans les specs et doivent être saisis dans Paramètres.',
    );
  }
}

async function seedFirstAdmin(): Promise<void> {
  const username = process.env.FAFFAGO_ADMIN_USERNAME ?? 'admin';
  const existing = await prisma.user.findFirst({ where: { role: Role.ADMIN } });
  if (existing) {
    console.log(`Admin : ${existing.username} existe déjà, inchangé.`);
    return;
  }

  // `||`, not `??`: .env.example ships the variable empty, meaning "generate one".
  const password = process.env.FAFFAGO_ADMIN_PASSWORD || generatePassword(randomBytes);
  await prisma.user.create({
    data: {
      role: Role.ADMIN,
      username,
      phone: process.env.FAFFAGO_ADMIN_PHONE ?? '20000000',
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      firstName: 'Admin',
      lastName: 'Faffa Go',
    },
  });

  console.log('\n─────────────────────────────────────────────');
  console.log('  Compte admin créé. Ce mot de passe ne sera plus affiché.');
  console.log(`  Identifiant : ${username}`);
  console.log(`  Mot de passe : ${password}`);
  console.log('─────────────────────────────────────────────\n');
}

async function main(): Promise<void> {
  await seedGeography();
  await seedSettings();
  await seedFirstAdmin();
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
