import { formatDT, millimesFromJson } from './money.js';
import { ParcelEventType } from './parcel-state-machine.js';
import { Permission } from './permissions.js';
import { Role } from './roles.js';
import { PICKUP_SLOT_LABELS_FR } from './pickups.js';
import { formatTunisDay } from './seller-dashboard.js';
import { FAILURE_REASON_LABELS_FR, type FailureReason, ParcelStatus } from './statuses.js';

/**
 * In-app notifications for every role (Vendeur 4.13, Admin 4.18, Coursier 4.11).
 *
 * A notification is stored as a type and its parameters, never as text (A-24):
 * the courier app shows the same one in French or in Arabic, so the text is
 * made here, by whoever displays it. Money in the parameters is a digit string
 * of millimes (D-20). The seller space and the back office are French only
 * (Q4), so a type that only they receive has no Arabic wording.
 */

/** The same list as the `NotificationType` enum of the schema. */
export const NotificationType = {
  COLIS_A_VERIFIER: 'COLIS_A_VERIFIER',
  COLIS_24H_RESTANTES: 'COLIS_24H_RESTANTES',
  COLIS_RETOUR_AUTO_48H: 'COLIS_RETOUR_AUTO_48H',
  COLIS_EN_RETOUR: 'COLIS_EN_RETOUR',
  BON_VERSEMENT_EN_ROUTE: 'BON_VERSEMENT_EN_ROUTE',
  BON_RETOUR_EN_ROUTE: 'BON_RETOUR_EN_ROUTE',
  RAMASSAGE_PLANIFIE: 'RAMASSAGE_PLANIFIE',
  RAMASSAGE_EFFECTUE: 'RAMASSAGE_EFFECTUE',
  NOUVEAU_MESSAGE: 'NOUVEAU_MESSAGE',
  COMPTE_SUSPENDU: 'COMPTE_SUSPENDU',
  COMPTE_REACTIVE: 'COMPTE_REACTIVE',
  NOUVELLE_DEMANDE_RAMASSAGE: 'NOUVELLE_DEMANDE_RAMASSAGE',
  DEMANDE_MODIFICATION: 'DEMANDE_MODIFICATION',
  ECART_CAISSE: 'ECART_CAISSE',
  BON_NON_REMIS: 'BON_NON_REMIS',
  COURSIER_A_PAYER: 'COURSIER_A_PAYER',
  NOUVEAUX_COLIS_ASSIGNES: 'NOUVEAUX_COLIS_ASSIGNES',
  COLIS_RELANCE_AUJOURDHUI: 'COLIS_RELANCE_AUJOURDHUI',
  COLIS_REPORTE_PAR_CLIENT: 'COLIS_REPORTE_PAR_CLIENT',
  RAPPEL_FIN_DE_JOURNEE: 'RAPPEL_FIN_DE_JOURNEE',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

export type NotificationLocale = 'fr' | 'ar';

/** What each type stores. A day is `AAAA-MM-JJ`. */
export interface NotificationParams {
  COLIS_A_VERIFIER: { code: string; reason: FailureReason };
  /** With a `shopName`, the staff's copy; without, the seller's. */
  COLIS_24H_RESTANTES: { code: string; shopName?: string };
  COLIS_RETOUR_AUTO_48H: { code: string };
  COLIS_EN_RETOUR: { code: string };
  BON_VERSEMENT_EN_ROUTE: { number: string };
  BON_RETOUR_EN_ROUTE: { number: string };
  /** With a `shopName`, the ramasseur's copy; without, the seller's. */
  RAMASSAGE_PLANIFIE: {
    pickupId: string;
    day: string;
    window: 'MATIN' | 'APRES_MIDI';
    shopName?: string;
  };
  RAMASSAGE_EFFECTUE: { pickupId: string; count: number };
  /** `from` is the name the reader may see: a first name, a shop, or Faffa Go. */
  NOUVEAU_MESSAGE: { code: string; from: string };
  COMPTE_SUSPENDU: Record<string, never>;
  COMPTE_REACTIVE: Record<string, never>;
  NOUVELLE_DEMANDE_RAMASSAGE: { pickupId: string; shopName: string };
  DEMANDE_MODIFICATION: { code: string; shopName: string };
  ECART_CAISSE: {
    courierName: string;
    day: string;
    direction: 'MANQUANT' | 'EXCEDENT';
    amountMillimes: string;
  };
  BON_NON_REMIS: { number: string; kind: 'VERSEMENT' | 'RETOUR' };
  /** `day` is the end of the pay period due: told once per period. */
  COURSIER_A_PAYER: { courierName: string; day: string };
  NOUVEAUX_COLIS_ASSIGNES: { count: number };
  COLIS_RELANCE_AUJOURDHUI: { count: number; day: string };
  COLIS_REPORTE_PAR_CLIENT: { code: string; date: string };
  RAPPEL_FIN_DE_JOURNEE: { parcels: number; bons: number; cash: boolean; day: string };
}

// ── Text ────────────────────────────────────────────────────

const WINDOW_LABELS_AR = { MATIN: 'صباحًا', APRES_MIDI: 'بعد الظهر' } as const;

function plural(count: number, one: string, many: string): string {
  return count === 1 ? `${count} ${one}` : `${count} ${many}`;
}

function endOfDayParts(params: NotificationParams['RAPPEL_FIN_DE_JOURNEE'], locale: 'fr' | 'ar') {
  const parts: string[] = [];
  if (locale === 'ar') {
    if (params.parcels > 0) parts.push(`طرود للإرجاع إلى المستودع: ${params.parcels}`);
    if (params.bons > 0) parts.push(`وصولات للإرجاع: ${params.bons}`);
    if (params.cash) parts.push('أموال للتسليم');
    return parts.join('، ');
  }
  if (params.parcels > 0)
    parts.push(`${plural(params.parcels, 'colis', 'colis')} à rendre au dépôt`);
  if (params.bons > 0) parts.push(`${plural(params.bons, 'bon', 'bons')} à rendre`);
  if (params.cash) parts.push('argent à remettre');
  return parts.join(', ');
}

/**
 * The line shown in a bell list. Arabic exists for what a courier receives;
 * anything else is French whatever the locale, as its readers are (Q4).
 */
export function notificationText<T extends NotificationType>(
  type: T,
  params: NotificationParams[T],
  locale: NotificationLocale,
): string {
  const ar = locale === 'ar';
  switch (type) {
    case 'COLIS_A_VERIFIER': {
      const { code, reason } = params as NotificationParams['COLIS_A_VERIFIER'];
      return `Colis ${code} à vérifier · ${FAILURE_REASON_LABELS_FR[reason]}`;
    }
    case 'COLIS_24H_RESTANTES': {
      const { code, shopName } = params as NotificationParams['COLIS_24H_RESTANTES'];
      return shopName
        ? `${code} · ${shopName} : plus que 24 h pour décider`
        : `Plus que 24 h pour décider sur ${code}`;
    }
    case 'COLIS_RETOUR_AUTO_48H':
      return `Colis ${(params as NotificationParams['COLIS_RETOUR_AUTO_48H']).code} retourné automatiquement`;
    case 'COLIS_EN_RETOUR':
      return `Colis ${(params as NotificationParams['COLIS_EN_RETOUR']).code} en retour`;
    case 'BON_VERSEMENT_EN_ROUTE':
      return `Votre paiement ${(params as NotificationParams['BON_VERSEMENT_EN_ROUTE']).number} arrive avec le coursier`;
    case 'BON_RETOUR_EN_ROUTE':
      return `Vos retours ${(params as NotificationParams['BON_RETOUR_EN_ROUTE']).number} arrivent avec le coursier`;
    case 'RAMASSAGE_PLANIFIE': {
      const { day, window, shopName } = params as NotificationParams['RAMASSAGE_PLANIFIE'];
      const date = formatTunisDay(day);
      if (ar) {
        return shopName
          ? `تمت جدولة الاستلام: ${shopName}، يوم ${date} (${WINDOW_LABELS_AR[window]})`
          : `تمت جدولة الاستلام يوم ${date} (${WINDOW_LABELS_AR[window]})`;
      }
      const slot = PICKUP_SLOT_LABELS_FR[window];
      return shopName
        ? `Ramassage planifié : ${shopName}, le ${date} (${slot})`
        : `Ramassage planifié le ${date} (${slot})`;
    }
    case 'RAMASSAGE_EFFECTUE': {
      const { count } = params as NotificationParams['RAMASSAGE_EFFECTUE'];
      return ar
        ? `تم الاستلام، عدد الطرود: ${count}`
        : `Ramassage effectué : ${plural(count, 'colis ramassé', 'colis ramassés')}`;
    }
    case 'NOUVEAU_MESSAGE': {
      const { code, from } = params as NotificationParams['NOUVEAU_MESSAGE'];
      return ar ? `رسالة جديدة من ${from} بخصوص ${code}` : `Nouveau message de ${from} sur ${code}`;
    }
    case 'COMPTE_SUSPENDU':
      return 'Compte suspendu';
    case 'COMPTE_REACTIVE':
      return 'Compte réactivé';
    case 'NOUVELLE_DEMANDE_RAMASSAGE':
      return `Nouvelle demande de ramassage · ${(params as NotificationParams['NOUVELLE_DEMANDE_RAMASSAGE']).shopName}`;
    case 'DEMANDE_MODIFICATION': {
      const { code, shopName } = params as NotificationParams['DEMANDE_MODIFICATION'];
      return `Demande de modification sur ${code} · ${shopName}`;
    }
    case 'ECART_CAISSE': {
      const { courierName, direction, amountMillimes } =
        params as NotificationParams['ECART_CAISSE'];
      const amount = formatDT(millimesFromJson(amountMillimes));
      return `Écart de caisse · ${courierName} · ${direction === 'MANQUANT' ? 'manque' : 'excédent'} ${amount}`;
    }
    case 'BON_NON_REMIS':
      return `Bon ${(params as NotificationParams['BON_NON_REMIS']).number} non remis`;
    case 'COURSIER_A_PAYER':
      return `Paie à préparer · ${(params as NotificationParams['COURSIER_A_PAYER']).courierName}`;
    case 'NOUVEAUX_COLIS_ASSIGNES': {
      const { count } = params as NotificationParams['NOUVEAUX_COLIS_ASSIGNES'];
      return ar
        ? `طرود جديدة: ${count}`
        : count === 1
          ? '1 nouveau colis assigné'
          : `${count} nouveaux colis assignés`;
    }
    case 'COLIS_RELANCE_AUJOURDHUI': {
      const { count } = params as NotificationParams['COLIS_RELANCE_AUJOURDHUI'];
      return ar
        ? `طرود مؤجلة للتسليم اليوم: ${count}`
        : count === 1
          ? '1 colis relancé à livrer aujourd’hui'
          : `${count} colis relancés à livrer aujourd’hui`;
    }
    case 'COLIS_REPORTE_PAR_CLIENT': {
      const { code, date } = params as NotificationParams['COLIS_REPORTE_PAR_CLIENT'];
      return `Livraison de ${code} reportée au ${formatTunisDay(date)} à la demande du client`;
    }
    case 'RAPPEL_FIN_DE_JOURNEE': {
      const parts = endOfDayParts(params as NotificationParams['RAPPEL_FIN_DE_JOURNEE'], locale);
      return ar ? `قبل العودة: ${parts}` : `Avant de rentrer : ${parts}`;
    }
  }
  return type;
}

// ── Who receives what ───────────────────────────────────────

export type NotificationRecipient = Role | Permission;

/**
 * Who a type is for. A role means the person the event is about (the seller
 * of the parcel, the courier concerned); a permission means every active
 * account holding it, so the team is told of what it can act on and nothing
 * else (Admin 4.18: "filtered by role").
 */
export function notificationRecipients<T extends NotificationType>(
  type: T,
  params: NotificationParams[T],
): NotificationRecipient[] {
  switch (type) {
    case 'COLIS_24H_RESTANTES':
      return (params as NotificationParams['COLIS_24H_RESTANTES']).shopName
        ? [Permission.SUIVI_A_VERIFIER]
        : [Role.VENDEUR];
    case 'NOUVELLE_DEMANDE_RAMASSAGE':
      return [Permission.PLANIFIER_RAMASSAGES_TOURNEES];
    case 'DEMANDE_MODIFICATION':
      return [Permission.DEMANDES_VENDEUR];
    case 'ECART_CAISSE':
      return [Permission.CAISSE_ECARTS];
    case 'COURSIER_A_PAYER':
      return [Permission.PAIE_COURSIERS];
    case 'BON_NON_REMIS':
      return (params as NotificationParams['BON_NON_REMIS']).kind === 'VERSEMENT'
        ? [Permission.BONS_VERSEMENT]
        : [Permission.BONS_RETOUR];
    case 'NOUVEAUX_COLIS_ASSIGNES':
    case 'COLIS_RELANCE_AUJOURDHUI':
      return [Role.LIVREUR];
    case 'RAPPEL_FIN_DE_JOURNEE':
      return [Role.LIVREUR, Role.RAMASSEUR];
    case 'RAMASSAGE_PLANIFIE':
      return (params as NotificationParams['RAMASSAGE_PLANIFIE']).shopName
        ? [Role.RAMASSEUR]
        : [Role.VENDEUR];
    case 'NOUVEAU_MESSAGE':
      // The chat service picks the other side of each conversation. The
      // ramasseur never joins a chat (A-23).
      return [Role.VENDEUR, Role.LIVREUR, Permission.CHATS_STAFF];
    default:
      return [Role.VENDEUR];
  }
}

// ── Where a notification leads ──────────────────────────────

export type NotificationTarget =
  | { screen: 'PARCEL'; code: string }
  | { screen: 'CHAT'; code: string }
  | { screen: 'PICKUP'; pickupId: string }
  | { screen: 'PAYMENTS' | 'RETURNS' | 'CHANGE_REQUESTS' | 'CAISSE' | 'PAY' | 'TOUR' | 'NONE' };

/** The screen a tap opens; each app maps it to its own route. */
export function notificationTarget<T extends NotificationType>(
  type: T,
  params: NotificationParams[T],
): NotificationTarget {
  const p = params as unknown as Record<string, string>;
  switch (type) {
    case 'COLIS_A_VERIFIER':
    case 'COLIS_24H_RESTANTES':
    case 'COLIS_RETOUR_AUTO_48H':
    case 'COLIS_EN_RETOUR':
    case 'COLIS_REPORTE_PAR_CLIENT':
    case 'DEMANDE_MODIFICATION':
      return { screen: 'PARCEL', code: p.code as string };
    case 'NOUVEAU_MESSAGE':
      return { screen: 'CHAT', code: p.code as string };
    case 'BON_VERSEMENT_EN_ROUTE':
      return { screen: 'PAYMENTS' };
    case 'BON_RETOUR_EN_ROUTE':
      return { screen: 'RETURNS' };
    case 'BON_NON_REMIS':
      return {
        screen:
          (params as NotificationParams['BON_NON_REMIS']).kind === 'VERSEMENT'
            ? 'PAYMENTS'
            : 'RETURNS',
      };
    case 'RAMASSAGE_PLANIFIE':
    case 'RAMASSAGE_EFFECTUE':
    case 'NOUVELLE_DEMANDE_RAMASSAGE':
      return { screen: 'PICKUP', pickupId: p.pickupId as string };
    case 'ECART_CAISSE':
      return { screen: 'CAISSE' };
    case 'COURSIER_A_PAYER':
      return { screen: 'PAY' };
    case 'NOUVEAUX_COLIS_ASSIGNES':
    case 'COLIS_RELANCE_AUJOURDHUI':
    case 'RAPPEL_FIN_DE_JOURNEE':
      return { screen: 'TOUR' };
    default:
      return { screen: 'NONE' };
  }
}

// ── What a parcel's events tell the seller ──────────────────

export interface ParcelNoticeInput {
  code: string;
  /** The events one action just wrote, in order. */
  events: readonly { type: ParcelEventType; newStatus: ParcelStatus }[];
  /** The parcel's failure reason after the action. */
  failureReason: FailureReason | null;
  /** The parcel's relance day after the action, `AAAA-MM-JJ`. */
  relaunchDate: string | null;
}

export interface SellerNotice {
  type:
    'COLIS_A_VERIFIER' | 'COLIS_REPORTE_PAR_CLIENT' | 'COLIS_EN_RETOUR' | 'COLIS_RETOUR_AUTO_48H';
  params: NotificationParams[SellerNotice['type']];
}

/**
 * What the seller is told after an action on his parcel (Vendeur 4.13, D-9).
 * Only what he did not do himself: his own decisions, cancellations and edits
 * stay silent, and a third failure is one notice, the return, not an À
 * vérifier that lasted no time.
 */
export function sellerNoticesForParcel(input: ParcelNoticeInput): SellerNotice[] {
  const { code, events } = input;
  const has = (type: ParcelEventType) => events.some((event) => event.type === type);

  if (has(ParcelEventType.RETOUR_AUTO_3E_TENTATIVE)) {
    return [{ type: 'COLIS_EN_RETOUR', params: { code } }];
  }
  if (has(ParcelEventType.RETOUR_AUTO_48H)) {
    return [{ type: 'COLIS_RETOUR_AUTO_48H', params: { code } }];
  }
  const failure = events.find((event) => event.type === ParcelEventType.ECHEC_LIVRAISON);
  if (failure?.newStatus === ParcelStatus.A_VERIFIER && input.failureReason) {
    return [{ type: 'COLIS_A_VERIFIER', params: { code, reason: input.failureReason } }];
  }
  if (failure?.newStatus === ParcelStatus.RELANCE && input.relaunchDate) {
    return [{ type: 'COLIS_REPORTE_PAR_CLIENT', params: { code, date: input.relaunchDate } }];
  }
  return [];
}

// ── The daily notices ───────────────────────────────────────

/**
 * TO CONFIRM (one constant each). The relance notice goes out at the start of
 * the working day; the reminder after the depot's hours, while a courier can
 * still hand things in.
 */
export const RELANCE_TODAY_NOTICE_HOUR_TUNIS = 7;
export const END_OF_DAY_REMINDER_HOUR_TUNIS = 18;

/** Tunis is UTC+1 all year. Whether the Tunis hour has come, on the Tunis day of `now`. */
export function isDailyNoticeDue(now: Date, hourTunis: number): boolean {
  return (now.getUTCHours() + 1) % 24 >= hourTunis;
}
