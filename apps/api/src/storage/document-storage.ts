import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

/**
 * Where the encrypted seller documents live (D-32). Never a public URL: only
 * the API reads them, and only for the admin.
 *
 * Files are write-once: a document that changes is a new file under a new
 * key. That is what lets the nightly backup copy the directory after the
 * database dump and still find every file a row points to.
 */
export interface DocumentStorage {
  /** Refuses to overwrite: a key is written once. */
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  /** Only to undo a write whose database transaction failed. */
  discard(key: string): Promise<void>;
  /** Every stored key, for `documents:verify`. */
  keys(): AsyncIterable<string>;
}

export const DOCUMENT_STORAGE = Symbol('DOCUMENT_STORAGE');

const KEY_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function newStorageKey(): string {
  return randomUUID();
}

/**
 * The server's own disk, in a directory only the API's system user can read
 * (0700 directories, 0600 files; the modes are ignored on Windows). Keys are
 * random UUIDs, spread over two levels of directories so no folder grows to
 * tens of thousands of entries.
 */
export class LocalDiskStorage implements DocumentStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = isAbsolute(root) ? root : resolve(process.cwd(), root);
  }

  private pathOf(key: string): string {
    if (!KEY_FORMAT.test(key)) throw new Error(`Clé de stockage invalide : ${key}`);
    return join(this.root, key.slice(0, 2), key.slice(2, 4), key);
  }

  async put(key: string, data: Buffer): Promise<void> {
    const path = this.pathOf(key);
    await mkdir(join(path, '..'), { recursive: true, mode: 0o700 });
    if (await exists(path)) throw new Error(`Le fichier ${key} existe déjà`);

    // Written beside, flushed to disk, then renamed: a crash never leaves a
    // half-written document under a real key.
    const temporary = `${path}.${randomUUID()}.tmp`;
    const handle = await open(temporary, 'wx', 0o600);
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, path);
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.pathOf(key));
  }

  async discard(key: string): Promise<void> {
    await rm(this.pathOf(key), { force: true });
  }

  async *keys(): AsyncIterable<string> {
    if (!(await exists(this.root))) return;
    for (const first of await readdir(this.root)) {
      for (const second of await readdir(join(this.root, first)).catch(() => [])) {
        for (const name of await readdir(join(this.root, first, second)).catch(() => [])) {
          if (KEY_FORMAT.test(name)) yield name;
        }
      }
    }
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
