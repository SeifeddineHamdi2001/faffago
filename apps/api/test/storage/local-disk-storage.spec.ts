import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalDiskStorage, newStorageKey } from '../../src/storage/document-storage';

/** The documents directory (D-32): write-once files, named by UUID only. */

let root: string;
let storage: LocalDiskStorage;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'faffago-storage-'));
  storage = new LocalDiskStorage(root);
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

async function allKeys(): Promise<string[]> {
  const keys: string[] = [];
  for await (const key of storage.keys()) keys.push(key);
  return keys.sort();
}

describe('LocalDiskStorage', () => {
  it('writes and reads a file under two levels of folders', async () => {
    const key = newStorageKey();
    await storage.put(key, Buffer.from('chiffré'));
    expect(await storage.get(key)).toEqual(Buffer.from('chiffré'));
    expect(readdirSync(join(root, key.slice(0, 2), key.slice(2, 4)))).toEqual([key]);
  });

  it('never overwrites a file', async () => {
    const key = newStorageKey();
    await storage.put(key, Buffer.from('a'));
    await expect(storage.put(key, Buffer.from('b'))).rejects.toThrow(/existe déjà/);
    expect(await storage.get(key)).toEqual(Buffer.from('a'));
  });

  it('refuses a key that is not a UUID, so no path can escape the folder', async () => {
    await expect(storage.put('../../etc/passwd', Buffer.from('x'))).rejects.toThrow(/invalide/);
    await expect(storage.get('../secret')).rejects.toThrow(/invalide/);
  });

  it('lists every stored key, and nothing left over from a write', async () => {
    const a = newStorageKey();
    const b = newStorageKey();
    await storage.put(a, Buffer.from('a'));
    await storage.put(b, Buffer.from('b'));
    expect(await allKeys()).toEqual([a, b].sort());
  });

  it('discards a file, and a missing one quietly', async () => {
    const key = newStorageKey();
    await storage.put(key, Buffer.from('a'));
    await storage.discard(key);
    await storage.discard(key);
    expect(await allKeys()).toEqual([]);
  });

  it('lists nothing before the first document', async () => {
    const empty = new LocalDiskStorage(join(root, 'pas-encore-créé'));
    const keys: string[] = [];
    for await (const key of empty.keys()) keys.push(key);
    expect(keys).toEqual([]);
  });
});
