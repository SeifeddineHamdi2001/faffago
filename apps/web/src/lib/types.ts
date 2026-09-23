import type { CourierBlocker, Permission, Role } from '@faffago/shared';

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
