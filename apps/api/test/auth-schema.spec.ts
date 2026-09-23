import { PGlite } from '@electric-sql/pglite';
import { applyMigrations } from './migrations';

/**
 * The auth rules the database holds on its own, whatever the service layer
 * does (migration 20260925000000_auth_sessions).
 */

let db: PGlite;
let n = 0;

beforeAll(async () => {
  db = await PGlite.create();
  await applyMigrations(db);
});
afterAll(async () => {
  await db.close();
});

async function user(role: string, phone: string): Promise<string> {
  n += 1;
  const identifier =
    role === 'VENDEUR'
      ? { col: 'email', value: `v${n}@mail.tn` }
      : ['ADMIN', 'DEPOT', 'SERVICE_CLIENT'].includes(role)
        ? { col: 'username', value: `staff.${n}` }
        : null;
  const { rows } = await db.query<{ id: string }>(
    `insert into users (id, role, ${identifier ? `"${identifier.col}",` : ''} phone, "passwordHash",
       "firstName", "lastName", "updatedAt")
     values (gen_random_uuid(), $1, ${identifier ? '$3,' : ''} $2, 'h', 'P', 'N', now())
     returning id`,
    identifier ? [role, phone, identifier.value] : [role, phone],
  );
  return rows[0]!.id;
}

describe('Q8: two staff members never share a phone', () => {
  it('refuses the same phone on a Dépôt and a Service client account', async () => {
    await user('DEPOT', '52000001');
    await expect(user('SERVICE_CLIENT', '52000001')).rejects.toThrow(/users_staff_phone_key/);
  });

  it('still lets a staff phone also be a courier or a seller phone', async () => {
    await user('ADMIN', '52000002');
    await expect(user('LIVREUR', '52000002')).resolves.toEqual(expect.any(String));
    await expect(user('VENDEUR', '52000002')).resolves.toEqual(expect.any(String));
  });

  it('still lets one phone carry a livreur and a ramasseur account (Admin 4.15)', async () => {
    await user('LIVREUR', '52000003');
    await expect(user('RAMASSEUR', '52000003')).resolves.toEqual(expect.any(String));
  });
});

describe('impersonation_sessions (D-5)', () => {
  let adminId: string;
  let sessionId: string;
  let sellerId: string;

  beforeAll(async () => {
    adminId = await user('ADMIN', '52000010');
    const sellerUser = await user('VENDEUR', '52000011');
    sessionId = (
      await db.query<{ id: string }>(
        `insert into refresh_tokens (id, "userId", client, "tokenHash", "expiresAt")
         values (gen_random_uuid(), $1, 'WEB', 'hash-1', now() + interval '7 days') returning id`,
        [adminId],
      )
    ).rows[0]!.id;
    sellerId = (
      await db.query<{ id: string }>(
        `insert into sellers (id, "userId", "shopName", "productCategory", "contactFullName",
           "contactPhone", statut, "createdByUserId", "updatedAt")
         values (gen_random_uuid(), $1, 'B', 'Mode', 'C', '52000011', 'PATENTE', $2, now())
         returning id`,
        [sellerUser, adminId],
      )
    ).rows[0]!.id;
  });

  function view(duration: string, extra = ''): Promise<unknown> {
    return db.query(
      `insert into impersonation_sessions (id, "adminUserId", "adminSessionId", "sellerId",
         "startedAt", "expiresAt" ${extra ? ', "endedAt", "endReason"' : ''})
       values (gen_random_uuid(), $1, $2, $3, now(), now() + interval '${duration}' ${extra})`,
      [adminId, sessionId, sellerId],
    );
  }

  it('accepts 30 minutes', async () => {
    await expect(view('30 minutes')).resolves.toBeDefined();
  });

  it('refuses anything longer than 30 minutes', async () => {
    await expect(view('31 minutes')).rejects.toThrow(/impersonation_sessions_duration/);
  });

  it('requires an end reason with an end time', async () => {
    await expect(view('30 minutes', ', now(), null')).rejects.toThrow(
      /impersonation_sessions_end_is_complete/,
    );
  });

  it('every session states whether it is web or the courier app', async () => {
    await expect(
      db.query(
        `insert into refresh_tokens (id, "userId", "tokenHash", "expiresAt")
         values (gen_random_uuid(), $1, 'hash-2', now())`,
        [adminId],
      ),
    ).rejects.toThrow(/client/);
  });
});
