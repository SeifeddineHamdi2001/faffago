import { PGlite } from '@electric-sql/pglite';
import { applyMigrations } from './migrations';

/**
 * The rules the database enforces on its own.
 *
 * These are the guarantees that must survive a bug in the service layer: the
 * append-only tables, the login identifier rule, and the money checks. They
 * run against a real PostgreSQL engine (PGlite is PostgreSQL compiled to
 * WebAssembly), so the triggers, the CHECK constraints and the partial unique
 * indexes are all genuinely exercised.
 *
 * Integration tests that need a real server — concurrency on
 * document_counters, transaction isolation, the two database roles — use
 * Testcontainers instead and live beside their feature.
 */

const USER_ID = '11111111-1111-1111-1111-111111111111';
const SELLER_ID = '22222222-2222-2222-2222-222222222222';
const GOUVERNORAT_ID = '33333333-3333-3333-3333-333333333333';
const DELEGATION_ID = '44444444-4444-4444-4444-444444444444';
const LOCALITE_ID = '77777777-7777-7777-7777-777777777777';
const PARCEL_ID = '55555555-5555-5555-5555-555555555555';
const EVENT_ID = '66666666-6666-6666-6666-666666666666';

let db: PGlite;

beforeAll(async () => {
  db = await PGlite.create();
  await applyMigrations(db);

  await db.query(
    `insert into users (id,role,username,phone,"passwordHash","firstName","lastName","updatedAt")
     values ($1,'ADMIN','saif','20123456','h','Saif','B',now())`,
    [USER_ID],
  );
  await db.query(
    `insert into sellers (id,"userId","shopName","productCategory","contactFullName",
       "contactPhone",statut,"createdByUserId","updatedAt")
     values ($1,$2,'Boutique','Mode','Saif B','20123456','CIN_UNIQUEMENT',$2,now())`,
    [SELLER_ID, USER_ID],
  );
  await db.query(
    `insert into gouvernorats (id,code,"nameFr","nameAr") values ($1,'TUN','Tunis','تونس')`,
    [GOUVERNORAT_ID],
  );
  await db.query(
    `insert into delegations (id,"gouvernoratId",code,"nameFr","nameAr")
     values ($1,$2,'TUN-BARDO','Le Bardo','باردو')`,
    [DELEGATION_ID, GOUVERNORAT_ID],
  );
  await db.query(
    `insert into localites (id,"delegationId","nameFr","updatedAt") values ($1,$2,'Khaznadar',now())`,
    [LOCALITE_ID, DELEGATION_ID],
  );
  // A parcel and its CREATION event commit together (D-21).
  await db.transaction(async (tx) => {
    await tx.query(
      `insert into parcels (id,code,"sellerId","recipientName","recipientPhone","delegationId","localiteId",address,
         "productDescription","codAmountMillimes","deliveryFeeMillimes","returnFeeMillimes",
         "changeClientFeeMillimes","createdByUserId","updatedAt")
       values ($1,'FG-8K2QX7AB',$2,'Client','29876543',$3,$5,'Rue X','2 bracelets',85000,7000,5000,1000,$4,now())`,
      [PARCEL_ID, SELLER_ID, DELEGATION_ID, USER_ID, LOCALITE_ID],
    );
    await tx.query(
      `insert into parcel_events (id,"parcelId",type,"newStatus","newLocation")
       values ($1,$2,'CREATION','CREE','CHEZ_LE_VENDEUR')`,
      [EVENT_ID, PARCEL_ID],
    );
  });
});

afterAll(async () => {
  await db?.close();
});

function insertBonVersement(number: string, values: string) {
  return db.query(
    `insert into bons_versement (id,number,"sellerId","totalCodMillimes","totalFeesMillimes",
       "baseAfterFeesMillimes","sellerStatutSnapshot","retenueRateBps","retenueMillimes",
       "netMillimes","qrToken","preparedByUserId")
     values (gen_random_uuid(),'${number}',$1,${values},'qr-${number}',$2)`,
    [SELLER_ID, USER_ID],
  );
}

describe('append-only tables', () => {
  it('refuses to update a parcel event', async () => {
    await expect(
      db.query(`update parcel_events set "reasonText" = 'modifié' where id = $1`, [EVENT_ID]),
    ).rejects.toThrow(/ajout seul/);
  });

  it('refuses to delete a parcel event', async () => {
    await expect(db.query(`delete from parcel_events where id = $1`, [EVENT_ID])).rejects.toThrow(
      /ajout seul/,
    );
  });

  it('refuses to truncate parcel events', async () => {
    await expect(db.exec(`truncate parcel_events cascade`)).rejects.toThrow(/ajout seul/);
  });

  it('refuses to update or delete an audit entry', async () => {
    await db.query(
      `insert into audit_log (id,action,"entityType","entityId")
       values (gen_random_uuid(),'FORCAGE_STATUT','parcel',$1)`,
      [PARCEL_ID],
    );
    await expect(db.query(`update audit_log set reason = 'x'`)).rejects.toThrow(/ajout seul/);
    await expect(db.query(`delete from audit_log`)).rejects.toThrow(/ajout seul/);
  });

  it('still accepts new events', async () => {
    await expect(
      db.query(
        `insert into parcel_events (id,"parcelId",type,"newStatus")
         values (gen_random_uuid(),$1,'RAMASSAGE','RAMASSE')`,
        [PARCEL_ID],
      ),
    ).resolves.toBeDefined();
  });
});

describe('login identifiers (A-20)', () => {
  it('requires an email for a seller and a username for staff', async () => {
    await expect(
      db.query(`insert into users (id,role,username,phone,"passwordHash","firstName","lastName","updatedAt")
        values (gen_random_uuid(),'VENDEUR','boutique','20123457','h','A','B',now())`),
    ).rejects.toThrow(/login_identifier/);

    await expect(
      db.query(`insert into users (id,role,phone,"passwordHash","firstName","lastName","updatedAt")
        values (gen_random_uuid(),'DEPOT','20123458','h','A','B',now())`),
    ).rejects.toThrow(/login_identifier/);
  });

  it('gives couriers neither an email nor a username', async () => {
    await expect(
      db.query(`insert into users (id,role,email,phone,"passwordHash","firstName","lastName","updatedAt")
        values (gen_random_uuid(),'LIVREUR','l@example.com','20123460','h','A','B',now())`),
    ).rejects.toThrow(/login_identifier/);
  });

  it('refuses a username that is already taken', async () => {
    // 'saif' was created in beforeAll. Because usernames are stored lowercase,
    // a case variant cannot sneak past the unique index: the format check
    // rejects it first, and an exact duplicate hits the index.
    await expect(
      db.query(`insert into users (id,role,username,phone,"passwordHash","firstName","lastName","updatedAt")
        values (gen_random_uuid(),'ADMIN','saif','20123459','h','A','B',now())`),
    ).rejects.toThrow(/users_username/);

    await expect(
      db.query(`insert into users (id,role,username,phone,"passwordHash","firstName","lastName","updatedAt")
        values (gen_random_uuid(),'ADMIN','SAIF','20123459','h','A','B',now())`),
    ).rejects.toThrow(/users_username/);
  });

  it('lets one phone hold a livreur and a ramasseur account, but not two of a kind', async () => {
    await db.query(`insert into users (id,role,phone,"passwordHash","firstName","lastName","updatedAt")
      values (gen_random_uuid(),'LIVREUR','29000001','h','Oussama','K',now())`);
    await db.query(`insert into users (id,role,phone,"passwordHash","firstName","lastName","updatedAt")
      values (gen_random_uuid(),'RAMASSEUR','29000001','h','Oussama','K',now())`);

    await expect(
      db.query(`insert into users (id,role,phone,"passwordHash","firstName","lastName","updatedAt")
        values (gen_random_uuid(),'LIVREUR','29000001','h','X','Y',now())`),
    ).rejects.toThrow(/phone_role/);
  });

  it('refuses a phone that is not 8 Tunisian digits', async () => {
    await expect(
      db.query(`insert into users (id,role,username,phone,"passwordHash","firstName","lastName","updatedAt")
        values (gen_random_uuid(),'ADMIN','autre','1234567','h','A','B',now())`),
    ).rejects.toThrow(/phone_format/);
  });

  it('stores usernames lowercase, at least 4 of a-z 0-9 . _ - (Q13)', async () => {
    await expect(
      db.query(`insert into users (id,role,username,phone,"passwordHash","firstName","lastName","updatedAt")
        values (gen_random_uuid(),'DEPOT','saif.b_1-x','20123460','h','A','B',now())`),
    ).resolves.toBeDefined();

    for (const bad of ['Saif2', 'ab', 'ab cd', 'saif@b']) {
      await expect(
        db.query(
          `insert into users (id,role,username,phone,"passwordHash","firstName","lastName","updatedAt")
           values (gen_random_uuid(),'ADMIN',$1,'20123461','h','A','B',now())`,
          [bad],
        ),
      ).rejects.toThrow(/users_username/);
    }
  });

  it('stores a seller email lowercase and plausible (Q13)', async () => {
    await expect(
      db.query(`insert into users (id,role,email,phone,"passwordHash","firstName","lastName","updatedAt")
        values (gen_random_uuid(),'VENDEUR','boutique@example.com','20123462','h','A','B',now())`),
    ).resolves.toBeDefined();

    await expect(
      db.query(`insert into users (id,role,email,phone,"passwordHash","firstName","lastName","updatedAt")
        values (gen_random_uuid(),'VENDEUR','Boutique@Example.com','20123463','h','A','B',now())`),
    ).rejects.toThrow(/users_email_is_lowercase/);

    await expect(
      db.query(`insert into users (id,role,email,phone,"passwordHash","firstName","lastName","updatedAt")
        values (gen_random_uuid(),'VENDEUR','boutique.example.com','20123464','h','A','B',now())`),
    ).rejects.toThrow(/users_email_format/);
  });
});

describe('money', () => {
  it('refuses a negative COD', async () => {
    await expect(
      db.query(
        `insert into parcels (id,code,"sellerId","recipientName","recipientPhone","delegationId","localiteId",address,
           "productDescription","codAmountMillimes","deliveryFeeMillimes","returnFeeMillimes",
           "changeClientFeeMillimes","createdByUserId","updatedAt")
         values (gen_random_uuid(),'FG-NEGATIV1',$1,'C','29876543',$2,$4,'R','p',-1,0,0,0,$3,now())`,
        [SELLER_ID, DELEGATION_ID, USER_ID, LOCALITE_ID],
      ),
    ).rejects.toThrow(/money_non_negative/);
  });

  it('gives a cash status only to a delivered parcel', async () => {
    await expect(
      db.query(`update parcels set "cashStatus" = 'CHEZ_LE_COURSIER' where id = $1`, [PARCEL_ID]),
    ).rejects.toThrow(/cash_status_requires_delivery/);
  });

  it('refuses a bon de versement whose net is zero (A-2)', async () => {
    await expect(
      insertBonVersement('BV-2026-0921-01', `5000,5000,0,'PATENTE',0,0,0`),
    ).rejects.toThrow(/net_positive/);
  });

  it('refuses a bon whose net does not match its own lines', async () => {
    await expect(
      insertBonVersement(
        'BV-2026-0921-02',
        `1000000,84000,916000,'CIN_UNIQUEMENT',300,27480,999999`,
      ),
    ).rejects.toThrow(/net_positive/);
  });

  it('refuses a retenue withheld from a seller who has a patente', async () => {
    await expect(
      insertBonVersement('BV-2026-0921-03', `1000000,84000,916000,'PATENTE',300,27480,888520`),
    ).rejects.toThrow(/retenue_only_cin/);
  });

  it('accepts the worked example of Vendeur 2.4', async () => {
    await expect(
      insertBonVersement(
        'BV-2026-0921-04',
        `1000000,84000,916000,'CIN_UNIQUEMENT',300,27480,888520`,
      ),
    ).resolves.toBeDefined();
  });

  it('refuses a pay slip that would pay a negative amount', async () => {
    const courierUser = await db.query<{ id: string }>(
      `insert into users (id,role,phone,"passwordHash","firstName","lastName","updatedAt")
       values (gen_random_uuid(),'LIVREUR','29000002','h','Ali','M',now()) returning id`,
    );
    const courier = await db.query<{ id: string }>(
      `insert into couriers (id,"userId",cin,"payPlan","updatedAt")
       values (gen_random_uuid(),$1,'12345678','JOURNALIER',now()) returning id`,
      [courierUser.rows[0]!.id],
    );

    await expect(
      db.query(
        `insert into payslips (id,number,"courierId","payPlan","periodStart","periodEnd","parcelCount",
           "ratePerParcelMillimes","grossMillimes","deductionsMillimes","netMillimes","preparedByUserId")
         values (gen_random_uuid(),'FP-0001',$1,'JOURNALIER',current_date,current_date,3,1500,4500,7000,-2500,$2)`,
        [courier.rows[0]!.id, USER_ID],
      ),
    ).rejects.toThrow(/net_non_negative/);
  });
});

describe('scans', () => {
  it('stores a replayed scan once (tech-stack, offline sync)', async () => {
    const clientScanId = '77777777-7777-7777-7777-777777777777';
    const insert = () =>
      db.query(
        `insert into scans (id,"clientScanId",action,"rawCode","parcelId","actorUserId",source,
           accepted,"deviceTime","businessDate")
         values (gen_random_uuid(),$1,'LIVRE','FG-8K2QX7AB',$2,$3,'APP_COURSIER',true,now(),current_date)`,
        [clientScanId, PARCEL_ID, USER_ID],
      );

    await expect(insert()).resolves.toBeDefined();
    await expect(insert()).rejects.toThrow(/clientScanId/);
  });

  it('allows the same parcel to fail more than once', async () => {
    const failure = (clientScanId: string) =>
      db.query(
        `insert into scans (id,"clientScanId",action,"rawCode","parcelId","actorUserId",source,
           accepted,"failureReason","deviceTime","businessDate")
         values (gen_random_uuid(),$1,'ECHEC','FG-8K2QX7AB',$2,$3,'APP_COURSIER',true,
                 'NE_REPOND_PAS',now(),current_date)`,
        [clientScanId, PARCEL_ID, USER_ID],
      );

    await expect(failure('88888888-8888-8888-8888-888888888881')).resolves.toBeDefined();
    await expect(failure('88888888-8888-8888-8888-888888888882')).resolves.toBeDefined();
  });
});

describe('parcels', () => {
  it('keeps the code unique', async () => {
    await expect(
      db.query(
        `insert into parcels (id,code,"sellerId","recipientName","recipientPhone","delegationId","localiteId",address,
           "productDescription","codAmountMillimes","deliveryFeeMillimes","returnFeeMillimes",
           "changeClientFeeMillimes","createdByUserId","updatedAt")
         values (gen_random_uuid(),'FG-8K2QX7AB',$1,'C','29876543',$2,$4,'R','p',0,0,0,0,$3,now())`,
        [SELLER_ID, DELEGATION_ID, USER_ID, LOCALITE_ID],
      ),
    ).rejects.toThrow(/parcels_code_key/);
  });

  it('pays a parcel into one bon de versement only (A-5a)', async () => {
    const bon = await db.query<{ id: string }>(
      `insert into bons_versement (id,number,"sellerId","totalCodMillimes","totalFeesMillimes",
         "baseAfterFeesMillimes","sellerStatutSnapshot","retenueRateBps","retenueMillimes",
         "netMillimes","qrToken","preparedByUserId")
       values (gen_random_uuid(),'BV-2026-0921-05',$1,85000,0,85000,'CIN_UNIQUEMENT',300,2550,82450,'qr-05',$2)
       returning id`,
      [SELLER_ID, USER_ID],
    );
    const other = await db.query<{ id: string }>(
      `insert into bons_versement (id,number,"sellerId","totalCodMillimes","totalFeesMillimes",
         "baseAfterFeesMillimes","sellerStatutSnapshot","retenueRateBps","retenueMillimes",
         "netMillimes","qrToken","preparedByUserId")
       values (gen_random_uuid(),'BV-2026-0921-06',$1,85000,0,85000,'CIN_UNIQUEMENT',300,2550,82450,'qr-06',$2)
       returning id`,
      [SELLER_ID, USER_ID],
    );

    await db.query(
      `insert into bon_versement_parcels ("bonVersementId","parcelId","codMillimes") values ($1,$2,85000)`,
      [bon.rows[0]!.id, PARCEL_ID],
    );
    await expect(
      db.query(
        `insert into bon_versement_parcels ("bonVersementId","parcelId","codMillimes") values ($1,$2,85000)`,
        [other.rows[0]!.id, PARCEL_ID],
      ),
    ).rejects.toThrow(/parcelId/);
  });
});

describe('customer postponement (D-9)', () => {
  const RELAUNCH_COLUMNS = '"relaunchDate","relaunchOrigin","relaunchSlot"';

  function insertParcel(id: string, code: string, extraColumns = '', extraValues = '') {
    return db.transaction(async (tx) => {
      await tx.query(
        `insert into parcels (id,code,"sellerId","recipientName","recipientPhone","delegationId",
           "localiteId",address,"productDescription","codAmountMillimes","deliveryFeeMillimes",
           "returnFeeMillimes","changeClientFeeMillimes","createdByUserId","updatedAt"${extraColumns})
         values ($1,$2,$3,'Client','29876543',$4,$6,'Rue X','p',0,0,0,0,$5,now()${extraValues})`,
        [id, code, SELLER_ID, DELEGATION_ID, USER_ID, LOCALITE_ID],
      );
      await tx.query(
        `insert into parcel_events (id,"parcelId",type,"newStatus","newLocation")
         values (gen_random_uuid(),$1,'CREATION','CREE','CHEZ_LE_VENDEUR')`,
        [id],
      );
      return true;
    });
  }

  it('accepts a date together with its origin', async () => {
    await expect(
      insertParcel(
        'aaaaaaaa-0000-0000-0000-000000000002',
        'FG-REPORT01',
        `,${RELAUNCH_COLUMNS}`,
        `,'2026-09-25','CLIENT','APRES_MIDI'`,
      ),
    ).resolves.toBeDefined();
  });

  it('refuses a date with no origin, and an origin with no date', async () => {
    await expect(
      insertParcel(
        'aaaaaaaa-0000-0000-0000-000000000003',
        'FG-REPORT02',
        `,"relaunchDate"`,
        `,'2026-09-25'`,
      ),
    ).rejects.toThrow(/parcels_relaunch_is_complete/);

    await expect(
      insertParcel(
        'aaaaaaaa-0000-0000-0000-000000000004',
        'FG-REPORT03',
        `,"relaunchOrigin"`,
        `,'CLIENT'`,
      ),
    ).rejects.toThrow(/parcels_relaunch_is_complete/);
  });

  it('refuses a slot outside Matin / Après-midi / Soir', async () => {
    await expect(
      db.query(
        `update parcels set "relaunchSlot" = 'NUIT' where id = 'aaaaaaaa-0000-0000-0000-000000000002'`,
      ),
    ).rejects.toThrow(/invalid input value for enum "RelaunchSlot"/);
  });

  it('no longer stores a courier PIN (Q7)', async () => {
    const result = await db.query<{ n: number }>(
      `select count(*)::int as n from information_schema.columns
       where table_name = 'couriers' and column_name = 'pinHash'`,
    );
    expect(result.rows[0]?.n).toBe(0);
  });
});
