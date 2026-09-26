import { act, render, waitFor } from '@testing-library/react-native';
import { storage } from '../src/session/storage';
import { AppProvider, useApp, type AppContextValue } from '../src/state/app';
import { QueueStatus, memoryStore } from '../src/queue/queue';

jest.mock('../src/queue/sqlite', () => ({
  cacheGet: jest.fn(async () => null),
  cacheSet: jest.fn(async () => undefined),
  sqliteStore: jest.fn(),
}));

const LOGIN = {
  accessToken: 'access',
  accessTokenExpiresAt: '2099-01-01T00:00:00.000Z',
  refreshToken: 'refresh',
  refreshTokenExpiresAt: '2099-01-01T00:00:00.000Z',
  user: { id: 'u-ali', role: 'LIVREUR', firstName: 'Ali', lastName: 'Ben Salah', langue: 'FR' },
};

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;
let handler: Handler;
const requests: { url: string; body: unknown }[] = [];

beforeEach(() => {
  requests.length = 0;
  globalThis.fetch = jest.fn(async (url: string, init: RequestInit) => {
    requests.push({ url, body: init.body ? JSON.parse(init.body as string) : null });
    return handler(url, init);
  }) as unknown as typeof fetch;
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

async function mount(store = memoryStore()) {
  let app: AppContextValue | null = null;
  function Probe() {
    app = useApp();
    return null;
  }
  await render(
    <AppProvider store={store}>
      <Probe />
    </AppProvider>,
  );
  await waitFor(() => expect(app!.ready).toBe(true));
  return { store, app: () => app! };
}

describe('the app state (Coursier 4.9, Q12, D-7)', () => {
  it('records a scan with the phone’s time and position, and sends it', async () => {
    handler = (url, init) => {
      if (url.endsWith('/auth/login/coursier')) return json(LOGIN);
      if (url.endsWith('/scans/courier')) {
        const { operations } = JSON.parse(init.body as string) as {
          operations: { clientScanId: string }[];
        };
        return json({
          results: operations.map((o) => ({
            kind: 'SCAN',
            id: o.clientScanId,
            ok: true,
            replayed: false,
            code: null,
            message: 'Livré',
            parcel: null,
          })),
        });
      }
      return json(null);
    };
    const { store, app } = await mount();
    await act(() => app().login('LIVREUR', '98111222', 'secret'));
    // A new login asks for a new PIN (D-7).
    expect(app().hasPin).toBe(false);
    await act(() => app().setPin('1234'));

    await act(async () => {
      await app().recordScan({
        action: 'LIVRE',
        rawCode: 'FG-AB12CD34',
        collectedMillimes: '85000',
      });
    });
    await waitFor(() => expect(store.rows[0]?.status).toBe(QueueStatus.ACCEPTE));
    const upload = requests.find((r) => r.url.endsWith('/scans/courier'))!;
    expect(upload.body).toMatchObject({
      operations: [
        {
          kind: 'SCAN',
          action: 'LIVRE',
          rawCode: 'FG-AB12CD34',
          source: 'APP_COURSIER',
          collectedMillimes: '85000',
          gps: { lat: 36.8065, lng: 10.1815, accuracyM: 8 },
        },
      ],
    });
  });

  it('keeps an offline scan through a logout and sends it after the next login (Q12)', async () => {
    let offline = true;
    handler = (url, init) => {
      if (url.endsWith('/auth/login/coursier')) return json(LOGIN);
      if (url.endsWith('/auth/logout')) return new Response(null, { status: 204 });
      if (offline) throw new TypeError('Network request failed');
      const { operations } = JSON.parse(init.body as string) as {
        operations: { clientScanId: string }[];
      };
      return json({
        results: operations.map((o) => ({
          kind: 'SCAN',
          id: o.clientScanId,
          ok: true,
          replayed: false,
          code: null,
          message: 'ok',
          parcel: null,
        })),
      });
    };
    const { store, app } = await mount();
    await act(() => app().login('LIVREUR', '98111222', 'secret'));
    await act(async () => {
      await app().recordScan({
        action: 'ECHEC',
        rawCode: 'FG-AB12CD34',
        failureReason: 'INJOIGNABLE',
      });
    });
    await waitFor(() => expect(app().pendingCount).toBe(1));

    await act(() => app().logout());
    expect(app().session).toBeNull();
    expect(await storage.hasPin()).toBe(false);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]!.status).toBe(QueueStatus.EN_ATTENTE);

    offline = false;
    await act(() => app().login('LIVREUR', '98111222', 'secret'));
    await waitFor(() => expect(store.rows[0]!.status).toBe(QueueStatus.ACCEPTE));
    // Its own UUID and device time, as recorded before the logout.
    const upload = requests.filter((r) => r.url.endsWith('/scans/courier')).at(-1)!;
    expect(upload.body).toMatchObject({
      operations: [{ clientScanId: store.rows[0]!.id, deviceTime: store.rows[0]!.deviceTime }],
    });
  });
});

describe('what is new (Coursier 4.11, 4.8)', () => {
  // The secure store is shared by the file's tests: each starts signed out.
  beforeEach(() => storage.clearSession());

  it('reads the unread notifications and chats of a livreur at login', async () => {
    handler = (url) => {
      if (url.endsWith('/auth/login/coursier')) return json(LOGIN);
      if (url.endsWith('/notifications/unread-count')) return json({ unreadCount: 3 });
      if (url.endsWith('/chat/courier/unread')) return json({ unreadCount: 2 });
      return json({ results: [] });
    };
    const { app } = await mount();
    await act(() => app().login('LIVREUR', '98111222', 'secret'));

    await waitFor(() => expect(app().unread).toEqual({ notifications: 3, chats: 2 }));
  });

  it('never asks a ramasseur for chats: he has none (A-23)', async () => {
    handler = (url) => {
      if (url.endsWith('/auth/login/coursier')) {
        return json({ ...LOGIN, user: { ...LOGIN.user, role: 'RAMASSEUR' } });
      }
      if (url.endsWith('/notifications/unread-count')) return json({ unreadCount: 1 });
      return json({ results: [] });
    };
    const { app } = await mount();
    await act(() => app().login('RAMASSEUR', '98111222', 'secret'));

    await waitFor(() => expect(app().unread).toEqual({ notifications: 1, chats: 0 }));
    expect(requests.some((r) => r.url.includes('/chat/'))).toBe(false);
  });

  it('keeps the last counts when the network is down', async () => {
    let down = false;
    handler = (url) => {
      if (down) throw new TypeError('Network request failed');
      if (url.endsWith('/auth/login/coursier')) return json(LOGIN);
      if (url.endsWith('/notifications/unread-count')) return json({ unreadCount: 4 });
      if (url.endsWith('/chat/courier/unread')) return json({ unreadCount: 0 });
      return json({ results: [] });
    };
    const { app } = await mount();
    await act(() => app().login('LIVREUR', '98111222', 'secret'));
    await waitFor(() => expect(app().unread.notifications).toBe(4));

    down = true;
    await act(() => app().refreshUnread());

    expect(app().unread.notifications).toBe(4);
  });

  it('queues a chat message like a scan, under its own id, and sends it', async () => {
    handler = (url, init) => {
      if (url.endsWith('/auth/login/coursier')) return json(LOGIN);
      if (url.endsWith('/scans/courier')) {
        const { operations } = JSON.parse(init.body as string) as {
          operations: { operationId: string }[];
        };
        return json({
          results: operations.map((o) => ({
            kind: 'MESSAGE_CHAT',
            id: o.operationId,
            ok: true,
            replayed: false,
            code: null,
            message: 'Message envoyé',
            parcel: null,
          })),
        });
      }
      if (url.endsWith('/notifications/unread-count')) return json({ unreadCount: 0 });
      return json({ unreadCount: 0 });
    };
    const { store, app } = await mount();
    await act(() => app().login('LIVREUR', '98111222', 'secret'));
    await act(() => app().setPin('1234'));

    await act(async () => {
      await app().recordOperation({
        kind: 'MESSAGE_CHAT',
        parcelCode: 'FG-AB12CD34',
        body: 'Client ne répond pas',
      });
    });

    await waitFor(() => expect(store.rows[0]?.status).toBe(QueueStatus.ACCEPTE));
    expect(store.rows[0]).toMatchObject({ kind: 'MESSAGE_CHAT', parcelCode: 'FG-AB12CD34' });
    const upload = requests.find((r) => r.url.endsWith('/scans/courier'))!;
    expect(upload.body).toMatchObject({
      operations: [
        {
          kind: 'MESSAGE_CHAT',
          parcelCode: 'FG-AB12CD34',
          body: 'Client ne répond pas',
          operationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        },
      ],
    });
  });
});
