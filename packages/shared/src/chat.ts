import { ParcelCashStatus, ParcelLocation, ParcelStatus } from './statuses.js';

/**
 * The life of a parcel chat (Q15, A-23).
 *
 * One thread per parcel, opened by the Sortie coursier scan. It follows the
 * parcel rather than the courier: when the parcel comes back to the depot the
 * seller and the courier stop writing, and when it goes out again the same
 * thread reopens with the new livreur, who reads the whole history.
 *
 * The ramasseur never joins, so a parcel that never reaches a livreur never
 * gets a thread at all (Q16).
 */

export const ChatThreadState = {
  /** The seller and the livreur who holds the parcel can both write. */
  OUVERT: 'OUVERT',
  /**
   * The parcel is at the depot or with the ramasseur: no livreur holds it, so
   * the seller and couriers can only read. Faffa Go staff still reply, which is
   * how À vérifier and returns are followed up.
   */
  VERROUILLE: 'VERROUILLE',
  /** Delivered and paid, returned and received, or cancelled. Nobody writes. */
  CLOS: 'CLOS',
} as const;
export type ChatThreadState = (typeof ChatThreadState)[keyof typeof ChatThreadState];

export const CHAT_THREAD_STATE_LABELS_FR: Record<ChatThreadState, string> = {
  OUVERT: 'Ouvert',
  VERROUILLE: 'Lecture seule',
  CLOS: 'Clos',
};

export interface ChatParcelView {
  status: ParcelStatus;
  location: ParcelLocation;
  cashStatus: ParcelCashStatus | null;
  /** False until the first Sortie coursier scan. */
  hasBeenDispatched: boolean;
}

/**
 * The state of the thread, derived from the parcel rather than stored as a
 * sequence of transitions, so it can never drift out of step with the parcel.
 *
 * Returns null when there should be no thread at all.
 */
export function chatStateFor(parcel: ChatParcelView): ChatThreadState | null {
  if (!parcel.hasBeenDispatched) return null;

  if (parcel.status === ParcelStatus.RETOUR_RECU || parcel.status === ParcelStatus.ANNULE) {
    return ChatThreadState.CLOS;
  }

  // Delivered closes the thread only once the seller has been paid for it.
  if (parcel.status === ParcelStatus.LIVRE) {
    return parcel.cashStatus === ParcelCashStatus.PAYE
      ? ChatThreadState.CLOS
      : ChatThreadState.OUVERT;
  }

  // A livreur is holding it right now: that is the only case where the seller
  // has someone to talk to.
  if (parcel.location === ParcelLocation.AVEC_LE_LIVREUR) return ChatThreadState.OUVERT;

  return ChatThreadState.VERROUILLE;
}

/** Whether a given participant may post, given the thread's state. */
export function canPostInChat(
  state: ChatThreadState | null,
  participant: 'VENDEUR' | 'COURSIER' | 'FAFFA_GO',
): boolean {
  if (state === null || state === ChatThreadState.CLOS) return false;
  if (state === ChatThreadState.OUVERT) return true;
  // VERROUILLE: staff keep the conversation alive during À vérifier and returns.
  return participant === 'FAFFA_GO';
}
