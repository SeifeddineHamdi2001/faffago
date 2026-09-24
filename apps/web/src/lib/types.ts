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
  zones: { name: string; role: 'LIVREUR' | 'RAMASSEUR'; kind: 'TITULAIRE' | 'BACKUP' }[];
  /** Marked absent for today (D-52). */
  absentToday: boolean;
  /** Livreurs only: parcels he carries and those Tournées plans for him (D-55). */
  parcelsToday?: { withHim: number; planned: number } | null;
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

/** GET /zones (Paramètres › Zones, D-51). Couriers are named by their account id. */
export interface ZoneCourierRef {
  id: string;
  firstName: string;
  lastName: string;
}

export interface ZoneRow {
  id: string;
  name: string;
  isActive: boolean;
  delegations: { id: string; code: string; nameFr: string }[];
  assignments: Record<
    'LIVREUR' | 'RAMASSEUR',
    Record<'TITULAIRE' | 'BACKUP', ZoneCourierRef | null>
  >;
}

/** GET /geo/admin (Paramètres › Géographie, D-51). */
export interface GeographyRow {
  id: string;
  code: string;
  nameFr: string;
  nameAr: string;
  delegations: {
    id: string;
    code: string;
    nameFr: string;
    nameAr: string;
    isActive: boolean;
    zone: { id: string; name: string } | null;
    localiteCount: number;
  }[];
}

/** GET /localites?delegationId= (Paramètres › Géographie, D-17). */
export interface LocaliteAdminRow {
  id: string;
  delegationId: string;
  nameFr: string;
  nameAr: string | null;
  postalCode: string | null;
  aliases: string[];
  isOther: boolean;
  isActive: boolean;
}

/** GET /localites/autre/parcels (D-17). */
export interface AutreParcelRow {
  id: string;
  code: string;
  address: string;
  landmark: string | null;
  status: string;
  createdAt: string;
  delegation: { code: string; nameFr: string };
  shopName: string;
}

/** GET /couriers/:id/absences (D-52). */
export interface AbsenceRow {
  date: string;
  reason: string | null;
}

/** POST /scans/depot (Admin 4.2, D-53): what the station shows after a scan. */
export interface DepotScanResult {
  scanId: string | null;
  clientScanId: string;
  mode: string;
  accepted: boolean;
  replayed: boolean;
  refusal: string | null;
  message: string;
  manualEntry: boolean;
  clockSkewFlagged: boolean;
  parcel: {
    code: string;
    status: string;
    location: string;
    shopName: string;
    delegationNameFr: string;
  } | null;
  courier: ZoneCourierRef | null;
  plannedFor: ZoneCourierRef | null;
  /** Until when Annuler le dernier scan is possible, server clock (D-54). */
  cancellableUntil: string | null;
  serverTime: string;
}

/** GET /tournees (Admin 4.5, D-55). */
export interface TourParcelRow {
  id: string;
  code: string;
  status: string;
  relaunchDate: string | null;
  relaunchSlot: string | null;
  attemptCount: number;
  localiteNameFr: string;
  delegationNameFr: string;
  shopName: string;
  plannedLivreur: ZoneCourierRef | null;
  moved: boolean;
}

export interface TourneesView {
  date: string;
  zones: {
    id: string;
    name: string;
    livreur: ZoneCourierRef | null;
    livreurKind: 'TITULAIRE' | 'BACKUP' | null;
    parcels: TourParcelRow[];
  }[];
  sansZone: TourParcelRow[];
  loads: { courier: ZoneCourierRef; count: number }[];
  withoutCourier: number;
}

/** GET /ramassages (Admin 4.4, D-58). */
export interface RamassageRow {
  id: string;
  status: string;
  shopName: string;
  contactPhone: string;
  address: {
    address: string;
    landmark: string | null;
    localiteNameFr: string;
    delegationNameFr: string;
    zone: { id: string; name: string } | null;
  };
  requestedSlot: string | null;
  note: string | null;
  expectedCount: number;
  scannedCount: number;
  plannedDate: string | null;
  plannedSlot: string | null;
  ramasseur: ZoneCourierRef | null;
  createdAt: string;
  suggestion: { ramasseur: ZoneCourierRef | null; kind: 'TITULAIRE' | 'BACKUP' | null } | null;
}

/** GET /ramassages/:id: the parcels announced and À emporter. */
export interface RamassageDetail extends RamassageRow {
  parcels: { code: string; recipientName: string; status: string; pickedUp: boolean }[];
  aEmporter: {
    bonsVersement: { number: string; netMillimes: string }[];
    bonsRetour: { number: string; parcelCount: number }[];
  };
}

/** The filters of Colis, as they sit in the page's address (Admin 4.3). */
export interface ColisQuery {
  q?: string;
  status?: string;
  cashStatus?: string;
  sellerId?: string;
  courierId?: string;
  zoneId?: string;
  from?: string;
  to?: string;
  page?: string;
}

/** GET /colis/filters. */
export interface ColisFilters {
  zones: { id: string; name: string }[];
  sellers: { id: string; shopName: string }[];
  livreurs: { id: string; firstName: string; lastName: string }[];
}

/** GET /colis. */
export interface StaffParcelList {
  items: {
    code: string;
    createdAt: string;
    sellerId: string;
    shopName: string;
    recipientName: string;
    recipientPhone: string;
    delegationNameFr: string;
    localiteNameFr: string;
    zoneName: string | null;
    status: string;
    location: string;
    cashStatus: string | null;
    codAmountMillimes: string;
    courier: { firstName: string; lastName: string } | null;
  }[];
  total: number;
  page: number;
  pageSize: number;
}

/** One line of the full event log (Admin 4.3). */
export interface StaffEventRow {
  type: string;
  at: string;
  deviceTime: string | null;
  actor: { name: string; role: string | null } | null;
  source: string | null;
  previousStatus: string | null;
  newStatus: string | null;
  previousLocation: string | null;
  newLocation: string | null;
  reasonCode: string | null;
  reasonText: string | null;
  gps: { lat: number; lng: number; accuracyM: number | null } | null;
  scan: { manualEntry: boolean; cancelled: boolean; clockSkewFlagged: boolean } | null;
  plannedFor: string | null;
  cancelledAfterPickup: boolean;
}

/** GET /colis/:code. */
export interface StaffParcelDetail {
  code: string;
  createdAt: string;
  seller: { id: string; shopName: string; contactPhone: string };
  recipientName: string;
  recipientPhone: string;
  recipientPhone2: string | null;
  address: string;
  landmark: string | null;
  localiteNameFr: string;
  delegationNameFr: string;
  zoneName: string | null;
  productDescription: string;
  pieceCount: number;
  isExchange: boolean;
  openingAllowed: boolean;
  courierNote: string | null;
  status: string;
  location: string;
  attemptCount: number;
  lastFailureReason: string | null;
  lastFailureNote: string | null;
  verifyDeadlineAt: string | null;
  relaunchDate: string | null;
  relaunchSlot: string | null;
  currentLivreur: ZoneCourierRef | null;
  plannedLivreur: ZoneCourierRef | null;
  money: {
    codAmountMillimes: string;
    deliveryFeeMillimes: string;
    returnFeeMillimes: string;
    changeClientFeeMillimes: string;
    courierRateMillimes: string | null;
    cashStatus: string | null;
    bonNumber: string | null;
    charges: { type: string; amountMillimes: string; status: string }[];
  };
  events: StaffEventRow[];
}
