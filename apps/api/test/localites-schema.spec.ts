import { PGlite } from '@electric-sql/pglite';
import { applyMigrations } from './migrations';

/**
 * Localités (D-17), as the database enforces them: the délégation of a parcel
 * or a pickup address can never disagree with its localité, one Autre per
 * délégation, and clean names and postal codes.
 */

const USER_ID = '11111111-1111-1111-1111-111111111111';
const SELLER_ID = '22222222-2222-2222-2222-222222222222';
const GOUVERNORAT_ID = '33333333-3333-3333-3333-333333333333';
const BARDO_ID = '44444444-4444-4444-4444-444444444444';
const MARSA_ID = '44444444-4444-4444-4444-555555555555';
const KHAZNADAR_ID = '77777777-7777-7777-7777-777777777777';
const GAMMART_ID = '77777777-7777-7777-7777-888888888888';
const AUTRE_BARDO_ID = '77777777-7777-7777-7777-999999999999';

let db: PGlite;
let parcelCounter = 0;

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
     values ($1,$2,'Boutique','Mode','Saif B','20123456','PATENTE',$2,now())`,
    [SELLER_ID, USER_ID],
  );
  await db.query(
    `insert into gouvernorats (id,code,"nameFr","nameAr") values ($1,'TUN','Tunis','تونس')`,
    [GOUVERNORAT_ID],
  );
  await db.query(
    `insert into delegations (id,"gouvernoratId",code,"nameFr","nameAr") values
       ($1,$3,'TUN-BARDO','Le Bardo','باردو'),
       ($2,$3,'TUN-MARSA','La Marsa','المرسى')`,
    [BARDO_ID, MARSA_ID, GOUVERNORAT_ID],
  );
  await insertLocalite(KHAZNADAR_ID, BARDO_ID, 'Khaznadar', "'2017'");
  await insertLocalite(GAMMART_ID, MARSA_ID, 'Gammart', "'1057'");
  await db.query(
    `insert into localites (id,"delegationId","nameFr","nameAr","isOther","updatedAt")
     values ($1,$2,'Autre','أخرى',true,now())`,
    [AUTRE_BARDO_ID, BARDO_ID],
  );
});

afterAll(async () => {
  await db?.close();
});

function insertLocalite(id: string, delegationId: string, nameFr: string, postalCode = 'null') {
  return db.query(
    `insert into localites (id,"delegationId","nameFr","postalCode","updatedAt")
     values ($1,$2,$3,${postalCode},now())`,
    [id, delegationId, nameFr],
  );
}

function insertParcel(localiteId: string, delegationId: string) {
  parcelCounter += 1;
  return db.query(
    `insert into parcels (id,code,"sellerId","recipientName","recipientPhone","delegationId",
       "localiteId",address,"productDescription","codAmountMillimes","deliveryFeeMillimes",
       "returnFeeMillimes","changeClientFeeMillimes","createdByUserId","updatedAt")
     values (gen_random_uuid(),$1,$2,'Client','29876543',$3,$4,'Rue X','Article',
       85000,5500,2000,1000,$5,now())`,
    [`FG-TEST${String(parcelCounter).padStart(4, '0')}`, SELLER_ID, delegationId, localiteId, USER_ID],
  );
}

describe('a parcel and its localité', () => {
  it('accepts a localité of the parcel délégation', async () => {
    await expect(insertParcel(KHAZNADAR_ID, BARDO_ID)).resolves.toBeDefined();
  });

  it('refuses a localité from another délégation', async () => {
    await expect(insertParcel(GAMMART_ID, BARDO_ID)).rejects.toThrow(/foreign key/);
  });

  it('refuses a parcel without a localité', async () => {
    await expect(
      db.query(
        `insert into parcels (id,code,"sellerId","recipientName","recipientPhone","delegationId",
           address,"productDescription","codAmountMillimes","deliveryFeeMillimes",
           "returnFeeMillimes","changeClientFeeMillimes","createdByUserId","updatedAt")
         values (gen_random_uuid(),'FG-NOLOC001',$1,'Client','29876543',$2,'Rue X','Article',
           85000,5500,2000,1000,$3,now())`,
        [SELLER_ID, BARDO_ID, USER_ID],
      ),
    ).rejects.toThrow(/localiteId/);
  });

  it('keeps the previous customer of Changer de client consistent too', async () => {
    const parcel = await db.query<{ id: string }>(`select id from parcels limit 1`);
    const insertChange = (localiteId: string, delegationId: string) =>
      db.query(
        `insert into parcel_client_changes (id,"parcelId","previousName","previousPhone",
           "previousDelegationId","previousLocaliteId","previousAddress","previousCodMillimes",
           "newCodMillimes","feeMillimes","decidedByUserId")
         values (gen_random_uuid(),$1,'Ancien','29876543',$2,$3,'Rue Y',85000,85000,1000,$4)`,
        [parcel.rows[0]!.id, delegationId, localiteId, USER_ID],
      );
    await expect(insertChange(KHAZNADAR_ID, BARDO_ID)).resolves.toBeDefined();
    await expect(insertChange(GAMMART_ID, BARDO_ID)).rejects.toThrow(/foreign key/);
  });

  it('refuses to move a localité that has parcels to another délégation', async () => {
    await expect(
      db.query(`update localites set "delegationId" = $1 where id = $2`, [MARSA_ID, KHAZNADAR_ID]),
    ).rejects.toThrow(/foreign key/);
  });
});

describe('a pickup address and its localité', () => {
  function insertPickupAddress(localiteId: string, delegationId: string) {
    return db.query(
      `insert into pickup_addresses (id,"sellerId","delegationId","localiteId",address)
       values (gen_random_uuid(),$1,$2,$3,'Entrepôt')`,
      [SELLER_ID, delegationId, localiteId],
    );
  }

  it('accepts a localité of its délégation', async () => {
    await expect(insertPickupAddress(GAMMART_ID, MARSA_ID)).resolves.toBeDefined();
  });

  it('refuses a localité from another délégation', async () => {
    await expect(insertPickupAddress(GAMMART_ID, BARDO_ID)).rejects.toThrow(/foreign key/);
  });
});

describe('the localités table', () => {
  it('allows one Autre per délégation', async () => {
    await expect(
      db.query(
        `insert into localites (id,"delegationId","nameFr","isOther","updatedAt")
         values (gen_random_uuid(),$1,'Autre bis',true,now())`,
        [BARDO_ID],
      ),
    ).rejects.toThrow(/unique/);
  });

  it('refuses the same French name twice in one délégation', async () => {
    await expect(
      insertLocalite('77777777-7777-7777-7777-000000000001', BARDO_ID, 'Khaznadar'),
    ).rejects.toThrow(/unique/);
  });

  it('accepts the same name in another délégation', async () => {
    await expect(
      insertLocalite('77777777-7777-7777-7777-000000000002', MARSA_ID, 'Khaznadar'),
    ).resolves.toBeDefined();
  });

  it('refuses a blank name', async () => {
    await expect(
      insertLocalite('77777777-7777-7777-7777-000000000003', BARDO_ID, '   '),
    ).rejects.toThrow(/localites_name_fr_not_blank/);
  });

  it('refuses a postal code that is not 4 digits', async () => {
    await expect(
      insertLocalite('77777777-7777-7777-7777-000000000004', BARDO_ID, 'Ksar Said', "'209'"),
    ).rejects.toThrow(/localites_postal_code_format/);
  });

  it('refuses to deactivate an Autre row', async () => {
    await expect(
      db.query(`update localites set "isActive" = false where id = $1`, [AUTRE_BARDO_ID]),
    ).rejects.toThrow(/localites_other_stays_active/);
  });

  it('keeps a unique seed key', async () => {
    await db.query(`update localites set "sourceKey" = 'TUN-BARDO|Khaznadar' where id = $1`, [
      KHAZNADAR_ID,
    ]);
    await expect(
      db.query(`update localites set "sourceKey" = 'TUN-BARDO|Khaznadar' where id = $1`, [
        GAMMART_ID,
      ]),
    ).rejects.toThrow(/unique/);
  });
});
