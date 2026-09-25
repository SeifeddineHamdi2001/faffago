import 'server-only';
import type { PublicSiteInfo, PublicTrackingView } from '@faffago/shared';
import type { Locale } from '../locale';
import { callApi } from './api';

/**
 * The public site's data, read from the API at request time — never at build,
 * so a deploy never bakes an old price into a page (Landing 3).
 *
 * Tarifs and zones are kept a few minutes in this server (Landing 6); a failed
 * read keeps the last good copy, and without one the page says the prices are
 * unavailable rather than showing none.
 */
let cached: { value: PublicSiteInfo; at: number } | null = null;

/** 5 minutes; the browser tests set 0 to see a Paramètres change at once. */
function ttlMs(): number {
  const seconds = Number.parseInt(process.env.PUBLIC_SITE_CACHE_SECONDS ?? '', 10);
  return (Number.isNaN(seconds) ? 300 : seconds) * 1000;
}

export async function getSiteInfo(now = Date.now()): Promise<PublicSiteInfo | null> {
  if (cached && now - cached.at < ttlMs()) return cached.value;
  try {
    const result = await callApi<PublicSiteInfo>('/public/site-info');
    if (result.status !== 200) return cached?.value ?? null;
    cached = { value: result.body, at: now };
    return result.body;
  } catch {
    return cached?.value ?? null;
  }
}

/** Tests only. */
export function clearSiteInfoCache(): void {
  cached = null;
}

export type TrackingResult =
  | { kind: 'found'; view: PublicTrackingView }
  | { kind: 'not-found' }
  | { kind: 'too-many' }
  | { kind: 'unavailable' };

/**
 * One parcel's public view. The visitor's address is forwarded so the API
 * slows down his wrong codes, not everyone's (Landing 4.4, D-15).
 */
export async function getTracking(
  code: string,
  locale: Locale,
  forwarded: Record<string, string>,
): Promise<TrackingResult> {
  try {
    const result = await callApi<PublicTrackingView>(
      `/public/tracking/${encodeURIComponent(code)}?langue=${locale === 'ar' ? 'AR' : 'FR'}`,
      { headers: forwarded },
    );
    if (result.status === 200) return { kind: 'found', view: result.body };
    if (result.status === 404) return { kind: 'not-found' };
    if (result.status === 429) return { kind: 'too-many' };
    return { kind: 'unavailable' };
  } catch {
    return { kind: 'unavailable' };
  }
}
