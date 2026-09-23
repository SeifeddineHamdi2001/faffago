/**
 * Money — integer millimes, always.
 *
 * 85,000 DT = 85000 millimes. The comma is the decimal separator (A-4).
 * No floating-point arithmetic ever touches money (CLAUDE.md, Money).
 * Rates are integers in basis points, so even a percentage stays exact.
 */

/** An amount of money, in millimes. 1 dinar = 1000 millimes. */
export type Millimes = bigint;

export const MILLIMES_PER_DINAR = 1000n;

/** Rate expressed in basis points. 300 bps = 3 %. */
export type BasisPoints = number;

export const BPS_DENOMINATOR = 10_000n;

const GROUP_SEPARATOR = ' ';
const DECIMAL_SEPARATOR = ',';

export class MoneyParseError extends Error {
  constructor(input: string, reason: string) {
    super(`Montant invalide "${input}" : ${reason}`);
    this.name = 'MoneyParseError';
  }
}

function groupThousands(digits: string): string {
  let out = '';
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += GROUP_SEPARATOR;
    out += digits[i];
  }
  return out;
}

/**
 * The one place money becomes text. `85000n` -> `"85,000 DT"`,
 * `1000000n` -> `"1 000,000 DT"`, `-5000n` -> `"-5,000 DT"`.
 */
export function formatDT(amount: Millimes, options: { suffix?: boolean } = {}): string {
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const dinars = abs / MILLIMES_PER_DINAR;
  const millimes = abs % MILLIMES_PER_DINAR;
  const body = `${groupThousands(dinars.toString())}${DECIMAL_SEPARATOR}${millimes
    .toString()
    .padStart(3, '0')}`;
  const sign = negative ? '-' : '';
  return options.suffix === false ? `${sign}${body}` : `${sign}${body} DT`;
}

/**
 * Reads an amount typed by a seller or read from a CSV cell.
 * Accepts `85`, `85,000`, `85.000`, `1 000,000`, `85,000 DT`.
 * Rejects anything with more than three decimals — a fourth decimal
 * would be a fraction of a millime, which cannot be paid in cash.
 */
export function parseDT(input: string): Millimes {
  const raw = String(input).trim();
  if (raw === '') throw new MoneyParseError(input, 'montant vide');

  const cleaned = raw
    .replace(/\u00a0|\u202f/g, ' ')
    .replace(/\s*DT\s*$/i, '')
    .replace(/\s/g, '')
    .trim();

  const match = /^(-)?(\d+)(?:[.,](\d{1,3}))?$/.exec(cleaned);
  if (!match) {
    throw new MoneyParseError(
      input,
      'utilisez le format 85,000 (au maximum trois décimales, le millime)',
    );
  }

  const [, sign, dinarPart, decimalPart = ''] = match;
  const millimes = BigInt(dinarPart!) * MILLIMES_PER_DINAR + BigInt(decimalPart.padEnd(3, '0'));
  return sign === '-' ? -millimes : millimes;
}

/** Same as {@link parseDT} but returns `null` instead of throwing. */
export function tryParseDT(input: string): Millimes | null {
  try {
    return parseDT(input);
  } catch {
    return null;
  }
}

export function sumMillimes(amounts: readonly Millimes[]): Millimes {
  return amounts.reduce<Millimes>((total, amount) => total + amount, 0n);
}

/**
 * Applies a basis-point rate with half-up rounding at the millime (A-3b).
 *
 * The accountant can change the rounding rule here and nowhere else.
 * Magnitude is rounded, then the sign is restored, so -0.5 rounds to -1
 * rather than towards zero.
 */
export function applyRateBps(base: Millimes, bps: BasisPoints): Millimes {
  if (!Number.isInteger(bps)) {
    throw new TypeError(`Un taux doit être un entier en points de base, reçu ${bps}`);
  }
  const product = base * BigInt(bps);
  const negative = product < 0n;
  const abs = negative ? -product : product;
  // floor(abs / d + 1/2), computed on integers only.
  const rounded = (abs * 2n + BPS_DENOMINATOR) / (BPS_DENOMINATOR * 2n);
  return negative ? -rounded : rounded;
}

export function maxMillimes(a: Millimes, b: Millimes): Millimes {
  return a > b ? a : b;
}

export function minMillimes(a: Millimes, b: Millimes): Millimes {
  return a < b ? a : b;
}

/**
 * BigInt has no JSON representation, so every amount crosses the wire as a
 * decimal string (tech-stack, Money). The API interceptor uses this; clients
 * read it back with {@link millimesFromJson}.
 */
export function millimesToJson(amount: Millimes): string {
  return amount.toString();
}

export function millimesFromJson(value: string | number | bigint): Millimes {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new TypeError(`Montant non entier reçu du JSON : ${value}`);
    }
    return BigInt(value);
  }
  if (!/^-?\d+$/.test(value)) {
    throw new TypeError(`Montant JSON invalide : ${value}`);
  }
  return BigInt(value);
}
