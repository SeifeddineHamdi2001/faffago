import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { Api } from '../src/api/client';
import type { Stop, Tour } from '../src/api/types';
import { I18nProvider, type Lang } from '../src/i18n';
import { QueueStatus, type QueueRow } from '../src/queue/queue';
import { AppContext, type AppContextValue } from '../src/state/app';

export { goBack, navigate } from './navigation-mock';

export function stop(overrides: Partial<Stop> = {}): Stop {
  return {
    code: 'FG-AB12CD34',
    status: 'EN_LIVRAISON',
    recipientName: 'Amira Ben Salah',
    recipientPhone: '98111222',
    recipientPhone2: null,
    address: '12 rue de Marseille',
    landmark: 'Près de la mosquée',
    localiteNameFr: 'Khaznadar',
    localiteNameAr: null,
    delegationNameFr: 'Le Bardo',
    delegationNameAr: 'باردو',
    codAmountMillimes: '85000',
    attemptNumber: 1,
    maxAttempts: 3,
    sellerNote: null,
    isExchange: false,
    openingAllowed: false,
    relaunchDate: null,
    relaunchSlot: null,
    relaunchOrigin: null,
    lastFailureReason: null,
    shopName: 'Boutique Yasmine',
    sellerPhone: '50990001',
    meetingPoint: null,
    memory: null,
    ...overrides,
  };
}

export function tour(overrides: Partial<Tour> = {}): Tour {
  return {
    toDeliver: [stop()],
    toBringBack: [],
    doneToday: 0,
    serverTime: '2026-09-25T08:00:00.000Z',
    ...overrides,
  };
}

/** A courier session and a context whose actions are mocks. */
export function appValue(
  responses: Record<string, unknown> = {},
  overrides: Partial<AppContextValue> = {},
): AppContextValue {
  return {
    ready: true,
    lang: 'FR',
    setLang: jest.fn(async () => undefined),
    session: {
      tokens: {
        accessToken: 'a',
        accessTokenExpiresAt: '2099-01-01T00:00:00.000Z',
        refreshToken: 'r',
        refreshTokenExpiresAt: '2099-01-01T00:00:00.000Z',
      },
      user: { id: 'u-ali', role: 'LIVREUR', firstName: 'Ali', lastName: 'Ben Salah', langue: 'FR' },
    },
    locked: false,
    hasPin: true,
    online: true,
    updateRequired: false,
    notice: null,
    pendingCount: 0,
    recent: [],
    cancelWindowSeconds: 60,
    api: {} as Api,
    login: jest.fn(async () => undefined),
    logout: jest.fn(async () => undefined),
    setPin: jest.fn(async () => undefined),
    unlock: jest.fn(async () => true),
    recordScan: jest.fn(async (input): Promise<QueueRow> => ({
      id: 'scan-1',
      seq: 1,
      userId: 'u-ali',
      kind: 'SCAN',
      action: input.action,
      parcelCode: input.rawCode,
      operation: { kind: 'SCAN', ...input } as never,
      deviceTime: new Date().toISOString(),
      status: QueueStatus.EN_ATTENTE,
      code: null,
      message: null,
    })),
    cancelLastScan: jest.fn(async () => 'REMOVED' as const),
    recordOperation: jest.fn(async () => undefined),
    syncNow: jest.fn(async () => undefined),
    unread: { notifications: 0, chats: 0 },
    refreshUnread: jest.fn(async () => undefined),
    load: jest.fn(async (path: string) => ({
      data: (responses[path] ?? null) as never,
      fromCache: false,
    })),
    ...overrides,
  };
}

export function renderScreen(ui: ReactElement, value: AppContextValue, lang: Lang = 'FR') {
  // RNTL 14 renders asynchronously (React 19).
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 400, height: 800 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <AppContext.Provider value={{ ...value, lang }}>
        <I18nProvider lang={lang}>{ui}</I18nProvider>
      </AppContext.Provider>
    </SafeAreaProvider>,
  );
}
