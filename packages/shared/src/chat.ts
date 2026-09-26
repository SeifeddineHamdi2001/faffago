import { z } from 'zod';
import { Role } from './roles.js';
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

// ── Messages ────────────────────────────────────────────────

/** Text only in v1 (Vendeur 4.10). */
export const CHAT_MESSAGE_MAX_LENGTH = 1000;

/**
 * One message. The sender is never part of it: who writes is the signed-in
 * account, and the id is the one the sender drew, so a message sent twice
 * (a weak signal, a retry from the offline queue) is stored once.
 */
export const chatMessageSchema = z
  .object({
    messageId: z.string().uuid(),
    body: z
      .string()
      .trim()
      .min(1, 'Écrivez un message')
      .max(CHAT_MESSAGE_MAX_LENGTH, `${CHAT_MESSAGE_MAX_LENGTH} caractères maximum`),
  })
  .strict();
export type ChatMessageValues = z.output<typeof chatMessageSchema>;

/**
 * Quick replies (Coursier 4.8). The four of the spec, worded in both
 * languages on the courier's buttons; what is sent is the French text, which
 * is what the seller reads (Q4).
 */
export const CHAT_QUICK_REPLIES_COURIER: readonly { fr: string; ar: string }[] = [
  { fr: 'Client ne répond pas', ar: 'الزبون لا يرد' },
  { fr: 'Adresse introuvable', ar: 'لم أجد العنوان' },
  { fr: 'Je passe dans 10 min', ar: 'سأمرّ خلال 10 دقائق' },
  { fr: 'Client demande un autre jour', ar: 'الزبون يطلب يومًا آخر' },
];

/** Vendeur 4.10: "le client est disponible après 17h". Worded here, as the spec gives one example. */
export const CHAT_QUICK_REPLIES_SELLER: readonly string[] = [
  'Le client est disponible après 17 h',
  'Le client est joignable maintenant',
  'Le client vous attend',
  'Merci',
];

export type ChatViewer = 'VENDEUR' | 'COURSIER' | 'FAFFA_GO';

/** Who a role speaks as in a chat. The ramasseur never joins (A-23). */
export function chatParticipantOf(role: Role): ChatViewer | null {
  switch (role) {
    case Role.VENDEUR:
      return 'VENDEUR';
    case Role.LIVREUR:
      return 'COURSIER';
    case Role.ADMIN:
    case Role.DEPOT:
    case Role.SERVICE_CLIENT:
      return 'FAFFA_GO';
    default:
      return null;
  }
}

/**
 * The name printed over a message, for the person reading it. The seller reads
 * the courier's first name only (Coursier rule 12); the team is "Faffa Go" to
 * both, and reads real names itself (Admin 4.8).
 */
export function chatSenderLabel(input: {
  viewer: ChatViewer;
  /** The reader wrote it. */
  mine: boolean;
  kind: ChatViewer;
  firstName?: string;
  fullName?: string;
  shopName?: string;
}): string {
  if (input.kind === 'FAFFA_GO') return 'Faffa Go';
  if (input.mine && input.viewer !== 'FAFFA_GO') return 'Vous';
  if (input.kind === 'VENDEUR') return input.shopName ?? 'Vendeur';
  if (input.viewer === 'FAFFA_GO') return input.fullName ?? input.firstName ?? 'Livreur';
  return input.firstName ?? 'Livreur';
}

/**
 * What a person may do in a thread (Q15, A-23). The seller reads his own
 * parcel's thread for good; a livreur reads and writes only while he is the
 * thread's current one; the staff read everything and write until it closes;
 * the ramasseur has nothing.
 */
export function chatAccessFor(input: {
  role: Role;
  state: ChatThreadState;
  isParcelSeller: boolean;
  isThreadCourier: boolean;
}): { canRead: boolean; canPost: boolean } {
  const participant = chatParticipantOf(input.role);
  const allowed =
    participant === 'FAFFA_GO' ||
    (participant === 'VENDEUR' && input.isParcelSeller) ||
    (participant === 'COURSIER' && input.isThreadCourier);
  if (!participant || !allowed) return { canRead: false, canPost: false };
  return { canRead: true, canPost: canPostInChat(input.state, participant) };
}

// ── Refusals ────────────────────────────────────────────────

export const ChatErrorCode = {
  /** The parcel has no thread yet: no livreur has taken it out (Q16). */
  CHAT_NON_OUVERT: 'CHAT_NON_OUVERT',
  CHAT_LECTURE_SEULE: 'CHAT_LECTURE_SEULE',
  CHAT_CLOS: 'CHAT_CLOS',
  /** The same message id sent by someone else, or into another chat. */
  MESSAGE_ID_REUTILISE: 'MESSAGE_ID_REUTILISE',
} as const;
export type ChatErrorCode = (typeof ChatErrorCode)[keyof typeof ChatErrorCode];

export const CHAT_MESSAGES_FR: Record<ChatErrorCode, string> = {
  CHAT_NON_OUVERT: 'Le chat s’ouvre quand un livreur prend le colis en charge',
  CHAT_LECTURE_SEULE: 'Le colis est au dépôt : le chat est en lecture seule',
  CHAT_CLOS: 'Le chat est clos : le colis est livré et payé, ou son retour est reçu',
  MESSAGE_ID_REUTILISE: 'Identifiant de message déjà utilisé',
};

/** Why a person cannot write now, for the state the thread is in. */
export function chatRefusalFor(state: ChatThreadState | null): ChatErrorCode | null {
  if (state === null) return ChatErrorCode.CHAT_NON_OUVERT;
  if (state === ChatThreadState.CLOS) return ChatErrorCode.CHAT_CLOS;
  return null;
}
