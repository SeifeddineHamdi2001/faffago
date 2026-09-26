import { describe, expect, it } from 'vitest';
import {
  CHAT_MESSAGE_MAX_LENGTH,
  CHAT_QUICK_REPLIES_COURIER,
  CHAT_QUICK_REPLIES_SELLER,
  ChatThreadState,
  chatAccessFor,
  chatMessageSchema,
  chatParticipantOf,
  chatRefusalFor,
  chatSenderLabel,
  ChatErrorCode,
  CHAT_MESSAGES_FR,
} from '../chat.js';
import { CourierOperationKind, courierOperationSchema, operationIdOf } from '../courier.js';
import { Role } from '../roles.js';

const ID = '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b';

describe('chatMessageSchema', () => {
  it('trims the text and needs the id the sender drew', () => {
    const parsed = chatMessageSchema.parse({ messageId: ID, body: '  Bonjour  ' });
    expect(parsed.body).toBe('Bonjour');
  });

  it('refuses an empty message, a message too long, and a missing id', () => {
    expect(chatMessageSchema.safeParse({ messageId: ID, body: '   ' }).success).toBe(false);
    expect(
      chatMessageSchema.safeParse({ messageId: ID, body: 'a'.repeat(CHAT_MESSAGE_MAX_LENGTH + 1) })
        .success,
    ).toBe(false);
    expect(chatMessageSchema.safeParse({ body: 'Bonjour' }).success).toBe(false);
    expect(chatMessageSchema.safeParse({ messageId: 'x', body: 'Bonjour' }).success).toBe(false);
  });

  it('refuses a field it does not know: the sender is never sent (CLAUDE.md)', () => {
    expect(
      chatMessageSchema.safeParse({ messageId: ID, body: 'Bonjour', senderKind: 'FAFFA_GO' })
        .success,
    ).toBe(false);
  });
});

describe('quick replies (Coursier 4.8, Vendeur 4.10)', () => {
  it('gives the courier the four replies of the spec, in both languages', () => {
    expect(CHAT_QUICK_REPLIES_COURIER.map((reply) => reply.fr)).toEqual([
      'Client ne répond pas',
      'Adresse introuvable',
      'Je passe dans 10 min',
      'Client demande un autre jour',
    ]);
    for (const reply of CHAT_QUICK_REPLIES_COURIER) expect(reply.ar).toMatch(/[؀-ۿ]/);
  });

  it('keeps every reply within the message limit', () => {
    for (const text of [
      ...CHAT_QUICK_REPLIES_COURIER.map((reply) => reply.fr),
      ...CHAT_QUICK_REPLIES_SELLER,
    ]) {
      expect(chatMessageSchema.safeParse({ messageId: ID, body: text }).success, text).toBe(true);
    }
  });
});

describe('chatParticipantOf', () => {
  it('maps a role to who it speaks as, and the ramasseur to nobody (A-23)', () => {
    expect(chatParticipantOf(Role.VENDEUR)).toBe('VENDEUR');
    expect(chatParticipantOf(Role.LIVREUR)).toBe('COURSIER');
    expect(chatParticipantOf(Role.ADMIN)).toBe('FAFFA_GO');
    expect(chatParticipantOf(Role.DEPOT)).toBe('FAFFA_GO');
    expect(chatParticipantOf(Role.SERVICE_CLIENT)).toBe('FAFFA_GO');
    expect(chatParticipantOf(Role.RAMASSEUR)).toBeNull();
  });
});

describe('chatSenderLabel', () => {
  const courier = { firstName: 'Sami', fullName: 'Sami Ben Ali' };
  const seller = { shopName: 'Boutique Démo' };

  it('shows the seller the courier by first name only, and the team as Faffa Go', () => {
    expect(chatSenderLabel({ viewer: 'VENDEUR', mine: false, kind: 'COURSIER', ...courier })).toBe(
      'Sami',
    );
    expect(chatSenderLabel({ viewer: 'VENDEUR', mine: false, kind: 'FAFFA_GO' })).toBe('Faffa Go');
    expect(chatSenderLabel({ viewer: 'VENDEUR', mine: true, kind: 'VENDEUR', ...seller })).toBe(
      'Vous',
    );
  });

  it('shows the courier the shop, and the previous livreur by first name (A-23)', () => {
    expect(chatSenderLabel({ viewer: 'COURSIER', mine: false, kind: 'VENDEUR', ...seller })).toBe(
      'Boutique Démo',
    );
    expect(chatSenderLabel({ viewer: 'COURSIER', mine: false, kind: 'COURSIER', ...courier })).toBe(
      'Sami',
    );
    expect(chatSenderLabel({ viewer: 'COURSIER', mine: true, kind: 'COURSIER', ...courier })).toBe(
      'Vous',
    );
    expect(chatSenderLabel({ viewer: 'COURSIER', mine: false, kind: 'FAFFA_GO' })).toBe('Faffa Go');
  });

  it('shows the team full names and the shop, and marks its own messages Faffa Go', () => {
    expect(chatSenderLabel({ viewer: 'FAFFA_GO', mine: false, kind: 'COURSIER', ...courier })).toBe(
      'Sami Ben Ali',
    );
    expect(chatSenderLabel({ viewer: 'FAFFA_GO', mine: false, kind: 'VENDEUR', ...seller })).toBe(
      'Boutique Démo',
    );
    expect(chatSenderLabel({ viewer: 'FAFFA_GO', mine: true, kind: 'FAFFA_GO' })).toBe('Faffa Go');
  });
});

describe('chatAccessFor', () => {
  const open = ChatThreadState.OUVERT;
  const locked = ChatThreadState.VERROUILLE;
  const closed = ChatThreadState.CLOS;

  it('lets the seller of the parcel read and write while it is open, only read after', () => {
    const view = (state: ChatThreadState) =>
      chatAccessFor({ role: Role.VENDEUR, state, isParcelSeller: true, isThreadCourier: false });
    expect(view(open)).toEqual({ canRead: true, canPost: true });
    expect(view(locked)).toEqual({ canRead: true, canPost: false });
    expect(view(closed)).toEqual({ canRead: true, canPost: false });
  });

  it('shuts another seller out of the thread', () => {
    expect(
      chatAccessFor({
        role: Role.VENDEUR,
        state: open,
        isParcelSeller: false,
        isThreadCourier: false,
      }),
    ).toEqual({ canRead: false, canPost: false });
  });

  it('gives the current livreur the thread, and nobody else in his role', () => {
    expect(
      chatAccessFor({
        role: Role.LIVREUR,
        state: open,
        isParcelSeller: false,
        isThreadCourier: true,
      }),
    ).toEqual({ canRead: true, canPost: true });
    expect(
      chatAccessFor({
        role: Role.LIVREUR,
        state: locked,
        isParcelSeller: false,
        isThreadCourier: true,
      }),
    ).toEqual({ canRead: true, canPost: false });
    expect(
      chatAccessFor({
        role: Role.LIVREUR,
        state: open,
        isParcelSeller: false,
        isThreadCourier: false,
      }),
    ).toEqual({ canRead: false, canPost: false });
  });

  it('never opens a chat to the ramasseur (A-23)', () => {
    for (const state of [open, locked, closed]) {
      expect(
        chatAccessFor({
          role: Role.RAMASSEUR,
          state,
          isParcelSeller: false,
          isThreadCourier: true,
        }),
      ).toEqual({ canRead: false, canPost: false });
    }
  });

  it('lets the staff read every chat and write while it is not closed (Q15)', () => {
    for (const role of [Role.ADMIN, Role.DEPOT, Role.SERVICE_CLIENT]) {
      expect(
        chatAccessFor({ role, state: locked, isParcelSeller: false, isThreadCourier: false }),
      ).toEqual({ canRead: true, canPost: true });
      expect(
        chatAccessFor({ role, state: closed, isParcelSeller: false, isThreadCourier: false }),
      ).toEqual({ canRead: true, canPost: false });
    }
  });
});

describe('the queued chat message', () => {
  const operation = {
    kind: CourierOperationKind.MESSAGE_CHAT,
    operationId: ID,
    parcelCode: 'FG-ABCD2345',
    body: 'Client ne répond pas',
    deviceTime: '2026-09-26T10:00:00+01:00',
  };

  it('is read like any other operation, under the id the phone drew', () => {
    const parsed = courierOperationSchema.parse(operation);
    expect(parsed.kind).toBe('MESSAGE_CHAT');
    expect(operationIdOf(operation)).toBe(ID);
  });

  it('refuses an empty or over-long message and an unknown field', () => {
    expect(courierOperationSchema.safeParse({ ...operation, body: ' ' }).success).toBe(false);
    expect(
      courierOperationSchema.safeParse({
        ...operation,
        body: 'a'.repeat(CHAT_MESSAGE_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
    expect(courierOperationSchema.safeParse({ ...operation, senderKind: 'FAFFA_GO' }).success).toBe(
      false,
    );
  });
});

describe('chatRefusalFor', () => {
  it('says why nobody can write: no thread yet, or a closed one', () => {
    expect(chatRefusalFor(null)).toBe(ChatErrorCode.CHAT_NON_OUVERT);
    expect(chatRefusalFor(ChatThreadState.CLOS)).toBe(ChatErrorCode.CHAT_CLOS);
    expect(chatRefusalFor(ChatThreadState.OUVERT)).toBeNull();
    // Read-only is a matter of who asks: the staff still write (Q15).
    expect(chatRefusalFor(ChatThreadState.VERROUILLE)).toBeNull();
  });

  it('words every refusal in French', () => {
    for (const code of Object.values(ChatErrorCode))
      expect(CHAT_MESSAGES_FR[code].length).toBeGreaterThan(10);
  });
});
