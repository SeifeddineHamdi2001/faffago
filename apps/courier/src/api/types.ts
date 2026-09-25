import type { CourierOperationResult } from '@faffago/shared';
import type { Tokens } from './client';

/** Money travels as digit strings in JSON (tech-stack 2). */
type MoneyJson = string;

export type CourierRole = 'LIVREUR' | 'RAMASSEUR';

export interface SessionUser {
  id: string;
  role: CourierRole;
  firstName: string;
  lastName: string;
  langue: 'FR' | 'AR';
}

export interface LoginResult extends Tokens {
  user: SessionUser;
}

export interface AddressMemory {
  note: string | null;
  meetingPoint: string | null;
  deliveredHere: boolean;
  updatedAt: string | null;
}

/** GET /coursier/tournee: one stop (Coursier 4.2). */
export interface Stop {
  code: string;
  status: string;
  recipientName: string;
  recipientPhone: string;
  recipientPhone2: string | null;
  address: string;
  landmark: string | null;
  localiteNameFr: string;
  localiteNameAr: string | null;
  delegationNameFr: string;
  delegationNameAr: string;
  codAmountMillimes: MoneyJson;
  attemptNumber: number;
  maxAttempts: number;
  sellerNote: string | null;
  isExchange: boolean;
  openingAllowed: boolean;
  relaunchDate: string | null;
  relaunchSlot: string | null;
  relaunchOrigin: string | null;
  lastFailureReason: string | null;
  shopName: string;
  sellerPhone: string;
  meetingPoint: string | null;
  memory: AddressMemory | null;
}

export interface Tour {
  toDeliver: Stop[];
  toBringBack: Stop[];
  doneToday: number;
  serverTime: string;
}

/** GET /coursier/ramassages (Coursier 4.6). */
export interface PickupView {
  id: string;
  status: string;
  plannedDate: string | null;
  plannedSlot: string | null;
  shopName: string;
  contactName: string;
  sellerPhone: string;
  address: string;
  landmark: string | null;
  localiteNameFr: string;
  localiteNameAr: string | null;
  delegationNameFr: string;
  delegationNameAr: string;
  note: string | null;
  declaredCount: number | null;
  scannedCount: number;
  parcels: { code: string; status: string; expected: boolean; scanned: boolean }[];
  aEmporter: AEmporter;
}

/** The bons he takes to one seller (Coursier 4.6, D-84). */
export interface AEmporter {
  bonsVersement: {
    id: string;
    number: string;
    netMillimes: MoneyJson;
    enMain: boolean;
    remis: boolean;
  }[];
  bonsRetour: {
    id: string;
    number: string;
    enMain: boolean;
    remis: boolean;
    lines: { code: string; itemType: 'COLIS' | 'ARTICLE_RECUPERE'; received: boolean }[];
  }[];
}

/** A visit only to hand over bons (answer 4, D-84). */
export interface BonVisit {
  sellerId: string;
  shopName: string;
  contactName: string;
  sellerPhone: string;
  address: string | null;
  landmark: string | null;
  localiteNameFr: string | null;
  localiteNameAr: string | null;
  delegationNameFr: string | null;
  delegationNameAr: string | null;
  aEmporter: AEmporter;
}

export interface PickupDay {
  open: PickupView[];
  done: PickupView[];
  visits: BonVisit[];
}

/** GET /coursier/caisse (Coursier 4.7). */
export interface Cash {
  parcels: {
    code: string;
    recipientName: string;
    codAmountMillimes: MoneyJson;
    deliveredAt: string | null;
  }[];
  totalMillimes: MoneyJson;
  /** A ramasseur's bons still to hand to sellers (D-84). */
  bons: { number: string; shopName: string; netMillimes: MoneyJson }[];
  bonCashMillimes: MoneyJson;
  aRemettreMillimes: MoneyJson;
  /** The depot's count of his last days (Coursier 4.7). */
  sessions: {
    day: string;
    status: 'COMPTEE' | 'CLOTUREE';
    expectedMillimes: MoneyJson;
    countedMillimes: MoneyJson | null;
    ecartMillimes: MoneyJson | null;
    conforme: boolean;
    debtMillimes: MoneyJson | null;
  }[];
}

/** GET /coursier/gains (Coursier 4.10, D-82). */
export interface Gains {
  payPlan: string;
  pendingPayPlan: string | null;
  pendingPayPlanFrom: string | null;
  period: { start: string; end: string };
  nextPaymentDate: string;
  parcelCount: number;
  grossMillimes: MoneyJson;
  debtsMillimes: MoneyJson;
  dueMillimes: MoneyJson;
  carriedDebtMillimes: MoneyJson;
  debtsOpenMillimes: MoneyJson;
  fiches: {
    id: string;
    number: string;
    period: { start: string; end: string };
    parcelCount: number;
    netMillimes: MoneyJson;
    status: 'A_PAYER' | 'PAYEE';
  }[];
}

/** GET /coursier/moi (Coursier 4.12). */
export interface Profile {
  firstName: string;
  lastName: string;
  phone: string;
  role: CourierRole;
  langue: 'FR' | 'AR';
  payPlan: string | null;
  zones: { name: string; kind: string }[];
  rules: { scanCancelWindowSeconds: number; maxDeliveryAttempts: number };
}

export interface SyncResponse {
  results: CourierOperationResult[];
}
