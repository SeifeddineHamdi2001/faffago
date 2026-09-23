import { PGlite } from '@electric-sql/pglite';
import { applyMigrations } from './migrations';

/**
 * No status change without its event, enforced by the database (D-21).
 *
 * The parcel event service is the only code that moves a parcel. This proves
 * that anything else — a bug, a hand-written UPDATE, a future service that
 * forgets — is refused at commit, whoever runs it, the application's own role
 * included.
 */

const USER_ID = '11111111-1111-1111-1111-111111111111';
const SELLER_ID = '22222222-2222-2222-2222-222222222222';
const DELEGATION_ID = '44444444-4444-4444-4444-444444444444';
const LOCALITE_ID = '77777777-7777-7777-7777-777777777777';

let db: PGlite;
let counter = 0;

function nextParcelId(): string {
  counter += 1;
  return `aaaaaaaa-0000-0000-0000-${String(counter).padStart(12, '0')}`;
}

function insertParcel(id: string): string {
  return `insert into parcels (id,code,"sellerId","recipientName","recipientPhone","delegationId",
      "localiteId",address,"productDescription","codAmountMillimes","deliveryFeeMillimes",
      "returnFeeMillimes","changeClientFeeMillimes","createdByUserId","updatedAt")
    values ('${id}','FG-${String(counter).padStart(8, '0')}','${SELLER_ID}','Client','29876543',
      '${DELEGATION_ID}','${LOCALITE_ID}','Rue X','Article',85000,5500,2000,1000,'${USER_ID}',now());`;
}

function insertEvent(
  parcelId: string,
  type: string,
  newStatus: string,
  newLocation: string,
): string {
  return `insert into parcel_events ("id","parcelId",type,"newStatus","newLocation")
    values (gen_random_uuid(),'${parcelId}','${type}','${newStatus}','${newLocation}');`;
}

async function transaction(...statements: string[]): Promise<void> {
  await db.exec(`BEGIN; ${statements.join('\n')} COMMIT;`);
}

/** A parcel created the proper way, with its CREATION event. */
async function createdParcel(): Promise<string> {
  const id = nextParcelId();
  await transaction(insertParcel(id), insertEvent(id, 'CREATION', 'CREE', 'CHEZ_LE_VENDEUR'));
  return id;
}

async function stateOf(id: string): Promise<{ status: string; location: string } | undefined> {
  const result = await db.query<{ status: string; location: string }>(
    'select status, location from parcels where id = $1',
    [id],
  );
  return result.rows[0];
}

async function eventCount(id: string): Promise<number> {
  const result = await db.query<{ n: number }>(
    'select count(*)::int as n from parcel_events where "parcelId" = $1',
    [id],
  );
  return result.rows[0]?.n ?? 0;
}

async function expectRefused(promise: Promise<unknown>): Promise<void> {
  await expect(promise).rejects.toThrow(/sans événement/);
  // A failed COMMIT leaves no transaction open behind it.
  await db.exec('ROLLBACK;').catch(() => undefined);
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
      values ('33333333-3333-3333-3333-333333333333','TUN','Tunis','تونس');
    insert into delegations (id,"gouvernoratId",code,"nameFr","nameAr")
      values ('${DELEGATION_ID}','33333333-3333-3333-3333-333333333333','TUN-BARDO','Le Bardo','باردو');
    insert into localites (id,"delegationId","nameFr","updatedAt")
      values ('${LOCALITE_ID}','${DELEGATION_ID}','Khaznadar',now());
  `);
});

afterAll(async () => {
  await db.close();
});

describe('creating a parcel', () => {
  it('is refused without its CREATION event, and nothing is stored', async () => {
    const id = nextParcelId();
    await expectRefused(db.exec(insertParcel(id)));
    expect(await stateOf(id)).toBeUndefined();
  });

  it('is accepted with an event in the same transaction ending in its state', async () => {
    const id = await createdParcel();
    expect(await stateOf(id)).toEqual({ status: 'CREE', location: 'CHEZ_LE_VENDEUR' });
  });

  it('is refused when the event names another state', async () => {
    const id = nextParcelId();
    await expectRefused(
      transaction(insertParcel(id), insertEvent(id, 'CREATION', 'CREE', 'AU_DEPOT')),
    );
    expect(await stateOf(id)).toBeUndefined();
  });
});

describe('moving a parcel', () => {
  it('is refused as a bare UPDATE, and the parcel stays where it was', async () => {
    const id = await createdParcel();
    await expectRefused(db.exec(`update parcels set status = 'ANNULE' where id = '${id}';`));
    expect(await stateOf(id)).toEqual({ status: 'CREE', location: 'CHEZ_LE_VENDEUR' });
  });

  it('is refused when only the location moves', async () => {
    const id = await createdParcel();
    await expectRefused(db.exec(`update parcels set location = 'AU_DEPOT' where id = '${id}';`));
    expect((await stateOf(id))?.location).toBe('CHEZ_LE_VENDEUR');
  });

  it('is accepted with its event in the same transaction', async () => {
    const id = await createdParcel();
    await transaction(
      `update parcels set status = 'RAMASSE', location = 'AVEC_LE_RAMASSEUR' where id = '${id}';`,
      insertEvent(id, 'RAMASSAGE', 'RAMASSE', 'AVEC_LE_RAMASSEUR'),
    );
    expect(await stateOf(id)).toEqual({ status: 'RAMASSE', location: 'AVEC_LE_RAMASSEUR' });
    expect(await eventCount(id)).toBe(2);
  });

  it('does not accept an event written by an earlier transaction', async () => {
    const id = await createdParcel();
    await transaction(insertEvent(id, 'ANNULATION', 'ANNULE', 'CHEZ_LE_VENDEUR'));
    await expectRefused(db.exec(`update parcels set status = 'ANNULE' where id = '${id}';`));
    expect((await stateOf(id))?.status).toBe('CREE');
  });

  it('checks the state the transaction ends in, however many steps it took', async () => {
    const id = await createdParcel();
    // Two events, one per step, like the third failed attempt (D-8).
    await transaction(
      `update parcels set status = 'RAMASSE', location = 'AVEC_LE_RAMASSEUR' where id = '${id}';`,
      insertEvent(id, 'RAMASSAGE', 'RAMASSE', 'AVEC_LE_RAMASSEUR'),
      `update parcels set status = 'AU_DEPOT', location = 'AU_DEPOT' where id = '${id}';`,
      insertEvent(id, 'ENTREE_DEPOT', 'AU_DEPOT', 'AU_DEPOT'),
    );
    expect(await stateOf(id)).toEqual({ status: 'AU_DEPOT', location: 'AU_DEPOT' });

    // An event for an intermediate state does not cover a final one.
    await expectRefused(
      transaction(
        `update parcels set status = 'EN_LIVRAISON', location = 'AVEC_LE_LIVREUR' where id = '${id}';`,
        insertEvent(id, 'SORTIE_COURSIER', 'EN_LIVRAISON', 'AVEC_LE_LIVREUR'),
        `update parcels set status = 'LIVRE', location = 'CHEZ_LE_CLIENT' where id = '${id}';`,
      ),
    );
    expect(await stateOf(id)).toEqual({ status: 'AU_DEPOT', location: 'AU_DEPOT' });
  });

  it('leaves the other columns free: a phone correction needs no event', async () => {
    const id = await createdParcel();
    await db.exec(`update parcels set "recipientPhone" = '98765432' where id = '${id}';`);
    const result = await db.query<{ phone: string }>(
      'select "recipientPhone" as phone from parcels where id = $1',
      [id],
    );
    expect(result.rows[0]?.phone).toBe('98765432');
  });

  it('binds the application role as much as the owner', async () => {
    const id = await createdParcel();
    await db.exec('SET ROLE faffago_app;');
    try {
      await expectRefused(db.exec(`update parcels set status = 'ANNULE' where id = '${id}';`));
    } finally {
      await db.exec('RESET ROLE;');
    }
    expect((await stateOf(id))?.status).toBe('CREE');
  });
});
