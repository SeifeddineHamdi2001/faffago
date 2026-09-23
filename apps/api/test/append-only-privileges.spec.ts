import { PGlite } from '@electric-sql/pglite';
import { applyMigrations } from './migrations';

/**
 * Append-only, proved from the application's own database role.
 *
 * `schema-constraints.spec.ts` proves the trigger fires. This one proves the
 * second layer: as `faffago_app`, the role the API actually connects as, the
 * privilege is not there at all, so an UPDATE is refused before any trigger
 * runs. Both layers matter — the trigger also binds the schema owner and
 * anyone with a psql prompt, the grants stop the application dead.
 *
 * The migration's grant block is conditional on the role existing, so the role
 * is created here first, exactly as the VPS does before the first deploy.
 */

const USER_ID = '11111111-1111-1111-1111-111111111111';
const SELLER_ID = '22222222-2222-2222-2222-222222222222';
const GOUVERNORAT_ID = '33333333-3333-3333-3333-333333333333';
const DELEGATION_ID = '44444444-4444-4444-4444-444444444444';
const PARCEL_ID = '55555555-5555-5555-5555-555555555555';
const EVENT_ID = '66666666-6666-6666-6666-666666666666';

let db: PGlite;

/** Runs one statement with the application's privileges, not the owner's. */
async function asApp(sql: string): Promise<void> {
  await db.exec('SET ROLE faffago_app;');
  try {
    await db.query(sql);
  } finally {
    await db.exec('RESET ROLE;');
  }
}

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(`CREATE ROLE faffago_app LOGIN PASSWORD 'test';`);
  await applyMigrations(db);

  await db.exec(`
    insert into users (id,role,username,phone,"passwordHash","firstName","lastName","updatedAt")
      values ('${USER_ID}','ADMIN','saif','20123456','h','Saif','B',now());
    insert into sellers (id,"userId","shopName","productCategory","contactFullName",
        "contactPhone",statut,"createdByUserId","updatedAt")
      values ('${SELLER_ID}','${USER_ID}','Boutique','Mode','Saif B','20123456','PATENTE','${USER_ID}',now());
    insert into gouvernorats (id,code,"nameFr","nameAr")
      values ('${GOUVERNORAT_ID}','TUN','Tunis','تونس');
    insert into delegations (id,"gouvernoratId",code,"nameFr","nameAr")
      values ('${DELEGATION_ID}','${GOUVERNORAT_ID}','TUN-BARDO','Le Bardo','باردو');
    insert into parcels (id,code,"sellerId","recipientName","recipientPhone","delegationId",address,
        "productDescription","codAmountMillimes","deliveryFeeMillimes","returnFeeMillimes",
        "changeClientFeeMillimes","createdByUserId","updatedAt")
      values ('${PARCEL_ID}','FG-8K2QX7AB','${SELLER_ID}','Client','29876543','${DELEGATION_ID}',
              'Rue X','2 bracelets',85000,7000,5000,1000,'${USER_ID}',now());
    insert into parcel_events (id,"parcelId",type,"newStatus")
      values ('${EVENT_ID}','${PARCEL_ID}','CREATION','CREE');
    insert into audit_log (id,action,"entityType","entityId")
      values (gen_random_uuid(),'FORCAGE_STATUT','parcel','${PARCEL_ID}');
  `);
});

afterAll(async () => {
  await db?.close();
});

describe('privileges of the application role', () => {
  it('grants only INSERT and SELECT on the append-only tables', async () => {
    const result = await db.query<{ table_name: string; privileges: string }>(`
      select table_name, string_agg(privilege_type, ',' order by privilege_type) as privileges
      from information_schema.role_table_grants
      where grantee = 'faffago_app' and table_name in ('parcel_events','audit_log')
      group by table_name order by table_name`);

    expect(result.rows).toEqual([
      { table_name: 'audit_log', privileges: 'INSERT,SELECT' },
      { table_name: 'parcel_events', privileges: 'INSERT,SELECT' },
    ]);
  });

  it('keeps ordinary tables fully writable', async () => {
    const result = await db.query<{ privileges: string }>(`
      select string_agg(privilege_type, ',' order by privilege_type) as privileges
      from information_schema.role_table_grants
      where grantee = 'faffago_app' and table_name = 'parcels'`);

    expect(result.rows[0]?.privileges).toBe('DELETE,INSERT,SELECT,UPDATE');
  });
});

describe('as faffago_app, the role the API connects as', () => {
  it('is refused an UPDATE on parcel_events', async () => {
    await expect(
      asApp(`update parcel_events set "reasonText" = 'modifié' where id = '${EVENT_ID}'`),
    ).rejects.toThrow(/permission denied for table parcel_events/);
  });

  it('is refused a DELETE on parcel_events', async () => {
    await expect(asApp(`delete from parcel_events where id = '${EVENT_ID}'`)).rejects.toThrow(
      /permission denied for table parcel_events/,
    );
  });

  it('is refused an UPDATE and a DELETE on audit_log', async () => {
    await expect(asApp(`update audit_log set reason = 'x'`)).rejects.toThrow(
      /permission denied for table audit_log/,
    );
    await expect(asApp(`delete from audit_log`)).rejects.toThrow(
      /permission denied for table audit_log/,
    );
  });

  it('can still append an event and read the history', async () => {
    await expect(
      asApp(`insert into parcel_events (id,"parcelId",type,"newStatus")
             values (gen_random_uuid(),'${PARCEL_ID}','RAMASSAGE','RAMASSE')`),
    ).resolves.toBeUndefined();

    await expect(asApp(`select count(*) from parcel_events`)).resolves.toBeUndefined();
  });

  it('can still update an ordinary table', async () => {
    await expect(
      asApp(`update parcels set "courierNote" = 'sonner deux fois' where id = '${PARCEL_ID}'`),
    ).resolves.toBeUndefined();
  });
});
