import type { PGlite } from '@electric-sql/pglite';
import type { Prisma } from '@prisma/client';
import { PrismaPGlite } from 'pglite-prisma-adapter';

/**
 * The Prisma adapter for PGlite, with commit errors that reach the caller.
 *
 * `pglite-prisma-adapter` 0.6.1 swallows an error raised by COMMIT: PostgreSQL
 * rolls the transaction back, but `$transaction` resolves as if it had
 * committed. The deferred trigger that ties every status change to an event
 * (D-21) raises its error exactly there, so a test would see success for a
 * write that never happened.
 *
 * Before the real COMMIT this runs `SET CONSTRAINTS ALL IMMEDIATE`, which
 * fires the deferred triggers while the transaction is still open: the same
 * check PostgreSQL makes at commit, a moment earlier, and its error travels
 * like any other query error. Tests only; the production driver reports a
 * failed COMMIT itself.
 */

interface Queryable {
  executeRaw(query: { sql: string; args: unknown[]; argTypes: unknown[] }): Promise<number>;
}

interface AdapterTransaction extends Queryable {
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

interface Adapter extends Queryable {
  startTransaction(isolationLevel?: string): Promise<AdapterTransaction>;
}

interface AdapterFactory {
  connect(): Promise<Adapter>;
}

export function pgliteAdapter(db: PGlite): Prisma.PrismaClientOptions['adapter'] {
  const factory = new PrismaPGlite(db) as unknown as AdapterFactory;
  const connect = factory.connect.bind(factory);

  factory.connect = async () => {
    const adapter = await connect();
    const startTransaction = adapter.startTransaction.bind(adapter);
    adapter.startTransaction = async (isolationLevel) => {
      const tx = await startTransaction(isolationLevel);
      const commit = tx.commit.bind(tx);
      tx.commit = async () => {
        // On an error Prisma calls rollback() itself, which settles the
        // transaction PGlite is holding open.
        await tx.executeRaw({ sql: 'SET CONSTRAINTS ALL IMMEDIATE', args: [], argTypes: [] });
        await commit();
      };
      return tx;
    };
    return adapter;
  };

  // The adapter is typed against @prisma/driver-adapter-utils 6.10 and the
  // client against 6.19; the protocol is the same, only the type copies differ.
  return factory as unknown as Prisma.PrismaClientOptions['adapter'];
}
