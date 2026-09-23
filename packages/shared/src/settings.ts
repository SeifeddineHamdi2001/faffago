import { z } from 'zod';
import { millimesFromJson, type BasisPoints, type Millimes } from './money.js';

/**
 * Platform settings (Paramètres, Admin 4.16).
 *
 * These are the seed defaults, not the runtime source of truth: the admin can
 * change any of them and the API reads the `settings` table. A change applies
 * only to parcels created after it, because every fee is frozen on the parcel
 * at creation (CLAUDE.md, Money).
 */

export const SettingKey = {
  DELIVERY_FEE_MILLIMES: 'delivery_fee_millimes',
  RETURN_FEE_MILLIMES: 'return_fee_millimes',
  CHANGE_CLIENT_FEE_MILLIMES: 'change_client_fee_millimes',
  PICKUP_FEE_MILLIMES: 'pickup_fee_millimes',
  PICKUP_FREE_THRESHOLD: 'pickup_free_threshold',
  RETENUE_RATE_BPS: 'retenue_rate_bps',
  COURIER_RATE_PER_PARCEL_MILLIMES: 'courier_rate_per_parcel_millimes',
  VERIFY_DEADLINE_HOURS: 'verify_deadline_hours',
  MAX_DELIVERY_ATTEMPTS: 'max_delivery_attempts',
  MAX_CLIENT_CHANGES_PER_PARCEL: 'max_client_changes_per_parcel',
  SCAN_CANCEL_WINDOW_SECONDS: 'scan_cancel_window_seconds',
  CLOCK_SKEW_FLAG_MINUTES: 'clock_skew_flag_minutes',
  CONTACT_LINKS: 'contact_links',
  COURIER_MIN_APP_VERSION: 'courier_min_app_version',
} as const;
export type SettingKey = (typeof SettingKey)[keyof typeof SettingKey];

export interface PlatformSettings {
  /** Frozen on every parcel at creation. */
  deliveryFeeMillimes: Millimes;
  returnFeeMillimes: Millimes;
  /** 1,000 DT for every seller. Vendeur 4.9. */
  changeClientFeeMillimes: Millimes;
  /** 2,000 DT below the free threshold. Vendeur 4.5, rule 11. */
  pickupFeeMillimes: Millimes;
  /** Free from 5 parcels scanned at the pickup. */
  pickupFreeThreshold: number;
  /** 3 % for sellers with statut CIN uniquement. Vendeur 2.4. */
  retenueRateBps: BasisPoints;
  /** Per parcel Livré, livreurs only. Frozen on the parcel at delivery (A-15). */
  courierRatePerParcelMillimes: Millimes;
  /** À vérifier time limit before the automatic return. Vendeur 4.9. */
  verifyDeadlineHours: number;
  /** Third failed attempt makes the parcel a return. Vendeur rule 16. */
  maxDeliveryAttempts: number;
  /** Changer de client is allowed once per parcel (A-6). */
  maxClientChangesPerParcel: number;
  /** "Annuler le dernier scan", measured on device time (A-11). */
  scanCancelWindowSeconds: number;
  /** Flag a scan whose device clock is this far from the server clock (A-12). */
  clockSkewFlagMinutes: number;
  courierMinAppVersion: string;
}

/**
 * TO CONFIRM values from the specs are implemented as these defaults and are
 * changed in one place (CLAUDE.md, Source of truth).
 *
 * The delivery fee, the return fee and the courier rate are the starting
 * values given on 2026-09-23 (D-20); the specs leave them to the admin, who
 * changes them in Paramètres.
 */
export const DEFAULT_SETTINGS: PlatformSettings = {
  deliveryFeeMillimes: 5500n,
  returnFeeMillimes: 2000n,
  changeClientFeeMillimes: 1000n,
  pickupFeeMillimes: 2000n,
  pickupFreeThreshold: 5,
  retenueRateBps: 300,
  courierRatePerParcelMillimes: 3500n,
  verifyDeadlineHours: 48,
  maxDeliveryAttempts: 3,
  maxClientChangesPerParcel: 1,
  scanCancelWindowSeconds: 60,
  clockSkewFlagMinutes: 15,
  courierMinAppVersion: '1.0.0',
};

/** Contact links behind "Devenir partenaire". Landing 2.8, Admin 4.16. */
export interface ContactLinks {
  /** As shown and dialled: "+216 99 602 208". */
  phone: string;
  /** The link the WhatsApp button opens. */
  whatsapp: string;
  facebook: string;
  instagram: string;
  /** Added on 2026-09-23 (D-20, landing v1.3). */
  tiktok: string;
}

/** Starting values (D-20); the admin changes them in Paramètres. */
export const DEFAULT_CONTACT_LINKS: ContactLinks = {
  phone: '+216 99 602 208',
  whatsapp: 'https://wa.me/21699602208',
  facebook: 'https://www.facebook.com/Faffago',
  instagram: 'https://www.instagram.com/faffago/',
  tiktok: 'https://www.tiktok.com/@faffa_goo',
};

export const SETTING_KEYS: readonly SettingKey[] = Object.values(SettingKey);

/** A setting as it is stored in `settings.value` and sent over the wire. */
export type SettingJsonValue = string | number | ContactLinks;

/**
 * Money is a string of digits, read back as `bigint` (D-20): JSON numbers are
 * floats, and a fee must never pass through one. No sign, no separator, no
 * leading zero, so there is exactly one way to write each amount.
 */
const millimesJson = z
  .string({ invalid_type_error: 'Montant en millimes, en chiffres (ex. 5500)' })
  .regex(/^(0|[1-9]\d{0,8})$/, 'Montant en millimes, en chiffres (ex. 5500)');

function wholeNumber(min: number, max: number) {
  return z
    .number({ invalid_type_error: 'Nombre entier attendu' })
    .int('Nombre entier attendu')
    .min(min, `Minimum ${min}`)
    .max(max, `Maximum ${max}`);
}

const httpsOrEmpty = z
  .string()
  .trim()
  .max(300)
  .refine((value) => value === '' || /^https:\/\/\S+$/.test(value), {
    message: 'Lien complet commençant par https://',
  });

export const contactLinksSchema = z
  .object({
    phone: z.string().trim().max(30),
    whatsapp: httpsOrEmpty,
    facebook: httpsOrEmpty,
    instagram: httpsOrEmpty,
    tiktok: httpsOrEmpty,
  })
  .strict();

/**
 * What each setting may hold. The bounds are guards against a typing slip, not
 * business rules: the business values are the defaults above.
 */
export const SETTING_VALUE_SCHEMAS: Record<SettingKey, z.ZodType<SettingJsonValue>> = {
  [SettingKey.DELIVERY_FEE_MILLIMES]: millimesJson,
  [SettingKey.RETURN_FEE_MILLIMES]: millimesJson,
  [SettingKey.CHANGE_CLIENT_FEE_MILLIMES]: millimesJson,
  [SettingKey.PICKUP_FEE_MILLIMES]: millimesJson,
  [SettingKey.COURIER_RATE_PER_PARCEL_MILLIMES]: millimesJson,
  [SettingKey.PICKUP_FREE_THRESHOLD]: wholeNumber(1, 100),
  /** 10 000 basis points = 100 %. */
  [SettingKey.RETENUE_RATE_BPS]: wholeNumber(0, 10_000),
  [SettingKey.VERIFY_DEADLINE_HOURS]: wholeNumber(1, 720),
  [SettingKey.MAX_DELIVERY_ATTEMPTS]: wholeNumber(1, 10),
  [SettingKey.MAX_CLIENT_CHANGES_PER_PARCEL]: wholeNumber(0, 10),
  [SettingKey.SCAN_CANCEL_WINDOW_SECONDS]: wholeNumber(0, 3600),
  [SettingKey.CLOCK_SKEW_FLAG_MINUTES]: wholeNumber(1, 1440),
  [SettingKey.COURIER_MIN_APP_VERSION]: z
    .string()
    .regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}$/, 'Version au format 1.2.3'),
  [SettingKey.CONTACT_LINKS]: contactLinksSchema,
};

export type SettingParseResult =
  | { ok: true; value: SettingJsonValue }
  | { ok: false; message: string };

export function parseSettingValue(key: SettingKey, value: unknown): SettingParseResult {
  const result = SETTING_VALUE_SCHEMAS[key].safeParse(value);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, message: result.error.issues[0]?.message ?? 'Valeur invalide' };
}

/** The defaults in their stored form: what a fresh seed writes. */
export function defaultSettingValues(): Record<SettingKey, SettingJsonValue> {
  const d = DEFAULT_SETTINGS;
  return {
    [SettingKey.DELIVERY_FEE_MILLIMES]: d.deliveryFeeMillimes.toString(),
    [SettingKey.RETURN_FEE_MILLIMES]: d.returnFeeMillimes.toString(),
    [SettingKey.CHANGE_CLIENT_FEE_MILLIMES]: d.changeClientFeeMillimes.toString(),
    [SettingKey.PICKUP_FEE_MILLIMES]: d.pickupFeeMillimes.toString(),
    [SettingKey.COURIER_RATE_PER_PARCEL_MILLIMES]: d.courierRatePerParcelMillimes.toString(),
    [SettingKey.PICKUP_FREE_THRESHOLD]: d.pickupFreeThreshold,
    [SettingKey.RETENUE_RATE_BPS]: d.retenueRateBps,
    [SettingKey.VERIFY_DEADLINE_HOURS]: d.verifyDeadlineHours,
    [SettingKey.MAX_DELIVERY_ATTEMPTS]: d.maxDeliveryAttempts,
    [SettingKey.MAX_CLIENT_CHANGES_PER_PARCEL]: d.maxClientChangesPerParcel,
    [SettingKey.SCAN_CANCEL_WINDOW_SECONDS]: d.scanCancelWindowSeconds,
    [SettingKey.CLOCK_SKEW_FLAG_MINUTES]: d.clockSkewFlagMinutes,
    [SettingKey.COURIER_MIN_APP_VERSION]: d.courierMinAppVersion,
    [SettingKey.CONTACT_LINKS]: { ...DEFAULT_CONTACT_LINKS },
  };
}

/**
 * Reads the `settings` rows back into typed values. A key that is missing or
 * unreadable takes its default, so a half-seeded database still runs; the
 * seed and the Paramètres screen are what keep the table complete.
 */
export function readPlatformSettings(stored: Readonly<Record<string, unknown>>): {
  settings: PlatformSettings;
  contactLinks: ContactLinks;
} {
  const money = (key: SettingKey, fallback: Millimes): Millimes => {
    const value = stored[key];
    if (typeof value !== 'string' && typeof value !== 'number') return fallback;
    try {
      const amount = millimesFromJson(value);
      return amount >= 0n ? amount : fallback;
    } catch {
      return fallback;
    }
  };
  const whole = (key: SettingKey, fallback: number): number => {
    const value = stored[key];
    return typeof value === 'number' && Number.isSafeInteger(value) ? value : fallback;
  };
  const d = DEFAULT_SETTINGS;
  const version = stored[SettingKey.COURIER_MIN_APP_VERSION];
  const links = stored[SettingKey.CONTACT_LINKS];

  return {
    settings: {
      deliveryFeeMillimes: money(SettingKey.DELIVERY_FEE_MILLIMES, d.deliveryFeeMillimes),
      returnFeeMillimes: money(SettingKey.RETURN_FEE_MILLIMES, d.returnFeeMillimes),
      changeClientFeeMillimes: money(
        SettingKey.CHANGE_CLIENT_FEE_MILLIMES,
        d.changeClientFeeMillimes,
      ),
      pickupFeeMillimes: money(SettingKey.PICKUP_FEE_MILLIMES, d.pickupFeeMillimes),
      pickupFreeThreshold: whole(SettingKey.PICKUP_FREE_THRESHOLD, d.pickupFreeThreshold),
      retenueRateBps: whole(SettingKey.RETENUE_RATE_BPS, d.retenueRateBps),
      courierRatePerParcelMillimes: money(
        SettingKey.COURIER_RATE_PER_PARCEL_MILLIMES,
        d.courierRatePerParcelMillimes,
      ),
      verifyDeadlineHours: whole(SettingKey.VERIFY_DEADLINE_HOURS, d.verifyDeadlineHours),
      maxDeliveryAttempts: whole(SettingKey.MAX_DELIVERY_ATTEMPTS, d.maxDeliveryAttempts),
      maxClientChangesPerParcel: whole(
        SettingKey.MAX_CLIENT_CHANGES_PER_PARCEL,
        d.maxClientChangesPerParcel,
      ),
      scanCancelWindowSeconds: whole(
        SettingKey.SCAN_CANCEL_WINDOW_SECONDS,
        d.scanCancelWindowSeconds,
      ),
      clockSkewFlagMinutes: whole(SettingKey.CLOCK_SKEW_FLAG_MINUTES, d.clockSkewFlagMinutes),
      courierMinAppVersion: typeof version === 'string' ? version : d.courierMinAppVersion,
    },
    contactLinks: {
      ...DEFAULT_CONTACT_LINKS,
      ...(links && typeof links === 'object' ? (links as Partial<ContactLinks>) : {}),
    },
  };
}
