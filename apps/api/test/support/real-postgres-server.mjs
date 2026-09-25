// A throwaway PostgreSQL server for the tests that PGlite cannot prove.
//
// `embedded-postgres` ships the official PostgreSQL binaries for each platform
// through npm, so this needs neither Docker nor an installed server. It is an
// ES module and Jest runs the API tests as CommonJS, hence this separate
// process: it starts the server, prints one JSON line with the port and the
// superuser password, and stops the server when its stdin closes (the test
// ends it, or the test process dies).
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

const dir = mkdtempSync(join(tmpdir(), 'faffago-pg-'));
const port = await freePort();
const password = randomBytes(16).toString('hex');
const server = new EmbeddedPostgres({
  databaseDir: join(dir, 'data'),
  user: 'postgres',
  password,
  port,
  persistent: false,
  // UTF-8 whatever the machine's code page: on Windows initdb would pick
  // WIN1252, which cannot hold the migrations' Arabic and box characters.
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  onLog: () => {},
  onError: (message) => process.stderr.write(`${message}\n`),
});

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  try {
    await server.stop();
  } finally {
    rmSync(dir, { recursive: true, force: true });
    process.exit(0);
  }
}

await server.initialise();
await server.start();
await server.createDatabase('faffago');
process.stdout.write(`${JSON.stringify({ port, password })}\n`);

process.stdin.on('end', stop);
process.stdin.on('close', stop);
process.stdin.resume();
