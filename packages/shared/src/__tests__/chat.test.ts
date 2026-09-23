import { describe, expect, it } from 'vitest';
import { canPostInChat, chatStateFor, ChatThreadState, type ChatParcelView } from '../chat.js';
import { ParcelCashStatus, ParcelLocation, ParcelStatus } from '../statuses.js';

function parcel(overrides: Partial<ChatParcelView> = {}): ChatParcelView {
  return {
    status: ParcelStatus.EN_LIVRAISON,
    location: ParcelLocation.AVEC_LE_LIVREUR,
    cashStatus: null,
    hasBeenDispatched: true,
    ...overrides,
  };
}

describe('chatStateFor (Q15)', () => {
  it('gives no thread to a parcel that never reached a livreur (Q16)', () => {
    expect(
      chatStateFor(
        parcel({
          status: ParcelStatus.CREE,
          location: ParcelLocation.CHEZ_LE_VENDEUR,
          hasBeenDispatched: false,
        }),
      ),
    ).toBeNull();

    // Picked up and cancelled without ever going out: still no thread.
    expect(
      chatStateFor(
        parcel({
          status: ParcelStatus.AU_DEPOT,
          location: ParcelLocation.AU_DEPOT,
          hasBeenDispatched: false,
        }),
      ),
    ).toBeNull();
  });

  it('opens while a livreur is carrying the parcel (Q14)', () => {
    expect(chatStateFor(parcel())).toBe(ChatThreadState.OUVERT);
  });

  it('locks it when the parcel is scanned back at the depot', () => {
    expect(
      chatStateFor(
        parcel({ status: ParcelStatus.A_VERIFIER, location: ParcelLocation.AU_DEPOT }),
      ),
    ).toBe(ChatThreadState.VERROUILLE);
  });

  it('keeps it locked while the parcel waits at the depot after a decision', () => {
    for (const status of [
      ParcelStatus.RELANCE,
      ParcelStatus.RETOUR_AU_DEPOT,
      ParcelStatus.AU_DEPOT,
    ]) {
      expect(chatStateFor(parcel({ status, location: ParcelLocation.AU_DEPOT }))).toBe(
        ChatThreadState.VERROUILLE,
      );
    }
  });

  it('stays open while a failed parcel is still in the courier bag', () => {
    // It only locks at the Retour de tournée scan, so the seller can still
    // reach the livreur who has it (Q15).
    expect(
      chatStateFor(
        parcel({ status: ParcelStatus.A_VERIFIER, location: ParcelLocation.AVEC_LE_LIVREUR }),
      ),
    ).toBe(ChatThreadState.OUVERT);
  });

  it('stays locked while a return travels with the ramasseur', () => {
    expect(
      chatStateFor(
        parcel({
          status: ParcelStatus.RETOUR_EN_ROUTE,
          location: ParcelLocation.AVEC_LE_RAMASSEUR,
        }),
      ),
    ).toBe(ChatThreadState.VERROUILLE);
  });

  it('reopens when the parcel goes out again after Relancer', () => {
    const relaunched = parcel({ status: ParcelStatus.RELANCE, location: ParcelLocation.AU_DEPOT });
    expect(chatStateFor(relaunched)).toBe(ChatThreadState.VERROUILLE);

    const dispatchedAgain = parcel({
      status: ParcelStatus.EN_LIVRAISON,
      location: ParcelLocation.AVEC_LE_LIVREUR,
    });
    expect(chatStateFor(dispatchedAgain)).toBe(ChatThreadState.OUVERT);
  });

  it('stays open after delivery until the seller has been paid', () => {
    expect(
      chatStateFor(
        parcel({
          status: ParcelStatus.LIVRE,
          location: ParcelLocation.CHEZ_LE_CLIENT,
          cashStatus: ParcelCashStatus.CHEZ_LE_COURSIER,
        }),
      ),
    ).toBe(ChatThreadState.OUVERT);

    expect(
      chatStateFor(
        parcel({
          status: ParcelStatus.LIVRE,
          location: ParcelLocation.CHEZ_LE_CLIENT,
          cashStatus: ParcelCashStatus.AU_DEPOT,
        }),
      ),
    ).toBe(ChatThreadState.OUVERT);
  });

  it('closes for good once the parcel is delivered and paid', () => {
    expect(
      chatStateFor(
        parcel({
          status: ParcelStatus.LIVRE,
          location: ParcelLocation.CHEZ_LE_CLIENT,
          cashStatus: ParcelCashStatus.PAYE,
        }),
      ),
    ).toBe(ChatThreadState.CLOS);
  });

  it('closes for good once the return is received', () => {
    expect(
      chatStateFor(
        parcel({
          status: ParcelStatus.RETOUR_RECU,
          location: ParcelLocation.RENDU_AU_VENDEUR,
        }),
      ),
    ).toBe(ChatThreadState.CLOS);
  });
});

describe('canPostInChat', () => {
  it('lets everyone write in an open thread', () => {
    for (const who of ['VENDEUR', 'COURSIER', 'FAFFA_GO'] as const) {
      expect(canPostInChat(ChatThreadState.OUVERT, who)).toBe(true);
    }
  });

  it('lets only Faffa Go write in a locked thread', () => {
    expect(canPostInChat(ChatThreadState.VERROUILLE, 'FAFFA_GO')).toBe(true);
    expect(canPostInChat(ChatThreadState.VERROUILLE, 'VENDEUR')).toBe(false);
    expect(canPostInChat(ChatThreadState.VERROUILLE, 'COURSIER')).toBe(false);
  });

  it('lets nobody write in a closed thread, or when there is none', () => {
    for (const who of ['VENDEUR', 'COURSIER', 'FAFFA_GO'] as const) {
      expect(canPostInChat(ChatThreadState.CLOS, who)).toBe(false);
      expect(canPostInChat(null, who)).toBe(false);
    }
  });
});
