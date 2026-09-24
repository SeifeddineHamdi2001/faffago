import { PGlite } from '@electric-sql/pglite';
import { PrismaClient } from '@prisma/client';
import { DEFAULT_CONTACT_LINKS } from '@faffago/shared';
import { INITIAL_ZONES, parseLocalitesCsv, seed } from '../prisma/seed';
import { pgliteAdapter } from './support/pglite-adapter';
import { applyMigrations } from './migrations';

/**
 * db:seed (D-17, D-19, D-20): the Grand Tunis geography, its localités, the
 * initial zones, the Paramètres and the first admin. Idempotent, and it never
 * undoes what the admin has changed since.
 */

async function freshDatabase(): Promise<{ db: PGlite; prisma: PrismaClient }> {
  const db = await PGlite.create();
  await applyMigrations(db);
  const adapter = pgliteAdapter(db);
  return { db, prisma: new PrismaClient({ adapter }) };
}

const QUIET = { log: () => undefined };

let db: PGlite;
let prisma: PrismaClient;

beforeAll(async () => {
  ({ db, prisma } = await freshDatabase());
  await seed(prisma, { ...QUIET, adminPassword: 'Mot-De-Passe-Admin-42' });
});
afterAll(async () => {
  await prisma.$disconnect();
  await db.close();
});

async function delegation(code: string) {
  return prisma.delegation.findUniqueOrThrow({ where: { code }, include: { zone: true } });
}

async function localite(delegationCode: string, nameFr: string) {
  const d = await delegation(delegationCode);
  return prisma.localite.findUniqueOrThrow({
    where: { delegationId_nameFr: { delegationId: d.id, nameFr } },
  });
}

describe('the geography (D-19)', () => {
  it('has the four gouvernorats and 48 délégations', async () => {
    expect(await prisma.gouvernorat.count()).toBe(4);
    expect(await prisma.delegation.count({ where: { isActive: true } })).toBe(48);
    const manouba = await prisma.gouvernorat.findUniqueOrThrow({
      where: { code: 'MAN' },
      include: { delegations: true },
    });
    expect(manouba.delegations).toHaveLength(8);
  });

  it('no longer has Den Den as a délégation', async () => {
    expect(await prisma.delegation.findUnique({ where: { code: 'MAN-DENDEN' } })).toBeNull();
  });

  it('uses the approved spellings', async () => {
    expect(await delegation('TUN-BABBHAR')).toMatchObject({
      nameFr: 'Bab El Bhar',
      nameAr: 'باب بحر',
    });
    expect((await delegation('TUN-KABARIA')).nameAr).toBe('الكبارية');
    expect((await delegation('TUN-SIJOUMI')).nameFr).toBe('Séjoumi');
    expect(await delegation('ARI-TADHAMEN')).toMatchObject({
      nameFr: 'Cité Ettadhamen',
      nameAr: 'حي التضامن',
    });
    expect((await delegation('ARI-MNIHLA')).nameAr).toBe('المنيهلة');
    expect((await delegation('ARI-SOUKRA')).nameAr).toBe('سكرة');
    expect((await delegation('MAN-VILLE')).nameFr).toBe('La Manouba');
    expect((await delegation('BEN-MEDINAJEDIDA')).nameFr).toBe('La Nouvelle Médina');
  });
});

describe('the localités (D-17)', () => {
  it('imports the 938 rows of the CSV, one Autre per délégation', async () => {
    expect(await prisma.localite.count()).toBe(938);
    const others = await prisma.localite.findMany({ where: { isOther: true } });
    expect(others).toHaveLength(48);
    expect(others.every((row) => row.nameFr === 'Autre' && row.nameAr === 'أخرى')).toBe(true);
  });

  it('keeps the first postal code and puts the others with the aliases', async () => {
    const snit = await localite('ARI-SOUKRA', 'Cité Snit');
    expect(snit.postalCode).toBe('2036');
    expect(snit.aliases).toEqual(['Cite Snit', '2073']);
  });

  it('keeps the Arabic name when the CSV has one, and leaves it empty otherwise', async () => {
    expect((await localite('TUN-SIDIBECHIR', 'Maakel Ezzaïm')).nameAr).toBe('معقل الزعيم');
    expect((await localite('TUN-MARSA', 'Gammart')).nameAr).toBeNull();
  });

  it('marks each row with its seed key', async () => {
    expect((await localite('ARI-VILLE', 'Cité Ennasr 1')).sourceKey).toBe(
      'ARI-VILLE|Cité Ennasr 1',
    );
  });

  it('files the 8 localités confirmed on 2026-09-23 where they belong', async () => {
    expect((await localite('TUN-GOULETTE', 'Lac 2')).postalCode).toBe('1053');
    expect((await localite('TUN-ELKHADRA', 'Cité Olympique')).postalCode).toBe('1003');
    expect((await localite('TUN-ELKHADRA', 'Centre Urbain Nord')).postalCode).toBe('1082');
    expect((await localite('TUN-GOULETTE', "L'Aouina")).postalCode).toBe('2045');
    expect((await localite('TUN-MARSA', 'Ain Zaghouan Nord')).postalCode).toBe('2046');
    expect((await localite('TUN-MARSA', 'Ain Zaghouan Sud')).postalCode).toBe('2046');
    expect((await localite('BEN-MOUROUJ', 'El Mourouj 1')).postalCode).toBe('2074');
    const jardins = await localite('ARI-VILLE', "Les Jardins d'El Menzah");
    expect(jardins.postalCode).toBe('2092');
    expect(jardins.aliases).toContain('2083');

    const marsa = await delegation('TUN-MARSA');
    const omraneSup = await delegation('TUN-OMRANESUP');
    expect(
      await prisma.localite.findFirst({ where: { delegationId: marsa.id, nameFr: 'Lac 2' } }),
    ).toBeNull();
    expect(
      await prisma.localite.findFirst({
        where: { delegationId: omraneSup.id, nameFr: 'Cité Olympique' },
      }),
    ).toBeNull();
  });

  it('puts both lake areas under La Goulette', async () => {
    const lac1 = await localite('TUN-GOULETTE', 'Les Berges du Lac');
    expect(lac1).toMatchObject({ postalCode: '1053', aliases: ['Berge Du Lac', 'Lac 1'] });
    expect((await localite('TUN-GOULETTE', 'Lac 2')).postalCode).toBe('1053');
    const marsa = await delegation('TUN-MARSA');
    expect(
      await prisma.localite.findFirst({
        where: { delegationId: marsa.id, nameFr: { startsWith: 'Les Berges' } },
      }),
    ).toBeNull();
  });

  it("keeps one Cité Olympique, La Poste's two spellings as its aliases", async () => {
    const olympique = await localite('TUN-ELKHADRA', 'Cité Olympique');
    expect(olympique.aliases).toEqual(['Cite Olympique', 'Cité Oplympique', 'Cité Olympeade']);
    expect(
      await prisma.localite.count({
        where: { nameFr: { in: ['Cité Oplympique', 'Cité Olympeade'] } },
      }),
    ).toBe(0);
  });

  it('puts Den Den under La Manouba, as La Poste does', async () => {
    expect((await localite('MAN-VILLE', 'Den Den')).aliases).toEqual(['Denden']);
  });

  it('refuses a malformed file rather than importing half of it', () => {
    expect(() => parseLocalitesCsv('gouvernorat,delegation_code\nTunis,TUN-BARDO\n')).toThrow(
      /en-tête/,
    );
    const header =
      'gouvernorat,delegation_code,localite_fr,localite_ar,code_postal,alias,nom_ambigu,a_verifier';
    expect(() => parseLocalitesCsv(`${header}\nTunis,TUN-BARDO,Le Bardo\n`)).toThrow(/ligne 2/);
  });
});

describe('the initial zones (D-19)', () => {
  it('creates the 15 zones with no courier', async () => {
    expect(await prisma.zone.count()).toBe(15);
    expect(await prisma.zoneAssignment.count()).toBe(0);
  });

  it('puts every active délégation in exactly one zone', async () => {
    const withoutZone = await prisma.delegation.findMany({
      where: { isActive: true, zoneId: null },
    });
    expect(withoutZone).toEqual([]);
    const codes = INITIAL_ZONES.flatMap((zone) => zone.delegations);
    expect(codes).toHaveLength(48);
    expect(new Set(codes).size).toBe(48);
  });

  it('makes zone 14 La Manouba + Oued Ellil', async () => {
    const zone = await prisma.zone.findUniqueOrThrow({
      where: { name: 'Manouba Est' },
      include: { delegations: true },
    });
    expect(zone.delegations.map((d) => d.code).sort()).toEqual(['MAN-OUEDELLIL', 'MAN-VILLE']);
  });

  it('lets zone 8 cross the Ariana / Manouba border', async () => {
    expect((await delegation('MAN-DOUARHICHER')).zone?.name).toBe('Ettadhamen – Douar Hicher');
    expect((await delegation('ARI-TADHAMEN')).zone?.name).toBe('Ettadhamen – Douar Hicher');
  });
});

describe('the Paramètres (D-20)', () => {
  it('writes the starting values, money as digit strings', async () => {
    const rows = await prisma.setting.findMany();
    const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    expect(rows).toHaveLength(14);
    expect(values.delivery_fee_millimes).toBe('5500');
    expect(values.return_fee_millimes).toBe('2000');
    expect(values.courier_rate_per_parcel_millimes).toBe('3500');
    expect(values.change_client_fee_millimes).toBe('1000');
    expect(values.contact_links).toEqual(DEFAULT_CONTACT_LINKS);
  });
});

describe('running it again', () => {
  it('changes nothing', async () => {
    const counts = async () => ({
      gouvernorats: await prisma.gouvernorat.count(),
      delegations: await prisma.delegation.count(),
      localites: await prisma.localite.count(),
      zones: await prisma.zone.count(),
      settings: await prisma.setting.count(),
      users: await prisma.user.count(),
    });
    const before = await counts();
    const result = await seed(prisma, QUIET);
    expect(await counts()).toEqual(before);
    expect(result.adminPassword).toBeNull();
  });

  it('keeps what the admin has changed since', async () => {
    const gammart = await localite('TUN-MARSA', 'Gammart');
    await prisma.localite.update({ where: { id: gammart.id }, data: { nameFr: 'Gammarth' } });
    const lac2 = await localite('TUN-GOULETTE', 'Lac 2');
    await prisma.localite.update({ where: { id: lac2.id }, data: { isActive: false } });
    await prisma.setting.update({
      where: { key: 'delivery_fee_millimes' },
      data: { value: '6000' },
    });
    const centre = await prisma.zone.findUniqueOrThrow({ where: { name: 'Tunis Centre' } });
    await prisma.zone.update({ where: { id: centre.id }, data: { name: 'Centre-ville' } });
    const bardo = await delegation('TUN-BARDO');
    await prisma.delegation.update({
      where: { id: bardo.id },
      data: { zoneId: centre.id, nameFr: 'Bardo', nameAr: 'الباردو' },
    });
    await prisma.gouvernorat.update({ where: { code: 'MAN' }, data: { nameAr: 'ولاية منوبة' } });

    await seed(prisma, QUIET);

    expect((await prisma.localite.findUniqueOrThrow({ where: { id: gammart.id } })).nameFr).toBe(
      'Gammarth',
    );
    const marsa = await delegation('TUN-MARSA');
    expect(
      await prisma.localite.findUnique({
        where: { delegationId_nameFr: { delegationId: marsa.id, nameFr: 'Gammart' } },
      }),
    ).toBeNull();
    expect((await prisma.localite.findUniqueOrThrow({ where: { id: lac2.id } })).isActive).toBe(
      false,
    );
    expect(
      (await prisma.setting.findUniqueOrThrow({ where: { key: 'delivery_fee_millimes' } })).value,
    ).toBe('6000');
    expect(await prisma.zone.count()).toBe(15);
    expect(await prisma.zone.findUnique({ where: { name: 'Tunis Centre' } })).toBeNull();
    expect(await delegation('TUN-BARDO')).toMatchObject({
      zoneId: centre.id,
      nameFr: 'Bardo',
      nameAr: 'الباردو',
    });
    expect((await prisma.gouvernorat.findUniqueOrThrow({ where: { code: 'MAN' } })).nameAr).toBe(
      'ولاية منوبة',
    );
  });
});

describe('a database seeded by the first version (phase 0)', () => {
  let old: { db: PGlite; prisma: PrismaClient };

  beforeEach(async () => {
    old = await freshDatabase();
    const gouvernorat = await old.prisma.gouvernorat.create({
      data: { code: 'MAN', nameFr: 'Manouba', nameAr: 'منوبة' },
    });
    await old.prisma.delegation.create({
      data: {
        gouvernoratId: gouvernorat.id,
        code: 'MAN-DENDEN',
        nameFr: 'Den Den',
        nameAr: 'دندان',
      },
    });
    const tunis = await old.prisma.gouvernorat.create({
      data: { code: 'TUN', nameFr: 'Tunis', nameAr: 'تونس' },
    });
    await old.prisma.delegation.create({
      data: { gouvernoratId: tunis.id, code: 'TUN-BABBHAR', nameFr: 'Bab Bhar', nameAr: 'باب بحر' },
    });
    await old.prisma.setting.create({ data: { key: 'return_fee_millimes', value: 0 } });
  });
  afterEach(async () => {
    await old.prisma.$disconnect();
    await old.db.close();
  });

  it('keeps the names already there: délégations are create-only now (D-51)', async () => {
    const before = await old.prisma.delegation.findUniqueOrThrow({
      where: { code: 'TUN-BABBHAR' },
    });
    await seed(old.prisma, { ...QUIET, adminPassword: 'x-Mot-De-Passe-42' });
    const after = await old.prisma.delegation.findUniqueOrThrow({ where: { code: 'TUN-BABBHAR' } });
    expect(after.id).toBe(before.id);
    expect(after.nameFr).toBe('Bab Bhar');
    // The missing ones are created, with the approved spellings.
    expect(
      (await old.prisma.delegation.findUniqueOrThrow({ where: { code: 'TUN-KABARIA' } })).nameAr,
    ).toBe('الكبارية');
  });

  it('deletes the Den Den délégation when nothing refers to it', async () => {
    await seed(old.prisma, { ...QUIET, adminPassword: 'x-Mot-De-Passe-42' });
    expect(await old.prisma.delegation.findUnique({ where: { code: 'MAN-DENDEN' } })).toBeNull();
  });

  it('deactivates it instead when a pickup address uses it', async () => {
    const denden = await old.prisma.delegation.findUniqueOrThrow({ where: { code: 'MAN-DENDEN' } });
    const place = await old.prisma.localite.create({
      data: { delegationId: denden.id, nameFr: 'Den Den' },
    });
    const admin = await old.prisma.user.create({
      data: {
        role: 'ADMIN',
        username: 'admin',
        phone: '20000000',
        passwordHash: 'x',
        firstName: 'A',
        lastName: 'B',
      },
    });
    const seller = await old.prisma.user.create({
      data: {
        role: 'VENDEUR',
        email: 'v@test.tn',
        phone: '20000001',
        passwordHash: 'x',
        firstName: 'V',
        lastName: 'B',
        seller: {
          create: {
            shopName: 'Boutique',
            productCategory: 'MODE_VETEMENTS',
            contactFullName: 'V B',
            contactPhone: '20000001',
            statut: 'PATENTE',
            createdByUserId: admin.id,
          },
        },
      },
      include: { seller: true },
    });
    await old.prisma.pickupAddress.create({
      data: {
        sellerId: seller.seller!.id,
        delegationId: denden.id,
        localiteId: place.id,
        address: 'Rue',
      },
    });

    await seed(old.prisma, QUIET);

    const after = await old.prisma.delegation.findUniqueOrThrow({ where: { code: 'MAN-DENDEN' } });
    expect(after.isActive).toBe(false);
    expect(after.zoneId).toBeNull();
  });

  it('leaves a setting that already exists alone, even an old zero', async () => {
    await seed(old.prisma, { ...QUIET, adminPassword: 'x-Mot-De-Passe-42' });
    const row = await old.prisma.setting.findUniqueOrThrow({
      where: { key: 'return_fee_millimes' },
    });
    expect(row.value).toBe(0);
  });
});
