import type { BasisPoints, Millimes } from './money.js';

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
 * The delivery fee, the return fee and the courier rate have no value in the
 * specs: "set by the admin". They are seeded at 0 on purpose, so that an
 * unconfigured platform is obviously unconfigured rather than quietly wrong.
 */
export const DEFAULT_SETTINGS: PlatformSettings = {
  deliveryFeeMillimes: 0n,
  returnFeeMillimes: 0n,
  changeClientFeeMillimes: 1000n,
  pickupFeeMillimes: 2000n,
  pickupFreeThreshold: 5,
  retenueRateBps: 300,
  courierRatePerParcelMillimes: 0n,
  verifyDeadlineHours: 48,
  maxDeliveryAttempts: 3,
  maxClientChangesPerParcel: 1,
  scanCancelWindowSeconds: 60,
  clockSkewFlagMinutes: 15,
  courierMinAppVersion: '1.0.0',
};

/** Contact links behind "Devenir partenaire". Landing 2.8, Admin 4.16. */
export interface ContactLinks {
  phone: string;
  whatsapp: string;
  facebook: string;
  instagram: string;
}
