import { randomBytes } from 'node:crypto';
import { DocumentCipher, cipherFromEnv } from '../../src/storage/document-cipher';

/**
 * AES-256-GCM for the seller documents (D-32): what goes in comes out, and
 * anything altered — the file, its metadata, its name — refuses to open.
 */

const KEY_A = randomBytes(32);
const KEY_B = randomBytes(32);
const CIN = Buffer.from('CIN 01234567 · Yasmine Trabelsi');

function cipher(current = 'k1') {
  return new DocumentCipher(
    new Map([
      ['k1', KEY_A],
      ['k2', KEY_B],
    ]),
    current,
  );
}

describe('DocumentCipher', () => {
  it('opens what it sealed, and records the key id', () => {
    const sealed = cipher().seal(CIN, 'storage-key');
    expect(sealed.keyId).toBe('k1');
    expect(sealed.iv).toHaveLength(12);
    expect(sealed.tag).toHaveLength(16);
    expect(sealed.ciphertext.includes(CIN)).toBe(false);
    expect(cipher().open(sealed, 'storage-key')).toEqual(CIN);
  });

  it('never reuses an IV', () => {
    const a = cipher().seal(CIN, 'x');
    const b = cipher().seal(CIN, 'x');
    expect(a.iv.equals(b.iv)).toBe(false);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
  });

  it('refuses a file altered on disk', () => {
    const sealed = cipher().seal(CIN, 'storage-key');
    sealed.ciphertext[0] = sealed.ciphertext[0]! ^ 0x01;
    expect(() => cipher().open(sealed, 'storage-key')).toThrow();
  });

  it("refuses a file moved onto another document's name", () => {
    const sealed = cipher().seal(CIN, 'storage-key-a');
    expect(() => cipher().open(sealed, 'storage-key-b')).toThrow();
  });

  it('refuses a tag or IV that does not match', () => {
    const sealed = cipher().seal(CIN, 'k');
    expect(() => cipher().open({ ...sealed, tag: randomBytes(16) }, 'k')).toThrow();
    expect(() => cipher().open({ ...sealed, iv: randomBytes(12) }, 'k')).toThrow();
  });

  it('opens a file sealed with a previous key after a rotation', () => {
    const old = cipher('k1').seal(CIN, 'k');
    const rotated = cipher('k2');
    expect(rotated.seal(CIN, 'k').keyId).toBe('k2');
    expect(rotated.open(old, 'k')).toEqual(CIN);
  });

  it('refuses a file sealed with a key it does not have', () => {
    const sealed = cipher().seal(CIN, 'k');
    const without = new DocumentCipher(new Map([['k2', KEY_B]]), 'k2');
    expect(() => without.open(sealed, 'k')).toThrow(/inconnue/);
  });
});

describe('the key from the environment: the API refuses to start without a good one', () => {
  const good = KEY_A.toString('base64');
  const env =
    (values: Record<string, string | undefined>) =>
    (name: string): string | undefined =>
      values[name];

  it('reads the current key and the previous ones', () => {
    const c = cipherFromEnv(
      env({
        STORAGE_ENCRYPTION_KEY_ID: 'k2',
        STORAGE_ENCRYPTION_KEY: KEY_B.toString('base64'),
        STORAGE_ENCRYPTION_PREVIOUS_KEYS: `k1:${good}`,
      }),
    );
    const old = cipher('k1').seal(CIN, 'k');
    expect(c.open(old, 'k')).toEqual(CIN);
    expect(c.seal(CIN, 'k').keyId).toBe('k2');
  });

  it.each([
    ['missing id', { STORAGE_ENCRYPTION_KEY: good }],
    ['bad id', { STORAGE_ENCRYPTION_KEY_ID: 'k 1', STORAGE_ENCRYPTION_KEY: good }],
    ['missing key', { STORAGE_ENCRYPTION_KEY_ID: 'k1' }],
    ['placeholder', { STORAGE_ENCRYPTION_KEY_ID: 'k1', STORAGE_ENCRYPTION_KEY: 'CHANGE_ME' }],
    [
      'short key',
      {
        STORAGE_ENCRYPTION_KEY_ID: 'k1',
        STORAGE_ENCRYPTION_KEY: randomBytes(16).toString('base64'),
      },
    ],
    ['not base64', { STORAGE_ENCRYPTION_KEY_ID: 'k1', STORAGE_ENCRYPTION_KEY: 'x'.repeat(44) }],
    [
      'malformed previous keys',
      {
        STORAGE_ENCRYPTION_KEY_ID: 'k1',
        STORAGE_ENCRYPTION_KEY: good,
        STORAGE_ENCRYPTION_PREVIOUS_KEYS: 'k0',
      },
    ],
    [
      'previous key reusing the current id',
      {
        STORAGE_ENCRYPTION_KEY_ID: 'k1',
        STORAGE_ENCRYPTION_KEY: good,
        STORAGE_ENCRYPTION_PREVIOUS_KEYS: `k1:${good}`,
      },
    ],
  ])('refuses: %s', (_label, values) => {
    expect(() => cipherFromEnv(env(values))).toThrow();
  });
});
