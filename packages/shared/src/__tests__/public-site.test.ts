import { describe, expect, it } from 'vitest';
import { publicSiteInfoFrom } from '../public-site.js';
import { DEFAULT_CONTACT_LINKS, DEFAULT_SETTINGS } from '../settings.js';

describe('publicSiteInfoFrom (Landing 3, 2.6)', () => {
  const zones = [
    {
      gouvernorat: { code: 'TUN', nameFr: 'Tunis', nameAr: 'تونس' },
      delegations: [{ code: 'TUN-CENTRE', nameFr: 'Tunis Ville', nameAr: 'تونس المدينة' }],
    },
  ];

  it('carries the fees as digit strings, never as floats', () => {
    const info = publicSiteInfoFrom(DEFAULT_SETTINGS, DEFAULT_CONTACT_LINKS, zones);
    expect(info.fees.deliveryFeeMillimes).toBe('5500');
    expect(info.fees.returnFeeMillimes).toBe('2000');
    expect(info.fees.changeClientFeeMillimes).toBe('1000');
    expect(info.fees.pickupFeeMillimes).toBe('2000');
    expect(info.fees.pickupFreeThreshold).toBe(5);
    expect(info.fees.retenueRateBps).toBe(300);
  });

  it('carries the rules the FAQ quotes: the À vérifier limit and the attempts', () => {
    const info = publicSiteInfoFrom(DEFAULT_SETTINGS, DEFAULT_CONTACT_LINKS, zones);
    expect(info.rules).toEqual({ verifyDeadlineHours: 48, maxDeliveryAttempts: 3 });
  });

  it('carries the contact links and the zones through unchanged', () => {
    const info = publicSiteInfoFrom(DEFAULT_SETTINGS, DEFAULT_CONTACT_LINKS, zones);
    expect(info.contactLinks).toEqual(DEFAULT_CONTACT_LINKS);
    expect(info.zones).toEqual(zones);
  });

  it('is off by default (empty Meta Pixel id)', () => {
    const info = publicSiteInfoFrom(DEFAULT_SETTINGS, DEFAULT_CONTACT_LINKS, zones);
    expect(info.metaPixelId).toBe('');
  });

  it('carries a Meta Pixel id once the admin sets one', () => {
    const info = publicSiteInfoFrom(
      { ...DEFAULT_SETTINGS, metaPixelId: '123456789012345' },
      DEFAULT_CONTACT_LINKS,
      zones,
    );
    expect(info.metaPixelId).toBe('123456789012345');
  });
});
