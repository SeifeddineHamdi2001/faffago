import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { Client } from 'pg';

/**
 * A real PostgreSQL 17 server, for what PGlite cannot prove: several
 * connections at once (row locks), and the production Prisma setup — the
 * real driver, no test adapter, connected as `faffago_app` with its password.
 *
 * The server is started in its own process (`real-postgres-server.mjs`), the
 * migrations are applied with `prisma migrate deploy` exactly as on the
 * server, as the owner, and the application role gets a password of its own.
 */

export interface RealPostgres {
  /** The owner (superuser): migrations, and setting up a test. */
  ownerUrl: string;
  /** What the API connects as in production (tech-stack; init migration). */
  appUrl: string;
  stop(): Promise<void>;
}

const API_DIR = join(__dirname, '..', '..');

export async function startRealPostgres(): Promise<RealPostgres> {
  const child = spawn(process.execPath, [join(__dirname, 'real-postgres-server.mjs')], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr!.on('data', (chunk) => (stderr += String(chunk)));

  const stop = () =>
    new Promise<void>((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once('exit', () => resolve());
      child.stdin!.end();
    });

  try {
    const { port, password } = await firstLine(child, () => stderr);
    const ownerUrl = `postgresql://postgres:${password}@127.0.0.1:${port}/faffago?schema=public`;

    const appPassword = randomBytes(16).toString('hex');
    await withClient(ownerUrl, (client) =>
      client.query(`CREATE ROLE faffago_app LOGIN PASSWORD '${appPassword}'`),
    );

    execFileSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      { cwd: API_DIR, env: { ...process.env, DATABASE_URL: ownerUrl }, stdio: 'pipe' },
    );

    return {
      ownerUrl,
      appUrl: `postgresql://faffago_app:${appPassword}@127.0.0.1:${port}/faffago?schema=public`,
      stop,
    };
  } catch (error) {
    await stop();
    throw error;
  }
}

export async function withClient<T>(url: string, run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: url.replace('?schema=public', '') });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

function firstLine(
  child: ChildProcess,
  stderr: () => string,
): Promise<{ port: number; password: string }> {
  return new Promise((resolve, reject) => {
    const lines = createInterface({ input: child.stdout! });
    lines.once('line', (line) => {
      lines.close();
      resolve(JSON.parse(line) as { port: number; password: string });
    });
    child.once('exit', (code) =>
      reject(new Error(`PostgreSQL did not start (exit ${code}): ${stderr()}`)),
    );
  });
}
