import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationBell } from '@/components/notification-bell';
import { NotificationsScreen } from '@/components/notifications-screen';
import { notificationHref } from '@/lib/notification-links';
import type { NotificationList } from '@/lib/types';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const bff = vi.fn();
vi.mock('@/lib/client/call', () => ({ bff: (...args: unknown[]) => bff(...args) }));

const list: NotificationList = {
  unreadCount: 2,
  next: null,
  items: [
    {
      id: 'n1',
      type: 'COLIS_A_VERIFIER',
      params: { code: 'FG-ABCD2345', reason: 'NE_REPOND_PAS' },
      parcelId: 'p1',
      readAt: null,
      createdAt: '2026-09-26T09:00:00.000Z',
    },
    {
      id: 'n2',
      type: 'BON_VERSEMENT_EN_ROUTE',
      params: { number: 'BV-2026-0926-01' },
      parcelId: null,
      readAt: null,
      createdAt: '2026-09-26T08:00:00.000Z',
    },
    {
      id: 'n3',
      type: 'COMPTE_REACTIVE',
      params: {},
      parcelId: null,
      readAt: '2026-09-25T08:00:00.000Z',
      createdAt: '2026-09-25T07:00:00.000Z',
    },
  ],
};

beforeEach(() => {
  bff.mockReset();
  refresh.mockReset();
});

describe('NotificationsScreen (Vendeur 4.13)', () => {
  it('words each notification in French from its parameters and links it to what it is about', () => {
    render(<NotificationsScreen initial={list} area="vendeur" />);

    expect(screen.getByText(/Colis FG-ABCD2345 à vérifier · Ne répond pas/)).toBeInTheDocument();
    expect(
      screen.getByText('Votre paiement BV-2026-0926-01 arrive avec le coursier'),
    ).toBeInTheDocument();
    expect(screen.getByText('Compte réactivé')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Colis FG-ABCD2345/ })).toHaveAttribute(
      'href',
      '/vendeur/colis/FG-ABCD2345',
    );
    expect(screen.getByRole('link', { name: /Votre paiement/ })).toHaveAttribute(
      'href',
      '/vendeur/paiements',
    );
    expect(screen.getByTestId('unread-summary')).toHaveTextContent('2 non lues');
  });

  it('marks one read when it is opened, and counts down', async () => {
    bff.mockResolvedValue({ ok: true, data: { unreadCount: 1 } });
    render(<NotificationsScreen initial={list} area="vendeur" />);

    await userEvent.click(screen.getByRole('link', { name: /Votre paiement/ }));

    expect(bff).toHaveBeenCalledWith('POST', 'notifications/n2/read');
    await waitFor(() =>
      expect(screen.getByTestId('unread-summary')).toHaveTextContent('1 non lue'),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it('marks everything read', async () => {
    bff.mockResolvedValue({ ok: true, data: { unreadCount: 0 } });
    render(<NotificationsScreen initial={list} area="vendeur" />);

    await userEvent.click(screen.getByRole('button', { name: 'Tout marquer comme lu' }));

    expect(bff).toHaveBeenCalledWith('POST', 'notifications/read-all');
    await waitFor(() =>
      expect(screen.getByTestId('unread-summary')).toHaveTextContent('Tout est lu.'),
    );
    expect(screen.getByRole('button', { name: 'Tout marquer comme lu' })).toBeDisabled();
  });

  it('loads older ones with the cursor', async () => {
    const older = { ...list.items[2]!, id: 'n4', readAt: '2026-09-24T00:00:00.000Z' };
    bff.mockResolvedValue({ ok: true, data: { items: [older], unreadCount: 2, next: null } });
    render(
      <NotificationsScreen
        initial={{ ...list, next: '2026-09-25T07:00:00.000Z' }}
        area="vendeur"
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Voir les plus anciennes' }));

    expect(bff).toHaveBeenCalledWith(
      'GET',
      `notifications?before=${encodeURIComponent('2026-09-25T07:00:00.000Z')}`,
    );
    await waitFor(() => expect(screen.getAllByText('Compte réactivé')).toHaveLength(2));
    expect(screen.queryByRole('button', { name: 'Voir les plus anciennes' })).toBeNull();
  });

  it('only reads under "Voir comme le vendeur": nothing is marked, nothing to clear (D-5)', async () => {
    render(<NotificationsScreen initial={list} area="vendeur" readOnly />);

    expect(screen.queryByRole('button', { name: 'Tout marquer comme lu' })).toBeNull();
    await userEvent.click(screen.getByRole('link', { name: /Votre paiement/ }));
    expect(bff).not.toHaveBeenCalled();
  });

  it('says so when there is nothing', () => {
    render(
      <NotificationsScreen initial={{ items: [], unreadCount: 0, next: null }} area="admin" />,
    );
    expect(screen.getByText('Aucune notification.')).toBeInTheDocument();
  });

  it('leads the team to its own screens', () => {
    render(
      <NotificationsScreen
        area="admin"
        initial={{
          unreadCount: 3,
          next: null,
          items: [
            {
              id: 'a1',
              type: 'ECART_CAISSE',
              params: {
                courierName: 'Sami Ben Ali',
                day: '2026-09-25',
                direction: 'MANQUANT',
                amountMillimes: '5000',
              },
              parcelId: null,
              readAt: null,
              createdAt: '2026-09-26T09:00:00.000Z',
            },
            {
              id: 'a2',
              type: 'NOUVEAU_MESSAGE',
              params: { code: 'FG-ABCD2345', from: 'Boutique Démo' },
              parcelId: 'p1',
              readAt: null,
              createdAt: '2026-09-26T09:00:00.000Z',
            },
            {
              id: 'a3',
              type: 'DEMANDE_MODIFICATION',
              params: { code: 'FG-ABCD2345', shopName: 'Boutique Démo' },
              parcelId: 'p1',
              readAt: null,
              createdAt: '2026-09-26T09:00:00.000Z',
            },
          ],
        }}
      />,
    );

    expect(
      screen.getByRole('link', { name: /Écart de caisse · Sami Ben Ali · manque 5,000 DT/ }),
    ).toHaveAttribute('href', '/admin/caisse');
    expect(screen.getByRole('link', { name: /Nouveau message de Boutique Démo/ })).toHaveAttribute(
      'href',
      '/admin/chats/FG-ABCD2345',
    );
    expect(screen.getByRole('link', { name: /Demande de modification/ })).toHaveAttribute(
      'href',
      '/admin/colis/FG-ABCD2345',
    );
  });
});

describe('notificationHref', () => {
  it('sends a seller to his chat tab and never to a back office screen', () => {
    expect(notificationHref('vendeur', { screen: 'CHAT', code: 'FG-ABCD2345' })).toBe(
      '/vendeur/colis/FG-ABCD2345#chat',
    );
    expect(notificationHref('vendeur', { screen: 'CAISSE' })).toBeNull();
    expect(notificationHref('vendeur', { screen: 'PAY' })).toBeNull();
    expect(notificationHref('vendeur', { screen: 'NONE' })).toBeNull();
  });
});

describe('NotificationBell', () => {
  it('shows the unread count and links to the list', () => {
    render(<NotificationBell initialCount={4} href="/vendeur/notifications" live={false} />);
    const link = screen.getByRole('link', { name: 'Notifications, 4 non lues' });
    expect(link).toHaveAttribute('href', '/vendeur/notifications');
    expect(screen.getByTestId('bell-count')).toHaveTextContent('4');
  });

  it('shows no number when everything is read, and caps a long one', () => {
    const { rerender } = render(
      <NotificationBell initialCount={0} href="/vendeur/notifications" live={false} />,
    );
    expect(screen.getByRole('link', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.queryByTestId('bell-count')).toBeNull();
    rerender(<NotificationBell initialCount={150} href="/vendeur/notifications" live={false} />);
    expect(screen.getByTestId('bell-count')).toHaveTextContent('99+');
  });

  it('reads the count again while the tab is shown, and not when it is not live', async () => {
    vi.useFakeTimers();
    try {
      bff.mockResolvedValue({ ok: true, data: { unreadCount: 7 } });
      render(<NotificationBell initialCount={1} href="/admin/notifications" />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });

      expect(bff).toHaveBeenCalledWith('GET', 'notifications/unread-count');
      expect(screen.getByTestId('bell-count')).toHaveTextContent('7');
    } finally {
      vi.useRealTimers();
    }

    bff.mockClear();
    vi.useFakeTimers();
    try {
      render(<NotificationBell initialCount={1} href="/vendeur/notifications" live={false} />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      expect(bff).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
