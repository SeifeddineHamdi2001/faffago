import { z } from 'zod';
import type { RandomBytes } from './codes.js';
import { Role, isCourierRole, isStaffRole } from './roles.js';
import { tunisianPhone } from './schemas.js';
import { PayPlan } from './statuses.js';

/**
 * Logins, sessions and generated passwords (A-20, Q7 to Q13, D-5, D-6).
 *
 * Every lifetime and threshold lives here, in one place, so that a TO CONFIRM
 * value is changed once and the API, the web app and the courier app agree.
 */

/** Where a session lives. Decides its lifetime (Q11). */
export const AuthClient = {
  WEB: 'WEB',
  COURIER_APP: 'COURIER_APP',
} as const;
export type AuthClient = (typeof AuthClient)[keyof typeof AuthClient];

const MINUTE = 60;
const DAY = 24 * 60 * MINUTE;

export const SESSION_POLICY = {
  /**
   * The session behind it is re-read on every request, so revocation is
   * immediate; the short life only limits a token copied off a device.
   */
  accessTokenTtlSeconds: 15 * MINUTE,
  /** Q11: web refresh token 7 days. */
  webRefreshTtlSeconds: 7 * DAY,
  /** Q11: courier refresh token 90 days; the PIN guards the phone (D-7). */
  courierRefreshTtlSeconds: 90 * DAY,
  /** Q11: staff idle logout. Sellers have none. */
  staffIdleTimeoutSeconds: 30 * MINUTE,
  /** D-5: one impersonation token, no refresh. */
  impersonationTtlSeconds: 30 * MINUTE,
  /**
   * D-13: a just-rotated refresh token presented again within this window
   * gets the same new token back instead of revoking the session, so two
   * tabs refreshing at once do not log the user out.
   */
  refreshGraceSeconds: 10,
} as const;

export interface SessionPolicy {
  client: AuthClient;
  /** Sliding: each refresh pushes the expiry this far ahead again. */
  refreshTtlSeconds: number;
  /** Null when the role has no idle logout. */
  idleTimeoutSeconds: number | null;
}

export function sessionPolicyFor(role: Role): SessionPolicy {
  if (isCourierRole(role)) {
    return {
      client: AuthClient.COURIER_APP,
      refreshTtlSeconds: SESSION_POLICY.courierRefreshTtlSeconds,
      idleTimeoutSeconds: null,
    };
  }
  return {
    client: AuthClient.WEB,
    refreshTtlSeconds: SESSION_POLICY.webRefreshTtlSeconds,
    idleTimeoutSeconds: isStaffRole(role) ? SESSION_POLICY.staffIdleTimeoutSeconds : null,
  };
}

/**
 * Login throttling (D-6, Q10). The specs fix the shape — per identifier and
 * per IP, exponential, never permanent — and these numbers were approved on
 * 2026-09-25.
 */
export const LOGIN_THROTTLE = {
  freeFailuresPerIdentifier: 5,
  /** Higher: a depot or an office shares one public IP. */
  freeFailuresPerIp: 30,
  maxDelaySeconds: 15 * MINUTE,
  /** A key with no failure for this long is forgotten. */
  forgetAfterSeconds: 24 * 60 * MINUTE,
} as const;

/** 0 while under the free allowance, then 1 s, 2 s, 4 s… up to the cap. */
export function loginBackoffSeconds(failures: number, freeFailures: number): number {
  const over = failures - freeFailures;
  if (over <= 0) return 0;
  // 2^10 = 1024 s already exceeds the 900 s cap; stop before any overflow.
  if (over > 10) return LOGIN_THROTTLE.maxDelaySeconds;
  return Math.min(2 ** (over - 1), LOGIN_THROTTLE.maxDelaySeconds);
}

/**
 * Generated passwords (A-20): no characters that can be confused when read
 * aloud to a seller or a courier, so no 0/O/o, 1/l/I/i.
 */
export const GENERATED_PASSWORD_ALPHABET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
export const GENERATED_PASSWORD_LENGTH = 14;

/** Rejection sampling, as for parcel codes, so no symbol is favoured. */
export function generatePassword(randomBytes: RandomBytes): string {
  const alphabet = GENERATED_PASSWORD_ALPHABET;
  const limit = 256 - (256 % alphabet.length);
  let out = '';
  while (out.length < GENERATED_PASSWORD_LENGTH) {
    for (const byte of randomBytes(GENERATED_PASSWORD_LENGTH * 2)) {
      if (byte >= limit) continue;
      out += alphabet[byte % alphabet.length];
      if (out.length === GENERATED_PASSWORD_LENGTH) break;
    }
  }
  return out;
}

/** The header the courier app sends on every request. */
export const APP_VERSION_HEADER = 'x-app-version';

const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)$/;

/** Missing or malformed counts as too old: the API cannot tell otherwise. */
export function isAppVersionAllowed(version: string | undefined, minimum: string): boolean {
  const got = VERSION_RE.exec(version?.trim() ?? '');
  const min = VERSION_RE.exec(minimum.trim());
  if (!got || !min) return false;
  for (let i = 1; i <= 3; i++) {
    const a = Number.parseInt(got[i]!, 10);
    const b = Number.parseInt(min[i]!, 10);
    if (a !== b) return a > b;
  }
  return true;
}

// ── Schemas ─────────────────────────────────────────────────

/** Never trimmed: what was generated is what must be typed. */
const password = z.string().min(1, 'Mot de passe obligatoire').max(256);

export const vendeurLoginSchema = z.object({
  email: z.string().trim().toLowerCase().min(3, 'Email obligatoire').max(254),
  password,
});

export const staffLoginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, 'Identifiant obligatoire').max(64),
  password,
});

export const courierLoginSchema = z.object({
  role: z.enum([Role.LIVREUR, Role.RAMASSEUR]),
  phone: tunisianPhone,
  password,
  /** Lets the admin tell two phones apart in a session list. Optional. */
  deviceId: z.string().trim().max(128).optional(),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1).max(512),
});

/** Q13: lowercase a-z 0-9 . _ -, at least 4 characters. */
export const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{4,32}$/, 'Identifiant : 4 caractères minimum, a-z 0-9 . _ -');

const personName = z.string().trim().min(1).max(80);

export const createStaffAccountSchema = z.object({
  role: z.enum([Role.ADMIN, Role.DEPOT, Role.SERVICE_CLIENT]),
  username,
  firstName: personName,
  lastName: personName,
  phone: tunisianPhone,
});

/** Admin 4.15. Zones are assigned separately, per role (phase 4). */
export const createCourierAccountSchema = z
  .object({
    role: z.enum([Role.LIVREUR, Role.RAMASSEUR]),
    phone: tunisianPhone,
    firstName: personName,
    lastName: personName,
    cin: z.string().trim().min(1).max(20),
    vehicle: z.string().trim().max(80).optional().nullable(),
    payPlan: z.nativeEnum(PayPlan).optional().nullable(),
    langue: z.enum(['FR', 'AR']).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.role === Role.LIVREUR && !value.payPlan) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['payPlan'],
        message: 'Plan de paie obligatoire',
      });
    }
    if (value.role === Role.RAMASSEUR && value.payPlan) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['payPlan'],
        message: 'Le ramasseur est payé par les RH, sans plan de paie',
      });
    }
  });

export const startImpersonationSchema = z.object({
  sellerId: z.string().uuid(),
});

export type VendeurLoginInput = z.input<typeof vendeurLoginSchema>;
export type StaffLoginInput = z.input<typeof staffLoginSchema>;
export type CourierLoginInput = z.input<typeof courierLoginSchema>;
export type CreateStaffAccountInput = z.input<typeof createStaffAccountSchema>;
export type CreateStaffAccountValues = z.output<typeof createStaffAccountSchema>;
export type CreateCourierAccountInput = z.input<typeof createCourierAccountSchema>;
export type CreateCourierAccountValues = z.output<typeof createCourierAccountSchema>;

// ── Error codes and messages ────────────────────────────────

/** Stable codes for the apps; the message is what the user reads. */
export const AuthErrorCode = {
  IDENTIFIANTS_INCORRECTS: 'IDENTIFIANTS_INCORRECTS',
  AUCUN_COMPTE_COURSIER: 'AUCUN_COMPTE_COURSIER',
  COMPTE_DESACTIVE: 'COMPTE_DESACTIVE',
  TROP_DE_TENTATIVES: 'TROP_DE_TENTATIVES',
  SESSION_EXPIREE: 'SESSION_EXPIREE',
  NON_AUTORISE: 'NON_AUTORISE',
  LECTURE_SEULE: 'LECTURE_SEULE',
  VERSION_APP_OBSOLETE: 'VERSION_APP_OBSOLETE',
  DERNIER_ADMIN: 'DERNIER_ADMIN',
  IDENTIFIANT_DEJA_UTILISE: 'IDENTIFIANT_DEJA_UTILISE',
  TELEPHONE_DEJA_UTILISE: 'TELEPHONE_DEJA_UTILISE',
  COURSIER_ENGAGEMENTS_OUVERTS: 'COURSIER_ENGAGEMENTS_OUVERTS',
} as const;
export type AuthErrorCode = (typeof AuthErrorCode)[keyof typeof AuthErrorCode];

function waitText(seconds: number): string {
  return seconds < 60 ? `${seconds} s` : `${Math.ceil(seconds / 60)} min`;
}

/**
 * aucunCompteCoursier is worded by Coursier 2 and kept even though it tells
 * whether a number has an account. The others were approved on 2026-09-25.
 */
export const AUTH_MESSAGES = {
  identifiantsIncorrects: 'Identifiant ou mot de passe incorrect',
  aucunCompteCoursier: (role: typeof Role.LIVREUR | typeof Role.RAMASSEUR): string =>
    `Aucun compte ${role === Role.LIVREUR ? 'livreur' : 'ramasseur'} pour ce numéro`,
  compteDesactive: 'Compte désactivé. Contactez Faffa Go.',
  tropDeTentatives: (seconds: number): string =>
    `Trop de tentatives. Réessayez dans ${waitText(seconds)}.`,
  sessionExpiree: 'Session expirée. Reconnectez-vous.',
  nonAutorise: "Vous n'avez pas accès à cette action.",
  lectureSeule: 'Consultation en lecture seule : aucune action possible.',
  versionAppObsolete: "Mettez à jour l'application pour continuer.",
  dernierAdmin:
    "Impossible : c'est le dernier admin actif. Utilisez la commande admin:reset sur le serveur.",
  identifiantDejaUtilise: 'Cet identifiant est déjà utilisé.',
  telephoneDejaUtilise: 'Ce numéro est déjà utilisé par un autre compte.',
} as const;

/** D-5: the banner in the seller space. */
export function impersonationBannerText(shopName: string): string {
  return `Vous consultez le compte de ${shopName}`;
}
