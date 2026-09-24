import { describe, expect, it } from 'vitest';
import { parcelCodeFromScan, trackingUrl } from '../labels.js';

describe('the QR code carries the tracking URL (D-36, D-43)', () => {
  it('builds it from the site address, with or without a trailing slash', () => {
    expect(trackingUrl('https://www.mirely.store', 'FG-8K2QX7AB')).toBe(
      'https://www.mirely.store/suivi/FG-8K2QX7AB',
    );
    expect(trackingUrl('https://www.mirely.store/', 'fg-8k2qx7ab')).toBe(
      'https://www.mirely.store/suivi/FG-8K2QX7AB',
    );
  });
});

describe('a scanner reads the code from either symbol (D-36)', () => {
  it('reads the Code128: the bare code, however a gun types it', () => {
    expect(parcelCodeFromScan('FG-8K2QX7AB')).toBe('FG-8K2QX7AB');
    expect(parcelCodeFromScan(' fg8k2qx7ab\r\n')).toBe('FG-8K2QX7AB');
  });

  it('reads the QR: the code inside the tracking URL', () => {
    expect(parcelCodeFromScan('https://www.mirely.store/suivi/FG-8K2QX7AB')).toBe('FG-8K2QX7AB');
    expect(parcelCodeFromScan('https://www.mirely.store/suivi/FG-8K2QX7AB?utm=x')).toBe(
      'FG-8K2QX7AB',
    );
  });

  it('still reads a label printed before a change of domain', () => {
    expect(parcelCodeFromScan('https://faffago.tn/suivi/FG-8K2QX7AB')).toBe('FG-8K2QX7AB');
    expect(parcelCodeFromScan('http://localhost:3000/fr/suivi/FG-8K2QX7AB')).toBe('FG-8K2QX7AB');
  });

  it('refuses anything that is not a parcel code', () => {
    expect(parcelCodeFromScan('https://www.mirely.store/')).toBeNull();
    expect(parcelCodeFromScan('https://www.mirely.store/suivi/BONJOUR')).toBeNull();
    expect(parcelCodeFromScan('6191234567890')).toBeNull();
    expect(parcelCodeFromScan('')).toBeNull();
  });
});
