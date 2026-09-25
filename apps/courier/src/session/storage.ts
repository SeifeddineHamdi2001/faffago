import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import type { Tokens } from '../api/client';
import type { CourierRole, SessionUser } from '../api/types';

/**
 * What the phone keeps between launches, in the Android keystore: the
 * session (90 days, sliding, Q11), the PIN (never sent to the server, D-7),
 * the last role chosen (Coursier 2) and the language.
 */

const KEYS = {
  session: 'fg.session',
  pin: 'fg.pin',
  lastRole: 'fg.lastRole',
  lang: 'fg.lang',
  deviceId: 'fg.deviceId',
} as const;

export interface StoredSession {
  tokens: Tokens;
  user: SessionUser;
}

async function readJson<T>(key: string): Promise<T | null> {
  const raw = await SecureStore.getItemAsync(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export const storage = {
  loadSession: () => readJson<StoredSession>(KEYS.session),
  saveSession: (session: StoredSession) =>
    SecureStore.setItemAsync(KEYS.session, JSON.stringify(session)),
  /** Logout, or a refused refresh: the session and the PIN go, the queue stays (Q12, D-7). */
  async clearSession() {
    await SecureStore.deleteItemAsync(KEYS.session);
    await SecureStore.deleteItemAsync(KEYS.pin);
  },

  lastRole: () => SecureStore.getItemAsync(KEYS.lastRole) as Promise<CourierRole | null>,
  setLastRole: (role: CourierRole) => SecureStore.setItemAsync(KEYS.lastRole, role),

  lang: () => SecureStore.getItemAsync(KEYS.lang) as Promise<'FR' | 'AR' | null>,
  setLang: (lang: 'FR' | 'AR') => SecureStore.setItemAsync(KEYS.lang, lang),

  /** A random id per installation, so the admin can tell two phones apart. */
  async deviceId(): Promise<string> {
    const existing = await SecureStore.getItemAsync(KEYS.deviceId);
    if (existing) return existing;
    const id = Crypto.randomUUID();
    await SecureStore.setItemAsync(KEYS.deviceId, id);
    return id;
  },

  hasPin: async () => (await SecureStore.getItemAsync(KEYS.pin)) !== null,
  async setPin(pin: string) {
    const salt = Crypto.randomUUID();
    const hash = await hashPin(salt, pin);
    await SecureStore.setItemAsync(KEYS.pin, JSON.stringify({ salt, hash }));
  },
  async checkPin(pin: string): Promise<boolean> {
    const stored = await readJson<{ salt: string; hash: string }>(KEYS.pin);
    if (!stored) return false;
    return (await hashPin(stored.salt, pin)) === stored.hash;
  },
};

function hashPin(salt: string, pin: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

/** The PIN is exactly four digits (Coursier 2). */
export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}
