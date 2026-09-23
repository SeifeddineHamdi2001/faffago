import { describe, expect, it } from 'vitest';
import {
  BonNumberKind,
  documentDateKey,
  formatBonNumber,
  generateParcelCode,
  isValidParcelCode,
  isValidTunisianPhone,
  normalizeParcelCode,
  normalizePhone,
  PARCEL_CODE_ALPHABET,
} from '../codes.js';

/** A counter disguised as randomness, so the draw is reproducible. */
function sequentialBytes(start = 0) {
  let n = start;
  return (size: number) => Uint8Array.from({ length: size }, () => n++ % 256);
}

describe('generateParcelCode', () => {
  it('produces FG- plus 8 characters (A-19)', () => {
    const code = generateParcelCode(sequentialBytes());
    expect(code).toMatch(/^FG-.{8}$/);
    expect(isValidParcelCode(code)).toBe(true);
  });

  it('never uses I, L, O or U, which are misread off a damaged label', () => {
    for (let seed = 0; seed < 64; seed += 1) {
      const body = generateParcelCode(sequentialBytes(seed)).slice(3);
      expect(body).not.toMatch(/[ILOU]/);
      for (const char of body) expect(PARCEL_CODE_ALPHABET).toContain(char);
    }
  });

  it('draws every symbol, so codes are not clustered at the start of the alphabet', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 256; seed += 1) {
      for (const char of generateParcelCode(sequentialBytes(seed)).slice(3)) seen.add(char);
    }
    expect(seen.size).toBe(PARCEL_CODE_ALPHABET.length);
  });
});

describe('normalizeParcelCode', () => {
  it('accepts what a clerk types by hand', () => {
    expect(normalizeParcelCode('fg-8k2qx7ab')).toBe('FG-8K2QX7AB');
    expect(normalizeParcelCode('8K2QX7AB')).toBe('FG-8K2QX7AB');
    expect(normalizeParcelCode(' FG 8K2Q X7AB ')).toBe('FG-8K2QX7AB');
  });

  it('applies the Crockford substitutions for misread characters', () => {
    // I and l read as 1, O reads as 0.
    expect(normalizeParcelCode('FG-I23456O7')).toBe('FG-12345607');
    expect(normalizeParcelCode('FG-l2345678')).toBe('FG-12345678');
  });

  it('still rejects a code of the wrong length', () => {
    expect(isValidParcelCode(normalizeParcelCode('FG-8K2QX7'))).toBe(false);
  });

  it('strips a non-breaking space without eating the code', () => {
    // A code copied out of a PDF or a web page arrives with U+00A0 in it. The
    // regex must remove that character and nothing else: an earlier version
    // stripped every "0" and "a" instead.
    expect(normalizeParcelCode('FG-8K2Q X7AB')).toBe('FG-8K2QX7AB');
    expect(normalizeParcelCode('FG-00A0A0A0')).toBe('FG-00A0A0A0');
    expect(normalizeParcelCode('FG-0123456A')).toBe('FG-0123456A');
  });
});

describe('formatBonNumber', () => {
  it('formats a bon de versement like Vendeur 4.11', () => {
    expect(formatBonNumber(BonNumberKind.BON_VERSEMENT, new Date('2026-09-21T09:00:00Z'), 1)).toBe(
      'BV-2026-0921-01',
    );
  });

  it('formats a bon de retour like Vendeur 4.12', () => {
    expect(formatBonNumber(BonNumberKind.BON_RETOUR, new Date('2026-09-21T09:00:00Z'), 1)).toBe(
      'BR-2026-0921-01',
    );
  });

  it('keeps two digits past the ninth bon of the day', () => {
    expect(formatBonNumber(BonNumberKind.BON_VERSEMENT, new Date('2026-09-21T09:00:00Z'), 12)).toBe(
      'BV-2026-0921-12',
    );
  });

  it('keys the daily counter by date', () => {
    expect(documentDateKey(new Date('2026-09-21T23:00:00Z'))).toBe('2026-09-21');
  });
});

describe('Tunisian phone numbers', () => {
  it('accepts 8 digits', () => {
    expect(isValidTunisianPhone('20123456')).toBe(true);
    expect(isValidTunisianPhone('98765432')).toBe(true);
  });

  it('strips the country code and the separators a seller pastes in', () => {
    expect(normalizePhone('+216 20 123 456')).toBe('20123456');
    expect(normalizePhone('216-20-123-456')).toBe('20123456');
    expect(normalizePhone('20.123.456')).toBe('20123456');
    expect(normalizePhone('20 123 456')).toBe('20123456');
  });

  it('keeps every digit of a number that contains 0 or a', () => {
    expect(normalizePhone('20000000')).toBe('20000000');
  });

  it('refuses a number that is too short or starts wrong', () => {
    expect(isValidTunisianPhone('2012345')).toBe(false);
    expect(isValidTunisianPhone('201234567')).toBe(false);
    expect(isValidTunisianPhone('10123456')).toBe(false);
    expect(isValidTunisianPhone('abcdefgh')).toBe(false);
  });
});
