import * as Location from 'expo-location';
import type { GpsValues } from '@faffago/shared';
import { GPS_TIMEOUT_MS } from './config';

/**
 * The phone's position (Coursier rule 2, tech-stack 4, D-63): foreground only,
 * read at the moment of each scan. The permission is required to use the app;
 * a missing fix never blocks a scan, which is then recorded without position.
 */

export async function hasLocationPermission(): Promise<boolean> {
  return (await Location.getForegroundPermissionsAsync()).granted;
}

export async function requestLocationPermission(): Promise<boolean> {
  return (await Location.requestForegroundPermissionsAsync()).granted;
}

export async function currentPosition(
  timeoutMs: number = GPS_TIMEOUT_MS,
): Promise<GpsValues | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  try {
    const fix = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      timeout,
    ]).finally(() => clearTimeout(timer));
    if (!fix) return null;
    return {
      lat: fix.coords.latitude,
      lng: fix.coords.longitude,
      accuracyM: fix.coords.accuracy === null ? null : Math.round(fix.coords.accuracy),
    };
  } catch {
    return null;
  }
}
