import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatPanel } from '@/components/chat-panel';
import { ChatsInboxScreen } from '@/components/chats-inbox-screen';
import type { ChatInbox, ChatThreadView } from '@/lib/types';

const bff = vi.fn();
vi.mock('@/lib/client/call', () => ({ bff: (...args: unknown[]) => bff(...args) }));

function thread(overrides: Partial<ChatThreadView> = {}): ChatThreadView {
  return {
    parcelCode: 'FG-ABCD2345',
    state: 'OUVERT',
    canPost: true,
    refusal: null,
    shopName: 'Boutique Démo',
    courierName: 'Sami',
    sellerPhone: null,
    messages: [
      {
        id: 'm1',
        kind: 'COURSIER',
        label: 'Sami',
        mine: false,
        body: 'Client ne répond pas',
        createdAt: '2026-09-26T09:00:00.000Z',
      },
      {
        id: 'm2',
        kind: 'FAFFA_GO',
        label: 'Faffa Go',
        mine: false,
        body: 'Nous rappelons le client',
        createdAt: '2026-09-26T09:05:00.000Z',
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  bff.mockReset();
});

describe('ChatPanel, seller side (Vendeur 4.10)', () => {
  it('shows the courier by first name and the team as Faffa Go', () => {
    render(<ChatPanel side="seller" code="FG-ABCD2345" initial={thread()} />);

    expect(screen.getByText('Livreur : Sami')).toBeInTheDocument();
    expect(screen.getAllByText('Sami').length).toBeGreaterThan(0);
    expect(screen.getByText('Faffa Go')).toBeInTheDocument();
    expect(screen.getByText('Ouvert')).toBeInTheDocument();
  });

  it('sends a message under an id it draws, and shows it at once', async () => {
    bff.mockImplementation(
      (_method: string, path: string, body?: { messageId: string; body: string }) =>
        path.endsWith('/messages')
          ? Promise.resolve({
              ok: true,
              data: {
                replayed: false,
                message: {
                  id: body!.messageId,
                  kind: 'VENDEUR',
                  label: 'Vous',
                  mine: true,
                  body: body!.body,
                  createdAt: '2026-09-26T09:10:00.000Z',
                },
              },
            })
          : Promise.resolve({ ok: true, data: { thread: thread() } }),
    );
    render(<ChatPanel side="seller" code="FG-ABCD2345" initial={thread()} />);

    await userEvent.type(screen.getByLabelText('Votre message'), 'Le client attend');
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

    const call = bff.mock.calls.find((args) => String(args[1]).endsWith('/messages'))!;
    expect(call[0]).toBe('POST');
    expect(call[1]).toBe('chat/seller/FG-ABCD2345/messages');
    expect(call[2].body).toBe('Le client attend');
    expect(call[2].messageId).toMatch(/^[0-9a-f-]{36}$/);
    await waitFor(() => expect(screen.getByText('Le client attend')).toBeInTheDocument());
    expect(screen.getByLabelText('Votre message')).toHaveValue('');
  });

  it('keeps a message that did not go out and sends it again under the same id', async () => {
    let attempts: { messageId: string }[] = [];
    bff.mockImplementation(
      (_method: string, path: string, body?: { messageId: string; body: string }) => {
        if (!path.endsWith('/messages'))
          return Promise.resolve({ ok: true, data: { thread: thread() } });
        attempts.push(body!);
        return attempts.length === 1
          ? Promise.resolve({ ok: false, status: 503, error: { message: 'Indisponible' } })
          : Promise.resolve({
              ok: true,
              data: {
                replayed: false,
                message: {
                  id: body!.messageId,
                  kind: 'VENDEUR',
                  label: 'Vous',
                  mine: true,
                  body: body!.body,
                  createdAt: '2026-09-26T09:10:00.000Z',
                },
              },
            });
      },
    );
    render(<ChatPanel side="seller" code="FG-ABCD2345" initial={thread()} />);

    await userEvent.type(screen.getByLabelText('Votre message'), 'Bonjour');
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    await screen.findByText('Message pas envoyé. Réessayez.');
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    await waitFor(() => expect(attempts).toHaveLength(2));
    expect(attempts[1]!.messageId).toBe(attempts[0]!.messageId);
    await waitFor(() => expect(screen.queryByText('Message pas envoyé. Réessayez.')).toBeNull());
  });

  it('fills the box from a quick reply', async () => {
    render(<ChatPanel side="seller" code="FG-ABCD2345" initial={thread()} />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Le client est disponible après 17 h' }),
    );
    expect(screen.getByLabelText('Votre message')).toHaveValue(
      'Le client est disponible après 17 h',
    );
  });

  it('gives no box while the parcel is at the depot, and says why', () => {
    render(
      <ChatPanel
        side="seller"
        code="FG-ABCD2345"
        initial={thread({ state: 'VERROUILLE', canPost: false, refusal: 'CHAT_LECTURE_SEULE' })}
      />,
    );

    expect(screen.queryByLabelText('Votre message')).toBeNull();
    expect(screen.getByTestId('chat-refusal')).toHaveTextContent(
      'Le colis est au dépôt : le chat est en lecture seule',
    );
    expect(screen.getByText('Lecture seule')).toBeInTheDocument();
    expect(screen.getByText('Client ne répond pas')).toBeInTheDocument();
  });

  it('says a closed chat is closed, history still readable', () => {
    render(
      <ChatPanel
        side="seller"
        code="FG-ABCD2345"
        initial={thread({ state: 'CLOS', canPost: false, refusal: 'CHAT_CLOS' })}
      />,
    );
    expect(screen.getByTestId('chat-refusal')).toHaveTextContent('Le chat est clos');
    expect(screen.getByText('Nous rappelons le client')).toBeInTheDocument();
  });

  it('opens when a livreur takes the parcel: until then there is nothing to write in', () => {
    render(<ChatPanel side="seller" code="FG-ABCD2345" initial={null} />);
    expect(
      screen.getByText('Le chat s’ouvre quand un livreur prend le colis en charge'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Votre message')).toBeNull();
  });

  it('only reads under "Voir comme le vendeur", and does not poll (D-5)', () => {
    render(<ChatPanel side="seller" code="FG-ABCD2345" initial={thread()} readOnly />);
    expect(screen.queryByLabelText('Votre message')).toBeNull();
    expect(screen.getByTestId('chat-refusal')).toHaveTextContent('lecture seule');
  });
});

describe('ChatPanel, team side (Admin 4.8)', () => {
  it('writes as Faffa Go, and says so', async () => {
    render(
      <ChatPanel
        side="staff"
        code="FG-ABCD2345"
        initial={thread({ state: 'VERROUILLE', courierName: 'Sami Ben Ali' })}
      />,
    );

    expect(screen.getByText('Boutique Démo · Sami Ben Ali')).toBeInTheDocument();
    expect(screen.getByText('Vos messages apparaissent sous le nom Faffa Go.')).toBeInTheDocument();
    // No quick replies for the team: the specs give none.
    expect(screen.queryByRole('button', { name: /disponible après/ })).toBeNull();
    expect(screen.getByLabelText('Votre message')).toBeInTheDocument();
  });

  it('shows the reason returned by the server when a message is refused, and reloads the thread', async () => {
    bff.mockImplementation((_method: string, path: string) =>
      path.endsWith('/messages')
        ? Promise.resolve({
            ok: false,
            status: 409,
            error: {
              code: 'CHAT_CLOS',
              message: 'Le chat est clos : le colis est livré et payé, ou son retour est reçu',
            },
          })
        : Promise.resolve({
            ok: true,
            data: { thread: thread({ state: 'CLOS', canPost: false, refusal: 'CHAT_CLOS' }) },
          }),
    );
    render(<ChatPanel side="staff" code="FG-ABCD2345" initial={thread()} />);

    await userEvent.type(screen.getByLabelText('Votre message'), 'Trop tard');
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Le chat est clos');
    await waitFor(() => expect(screen.queryByLabelText('Votre message')).toBeNull());
    expect(screen.queryByText('Trop tard')).toBeNull();
  });
});

describe('ChatsInboxScreen (Admin 4.8)', () => {
  const inbox: ChatInbox = {
    unreadCount: 1,
    threads: [
      {
        parcelCode: 'FG-AAAAAAAA',
        sellerId: 's1',
        shopName: 'Boutique Démo',
        courier: { userId: 'u1', name: 'Sami Ben Ali' },
        state: 'OUVERT',
        lastMessage: 'Client ne répond pas',
        lastMessageKind: 'COURSIER',
        lastMessageAt: '2026-09-26T09:00:00.000Z',
        unread: 2,
      },
      {
        parcelCode: 'FG-BBBBBBBB',
        sellerId: 's2',
        shopName: 'Chic Tunis',
        courier: null,
        state: 'CLOS',
        lastMessage: 'Merci',
        lastMessageKind: 'VENDEUR',
        lastMessageAt: '2026-09-25T09:00:00.000Z',
        unread: 0,
      },
    ],
  };
  const filters = {
    zones: [],
    sellers: [
      { id: 's1', shopName: 'Boutique Démo' },
      { id: 's2', shopName: 'Chic Tunis' },
    ],
    livreurs: [{ id: 'u1', firstName: 'Sami', lastName: 'Ben Ali' }],
  };

  it('lists every chat with its unread count, each leading to the thread', () => {
    render(<ChatsInboxScreen inbox={inbox} filters={filters} query={{}} />);

    expect(screen.getByText('1 conversation avec du nouveau')).toBeInTheDocument();
    const first = screen.getByRole('link', { name: /FG-AAAAAAAA/ });
    expect(first).toHaveAttribute('href', '/admin/chats/FG-AAAAAAAA');
    expect(within(first).getByLabelText('2 messages non lus')).toBeInTheDocument();
    expect(within(first).getByText(/Boutique Démo · Sami Ben Ali/)).toBeInTheDocument();
    const second = screen.getByRole('link', { name: /FG-BBBBBBBB/ });
    expect(within(second).getByText(/aucun livreur/)).toBeInTheDocument();
    expect(within(second).getByText('Clos')).toBeInTheDocument();
  });

  it('filters by unread, seller and courier, in the address', () => {
    render(
      <ChatsInboxScreen
        inbox={inbox}
        filters={filters}
        query={{ unread: true, sellerId: 's1', courierUserId: 'u1', q: 'FG' }}
      />,
    );

    expect(screen.getByLabelText('Non lus')).toBeChecked();
    expect(screen.getByLabelText('Vendeur')).toHaveValue('s1');
    expect(screen.getByLabelText('Livreur')).toHaveValue('u1');
    expect(screen.getByLabelText('Code ou boutique')).toHaveValue('FG');
    expect(screen.getByRole('button', { name: 'Filtrer' }).closest('form')).toHaveAttribute(
      'method',
      'get',
    );
  });

  it('says when there is no chat', () => {
    render(
      <ChatsInboxScreen inbox={{ unreadCount: 0, threads: [] }} filters={filters} query={{}} />,
    );
    expect(screen.getByText('Aucun chat.')).toBeInTheDocument();
    expect(screen.getByText('Rien de nouveau.')).toBeInTheDocument();
  });
});
