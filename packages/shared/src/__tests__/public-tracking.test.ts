import { describe, expect, it } from 'vitest';
import { ParcelEventType } from '../parcel-state-machine.js';
import {
  PUBLIC_TIMELINE_EVENT_TYPES,
  PUBLIC_TIMELINE_STEP_BY_EVENT,
  PUBLIC_TRACKING_THROTTLE,
  PublicStatus,
  PublicTimelineStep,
  publicStatusFor,
  publicTimelineSteps,
  publicTrackLine,
  trackingBackoffSeconds,
} from '../public-tracking.js';
import { TrackStepState } from '../seller-parcels.js';
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

describe('publicTimelineSteps (Q2)', () => {
  it('gives every whitelisted event a step, and nothing else', () => {
    for (const type of PUBLIC_TIMELINE_EVENT_TYPES) {
      expect(PUBLIC_TIMELINE_STEP_BY_EVENT[type]).toBeDefined();
    }
    expect(
      publicTimelineSteps([{ type: ParcelEventType.ECHEC_LIVRAISON, at: '2026-09-25T10:00:00Z' }]),
    ).toEqual([]);
  });

  it('shows picked up and arrived at the depot as one "Chez Faffa Go"', () => {
    expect(
      publicTimelineSteps([
        { type: ParcelEventType.CREATION, at: '2026-09-24T08:00:00Z' },
        { type: ParcelEventType.RAMASSAGE, at: '2026-09-24T10:00:00Z' },
        { type: ParcelEventType.ENTREE_DEPOT, at: '2026-09-24T15:00:00Z' },
      ]),
    ).toEqual([
      { step: PublicTimelineStep.COMMANDE_ENREGISTREE, at: '2026-09-24T08:00:00Z' },
      { step: PublicTimelineStep.CHEZ_FAFFA_GO, at: '2026-09-24T15:00:00Z' },
    ]);
  });

  it('shows a second attempt as one "En cours de livraison", dated when it left again', () => {
    expect(
      publicTimelineSteps([
        { type: ParcelEventType.SORTIE_COURSIER, at: '2026-09-24T09:00:00Z' },
        { type: ParcelEventType.SORTIE_COURSIER, at: '2026-09-26T09:00:00Z' },
      ]),
    ).toEqual([{ step: PublicTimelineStep.EN_COURS_DE_LIVRAISON, at: '2026-09-26T09:00:00Z' }]);
  });

  it('shows "Changement de client" then the new delivery (Q3)', () => {
    const steps = publicTimelineSteps([
      { type: ParcelEventType.SORTIE_COURSIER, at: '2026-09-24T09:00:00Z' },
      { type: ParcelEventType.DECISION_CHANGER_CLIENT, at: '2026-09-25T09:00:00Z' },
      { type: ParcelEventType.SORTIE_COURSIER, at: '2026-09-26T09:00:00Z' },
    ]);
    expect(steps.map((s) => s.step)).toEqual([
      PublicTimelineStep.EN_COURS_DE_LIVRAISON,
      PublicTimelineStep.CHANGEMENT_DE_CLIENT,
      PublicTimelineStep.EN_COURS_DE_LIVRAISON,
    ]);
  });
});

describe('publicTrackLine (Landing 4.1)', () => {
  const states = (status: PublicStatus) => publicTrackLine(status).steps.map((s) => s.state);
  const { FAIT, ACTUEL, A_VENIR } = TrackStepState;

  it('follows the delivery flow', () => {
    expect(states(PublicStatus.COMMANDE_ENREGISTREE)).toEqual([ACTUEL, A_VENIR, A_VENIR, A_VENIR]);
    expect(states(PublicStatus.EN_COURS_DE_LIVRAISON)).toEqual([FAIT, FAIT, ACTUEL, A_VENIR]);
    expect(states(PublicStatus.LIVRE)).toEqual([FAIT, FAIT, FAIT, FAIT]);
  });

  it('marks a postponed delivery on its current step', () => {
    const line = publicTrackLine(PublicStatus.LIVRAISON_REPORTEE_CLIENT);
    expect(line.postponed).toBe(true);
    expect(line.steps[2]).toEqual({
      step: PublicTimelineStep.EN_COURS_DE_LIVRAISON,
      state: ACTUEL,
    });
  });

  it('ends on "Retourné au vendeur" for a return', () => {
    const line = publicTrackLine(PublicStatus.RETOURNE_AU_VENDEUR);
    expect(line.steps.at(-1)).toEqual({
      step: PublicTimelineStep.RETOURNE_AU_VENDEUR,
      state: ACTUEL,
    });
  });

  it('reads Commande enregistrée › Commande annulée for a cancelled order (D-31)', () => {
    expect(publicTrackLine(PublicStatus.COMMANDE_ANNULEE).steps.map((s) => s.step)).toEqual([
      PublicTimelineStep.COMMANDE_ENREGISTREE,
      PublicTimelineStep.COMMANDE_ANNULEE,
    ]);
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
