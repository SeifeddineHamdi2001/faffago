import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import {
  COURIER_APP_HEADERS,
  createTestApp,
  createUser,
  login,
  type ApiResponse,
  type Fixture,
  type TestApp,
} from '../support/test-app';
import { startRealPostgres, withClient, type RealPostgres } from '../support/real-postgres';
import { createParcel } from '../support/work-fixtures';

/**
 * Required before any money is counted (PROGRESS, phase 3), on a real
 * PostgreSQL server with the production Prisma setup — the real driver, no
 * test adapter, connected as `faffago_app` with its password:
 *
 * 1. Two actions on one parcel at the same instant, above all two Livré
 *    scans: exactly one wins, one event, one delivery fee. PGlite has a single
 *    connection and cannot prove the `SELECT … FOR UPDATE` lock.
 * 2. An error raised at COMMIT by the D-21 trigger reaches the caller as a
 *    failure, which the PGlite adapter could not show (D-21, Tests).
 */

let pg: RealPostgres;
let t: TestApp;
let seller: Fixture;
let ali: Fixture;
let aliToken: string;
let sellerToken: string;

const NOW = '2026-09-25T08:00:00.000Z';

beforeAll(async () => {
  pg = await startRealPostgres();
  t = await createTestApp([], { databaseUrl: pg.appUrl });
  seller = await createUser(t.prisma, { role: 'VENDEUR', email: 'reel@boutique.tn' });
  ali = await createUser(t.prisma, { role: 'LIVREUR' });
  aliToken = (await login(t, ali)).accessToken;
  sellerToken = (await login(t, seller)).accessToken;
});
afterAll(async () => {
  await t?.close();
  await pg?.stop();
});

async function carried(): Promise<{ id: string; code: string }> {
  const id = await createParcel(t.prisma, {
    sellerId: seller.sellerId!,
    createdByUserId: seller.id,
    status: 'EN_LIVRAISON',
    location: 'AVEC_LE_LIVREUR',
    currentLivreurId: ali.courierId!,
  });
  return t.prisma.parcel.findUniqueOrThrow({ where: { id }, select: { id: true, code: true } });
}

function livre(code: string, clientScanId = randomUUID()) {
  return {
    kind: 'SCAN',
    clientScanId,
    source: 'APP_COURSIER',
    action: 'LIVRE',
    rawCode: code,
    collectedMillimes: '85000',
    deviceTime: NOW,
  };
}

function sync(operation: unknown): Promise<ApiResponse> {
  return t.request('POST', '/scans/courier', {
    token: aliToken,
    body: { operations: [operation] },
    headers: COURIER_APP_HEADERS,
  });
}

/** What the database holds for a parcel after the race. */
async function outcome(parcelId: string) {
  const [parcel, events, charges, acceptedScans] = await Promise.all([
    t.prisma.parcel.findUniqueOrThrow({ where: { id: parcelId } }),
    t.prisma.parcelEvent.findMany({ where: { parcelId, type: { not: 'FORCAGE_STATUT' } } }),
    t.prisma.sellerCharge.findMany({ where: { parcelId } }),
    t.prisma.scan.count({ where: { parcelId, accepted: true } }),
  ]);
  return { parcel, events, charges, acceptedScans };
}

/**
 * Holds the parcel's row lock from another connection while `race` starts,
 * waits until `waiters` API connections queue behind it, then lets them go.
 * Without this, two requests fired together might simply run one after the
 * other and the test would prove nothing.
 */
async function behindHeldLock<T>(parcelId: string, waiters: number, race: () => Promise<T>) {
  const url = pg.ownerUrl.replace('?schema=public', '');
  const holder = new Client({ connectionString: url });
  // Watched from its own connection: pg_stat_activity is read once per
  // transaction, so the holder would keep seeing the moment before the race.
  const watcher = new Client({ connectionString: url });
  await Promise.all([holder.connect(), watcher.connect()]);
  try {
    await holder.query('BEGIN');
    await holder.query('SELECT id FROM parcels WHERE id = $1 FOR UPDATE', [parcelId]);
    const running = race();
    const deadline = Date.now() + 4_000;
    for (;;) {
      const { rows } = await watcher.query<{ n: string }>(
        `SELECT count(*) AS n FROM pg_stat_activity
          WHERE usename = 'faffago_app' AND wait_event_type = 'Lock'`,
      );
      if (Number(rows[0]!.n) >= waiters) break;
      if (Date.now() > deadline) throw new Error('The requests never queued on the parcel lock');
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await holder.query('COMMIT');
    return await running;
  } finally {
    await Promise.all([holder.end(), watcher.end()]);
  }
}

describe('two Livré scans of one parcel at the same instant', () => {
  it('queues them on the row lock: one delivers, the other is refused', async () => {
    const p = await carried();

    const [first, second] = await behindHeldLock(p.id, 2, () =>
      Promise.all([sync(livre(p.code)), sync(livre(p.code))]),
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const results = [first.body.results[0], second.body.results[0]];
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toHaveLength(1);

    const { parcel, events, charges, acceptedScans } = await outcome(p.id);
    expect(parcel).toMatchObject({
      status: 'LIVRE',
      attemptCount: 1,
      cashStatus: 'CHEZ_LE_COURSIER',
    });
    expect(events.map((e) => e.type)).toEqual(['LIVRAISON']);
    expect(charges).toEqual([expect.objectContaining({ type: 'LIVRAISON', status: 'EN_ATTENTE' })]);
    expect(acceptedScans).toBe(1);
  });

  it('holds over many parcels raced without help', async () => {
    const parcels = await Promise.all(Array.from({ length: 10 }, () => carried()));

    await Promise.all(parcels.flatMap((p) => [sync(livre(p.code)), sync(livre(p.code))]));

    for (const p of parcels) {
      const { parcel, events, charges, acceptedScans } = await outcome(p.id);
      expect(parcel.status).toBe('LIVRE');
      expect(parcel.attemptCount).toBe(1);
      expect(events.map((e) => e.type)).toEqual(['LIVRAISON']);
      expect(charges.map((c) => c.type)).toEqual(['LIVRAISON']);
      expect(acceptedScans).toBe(1);
    }
  });

  it('answers the same scan sent twice at once with one result, written once', async () => {
    const p = await carried();
    const op = livre(p.code);

    const [first, second] = await behindHeldLock(p.id, 2, () => Promise.all([sync(op), sync(op)]));

    const results = [first.body.results[0], second.body.results[0]];
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results.map((r) => r.replayed).sort()).toEqual([false, true]);
    expect(await t.prisma.scan.count({ where: { clientScanId: op.clientScanId } })).toBe(1);
    const { events, charges } = await outcome(p.id);
    expect(events).toHaveLength(1);
    expect(charges).toHaveLength(1);
  });
});

describe('Livré and the seller’s Annuler at the same instant', () => {
  it('lets one win: never a delivery fee and a return fee on one parcel (A-1)', async () => {
    const p = await carried();

    const [scan, cancel] = await behindHeldLock(p.id, 2, () =>
      Promise.all([
        sync(livre(p.code)),
        t.request('POST', `/parcels/${p.code}/cancel`, { token: sellerToken }),
      ]),
    );

    const delivered = scan.body.results[0].ok === true;
    const cancelled = cancel.status === 200;
    expect(delivered !== cancelled).toBe(true);
    const { parcel, charges } = await outcome(p.id);
    if (delivered) {
      expect(parcel.status).toBe('LIVRE');
      expect(charges.map((c) => c.type)).toEqual(['LIVRAISON']);
    } else {
      expect(parcel.status).toBe('RETOUR_AU_DEPOT');
      expect(charges.map((c) => c.type)).toEqual(['RETOUR']);
    }
  });
});

describe('an error raised at COMMIT, with the production Prisma setup (D-21)', () => {
  it('reaches the caller of an interactive transaction as a failure', async () => {
    const p = await carried();

    await expect(
      t.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`UPDATE parcels SET status = 'LIVRE' WHERE id = ${p.id}::uuid`;
      }),
    ).rejects.toThrow(/sans événement|event|parcel_status/i);

    expect((await t.prisma.parcel.findUniqueOrThrow({ where: { id: p.id } })).status).toBe(
      'EN_LIVRAISON',
    );
  });

  it('reaches the caller of a batch transaction and of a single statement as a failure', async () => {
    const p = await carried();

    await expect(
      t.prisma.$transaction([
        t.prisma.$executeRaw`UPDATE parcels SET status = 'LIVRE' WHERE id = ${p.id}::uuid`,
      ]),
    ).rejects.toThrow();
    await expect(
      t.prisma.parcel.update({ where: { id: p.id }, data: { status: 'LIVRE' } }),
    ).rejects.toThrow();

    expect((await t.prisma.parcel.findUniqueOrThrow({ where: { id: p.id } })).status).toBe(
      'EN_LIVRAISON',
    );
  });
});

describe('the application role, connected with its password (phase 11 check)', () => {
  it('is the role the API runs as, and cannot rewrite the event log', async () => {
    const p = await carried();
    await withClient(pg.appUrl, async (client) => {
      const { rows } = await client.query<{ user: string }>('SELECT current_user AS user');
      expect(rows[0]!.user).toBe('faffago_app');
      await expect(
        client.query(`UPDATE parcel_events SET "reasonText" = 'x' WHERE "parcelId" = $1`, [p.id]),
      ).rejects.toThrow(/permission denied|append-only|refus/i);
    });
  });
});
