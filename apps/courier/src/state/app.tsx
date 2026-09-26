import NetInfo from '@react-native-community/netinfo';
import * as Crypto from 'expo-crypto';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState as RNAppState } from 'react-native';
import {
  CourierOperationKind,
  ScanSource,
  type CourierOperationInput,
  type CourierScanOperationInput,
} from '@faffago/shared';
import { ApiError, NetworkError, createApi, type Api } from '../api/client';
import type { CourierRole, LoginResult, Profile, SyncResponse } from '../api/types';
import { API_URL, APP_VERSION, PIN_RELOCK_AFTER_MS, SYNC_INTERVAL_MS } from '../config';
import { I18nProvider, type Lang } from '../i18n';
import { currentPosition } from '../location';
import {
  cancelScan,
  enqueue,
  lastScan,
  syncOnce,
  type CancelOutcome,
  type QueueRow,
  type QueueStore,
} from '../queue/queue';
import { cacheGet, cacheSet, sqliteStore } from '../queue/sqlite';
import { storage, type StoredSession } from '../session/storage';

/** The scan fields the screen decides; the rest is added here. */
export type ScanInput = Omit<
  CourierScanOperationInput,
  'kind' | 'clientScanId' | 'deviceTime' | 'gps' | 'deviceId' | 'source'
> & { manual?: boolean };

export interface AppContextValue {
  ready: boolean;
  lang: Lang;
  setLang: (lang: Lang) => Promise<void>;
  session: StoredSession | null;
  /** The PIN is asked (Coursier 2); false once entered. */
  locked: boolean;
  hasPin: boolean;
  online: boolean;
  /** Below Paramètres' minimum version: the app blocks once the queue is empty (tech-stack 5). */
  updateRequired: boolean;
  /** Shown on the login screen after a forced logout. */
  notice: string | null;
  pendingCount: number;
  /** His rows of the last two days: for "Déjà scanné", Annuler and refusals. */
  recent: QueueRow[];
  cancelWindowSeconds: number;
  api: Api;
  login: (role: CourierRole, phone: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setPin: (pin: string) => Promise<void>;
  unlock: (pin: string) => Promise<boolean>;
  /** Records a scan on the phone, with the device time and GPS, then sends when it can. */
  recordScan: (input: ScanInput) => Promise<QueueRow>;
  cancelLastScan: () => Promise<CancelOutcome | null>;
  recordOperation: (
    operation:
      | { kind: typeof CourierOperationKind.TERMINER_RAMASSAGE; pickupId: string }
      | {
          kind: typeof CourierOperationKind.NOTE_ADRESSE;
          parcelCode: string;
          note?: string;
          meetingPoint?: string;
        }
      | {
          /** Written offline or not, it joins the queue like a scan and is sent once. */
          kind: typeof CourierOperationKind.MESSAGE_CHAT;
          parcelCode: string;
          body: string;
        },
  ) => Promise<void>;
  syncNow: () => Promise<void>;
  /** A screen's data: from the API when online, else the last answer kept on the phone. */
  load: <T>(path: string) => Promise<{ data: T | null; fromCache: boolean }>;
  /** What is new for him: notifications, and chats for a livreur (Coursier 4.11, 4.8). */
  unread: { notifications: number; chats: number };
  refreshUnread: () => Promise<void>;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp outside AppProvider');
  return value;
}

const TWO_DAYS_MS = 2 * 86_400_000;
const UNREAD_INTERVAL_MS = 30_000;

export function AppProvider({
  children,
  store: givenStore,
}: {
  children: ReactNode;
  store?: QueueStore;
}) {
  const store = useMemo(() => givenStore ?? sqliteStore(), [givenStore]);
  const [ready, setReady] = useState(false);
  const [lang, setLangState] = useState<Lang>('FR');
  const [session, setSession] = useState<StoredSession | null>(null);
  const sessionRef = useRef<StoredSession | null>(null);
  const [locked, setLocked] = useState(true);
  const [hasPin, setHasPin] = useState(false);
  const [online, setOnline] = useState(true);
  const [updateRequired, setUpdateRequired] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [recent, setRecent] = useState<QueueRow[]>([]);
  const [cancelWindowSeconds, setCancelWindow] = useState(60);
  const [unread, setUnread] = useState({ notifications: 0, chats: 0 });
  const syncing = useRef(false);
  const backgroundAt = useRef<number | null>(null);

  const applySession = useCallback((next: StoredSession | null) => {
    sessionRef.current = next;
    setSession(next);
  }, []);

  const expire = useCallback(() => {
    // The queue is never touched here: it is sent after the next login (Q12).
    void storage.clearSession();
    applySession(null);
    setHasPin(false);
    setLocked(true);
    setNotice('SESSION_EXPIREE');
  }, [applySession]);

  const api = useMemo(
    () =>
      createApi({
        baseUrl: API_URL,
        appVersion: APP_VERSION,
        getTokens: () => sessionRef.current?.tokens ?? null,
        saveTokens: async (tokens) => {
          const current = sessionRef.current;
          if (!current) return;
          const next = { ...current, tokens };
          applySession(next);
          await storage.saveSession(next);
        },
        onSessionExpired: expire,
        onUpdateRequired: () => setUpdateRequired(true),
      }),
    [applySession, expire],
  );

  const refreshQueue = useCallback(async () => {
    const user = sessionRef.current?.user;
    if (!user) {
      setPendingCount(0);
      setRecent([]);
      return;
    }
    const since = new Date(Date.now() - TWO_DAYS_MS).toISOString();
    setPendingCount(await store.countPending(user.id));
    setRecent(await store.since(user.id, since));
  }, [store]);

  const syncNow = useCallback(async () => {
    const user = sessionRef.current?.user;
    if (!user || syncing.current) return;
    syncing.current = true;
    try {
      // Sends batch after batch until the queue is empty or the network fails.
      for (;;) {
        const outcome = await syncOnce(store, user.id, async (operations) => {
          const response = await api.request<SyncResponse>('POST', '/scans/courier', {
            operations,
          });
          return response.results;
        });
        if (outcome.sent === 0) break;
      }
      await store.prune(new Date(Date.now() - TWO_DAYS_MS).toISOString());
    } catch (error) {
      if (!(error instanceof NetworkError) && !(error instanceof ApiError)) throw error;
    } finally {
      syncing.current = false;
      await refreshQueue();
    }
  }, [api, refreshQueue, store]);

  const refreshUnread = useCallback(async () => {
    const user = sessionRef.current?.user;
    if (!user) {
      setUnread({ notifications: 0, chats: 0 });
      return;
    }
    try {
      const notifications = await api.request<{ unreadCount: number }>(
        'GET',
        '/notifications/unread-count',
      );
      // The ramasseur has no chat (A-23).
      const chats =
        user.role === 'LIVREUR'
          ? await api.request<{ unreadCount: number }>('GET', '/chat/courier/unread')
          : { unreadCount: 0 };
      setUnread({
        notifications: notifications.unreadCount ?? 0,
        chats: chats.unreadCount ?? 0,
      });
    } catch {
      // Offline or refused: the last counts stay, and the next look tries again.
    }
  }, [api]);

  // Start: language, session, PIN.
  useEffect(() => {
    void (async () => {
      const [savedLang, saved, pin] = await Promise.all([
        storage.lang(),
        storage.loadSession(),
        storage.hasPin(),
      ]);
      if (savedLang) setLangState(savedLang);
      applySession(saved);
      setHasPin(pin);
      setLocked(true);
      setReady(true);
    })();
  }, [applySession]);

  useEffect(() => {
    void refreshQueue();
    if (session) void syncNow();
    // Only when the courier changes, not on every token refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  // Online again: send what waits.
  useEffect(
    () =>
      NetInfo.addEventListener((state) => {
        const isOnline = state.isConnected !== false && state.isInternetReachable !== false;
        setOnline(isOnline);
        if (isOnline) void syncNow();
      }),
    [syncNow],
  );

  useEffect(() => {
    const timer = setInterval(() => void syncNow(), SYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [syncNow]);

  // What is new: at login, every half minute, and when the app comes back.
  useEffect(() => {
    void refreshUnread();
    const timer = setInterval(() => void refreshUnread(), UNREAD_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [session?.user.id, session?.user.role, refreshUnread]);

  // Back from the background after a while: the PIN again (Coursier 2).
  useEffect(() => {
    const subscription = RNAppState.addEventListener('change', (state) => {
      if (state === 'background') backgroundAt.current = Date.now();
      if (state === 'active' && backgroundAt.current !== null) {
        if (Date.now() - backgroundAt.current > PIN_RELOCK_AFTER_MS) setLocked(true);
        backgroundAt.current = null;
        void syncNow();
        void refreshUnread();
      }
    });
    return () => subscription.remove();
  }, [syncNow, refreshUnread]);

  const load = useCallback(
    async <T,>(path: string) => {
      const key = `${sessionRef.current?.user.id ?? ''}:${path}`;
      try {
        const data = await api.request<T>('GET', path);
        await cacheSet(key, data);
        if (path === '/coursier/moi') {
          setCancelWindow((data as Profile).rules.scanCancelWindowSeconds);
        }
        return { data, fromCache: false };
      } catch (error) {
        if (!(error instanceof NetworkError)) throw error;
        return { data: await cacheGet<T>(key), fromCache: true };
      }
    },
    [api],
  );

  const value: AppContextValue = {
    ready,
    lang,
    async setLang(next) {
      setLangState(next);
      await storage.setLang(next);
      if (sessionRef.current) {
        await api.request('PATCH', '/coursier/moi/langue', { langue: next }).catch(() => undefined);
      }
    },
    session,
    locked,
    hasPin,
    online,
    updateRequired,
    notice,
    pendingCount,
    recent,
    cancelWindowSeconds,
    api,
    async login(role, phone, password) {
      const result = await api.publicRequest<LoginResult>('POST', '/auth/login/coursier', {
        role,
        phone,
        password,
        deviceId: await storage.deviceId(),
      });
      const next: StoredSession = {
        tokens: {
          accessToken: result.accessToken,
          accessTokenExpiresAt: result.accessTokenExpiresAt,
          refreshToken: result.refreshToken,
          refreshTokenExpiresAt: result.refreshTokenExpiresAt,
        },
        user: result.user,
      };
      await storage.saveSession(next);
      await storage.setLastRole(role);
      setNotice(null);
      applySession(next);
      // A new login asks for a new PIN (D-7).
      setHasPin(false);
      setLocked(false);
      if (result.user.langue !== lang) {
        setLangState(result.user.langue);
        await storage.setLang(result.user.langue);
      }
    },
    async logout() {
      await api.request('POST', '/auth/logout').catch(() => undefined);
      await storage.clearSession();
      applySession(null);
      setHasPin(false);
      setLocked(true);
    },
    async setPin(pin) {
      await storage.setPin(pin);
      setHasPin(true);
      setLocked(false);
    },
    async unlock(pin) {
      const ok = await storage.checkPin(pin);
      if (ok) setLocked(false);
      return ok;
    },
    async recordScan(input) {
      const user = sessionRef.current?.user;
      if (!user) throw new Error('no session');
      const { manual, ...fields } = input;
      const operation: CourierScanOperationInput = {
        ...fields,
        kind: CourierOperationKind.SCAN,
        clientScanId: Crypto.randomUUID(),
        source: manual ? ScanSource.SAISIE_MANUELLE : ScanSource.APP_COURSIER,
        deviceTime: new Date().toISOString(),
        gps: await currentPosition(),
        deviceId: await storage.deviceId(),
      };
      await enqueue(store, user.id, operation);
      await refreshQueue();
      void syncNow();
      return (await store.get(operation.clientScanId))!;
    },
    async cancelLastScan() {
      const user = sessionRef.current?.user;
      if (!user) return null;
      const rows = await store.since(user.id, new Date(Date.now() - TWO_DAYS_MS).toISOString());
      const last = lastScan(rows);
      if (!last) return null;
      const outcome = await cancelScan(store, last, new Date(), cancelWindowSeconds);
      await refreshQueue();
      void syncNow();
      return outcome;
    },
    async recordOperation(operation) {
      const user = sessionRef.current?.user;
      if (!user) throw new Error('no session');
      const full: CourierOperationInput = {
        ...operation,
        operationId: Crypto.randomUUID(),
        deviceTime: new Date().toISOString(),
      };
      await enqueue(store, user.id, full);
      await refreshQueue();
      void syncNow();
    },
    syncNow,
    load,
    unread,
    refreshUnread,
  };

  return (
    <AppContext.Provider value={value}>
      <I18nProvider lang={lang}>{children}</I18nProvider>
    </AppContext.Provider>
  );
}
