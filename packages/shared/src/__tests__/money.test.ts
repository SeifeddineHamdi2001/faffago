import { describe, expect, it } from 'vitest';
import {
  applyRateBps,
  formatDT,
  millimesFromJson,
  millimesToJson,
  MoneyParseError,
  parseDT,
  sumMillimes,
  tryParseDT,
  formatRatePercent,
  parseRatePercent,
} from '../money.js';

describe('formatDT', () => {
  it('formats the reference amount from CLAUDE.md', () => {
    expect(formatDT(85000n)).toBe('85,000 DT');
  });

  it('groups thousands of dinars like the worked example in Vendeur 2.4', () => {
    expect(formatDT(1_000_000n)).toBe('1 000,000 DT');
    expect(formatDT(916_000n)).toBe('916,000 DT');
    expect(formatDT(888_520n)).toBe('888,520 DT');
  });

  it('always shows three millime digits', () => {
    expect(formatDT(0n)).toBe('0,000 DT');
    expect(formatDT(1n)).toBe('0,001 DT');
    expect(formatDT(1000n)).toBe('1,000 DT');
    expect(formatDT(27_480n)).toBe('27,480 DT');
  });

  it('keeps the fee amounts of the specs readable', () => {
    // 2,000 DT is two dinars and 1,000 DT is one dinar (A-4).
    expect(formatDT(2000n)).toBe('2,000 DT');
    expect(formatDT(1000n)).toBe('1,000 DT');
  });

  it('formats a shortfall with its sign', () => {
    expect(formatDT(-5000n)).toBe('-5,000 DT');
  });

  it('can omit the suffix for table cells', () => {
    expect(formatDT(85000n, { suffix: false })).toBe('85,000');
  });
});

describe('parseDT', () => {
  it('reads what a seller types', () => {
    expect(parseDT('85,000')).toBe(85_000n);
    expect(parseDT('85')).toBe(85_000n);
    expect(parseDT('85.000')).toBe(85_000n);
    expect(parseDT('0,500')).toBe(500n);
    expect(parseDT('0.5')).toBe(500n);
  });

  it('reads a grouped amount and one with the currency', () => {
    expect(parseDT('1 000,000')).toBe(1_000_000n);
    expect(parseDT('85,000 DT')).toBe(85_000n);
    expect(parseDT('  85,000  ')).toBe(85_000n);
  });

  it('accepts zero, which is allowed when the customer already paid', () => {
    expect(parseDT('0')).toBe(0n);
    expect(parseDT('0,000')).toBe(0n);
  });

  it('refuses a fourth decimal, which cannot be paid in cash', () => {
    expect(() => parseDT('85,0001')).toThrow(MoneyParseError);
  });

  it('refuses anything that is not a number', () => {
    expect(() => parseDT('')).toThrow(MoneyParseError);
    expect(() => parseDT('abc')).toThrow(MoneyParseError);
    expect(() => parseDT('85,00,0')).toThrow(MoneyParseError);
  });

  it('round-trips through formatDT', () => {
    for (const amount of [0n, 1n, 999n, 1000n, 85_000n, 1_000_000n, 123_456_789n]) {
      expect(parseDT(formatDT(amount))).toBe(amount);
    }
  });

  it('tryParseDT returns null instead of throwing', () => {
    expect(tryParseDT('nope')).toBeNull();
    expect(tryParseDT('7,000')).toBe(7000n);
  });
});

describe('applyRateBps', () => {
  it('computes the 3 % retenue of the worked example exactly', () => {
    expect(applyRateBps(916_000n, 300)).toBe(27_480n);
  });

  it('rounds half-up at the millime (A-3b)', () => {
    // 1 bps of 5000 is 0.5 millime.
    expect(applyRateBps(5000n, 1)).toBe(1n);
    // 1 bps of 4999 is 0.4999 millime.
    expect(applyRateBps(4999n, 1)).toBe(0n);
    // 1 bps of 15000 is 1.5 millimes.
    expect(applyRateBps(15_000n, 1)).toBe(2n);
  });

  it('rounds the magnitude, so a negative half goes away from zero', () => {
    expect(applyRateBps(-5000n, 1)).toBe(-1n);
  });

  it('is exact on an amount no float could hold', () => {
    expect(applyRateBps(9_007_199_254_740_993n, 300)).toBe(270_215_977_642_230n);
  });

  it('handles the edges', () => {
    expect(applyRateBps(0n, 300)).toBe(0n);
    expect(applyRateBps(123_456n, 0)).toBe(0n);
    expect(applyRateBps(123_456n, 10_000)).toBe(123_456n);
  });

  it('refuses a fractional rate, which would reintroduce floats', () => {
    expect(() => applyRateBps(1000n, 2.5)).toThrow(TypeError);
  });
});

describe('sumMillimes', () => {
  it('sums an empty list to zero', () => {
    expect(sumMillimes([])).toBe(0n);
  });

  it('sums without losing precision', () => {
    expect(sumMillimes([85_000n, 27_480n, 1n])).toBe(112_481n);
  });
});

describe('JSON transport', () => {
  it('sends money as a decimal string', () => {
    expect(millimesToJson(85_000n)).toBe('85000');
  });

  it('reads it back', () => {
    expect(millimesFromJson('85000')).toBe(85_000n);
    expect(millimesFromJson(85_000)).toBe(85_000n);
    expect(millimesFromJson(85_000n)).toBe(85_000n);
  });

  it('refuses a number that has already lost precision', () => {
    expect(() => millimesFromJson(1.5)).toThrow(TypeError);
    expect(() => millimesFromJson('85,000')).toThrow(TypeError);
  });
});

describe('rates typed as a percentage (Paramètres, retenue)', () => {
  it('shows basis points as a French percentage', () => {
    expect(formatRatePercent(300)).toBe('3');
    expect(formatRatePercent(250)).toBe('2,5');
    expect(formatRatePercent(1)).toBe('0,01');
    expect(formatRatePercent(0)).toBe('0');
  });

  it('reads a typed percentage into basis points without floats', () => {
    expect(parseRatePercent('3')).toBe(300);
    expect(parseRatePercent('2,5')).toBe(250);
    expect(parseRatePercent('2.55')).toBe(255);
    expect(parseRatePercent(' 3 % ')).toBe(300);
    expect(parseRatePercent('100')).toBe(10_000);
  });

  it('refuses what is not a percentage between 0 and 100 with two decimals at most', () => {
    for (const input of ['', 'abc', '-1', '2,555', '100,01', '1e2']) {
      expect(parseRatePercent(input)).toBeNull();
    }
  });
});
