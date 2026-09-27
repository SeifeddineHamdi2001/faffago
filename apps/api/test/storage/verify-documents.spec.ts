import { rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DocumentCipher } from '../../src/storage/document-cipher';
import { LocalDiskStorage, newStorageKey } from '../../src/storage/document-storage';
import { isHealthy, verifyDocuments } from '../../src/storage/verify-documents';
import { blob, png } from '../support/documents';
import {
  TEST_SECRETS,
  createTestApp,
  createUser,
  login,
  nextPhone,
  type TestApp,
} from '../support/test-app';

/** `documents:verify`: every row has its file, unaltered, readable (D-32). */

let t: TestApp;
let storage: LocalDiskStorage;
let cipher: DocumentCipher;

function fileOf(storageKey: string): string {
  const dir = join(t.storageDir, storageKey.slice(0, 2), storageKey.slice(2, 4));
  return join(dir, storageKey);
}

beforeAll(async () => {
  t = await createTestApp();
  storage = new LocalDiskStorage(t.storageDir);
  cipher = new DocumentCipher(
    new Map([['test1', Buffer.from(TEST_SECRETS.STORAGE_ENCRYPTION_KEY, 'base64')]]),
    'test1',
  );
  const admin = await createUser(t.prisma, { role: 'ADMIN', username: 'verif.admin' });
  const token = (await login(t, admin)).accessToken;
  for (const email of ['a@verif.tn', 'b@verif.tn']) {
    const form = new FormData();
    for (const [key, value] of Object.entries({
      shopName: 'Boutique',
      productCategory: 'AUTRE',
      contactFirstName: 'A',
      contactLastName: 'B',
      contactPhone: nextPhone(),
      email,
      statut: 'CIN_UNIQUEMENT',
      cinNumber: '01234567',
    })) {
      form.append(key, value);
    }
    form.append('CIN_RECTO', blob(await png()), 'r.png');
    form.append('CIN_VERSO', blob(await png()), 'v.png');
    expect((await t.request('POST', '/sellers', { token, form })).status).toBe(201);
  }
});
afterAll(async () => {
  await t.close();
});

describe('verifyDocuments', () => {
  it('finds every document in place, and opens each with the key', async () => {
    const report = await verifyDocuments(t.prisma, storage, cipher);
    expect(report).toEqual({ checked: 4, missing: [], altered: [], unreadable: [], orphans: [] });
    expect(isHealthy(report)).toBe(true);
  });

  it('reports a file opened with the wrong key as unreadable', async () => {
    const wrong = new DocumentCipher(new Map([['test1', Buffer.alloc(32, 9)]]), 'test1');
    const report = await verifyDocuments(t.prisma, storage, wrong);
    expect(report.unreadable).toHaveLength(4);
    expect(isHealthy(report)).toBe(false);
  });

  it('reports an orphan file without calling the set unhealthy, and deletes nothing', async () => {
    const orphan = newStorageKey();
    await storage.put(orphan, Buffer.from('reste'));
    const report = await verifyDocuments(t.prisma, storage);
    expect(report.orphans).toEqual([orphan]);
    expect(isHealthy(report)).toBe(true);
    expect(statSync(fileOf(orphan)).isFile()).toBe(true);
    await storage.discard(orphan);
  });

  it('reports an altered file and a missing one', async () => {
    const [first, second] = await t.prisma.sellerDocument.findMany({ orderBy: { id: 'asc' } });
    writeFileSync(fileOf(first!.storageKey), Buffer.from('remplacé'));
    rmSync(fileOf(second!.storageKey));

    const report = await verifyDocuments(t.prisma, storage);
    expect(report.altered).toEqual([first!.storageKey]);
    expect(report.missing).toEqual([second!.storageKey]);
    expect(isHealthy(report)).toBe(false);
  });
});
