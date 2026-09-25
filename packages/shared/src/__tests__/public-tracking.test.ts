import { describe, expect, it } from 'vitest';
import { ParcelEventType } from '../parcel-state-machine.js';
import {
  PUBLIC_TIMELINE_EVENT_TYPES,
  PUBLIC_TRACKING_THROTTLE,
  PublicStatus,
  publicStatusFor,
  trackingBackoffSeconds,
} from '../public-tracking.js';
import { ParcelStatus, RelaunchOrigin } from '../statuses.js';

describe('a cancelled order on public tracking (D-28)', () => {
  const cancelledAt = new Date('2026-09-24T10:00:00.000Z');

  it('reads "Commande annulée" before pickup', () => {
    expect(
      publicStatusFor({ status: ParcelStatus.ANNULE, relaunchOrigin: null, cancelledAt }),
    ).toBe(PublicStatus.COMMANDE_ANNULEE);
  });

  it.each([ParcelStatus.RETOUR_AU_DEPOT, ParcelStatus.RETOUR_EN_ROUTE, ParcelStatus.RETOUR_RECU])(
    'reads "Commande annulée" after pickup, while the parcel travels back (%s)',
    (status) => {
      expect(publicStatusFor({ status, relaunchOrigin: null, cancelledAt })).toBe(
        PublicStatus.COMMANDE_ANNULEE,
      );
    },
  );

  it('wins over a date the customer had asked for', () => {
    expect(
      publicStatusFor({
        status: ParcelStatus.RETOUR_AU_DEPOT,
        relaunchOrigin: RelaunchOrigin.CLIENT,
        cancelledAt,
      }),
    ).toBe(PublicStatus.COMMANDE_ANNULEE);
  });

  it('leaves an ordinary return as "Retourné au vendeur"', () => {
    expect(
      publicStatusFor({
        status: ParcelStatus.RETOUR_AU_DEPOT,
        relaunchOrigin: null,
        cancelledAt: null,
      }),
    ).toBe(PublicStatus.RETOURNE_AU_VENDEUR);
  });

  it('keeps the cancellation in the public timeline', () => {
    expect(PUBLIC_TIMELINE_EVENT_TYPES).toContain(ParcelEventType.ANNULATION);
  });
});

describe('trackingBackoffSeconds (Landing 4.4, repeated wrong codes)', () => {
  it('lets the free failures through', () => {
    for (let i = 0; i <= PUBLIC_TRACKING_THROTTLE.freeFailuresPerIp; i++) {
      expect(trackingBackoffSeconds(i)).toBe(0);
    }
  });

  it('doubles past the free failures, capped at the maximum delay', () => {
    const free = PUBLIC_TRACKING_THROTTLE.freeFailuresPerIp;
    expect(trackingBackoffSeconds(free + 1)).toBe(1);
    expect(trackingBackoffSeconds(free + 2)).toBe(2);
    expect(trackingBackoffSeconds(free + 3)).toBe(4);
    expect(trackingBackoffSeconds(free + 20)).toBe(PUBLIC_TRACKING_THROTTLE.maxDelaySeconds);
  });
});
