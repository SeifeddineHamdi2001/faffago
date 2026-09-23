import { describe, expect, it } from 'vitest';
import { Role } from '../roles.js';
import {
  applyParcelAction,
  isDueForTour,
  isPostponedByCustomer,
  isValidPostponementDate,
  ParcelAction,
  ParcelEffect,
  ParcelEventType,
  ScanRefusal,
  type ParcelActionCommand,
  type ParcelSnapshot,
  type ParcelTransition,
} from '../parcel-state-machine.js';
import { PUBLIC_TIMELINE_EVENT_TYPES, publicStatusFor, PublicStatus } from '../public-tracking.js';
import {
  FailureReason,
  ParcelLocation,
  ParcelStatus,
  RelaunchOrigin,
  RelaunchSlot,
} from '../statuses.js';

/**
 * "Reporté par le client" (decision 6).
 *
 * The one exception to "a failed delivery always goes to À vérifier": when the
 * customer himself asks for another day, the courier plans it and the parcel
 * goes straight to Relancé with its date. Nothing waits on the seller and no
 * 48-hour clock starts.
 */

const LIVREUR_ID = 'livreur-1';
const TODAY = new Date(Date.UTC(2026, 8, 23)); // Wednesday 23 September 2026
const day = (n: number) => new Date(Date.UTC(2026, 8, 23 + n));

function parcel(overrides: Partial<ParcelSnapshot> = {}): ParcelSnapshot {
  return {
    status: ParcelStatus.EN_LIVRAISON,
    location: ParcelLocation.AVEC_LE_LIVREUR,
    cashStatus: null,
    attemptCount: 0,
    changeClientCount: 0,
    currentLivreurId: LIVREUR_ID,
    isExchange: false,
    relaunchDate: null,
    relaunchOrigin: null,
    relaunchSlot: null,
    ...overrides,
  };
}

function postpone(overrides: Partial<ParcelActionCommand> = {}): ParcelActionCommand {
  return {
    action: ParcelAction.SCAN_ECHEC,
    actor: Role.LIVREUR,
    actorCourierId: LIVREUR_ID,
    failureReason: FailureReason.REPORTE_PAR_LE_CLIENT,
    postponedTo: day(1),
    today: TODAY,
    maxAttempts: 3,
    maxClientChanges: 1,
    ...overrides,
  };
}

function expectOk(result: ParcelTransition) {
  if (!result.ok) throw new Error(`Refusé : ${result.message}`);
  return result;
}

describe('the courier records a postponement', () => {
  it('sets Relancé with a date and no 48-hour deadline', () => {
    const result = expectOk(applyParcelAction(parcel(), postpone()));

    expect(result.next.status).toBe(ParcelStatus.RELANCE);
    expect(result.next.relaunchDate).toEqual(day(1));
    expect(result.next.relaunchOrigin).toBe(RelaunchOrigin.CLIENT);
    // Never À vérifier, so the countdown never starts.
    expect(result.events.map((e) => e.newStatus)).not.toContain(ParcelStatus.A_VERIFIER);
    expect(result.events[0]?.effects).not.toContain(ParcelEffect.DEMARRER_DELAI_VERIFICATION);
    expect(result.events[0]?.effects).toContain(ParcelEffect.PLANIFIER_RELANCE);
  });

  it('records it as an échec with the reason, so the timeline is honest', () => {
    const result = expectOk(applyParcelAction(parcel(), postpone()));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.type).toBe(ParcelEventType.ECHEC_LIVRAISON);
  });

  it('keeps the parcel with the livreur until he brings it back', () => {
    const result = expectOk(applyParcelAction(parcel(), postpone()));
    expect(result.next.location).toBe(ParcelLocation.AVEC_LE_LIVREUR);
  });

  it('counts as a delivery attempt', () => {
    const result = expectOk(applyParcelAction(parcel({ attemptCount: 0 }), postpone()));
    expect(result.next.attemptCount).toBe(1);
  });

  it('records the optional slot', () => {
    const result = expectOk(
      applyParcelAction(parcel(), postpone({ relaunchSlot: RelaunchSlot.APRES_MIDI })),
    );
    expect(result.next.relaunchSlot).toBe(RelaunchSlot.APRES_MIDI);
  });

  it('accepts any day from tomorrow to a week out', () => {
    for (const offset of [1, 2, 7]) {
      const result = applyParcelAction(parcel(), postpone({ postponedTo: day(offset) }));
      expect(result.ok).toBe(true);
    }
  });

  it('refuses today, yesterday and anything past seven days', () => {
    for (const offset of [0, -1, 8, 30]) {
      const result = applyParcelAction(parcel(), postpone({ postponedTo: day(offset) }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.refusal).toBe(ScanRefusal.DATE_REPORT_INVALIDE);
    }
  });

  it('refuses the reason with no date at all', () => {
    const result = applyParcelAction(parcel(), postpone({ postponedTo: null }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe(ScanRefusal.DATE_REPORT_REQUISE);
  });

  it('leaves the other failure reasons going to À vérifier', () => {
    const result = expectOk(
      applyParcelAction(
        parcel(),
        postpone({ failureReason: FailureReason.NE_REPOND_PAS, postponedTo: null }),
      ),
    );
    expect(result.next.status).toBe(ParcelStatus.A_VERIFIER);
    expect(result.events[0]?.effects).toContain(ParcelEffect.DEMARRER_DELAI_VERIFICATION);
  });

  it('gives way to the three-attempt rule on the last attempt', () => {
    const result = expectOk(applyParcelAction(parcel({ attemptCount: 2 }), postpone()));

    expect(result.next.status).toBe(ParcelStatus.RETOUR_AU_DEPOT);
    expect(result.next.attemptCount).toBe(3);
    expect(result.events.map((e) => e.type)).toEqual([
      ParcelEventType.ECHEC_LIVRAISON,
      ParcelEventType.RETOUR_AUTO_3E_TENTATIVE,
    ]);
    expect(result.next.relaunchDate).toBeNull();
  });

  it('still checks the date on the last attempt, so the message is the same', () => {
    const result = applyParcelAction(
      parcel({ attemptCount: 2 }),
      postpone({ postponedTo: day(99) }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe(ScanRefusal.DATE_REPORT_INVALIDE);
  });
});

describe('the parcel comes back and waits', () => {
  const postponed = parcel({
    status: ParcelStatus.RELANCE,
    location: ParcelLocation.AVEC_LE_LIVREUR,
    attemptCount: 1,
    relaunchDate: day(2),
    relaunchOrigin: RelaunchOrigin.CLIENT,
  });

  it('keeps the status Relancé when the depot scans it back in', () => {
    const result = expectOk(
      applyParcelAction(postponed, {
        action: ParcelAction.SCAN_RETOUR_DE_TOURNEE,
        actor: Role.DEPOT,
        maxAttempts: 3,
        maxClientChanges: 1,
      }),
    );
    expect(result.next.status).toBe(ParcelStatus.RELANCE);
    expect(result.next.location).toBe(ParcelLocation.AU_DEPOT);
    expect(result.next.relaunchDate).toEqual(day(2));
  });

  it('appears in Tournées only from the chosen day', () => {
    const waiting = { ...postponed, location: ParcelLocation.AU_DEPOT };

    expect(isDueForTour(waiting, TODAY)).toBe(false);
    expect(isDueForTour(waiting, day(1))).toBe(false);
    expect(isDueForTour(waiting, day(2))).toBe(true);
    // Missed its day: it keeps showing rather than disappearing.
    expect(isDueForTour(waiting, day(5))).toBe(true);
  });

  it('is not in Tournées while a livreur still has it', () => {
    expect(isDueForTour(postponed, day(2))).toBe(false);
  });

  it('puts an ordinary parcel at the depot in Tournées straight away', () => {
    const ready = parcel({ status: ParcelStatus.AU_DEPOT, location: ParcelLocation.AU_DEPOT });
    expect(isDueForTour(ready, TODAY)).toBe(true);
  });

  it('clears the date once it goes out again', () => {
    const waiting = { ...postponed, location: ParcelLocation.AU_DEPOT };
    const result = expectOk(
      applyParcelAction(waiting, {
        action: ParcelAction.SCAN_SORTIE_COURSIER,
        actor: Role.DEPOT,
        assignToCourierId: 'livreur-2',
        maxAttempts: 3,
        maxClientChanges: 1,
      }),
    );
    expect(result.next.status).toBe(ParcelStatus.EN_LIVRAISON);
    expect(result.next.relaunchDate).toBeNull();
    expect(result.next.relaunchOrigin).toBeNull();
  });
});

describe('what the seller can do about it', () => {
  const waiting = parcel({
    status: ParcelStatus.RELANCE,
    location: ParcelLocation.AU_DEPOT,
    attemptCount: 1,
    relaunchDate: day(2),
    relaunchOrigin: RelaunchOrigin.CLIENT,
  });

  const sellerCommand = (
    action: ParcelAction,
    overrides: Partial<ParcelActionCommand> = {},
  ): ParcelActionCommand => ({
    action,
    actor: Role.VENDEUR,
    today: TODAY,
    maxAttempts: 3,
    maxClientChanges: 1,
    ...overrides,
  });

  it('can move the date, inside the same window', () => {
    const result = expectOk(
      applyParcelAction(
        waiting,
        sellerCommand(ParcelAction.DECISION_CHANGER_DATE, { postponedTo: day(4) }),
      ),
    );
    expect(result.next.relaunchDate).toEqual(day(4));
    // Still the customer's postponement, so the label does not change.
    expect(result.next.relaunchOrigin).toBe(RelaunchOrigin.CLIENT);
  });

  it('cannot move it outside the window', () => {
    const result = applyParcelAction(
      waiting,
      sellerCommand(ParcelAction.DECISION_CHANGER_DATE, { postponedTo: day(20) }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe(ScanRefusal.DATE_REPORT_INVALIDE);
  });

  it('cannot move the date once the parcel is out again', () => {
    const out = parcel({ status: ParcelStatus.EN_LIVRAISON });
    const result = applyParcelAction(
      out,
      sellerCommand(ParcelAction.DECISION_CHANGER_DATE, { postponedTo: day(3) }),
    );
    expect(result.ok).toBe(false);
  });

  it('can choose Retourner instead of waiting', () => {
    const result = expectOk(
      applyParcelAction(waiting, sellerCommand(ParcelAction.DECISION_RETOURNER)),
    );
    expect(result.next.status).toBe(ParcelStatus.RETOUR_AU_DEPOT);
    expect(result.events[0]?.effects).toContain(ParcelEffect.CREER_FRAIS_RETOUR);
  });

  it('can Changer de client once the parcel is back at the depot', () => {
    const result = expectOk(
      applyParcelAction(waiting, sellerCommand(ParcelAction.DECISION_CHANGER_CLIENT)),
    );
    expect(result.next.status).toBe(ParcelStatus.AU_DEPOT);
    expect(result.next.attemptCount).toBe(0);
    expect(result.next.relaunchDate).toBeNull();
    expect(result.next.relaunchOrigin).toBeNull();
  });

  it('cannot Changer de client while the livreur still carries it', () => {
    const inBag = { ...waiting, location: ParcelLocation.AVEC_LE_LIVREUR };
    const result = applyParcelAction(inBag, sellerCommand(ParcelAction.DECISION_CHANGER_CLIENT));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe(ScanRefusal.COLIS_PAS_AU_DEPOT);
  });

  it('is the only one who can move the date', () => {
    for (const actor of [Role.ADMIN, Role.SERVICE_CLIENT, Role.DEPOT, Role.LIVREUR]) {
      const result = applyParcelAction(
        waiting,
        sellerCommand(ParcelAction.DECISION_CHANGER_DATE, { actor, postponedTo: day(3) }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.refusal).toBe(ScanRefusal.ROLE_NON_AUTORISE);
    }
  });
});

describe('what the customer sees', () => {
  it('reads "Livraison reportée", without the seller-will-call line', () => {
    expect(
      publicStatusFor({ status: ParcelStatus.RELANCE, relaunchOrigin: RelaunchOrigin.CLIENT }),
    ).toBe(PublicStatus.LIVRAISON_REPORTEE_CLIENT);
  });

  it('still reads the seller-will-call line when the seller relaunched', () => {
    expect(
      publicStatusFor({ status: ParcelStatus.RELANCE, relaunchOrigin: RelaunchOrigin.VENDEUR }),
    ).toBe(PublicStatus.LIVRAISON_REPORTEE);
  });

  it('is unchanged for every other status', () => {
    expect(publicStatusFor({ status: ParcelStatus.A_VERIFIER, relaunchOrigin: null })).toBe(
      PublicStatus.LIVRAISON_REPORTEE,
    );
    expect(publicStatusFor({ status: ParcelStatus.LIVRE, relaunchOrigin: null })).toBe(
      PublicStatus.LIVRE,
    );
  });

  it('never exposes the failure event itself', () => {
    // The status line carries the news; the timeline stays free of failures.
    expect(PUBLIC_TIMELINE_EVENT_TYPES).not.toContain(ParcelEventType.ECHEC_LIVRAISON);
  });
});

describe('isValidPostponementDate', () => {
  it('accepts tomorrow through the seventh day', () => {
    expect(isValidPostponementDate(day(1), TODAY)).toBe(true);
    expect(isValidPostponementDate(day(7), TODAY)).toBe(true);
  });

  it('refuses today and the eighth day', () => {
    expect(isValidPostponementDate(day(0), TODAY)).toBe(false);
    expect(isValidPostponementDate(day(8), TODAY)).toBe(false);
  });

  it('compares whole days, not hours', () => {
    const tomorrowLate = new Date(Date.UTC(2026, 8, 24, 23, 59));
    const todayEarly = new Date(Date.UTC(2026, 8, 23, 0, 1));
    expect(isValidPostponementDate(tomorrowLate, todayEarly)).toBe(true);
  });
});

describe('isPostponedByCustomer', () => {
  it('is true only for a customer postponement', () => {
    expect(
      isPostponedByCustomer(
        parcel({ status: ParcelStatus.RELANCE, relaunchOrigin: RelaunchOrigin.CLIENT }),
      ),
    ).toBe(true);
    expect(
      isPostponedByCustomer(
        parcel({ status: ParcelStatus.RELANCE, relaunchOrigin: RelaunchOrigin.VENDEUR }),
      ),
    ).toBe(false);
    expect(isPostponedByCustomer(parcel({ status: ParcelStatus.A_VERIFIER }))).toBe(false);
  });
});
