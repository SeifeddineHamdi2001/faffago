import { describe, expect, it } from 'vitest';
import { ParcelEventType } from '../parcel-state-machine.js';
import { PUBLIC_TIMELINE_EVENT_TYPES, PublicStatus, publicStatusFor } from '../public-tracking.js';
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
