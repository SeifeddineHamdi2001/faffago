import { describe, expect, it } from 'vitest';
import {
  AUTH_MESSAGES,
  AuthClient,
  createCourierAccountSchema,
  createStaffAccountSchema,
  courierLoginSchema,
  GENERATED_PASSWORD_ALPHABET,
  GENERATED_PASSWORD_LENGTH,
  generatePassword,
  isAppVersionAllowed,
  LOGIN_THROTTLE,
  loginBackoffSeconds,
  SESSION_POLICY,
  sessionPolicyFor,
  staffLoginSchema,
  vendeurLoginSchema,
} from '../auth.js';
import { Role } from '../roles.js';

describe('session lifetimes (Q11)', () => {
  it('gives staff a 7-day web session with a 30-minute idle logout', () => {
    for (const role of [Role.ADMIN, Role.DEPOT, Role.SERVICE_CLIENT]) {
      expect(sessionPolicyFor(role)).toEqual({
        client: AuthClient.WEB,
        refreshTtlSeconds: 7 * 24 * 3600,
        idleTimeoutSeconds: 30 * 60,
      });
    }
  });

  it('gives sellers a 7-day web session with no idle logout', () => {
    expect(sessionPolicyFor(Role.VENDEUR)).toEqual({
      client: AuthClient.WEB,
      refreshTtlSeconds: 7 * 24 * 3600,
      idleTimeoutSeconds: null,
    });
  });

  it('gives couriers a 90-day app session with no idle logout; the PIN is on the phone (D-7)', () => {
    for (const role of [Role.LIVREUR, Role.RAMASSEUR]) {
      expect(sessionPolicyFor(role)).toEqual({
        client: AuthClient.COURIER_APP,
        refreshTtlSeconds: 90 * 24 * 3600,
        idleTimeoutSeconds: null,
      });
    }
  });

  it('keeps the impersonation token at 30 minutes (D-5)', () => {
    expect(SESSION_POLICY.impersonationTtlSeconds).toBe(30 * 60);
  });

  it('keeps the access token shorter than every idle timeout', () => {
    expect(SESSION_POLICY.accessTokenTtlSeconds).toBeLessThan(
      SESSION_POLICY.staffIdleTimeoutSeconds,
    );
  });
});

describe('login backoff (D-6, Q10)', () => {
  const free = LOGIN_THROTTLE.freeFailuresPerIdentifier;

  it('lets the first failures through with no wait', () => {
    for (let failures = 0; failures <= free; failures++) {
      expect(loginBackoffSeconds(failures, free)).toBe(0);
    }
  });

  it('doubles the wait after each further failure', () => {
    expect(loginBackoffSeconds(free + 1, free)).toBe(1);
    expect(loginBackoffSeconds(free + 2, free)).toBe(2);
    expect(loginBackoffSeconds(free + 3, free)).toBe(4);
    expect(loginBackoffSeconds(free + 4, free)).toBe(8);
  });

  it('never locks anyone out for good: the wait stops growing at the cap', () => {
    const cap = LOGIN_THROTTLE.maxDelaySeconds;
    expect(cap).toBe(15 * 60);
    expect(loginBackoffSeconds(free + 50, free)).toBe(cap);
    expect(loginBackoffSeconds(Number.MAX_SAFE_INTEGER, free)).toBe(cap);
  });
});

describe('generatePassword (A-20)', () => {
  function sequence(bytes: number[]): (size: number) => Uint8Array {
    let i = 0;
    return (size) => Uint8Array.from({ length: size }, () => bytes[i++ % bytes.length]!);
  }

  it('is at least 12 characters', () => {
    expect(GENERATED_PASSWORD_LENGTH).toBeGreaterThanOrEqual(12);
    expect(generatePassword(sequence([1, 2, 3]))).toHaveLength(GENERATED_PASSWORD_LENGTH);
  });

  it('uses no character that can be confused when read aloud', () => {
    for (const confusable of ['0', 'O', 'o', '1', 'l', 'I', 'i']) {
      expect(GENERATED_PASSWORD_ALPHABET).not.toContain(confusable);
    }
  });

  it('rejects the bytes that would bias the draw', () => {
    const limit = 256 - (256 % GENERATED_PASSWORD_ALPHABET.length);
    // Every byte at or above the limit is skipped, so only the 5s are used.
    const password = generatePassword(sequence([255, limit, 5]));
    expect(password).toBe(GENERATED_PASSWORD_ALPHABET[5]!.repeat(GENERATED_PASSWORD_LENGTH));
  });
});

describe('isAppVersionAllowed', () => {
  it('compares each part as a number, not as text', () => {
    expect(isAppVersionAllowed('1.10.0', '1.9.0')).toBe(true);
    expect(isAppVersionAllowed('1.9.0', '1.10.0')).toBe(false);
  });

  it('accepts the minimum itself and anything above it', () => {
    expect(isAppVersionAllowed('1.2.3', '1.2.3')).toBe(true);
    expect(isAppVersionAllowed('2.0.0', '1.99.99')).toBe(true);
  });

  it('refuses a missing or malformed version', () => {
    expect(isAppVersionAllowed(undefined, '1.0.0')).toBe(false);
    expect(isAppVersionAllowed('', '1.0.0')).toBe(false);
    expect(isAppVersionAllowed('beta', '1.0.0')).toBe(false);
    expect(isAppVersionAllowed('1.0', '1.0.0')).toBe(false);
  });
});

describe('login schemas (A-20, Q13)', () => {
  it('lowercases the seller email, so any capitalisation logs in', () => {
    expect(vendeurLoginSchema.parse({ email: '  Boutique@Mail.TN ', password: 'x' })).toEqual({
      email: 'boutique@mail.tn',
      password: 'x',
    });
  });

  it('lowercases the staff username', () => {
    expect(staffLoginSchema.parse({ username: ' Saif.B ', password: 'x' }).username).toBe('saif.b');
  });

  it('normalises the courier phone and accepts only the two courier roles', () => {
    expect(
      courierLoginSchema.parse({ role: 'LIVREUR', phone: '+216 20 123 456', password: 'x' }).phone,
    ).toBe('20123456');
    expect(
      courierLoginSchema.safeParse({ role: 'ADMIN', phone: '20123456', password: 'x' }).success,
    ).toBe(false);
  });

  it('never trims or alters the password', () => {
    expect(vendeurLoginSchema.parse({ email: 'a@b.tn', password: ' p w ' }).password).toBe(' p w ');
  });

  it('refuses an empty or absurdly long password without hashing it', () => {
    expect(vendeurLoginSchema.safeParse({ email: 'a@b.tn', password: '' }).success).toBe(false);
    expect(
      vendeurLoginSchema.safeParse({ email: 'a@b.tn', password: 'x'.repeat(257) }).success,
    ).toBe(false);
  });
});

describe('account creation schemas', () => {
  const staff = {
    role: 'DEPOT',
    username: 'Amine.K',
    firstName: 'Amine',
    lastName: 'K',
    phone: '20123456',
  };

  it('creates staff with a lowercase username of at least 4 characters (Q13)', () => {
    expect(createStaffAccountSchema.parse(staff).username).toBe('amine.k');
    expect(createStaffAccountSchema.safeParse({ ...staff, username: 'abc' }).success).toBe(false);
    expect(createStaffAccountSchema.safeParse({ ...staff, username: 'amine k' }).success).toBe(
      false,
    );
  });

  it('creates staff roles only', () => {
    expect(createStaffAccountSchema.safeParse({ ...staff, role: 'VENDEUR' }).success).toBe(false);
    expect(createStaffAccountSchema.safeParse({ ...staff, role: 'LIVREUR' }).success).toBe(false);
  });

  const courier = {
    role: 'LIVREUR',
    phone: '98 765 432',
    firstName: 'Karim',
    lastName: 'B',
    cin: '01234567',
    vehicle: 'Scooter',
    payPlan: 'HEBDOMADAIRE',
  };

  it('requires a pay plan for a livreur (Admin 4.15)', () => {
    expect(createCourierAccountSchema.parse(courier).phone).toBe('98765432');
    expect(createCourierAccountSchema.safeParse({ ...courier, payPlan: undefined }).success).toBe(
      false,
    );
  });

  it('refuses a pay plan for a ramasseur, who is paid by HR', () => {
    expect(createCourierAccountSchema.safeParse({ ...courier, role: 'RAMASSEUR' }).success).toBe(
      false,
    );
    expect(
      createCourierAccountSchema.safeParse({ ...courier, role: 'RAMASSEUR', payPlan: undefined })
        .success,
    ).toBe(true);
  });
});

describe('AUTH_MESSAGES', () => {
  it('uses the wording of Coursier 2 when no account exists for the chosen role', () => {
    expect(AUTH_MESSAGES.aucunCompteCoursier(Role.RAMASSEUR)).toBe(
      'Aucun compte ramasseur pour ce numéro',
    );
    expect(AUTH_MESSAGES.aucunCompteCoursier(Role.LIVREUR)).toBe(
      'Aucun compte livreur pour ce numéro',
    );
  });

  it('shows the wait in minutes once it passes a minute', () => {
    expect(AUTH_MESSAGES.tropDeTentatives(8)).toBe('Trop de tentatives. Réessayez dans 8 s.');
    expect(AUTH_MESSAGES.tropDeTentatives(900)).toBe('Trop de tentatives. Réessayez dans 15 min.');
  });
});
