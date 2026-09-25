import type { NamedPlace } from './geo.js';
import type { ContactLinks, PlatformSettings } from './settings.js';

/**
 * The public site's Tarifs and Zones couvertes (Landing 3, 2.6): read from
 * Paramètres and the géographie so the page can never show an old price or a
 * délégation the platform no longer serves (Landing, business rule 2).
 */

export interface PublicFees {
  deliveryFeeMillimes: string;
  returnFeeMillimes: string;
  changeClientFeeMillimes: string;
  pickupFeeMillimes: string;
  pickupFreeThreshold: number;
  retenueRateBps: number;
}

export interface PublicZone {
  gouvernorat: NamedPlace;
  delegations: NamedPlace[];
}

export interface PublicSiteInfo {
  fees: PublicFees;
  contactLinks: ContactLinks;
  zones: PublicZone[];
  /** Empty when Meta Pixel is off (D-20 style setting, off by default). */
  metaPixelId: string;
}

/** What Paramètres and the géographie tree hand to the public site, and nothing else. */
export function publicSiteInfoFrom(
  settings: PlatformSettings,
  contactLinks: ContactLinks,
  zones: PublicZone[],
): PublicSiteInfo {
  return {
    fees: {
      deliveryFeeMillimes: settings.deliveryFeeMillimes.toString(),
      returnFeeMillimes: settings.returnFeeMillimes.toString(),
      changeClientFeeMillimes: settings.changeClientFeeMillimes.toString(),
      pickupFeeMillimes: settings.pickupFeeMillimes.toString(),
      pickupFreeThreshold: settings.pickupFreeThreshold,
      retenueRateBps: settings.retenueRateBps,
    },
    contactLinks,
    zones,
    metaPixelId: settings.metaPixelId,
  };
}
