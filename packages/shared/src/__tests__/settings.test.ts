import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONTACT_LINKS,
  DEFAULT_SETTINGS,
  SETTING_KEYS,
  SettingKey,
  defaultSettingValues,
  parseSettingValue,
  readPlatformSettings,
} from '../settings.js';

/**
 * Paramètres (Admin 4.16, D-20): what a stored or submitted value may look
 * like, and how the platform reads the table back.
 */

describe('the starting values (D-20)', () => {
  it('are the fees given on 2026-09-23, in millimes', () => {
    expect(DEFAULT_SETTINGS.deliveryFeeMillimes).toBe(5500n);
    expect(DEFAULT_SETTINGS.returnFeeMillimes).toBe(2000n);
    expect(DEFAULT_SETTINGS.courierRatePerParcelMillimes).toBe(3500n);
    expect(DEFAULT_SETTINGS.changeClientFeeMillimes).toBe(1000n);
    expect(DEFAULT_SETTINGS.pickupFeeMillimes).toBe(2000n);
    expect(DEFAULT_SETTINGS.pickupFreeThreshold).toBe(5);
    expect(DEFAULT_SETTINGS.retenueRateBps).toBe(300);
  });

  it('include the five contact links, TikTok among them', () => {
    expect(DEFAULT_CONTACT_LINKS).toEqual({
      phone: '+216 99 602 208',
      whatsapp: 'https://wa.me/21699602208',
      facebook: 'https://www.facebook.com/Faffago',
      instagram: 'https://www.instagram.com/faffago/',
      tiktok: 'https://www.tiktok.com/@faffa_goo',
    });
  });

  it('are stored with money as digit strings, never as numbers', () => {
    const values = defaultSettingValues();
    expect(values[SettingKey.DELIVERY_FEE_MILLIMES]).toBe('5500');
    expect(values[SettingKey.RETURN_FEE_MILLIMES]).toBe('2000');
    expect(values[SettingKey.CHANGE_CLIENT_FEE_MILLIMES]).toBe('1000');
    expect(values[SettingKey.PICKUP_FEE_MILLIMES]).toBe('2000');
    expect(values[SettingKey.COURIER_RATE_PER_PARCEL_MILLIMES]).toBe('3500');
    expect(values[SettingKey.RETENUE_RATE_BPS]).toBe(300);
    expect(values[SettingKey.CONTACT_LINKS]).toEqual(DEFAULT_CONTACT_LINKS);
  });

  it('cover every key, and every default passes its own validation', () => {
    const values = defaultSettingValues();
    expect(Object.keys(values).sort()).toEqual([...SETTING_KEYS].sort());
    for (const key of SETTING_KEYS) {
      expect(parseSettingValue(key, values[key])).toEqual({ ok: true, value: values[key] });
    }
  });
});

describe('parseSettingValue', () => {
  it('accepts a money value as a digit string and keeps it a string', () => {
    expect(parseSettingValue(SettingKey.DELIVERY_FEE_MILLIMES, '6000')).toEqual({
      ok: true,
      value: '6000',
    });
    expect(parseSettingValue(SettingKey.RETURN_FEE_MILLIMES, '0')).toEqual({
      ok: true,
      value: '0',
    });
  });

  it.each([
    ['a JSON number', 6000],
    ['a decimal', '5.5'],
    ['a DT amount', '5,500'],
    ['a negative amount', '-100'],
    ['an empty string', ''],
    ['leading zeros', '0550'],
  ])('refuses a money value given as %s', (_label, value) => {
    const result = parseSettingValue(SettingKey.DELIVERY_FEE_MILLIMES, value);
    expect(result.ok).toBe(false);
  });

  it('bounds the rates and limits to values that make sense', () => {
    expect(parseSettingValue(SettingKey.RETENUE_RATE_BPS, 300).ok).toBe(true);
    expect(parseSettingValue(SettingKey.RETENUE_RATE_BPS, 10_001).ok).toBe(false);
    expect(parseSettingValue(SettingKey.RETENUE_RATE_BPS, 2.5).ok).toBe(false);
    expect(parseSettingValue(SettingKey.MAX_DELIVERY_ATTEMPTS, 0).ok).toBe(false);
    expect(parseSettingValue(SettingKey.VERIFY_DEADLINE_HOURS, 0).ok).toBe(false);
    expect(parseSettingValue(SettingKey.PICKUP_FREE_THRESHOLD, '5').ok).toBe(false);
  });

  it('requires a x.y.z courier app version', () => {
    expect(parseSettingValue(SettingKey.COURIER_MIN_APP_VERSION, '1.2.0').ok).toBe(true);
    expect(parseSettingValue(SettingKey.COURIER_MIN_APP_VERSION, '1.2').ok).toBe(false);
  });

  it('requires https links, or an empty field, in the contact links', () => {
    const ok = parseSettingValue(SettingKey.CONTACT_LINKS, { ...DEFAULT_CONTACT_LINKS, tiktok: '' });
    expect(ok.ok).toBe(true);

    const insecure = parseSettingValue(SettingKey.CONTACT_LINKS, {
      ...DEFAULT_CONTACT_LINKS,
      facebook: 'http://www.facebook.com/Faffago',
    });
    expect(insecure.ok).toBe(false);

    const missing = parseSettingValue(SettingKey.CONTACT_LINKS, { phone: '+216 99 602 208' });
    expect(missing.ok).toBe(false);
  });

  it('gives a French reason when it refuses', () => {
    const result = parseSettingValue(SettingKey.DELIVERY_FEE_MILLIMES, '5,500');
    expect(result).toEqual({ ok: false, message: expect.stringMatching(/millimes/) });
  });
});

describe('readPlatformSettings', () => {
  it('reads money back as bigint', () => {
    const { settings } = readPlatformSettings({
      [SettingKey.DELIVERY_FEE_MILLIMES]: '6000',
      [SettingKey.COURIER_RATE_PER_PARCEL_MILLIMES]: '4000',
    });
    expect(settings.deliveryFeeMillimes).toBe(6000n);
    expect(settings.courierRatePerParcelMillimes).toBe(4000n);
  });

  it('falls back to the default for a key that is missing', () => {
    const { settings, contactLinks } = readPlatformSettings({});
    expect(settings).toEqual(DEFAULT_SETTINGS);
    expect(contactLinks).toEqual(DEFAULT_CONTACT_LINKS);
  });

  it('still reads a money value stored as a JSON number by the first seed', () => {
    const { settings } = readPlatformSettings({ [SettingKey.RETURN_FEE_MILLIMES]: 2500 });
    expect(settings.returnFeeMillimes).toBe(2500n);
  });

  it('fills a contact link the first seed did not have (TikTok) from the default', () => {
    const { contactLinks } = readPlatformSettings({
      [SettingKey.CONTACT_LINKS]: { phone: '1', whatsapp: '', facebook: '', instagram: '' },
    });
    expect(contactLinks.phone).toBe('1');
    expect(contactLinks.tiktok).toBe(DEFAULT_CONTACT_LINKS.tiktok);
  });
});
