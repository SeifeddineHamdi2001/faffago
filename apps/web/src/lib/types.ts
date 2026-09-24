import type {
  ChangeRequestField,
  ChangeRequestStatus,
  CourierBlocker,
  CsvRowProblem,
  CsvRowVerdict,
  DashboardTile,
  FailureReason,
  ParcelCashStatus,
  ParcelEventType,
  ParcelGroup,
  ParcelLocation,
  PickupSlot,
  PickupStatus,
  ParcelStatus,
  Permission,
  Role,
  SellerDocumentType,
  TimelineActor,
} from '@faffago/shared';

/** GET /auth/me. */
export interface Me {
  id: string;
  role: Role;
  firstName: string;
  lastName: string;
  langue: string;
  permissions: Permission[];
  readOnly: boolean;
  seller: { id: string; shopName: string; accountState: string } | null;
  impersonation: { id: string; shopName: string; banner: string; expiresAt: string } | null;
}

/** Every refusal from the API: a stable code and a French message. */
export interface ApiError {
  code?: string;
  message: string;
  retryAfterSeconds?: number;
  blockers?: CourierBlocker[];
  issues?: { path: string; message: string }[];
}

/** GET /accounts/couriers. The account and pay fields reach the admin only. */
export interface CourierRow {
  id: string;
  role: 'LIVREUR' | 'RAMASSEUR';
  firstName: string;
  lastName: string;
  phone: string;
  zones: { name: string; kind: 'TITULAIRE' | 'BACKUP' }[];
  isActive?: boolean;
  acceptsWork?: boolean;
  accountState?: 'ACTIF' | 'INACTIF';
  cin?: string;
  vehicle?: string | null;
  payPlan?: string | null;
}

/** GET /sellers. The email, statut and state reach the admin only (D-11). */
export interface SellerRow {
  id: string;
  shopName: string;
  contactFullName: string;
  contactPhone: string;
  userId?: string;
  email?: string | null;
  statut?: string;
  accountState?: string;
  productCategory?: string;
  storeLink?: string | null;
  contactFirstName?: string;
  contactLastName?: string;
  createdAt?: string;
}

/** A CIN, patente or card, as listed; the file itself is fetched on its own (D-32). */
export interface SellerDocumentRow {
  id: string;
  type: SellerDocumentType;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  replacedAt: string | null;
}

/** GET /sellers/:id. Dépôt and Service client get the four contact fields only. */
export interface SellerDetail extends SellerRow {
  documents?: SellerDocumentRow[];
}

/** POST /sellers: the account, and its password shown once. */
export interface CreatedSeller {
  seller: SellerRow & { email: string };
  password: string;
}

/** GET /accounts/staff. */
export interface StaffRow {
  id: string;
  role: 'ADMIN' | 'DEPOT' | 'SERVICE_CLIENT';
  username: string;
  firstName: string;
  lastName: string;
  phone: string;
  isActive: boolean;
  lastLoginAt: string | null;
}

/** POST /accounts/staff and /accounts/couriers: the password, shown once. */
export interface CreatedAccount {
  user: { id: string; role: Role; username: string | null; phone: string };
  password: string;
}

/** A change request as its seller sees it (Vendeur 4.6, D-44). */
export interface ParcelChangeRequest {
  id: string;
  requestedFields: Partial<Record<ChangeRequestField, string>>;
  /** The localité asked for, named. */
  requestedLocalite: { id: string; nameFr: string; delegationNameFr: string } | null;
  sellerNote: string | null;
  status: ChangeRequestStatus;
  createdAt: string;
  editedAt: string | null;
  handledAt: string | null;
}

/** GET /parcels/:code, for the seller. Money as digit strings of millimes. */
export interface SellerParcel {
  id: string;
  code: string;
  status: ParcelStatus;
  location: string;
  cashStatus: ParcelCashStatus | null;
  recipientName: string;
  recipientPhone: string;
  recipientPhone2: string | null;
  localite: { id: string; nameFr: string };
  delegation: { id: string; nameFr: string; gouvernoratNameFr: string };
  address: string;
  landmark: string | null;
  productDescription: string;
  pieceCount: number;
  codAmountMillimes: string;
  isExchange: boolean;
  openingAllowed: boolean;
  courierNote: string | null;
  deliveryFeeMillimes: string;
  returnFeeMillimes: string;
  createdAt: string;
  cancelledAt: string | null;
  changeRequests: ParcelChangeRequest[];
}

/** PATCH /parcels/:code. */
export interface ParcelEdit {
  parcel: SellerParcel;
  changedFields: string[];
  reprintLabel: boolean;
}

/** POST and GET /parcels/imports: the parcels of one file, in file order. */
export interface ParcelImport {
  id: string;
  fileName: string;
  parcelCount: number;
  createdAt: string;
  parcels: { line: number; code: string; recipientName: string; codAmountMillimes: string }[];
}

/** A row the server refused on import (422 LIGNES_REFUSEES). */
export interface RefusedImportRow {
  line: number;
  verdict: CsvRowVerdict;
  problems: CsvRowProblem[];
}

/** GET /parcels: one row of Mes colis (Vendeur 4.7). */
export interface ParcelListItem {
  code: string;
  recipientName: string;
  recipientPhone: string;
  delegationNameFr: string;
  localiteNameFr: string;
  status: ParcelStatus;
  cashStatus: ParcelCashStatus | null;
  codAmountMillimes: string;
  createdAt: string;
}

export interface ParcelList {
  items: ParcelListItem[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<ParcelGroup, number>;
}

/** One line of the timeline as the seller reads it (D-38). */
export interface TimelineEntry {
  type: ParcelEventType;
  at: string;
  actor: TimelineActor;
  location: ParcelLocation | null;
  failureReason: FailureReason | null;
  cancelledAfterPickup: boolean;
}

/** GET /parcels/:code: Détail du colis (Vendeur 4.8). */
export interface SellerParcelDetail extends SellerParcel {
  attemptCount: number;
  maxAttempts: number;
  lastFailureReason: FailureReason | null;
  bonNumber: string | null;
  timeline: TimelineEntry[];
}

/** A pickup address (Vendeur 4.5, 4.14). */
export interface PickupAddress {
  id: string;
  label: string | null;
  localiteId: string;
  localiteNameFr: string;
  delegationNameFr: string;
  gouvernoratNameFr: string;
  address: string;
  landmark: string | null;
  isDefault: boolean;
}

/** GET /pickups: one request (Vendeur 4.5). */
export interface PickupView {
  id: string;
  status: PickupStatus;
  requestedSlot: PickupSlot | null;
  note: string | null;
  declaredCount: number | null;
  expectedCount: number;
  scannedCount: number;
  plannedDate: string | null;
  plannedSlot: PickupSlot | null;
  ramasseurFirstName: string | null;
  createdAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  address: PickupAddress;
}

export interface PickupDetail extends PickupView {
  parcels: { code: string; recipientName: string; status: ParcelStatus; pickedUp: boolean }[];
}

/** GET /pickups/ready-parcels: what the request form offers. */
export interface ReadyParcel {
  code: string;
  recipientName: string;
  delegationNameFr: string;
  codAmountMillimes: string;
  createdAt: string;
}

/** GET /profile (Vendeur 4.14). Money as digit strings of millimes. */
export interface SellerProfile {
  shopName: string;
  productCategory: string;
  storeLink: string | null;
  contactFullName: string;
  contactPhone: string;
  email: string | null;
  statut: string;
  accountState: string;
  rates: {
    deliveryFeeMillimes: string;
    returnFeeMillimes: string;
    changeClientFeeMillimes: string;
    pickupFeeMillimes: string;
    pickupFreeThreshold: number;
    retenueRateBps: number;
  };
}

/** GET /dashboard (Vendeur 4.1, D-48): distinct parcels per tile over Tunis days. */
export interface SellerDashboard {
  from: string;
  to: string;
  counts: Record<DashboardTile, number>;
}
