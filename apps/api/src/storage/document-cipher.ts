import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM for the seller documents, in the application, before a file
 * reaches the disk (D-32). A copied disk, a provider snapshot or a leaked
 * backup never shows a CIN.
 *
 * Each file records the id of the key that encrypted it. Rotating means
 * adding a new current key and keeping the old ones listed as previous until
 * every file has been re-encrypted.
 *
 * The associated data is the file's storage key: a file moved onto another
 * document's name fails to decrypt instead of showing the wrong CIN.
 */

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;

export interface Sealed {
  keyId: string;
  iv: Buffer;
  tag: Buffer;
  ciphertext: Buffer;
}

export class DocumentCipher {
  constructor(
    private readonly keys: ReadonlyMap<string, Buffer>,
    private readonly currentKeyId: string,
  ) {
    if (!keys.has(currentKeyId)) throw new Error(`Clé de chiffrement ${currentKeyId} absente`);
    for (const [id, key] of keys) {
      if (key.length !== KEY_BYTES) throw new Error(`La clé ${id} doit faire 32 octets`);
    }
  }

  seal(plaintext: Buffer, associatedData: string): Sealed {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.keys.get(this.currentKeyId)!, iv);
    cipher.setAAD(Buffer.from(associatedData, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return { keyId: this.currentKeyId, iv, tag: cipher.getAuthTag(), ciphertext };
  }

  /** Throws when the key is unknown, or when the file or its metadata were altered. */
  open(sealed: Sealed, associatedData: string): Buffer {
    const key = this.keys.get(sealed.keyId);
    if (!key) throw new Error(`Clé de chiffrement ${sealed.keyId} inconnue`);
    const decipher = createDecipheriv(ALGORITHM, key, sealed.iv);
    decipher.setAAD(Buffer.from(associatedData, 'utf8'));
    decipher.setAuthTag(sealed.tag);
    return Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]);
  }
}

const KEY_ID_FORMAT = /^[A-Za-z0-9_-]{1,32}$/;

function decodeKey(name: string, value: string | undefined): Buffer {
  if (!value || value === 'CHANGE_ME') {
    throw new Error(`${name} doit être défini (voir .env.example).`);
  }
  const key = Buffer.from(value, 'base64');
  if (key.length !== KEY_BYTES || key.toString('base64') !== value.trim()) {
    throw new Error(
      `${name} doit être 32 octets aléatoires encodés en base64, par exemple \`openssl rand -base64 32\`.`,
    );
  }
  return key;
}

/**
 * Reads the keyring from the environment and refuses to start on a missing,
 * placeholder or malformed key, like the JWT secrets.
 *
 *   STORAGE_ENCRYPTION_KEY_ID         id written with each new file
 *   STORAGE_ENCRYPTION_KEY            that key, base64
 *   STORAGE_ENCRYPTION_PREVIOUS_KEYS  "id:base64,id:base64", after a rotation
 */
export function cipherFromEnv(get: (name: string) => string | undefined): DocumentCipher {
  const currentId = get('STORAGE_ENCRYPTION_KEY_ID')?.trim();
  if (!currentId || !KEY_ID_FORMAT.test(currentId)) {
    throw new Error('STORAGE_ENCRYPTION_KEY_ID doit être défini : lettres, chiffres, - ou _.');
  }
  const keys = new Map<string, Buffer>([
    [currentId, decodeKey('STORAGE_ENCRYPTION_KEY', get('STORAGE_ENCRYPTION_KEY')?.trim())],
  ]);
  const previous = get('STORAGE_ENCRYPTION_PREVIOUS_KEYS')?.trim();
  for (const entry of previous ? previous.split(',') : []) {
    const [id, value] = entry.trim().split(':');
    if (!id || !KEY_ID_FORMAT.test(id) || keys.has(id)) {
      throw new Error('STORAGE_ENCRYPTION_PREVIOUS_KEYS : "id:clé" séparés par des virgules.');
    }
    keys.set(id, decodeKey(`STORAGE_ENCRYPTION_PREVIOUS_KEYS (${id})`, value));
  }
  return new DocumentCipher(keys, currentId);
}
