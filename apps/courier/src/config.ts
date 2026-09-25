import Constants from 'expo-constants';

/**
 * The API's address, with its /api prefix. Set EXPO_PUBLIC_API_URL for a
 * build; the default reaches `pnpm dev`'s API from the Android emulator.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3001/api').replace(
  /\/$/,
  '',
);

/** Sent on every call: the API refuses versions below Paramètres' minimum (tech-stack 5). */
export const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';

/** The PIN is asked again when the app comes back after this long in the background. */
export const PIN_RELOCK_AFTER_MS = 5 * 60_000;

/** The queue is sent at most this often while online. */
export const SYNC_INTERVAL_MS = 15_000;

/** A GPS fix is waited for this long at a scan, then the scan goes without (D-63). */
export const GPS_TIMEOUT_MS = 4_000;
