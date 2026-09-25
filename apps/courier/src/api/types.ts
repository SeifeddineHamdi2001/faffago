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
  aEmporter: unknown[];
}

export interface PickupDay {
  open: PickupView[];
  done: PickupView[];
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
