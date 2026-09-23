/**
 * Parcel codes and document numbers.
 *
 * Parcel codes are random, never sequential, because anyone can query the
 * public tracking endpoint with one (Landing 4.4).
 */

/**
 * Crockford base32: the digits, minus I, L, O and U.
 *
 * I/1 and O/0 are the two pairs a depot clerk misreads off a damaged thermal
 * label, and U is excluded so a random code cannot spell an offensive word.
 */
export const PARCEL_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const PARCEL_CODE_PREFIX = 'FG-';
/** 8 characters over 32 symbols: about 1.1e12 codes (A-19). */
export const PARCEL_CODE_LENGTH = 8;

const PARCEL_CODE_RE = new RegExp(`^FG-[${PARCEL_CODE_ALPHABET}]{${PARCEL_CODE_LENGTH}}$`);

/** Injected so tests are deterministic and the API can use a CSPRNG. */
export type RandomBytes = (size: number) => Uint8Array;

/**
 * Draws a code with rejection sampling, so every symbol is equally likely.
 * A plain modulo over 256 would favour the first 32 symbols of the alphabet.
 */
export function generateParcelCode(randomBytes: RandomBytes): string {
  const limit = 256 - (256 % PARCEL_CODE_ALPHABET.length);
  let code = '';
  while (code.length < PARCEL_CODE_LENGTH) {
    const chunk = randomBytes(PARCEL_CODE_LENGTH);
    for (const byte of chunk) {
      if (byte >= limit) continue;
      code += PARCEL_CODE_ALPHABET[byte % PARCEL_CODE_ALPHABET.length];
      if (code.length === PARCEL_CODE_LENGTH) break;
    }
  }
  return PARCEL_CODE_PREFIX + code;
}

/**
 * Cleans up what a human typed or a scanner read: lower case, missing prefix,
 * spaces, and the Crockford substitutions (I and L read as 1, O as 0).
 */
export function normalizeParcelCode(input: string): string {
  // \s already matches the non-breaking and narrow no-break spaces that come
  // with a code copied out of a PDF, so they need no escape of their own.
  let body = String(input)
    .toUpperCase()
    .replace(/[\s.\-_]/g, '');
  if (body.startsWith('FG')) body = body.slice(2);
  body = body.replace(/[IL]/g, '1').replace(/O/g, '0');
  return PARCEL_CODE_PREFIX + body;
}

export function isValidParcelCode(input: string): boolean {
  return PARCEL_CODE_RE.test(input);
}

export const BonNumberKind = {
  BON_VERSEMENT: 'BV',
  BON_RETOUR: 'BR',
} as const;
export type BonNumberKind = (typeof BonNumberKind)[keyof typeof BonNumberKind];

/**
 * `BV-2026-0921-01` (Vendeur 4.11) and `BR-2026-0921-01` (Vendeur 4.12).
 * The sequence is per kind and per day, taken from `document_counters` inside
 * the same transaction that creates the document.
 */
export function formatBonNumber(kind: BonNumberKind, date: Date, sequence: number): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${kind}-${year}-${month}${day}-${String(sequence).padStart(2, '0')}`;
}

/** The `dateKey` used by the counter row. */
export function documentDateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** 8 digits, Tunisian format. Vendeur 4.2. */
const TUNISIAN_PHONE_RE = /^[2-59]\d{7}$/;

export function normalizePhone(input: string): string {
  return String(input)
    .replace(/[\s.\-()]/g, '')
    .replace(/^\+?216/, '');
}

export function isValidTunisianPhone(input: string): boolean {
  return TUNISIAN_PHONE_RE.test(normalizePhone(input));
}
