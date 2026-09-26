import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CHAT_MESSAGES_FR,
  ChatErrorCode,
  ChatThreadState,
  PARCEL_MESSAGES,
  ParcelErrorCode,
  chatAccessFor,
  chatParticipantOf,
  chatRefusalFor,
  chatSenderLabel,
  normalizeParcelCode,
  Permission,
  Role,
  type ChatMessageValues,
  type ChatViewer,
} from '@faffago/shared';
import type { Principal, UserPrincipal } from '../auth/principal';
import { CLOCK, type Clock } from '../common/clock';
import { apiError } from '../common/errors';
import { PrismaService } from '../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ChatThreadsService } from './chat-threads.service';

type Db = Prisma.TransactionClient | PrismaService;

/** Which door the person came through: each has its own route and permission. */
export type ChatSide = 'SELLER' | 'COURIER' | 'STAFF';

export interface ChatMessageView {
  id: string;
  kind: ChatViewer;
  /** The name printed over it, for this reader (the seller reads a first name only). */
  label: string;
  mine: boolean;
  body: string;
  createdAt: string;
}

export interface ChatThreadView {
  parcelCode: string;
  state: ChatThreadState;
  canPost: boolean;
  /** Why not, when the person cannot write now. */
  refusal: ChatErrorCode | null;
  shopName: string;
  /** The seller reads the first name; the courier himself and the staff read the full name. */
  courierName: string | null;
  /** For the courier only (Coursier 4.8). */
  sellerPhone: string | null;
  messages: ChatMessageView[];
}

export type PostResult =
  | { ok: true; message: ChatMessageView; replayed: boolean }
  | { ok: false; status: number; code: string; message: string };

const notFound = () =>
  apiError(404, ParcelErrorCode.COLIS_INTROUVABLE, PARCEL_MESSAGES[ParcelErrorCode.COLIS_INTROUVABLE]);

const HISTORY_LIMIT = 500;
const INBOX_LIMIT = 100;

const PARCEL_FOR_CHAT = {
  id: true,
  code: true,
  status: true,
  location: true,
  cashStatus: true,
  sellerId: true,
  seller: { select: { shopName: true, contactPhone: true } },
} satisfies Prisma.ParcelSelect;

type ChatParcel = Prisma.ParcelGetPayload<{ select: typeof PARCEL_FOR_CHAT }>;

/**
 * The parcel chat (Vendeur 4.10, Coursier 4.8, Admin 4.8, Q14 to Q16, A-23).
 *
 * One thread per parcel, opened by the Sortie coursier scan. What a person may
 * do is decided here, from the account the guard established and the parcel's
 * own state, never from anything sent. The seller reads a courier by first
 * name only; the team is "Faffa Go"; the ramasseur has no route at all.
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly threads: ChatThreadsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  // ── One thread ─────────────────────────────────────────────

  /** The thread of a parcel, for the seller, the livreur holding it, or the team. */
  async thread(
    principal: Principal,
    side: ChatSide,
    rawCode: string,
  ): Promise<{ thread: ChatThreadView | null }> {
    const code = normalizeParcelCode(rawCode);
    const parcel = await this.prisma.parcel.findUnique({ where: { code }, select: PARCEL_FOR_CHAT });
    if (!parcel) throw notFound();
    const row = await this.prisma.chatThread.findUnique({
      where: { parcelId: parcel.id },
      include: { courier: { include: { user: true } } },
    });
    const access = this.accessOf(principal, side, parcel, row);
    if (!access) throw notFound();
    if (!row) return { thread: null };

    const view = await this.view(this.prisma, principal, side, parcel, row);
    // A first name read is a message read. Never while an admin looks as the seller (D-5).
    if (principal.kind === 'user' && row) {
      await this.markRead(this.prisma, row.id, principal.userId);
    }
    return { thread: view };
  }

  /** Who the person is in this thread, or null when the thread is none of his. */
  private accessOf(
    principal: Principal,
    side: ChatSide,
    parcel: ChatParcel,
    thread: { courierId: string | null } | null,
  ): { canRead: boolean; canPost: boolean } | null {
    const state = thread ? this.threads.stateOf(parcel) : null;
    const isParcelSeller = principal.sellerId !== null && principal.sellerId === parcel.sellerId;
    const isThreadCourier =
      principal.kind === 'user' &&
      principal.courierId !== null &&
      thread?.courierId === principal.courierId;
    const role = principal.role;
    const sideRole =
      side === 'SELLER'
        ? role === Role.VENDEUR
        : side === 'COURIER'
          ? role === Role.LIVREUR
          : chatParticipantOf(role) === 'FAFFA_GO';
    if (!sideRole) return null;
    // A thread that does not exist yet is the seller's or the team's to look at, nobody else's.
    if (!thread) {
      return side === 'COURIER' || (side === 'SELLER' && !isParcelSeller)
        ? null
        : { canRead: true, canPost: false };
    }
    const access = chatAccessFor({
      role,
      state: state as ChatThreadState,
      isParcelSeller,
      isThreadCourier,
    });
    return access.canRead ? access : null;
  }

  private async view(
    db: Db,
    principal: Principal,
    side: ChatSide,
    parcel: ChatParcel,
    thread: Prisma.ChatThreadGetPayload<{ include: { courier: { include: { user: true } } } }>,
  ): Promise<ChatThreadView> {
    const state = this.threads.stateOf(parcel);
    const isParcelSeller = principal.sellerId === parcel.sellerId;
    const isThreadCourier =
      principal.kind === 'user' && principal.courierId === thread.courierId && thread.courierId !== null;
    const { canPost } = chatAccessFor({
      role: principal.role,
      state,
      isParcelSeller,
      isThreadCourier,
    });
    const viewer = chatParticipantOf(principal.role) ?? 'FAFFA_GO';
    const senderId = principal.kind === 'user' ? principal.userId : null;

    const rows = await db.chatMessage.findMany({
      where: { threadId: thread.id },
      orderBy: { sequence: 'asc' },
      take: HISTORY_LIMIT,
      include: { sender: { select: { id: true, firstName: true, lastName: true } } },
    });
    const messages: ChatMessageView[] = rows.map((row) => ({
      id: row.id,
      kind: row.senderKind,
      label: chatSenderLabel({
        viewer,
        mine: senderId !== null && row.senderUserId === senderId,
        kind: row.senderKind,
        firstName: row.sender.firstName,
        fullName: `${row.sender.firstName} ${row.sender.lastName}`,
        shopName: parcel.seller.shopName,
      }),
      mine: senderId !== null && row.senderUserId === senderId,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
    }));

    const courier = thread.courier?.user;
    return {
      parcelCode: parcel.code,
      state,
      canPost,
      refusal: canPost ? null : (chatRefusalFor(state) ?? this.readOnlyRefusal(state)),
      shopName: parcel.seller.shopName,
      courierName: courier
        ? side === 'SELLER'
          ? courier.firstName
          : `${courier.firstName} ${courier.lastName}`
        : null,
      sellerPhone: side === 'COURIER' ? parcel.seller.contactPhone : null,
      messages,
    };
  }

  private readOnlyRefusal(state: ChatThreadState): ChatErrorCode | null {
    return state === ChatThreadState.VERROUILLE ? ChatErrorCode.CHAT_LECTURE_SEULE : null;
  }

  private async markRead(db: Db, threadId: string, userId: string): Promise<void> {
    const now = this.clock.now();
    await db.chatRead.upsert({
      where: { threadId_userId: { threadId, userId } },
      create: { threadId, userId, lastReadAt: now },
      update: { lastReadAt: now },
    });
  }

  // ── Writing ────────────────────────────────────────────────

  /** A message from the web or the app, refused with the reason in French. */
  async post(
    principal: UserPrincipal,
    side: ChatSide,
    rawCode: string,
    values: ChatMessageValues,
  ) {
    const result = await this.prisma.$transaction((tx) =>
      this.postIn(tx, principal, side, rawCode, values),
    );
    if (!result.ok) throw apiError(result.status, result.code, result.message);
    return { message: result.message, replayed: result.replayed };
  }

  /**
   * In the caller's transaction, and never throwing for a refusal: the
   * courier's queue stores the answer under the phone's id, so a refused
   * message is answered once and not tried again.
   *
   * The message id is the one the sender drew. The same id again from the same
   * person into the same chat is the same message, answered as such even if
   * the chat has closed since; from anyone else it is refused.
   */
  async postIn(
    tx: Prisma.TransactionClient,
    principal: UserPrincipal,
    side: ChatSide,
    rawCode: string,
    values: ChatMessageValues,
  ): Promise<PostResult> {
    const kind = chatParticipantOf(principal.role);
    if (!kind) return this.refusal(403, 'NON_AUTORISE', "Vous n'avez pas accès à cette action.");
    const code = normalizeParcelCode(rawCode);
    const parcel = await tx.parcel.findUnique({ where: { code }, select: PARCEL_FOR_CHAT });
    const thread = parcel
      ? await tx.chatThread.findUnique({
          where: { parcelId: parcel.id },
          include: { courier: { include: { user: true } } },
        })
      : null;
    if (!parcel) return this.refusal(404, ParcelErrorCode.COLIS_INTROUVABLE, PARCEL_MESSAGES.COLIS_INTROUVABLE);
    const access = this.accessOf(principal, side, parcel, thread);
    if (!access) return this.refusal(404, ParcelErrorCode.COLIS_INTROUVABLE, PARCEL_MESSAGES.COLIS_INTROUVABLE);

    const earlier = await tx.chatMessage.findUnique({
      where: { id: values.messageId },
      include: { sender: { select: { firstName: true, lastName: true } } },
    });
    if (earlier) {
      if (earlier.threadId === thread?.id && earlier.senderUserId === principal.userId) {
        return {
          ok: true,
          replayed: true,
          message: this.messageView(earlier, kind, parcel, earlier.sender),
        };
      }
      return this.refusal(409, ChatErrorCode.MESSAGE_ID_REUTILISE, CHAT_MESSAGES_FR.MESSAGE_ID_REUTILISE);
    }

    if (!thread) return this.refusal(409, ChatErrorCode.CHAT_NON_OUVERT, CHAT_MESSAGES_FR.CHAT_NON_OUVERT);
    if (!access.canPost) {
      const state = this.threads.stateOf(parcel);
      const why = chatRefusalFor(state) ?? ChatErrorCode.CHAT_LECTURE_SEULE;
      return this.refusal(409, why, CHAT_MESSAGES_FR[why]);
    }

    const now = this.clock.now();
    const created = await tx.chatMessage.create({
      data: {
        id: values.messageId,
        threadId: thread.id,
        senderUserId: principal.userId,
        senderKind: kind,
        body: values.body,
        createdAt: now,
      },
      include: { sender: { select: { firstName: true, lastName: true } } },
    });
    await tx.chatThread.update({
      where: { id: thread.id },
      data: { lastMessageAt: now, state: this.threads.stateOf(parcel) },
    });
    await this.markRead(tx, thread.id, principal.userId);
    await this.tellTheOthers(tx, principal, kind, parcel, thread, created.sender);
    return {
      ok: true,
      replayed: false,
      message: this.messageView(created, kind, parcel, created.sender),
    };
  }

  private refusal(status: number, code: string, message: string): PostResult {
    return { ok: false, status, code, message };
  }

  /** A message as its own sender reads it. */
  private messageView(
    row: { id: string; senderKind: ChatViewer; body: string; createdAt: Date },
    viewer: ChatViewer,
    parcel: ChatParcel,
    sender: { firstName: string; lastName: string },
  ): ChatMessageView {
    return {
      id: row.id,
      kind: row.senderKind,
      label: chatSenderLabel({
        viewer,
        mine: true,
        kind: row.senderKind,
        firstName: sender.firstName,
        fullName: `${sender.firstName} ${sender.lastName}`,
        shopName: parcel.seller.shopName,
      }),
      mine: true,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /**
   * NOUVEAU_MESSAGE to the other side of the conversation (Vendeur 4.13,
   * Coursier 4.11, Admin 4.18). Each reader is told the name he may read:
   * the seller a first name, the courier the shop. The team is told of the
   * chats it has joined; the others it reads in its inbox, where unread ones
   * are counted. The ramasseur is never told anything (A-23).
   */
  private async tellTheOthers(
    tx: Prisma.TransactionClient,
    sender: UserPrincipal,
    kind: ChatViewer,
    parcel: ChatParcel,
    thread: Prisma.ChatThreadGetPayload<{ include: { courier: { include: { user: true } } } }>,
    senderUser: { firstName: string; lastName: string },
  ): Promise<void> {
    const options = { parcelId: parcel.id, exceptUserId: sender.userId };
    const state = this.threads.stateOf(parcel);
    const courier = thread.courier?.user;
    const from = (viewer: ChatViewer) =>
      chatSenderLabel({
        viewer,
        mine: false,
        kind,
        firstName: senderUser.firstName,
        fullName: `${senderUser.firstName} ${senderUser.lastName}`,
        shopName: parcel.seller.shopName,
      });

    if (kind !== 'VENDEUR') {
      await this.notifications.send(tx, { sellerId: parcel.sellerId }, 'NOUVEAU_MESSAGE', {
        code: parcel.code,
        from: from('VENDEUR'),
      }, options);
    }
    if (kind !== 'COURSIER' && courier && state === ChatThreadState.OUVERT) {
      await this.notifications.send(tx, { userId: courier.id }, 'NOUVEAU_MESSAGE', {
        code: parcel.code,
        from: from('COURSIER'),
      }, options);
    }
    if (kind !== 'FAFFA_GO') {
      const joined = await tx.chatMessage.findFirst({
        where: { threadId: thread.id, senderKind: 'FAFFA_GO' },
        select: { id: true },
      });
      if (joined) {
        await this.notifications.send(tx, { permission: Permission.CHATS_STAFF }, 'NOUVEAU_MESSAGE', {
          code: parcel.code,
          from: from('FAFFA_GO'),
        }, options);
      }
    }
  }

  // ── Lists ──────────────────────────────────────────────────

  /**
   * Unread messages per thread for one person: what others wrote after he
   * last opened the thread. The team's own messages never count against it.
   */
  private async unreadByThread(userId: string, courierId?: string): Promise<Map<string, number>> {
    const rows = courierId
      ? await this.prisma.$queryRaw<{ threadId: string; n: number }[]>`
          SELECT m."threadId", COUNT(*)::int AS n
          FROM "chat_messages" m
          JOIN "chat_threads" t ON t."id" = m."threadId" AND t."courierId" = ${courierId}::uuid
          LEFT JOIN "chat_reads" r ON r."threadId" = m."threadId" AND r."userId" = ${userId}::uuid
          WHERE m."senderUserId" <> ${userId}::uuid
            AND (r."lastReadAt" IS NULL OR m."createdAt" > r."lastReadAt")
          GROUP BY m."threadId"`
      : await this.prisma.$queryRaw<{ threadId: string; n: number }[]>`
          SELECT m."threadId", COUNT(*)::int AS n
          FROM "chat_messages" m
          LEFT JOIN "chat_reads" r ON r."threadId" = m."threadId" AND r."userId" = ${userId}::uuid
          WHERE m."senderKind" <> 'FAFFA_GO'
            AND (r."lastReadAt" IS NULL OR m."createdAt" > r."lastReadAt")
          GROUP BY m."threadId"`;
    return new Map(rows.map((row) => [row.threadId, row.n]));
  }

  /** The livreur's chats: the parcels he holds or held, latest message first. */
  async courierThreads(principal: UserPrincipal) {
    const courierId = principal.courierId!;
    const unread = await this.unreadByThread(principal.userId, courierId);
    const threads = await this.prisma.chatThread.findMany({
      where: { courierId, lastMessageAt: { not: null } },
      orderBy: { lastMessageAt: 'desc' },
      take: INBOX_LIMIT,
      include: {
        parcel: { select: PARCEL_FOR_CHAT },
        messages: { orderBy: { sequence: 'desc' }, take: 1 },
      },
    });
    return {
      unreadCount: [...unread.values()].reduce((sum, n) => sum + n, 0),
      threads: threads.map((thread) => ({
        parcelCode: thread.parcel.code,
        shopName: thread.parcel.seller.shopName,
        state: this.threads.stateOf(thread.parcel),
        lastMessage: thread.messages[0]?.body ?? null,
        lastMessageAt: thread.lastMessageAt?.toISOString() ?? null,
        unread: unread.get(thread.id) ?? 0,
      })),
    };
  }

  /** Every parcel chat, for Admin, Dépôt and Service client (Admin 4.8): filters by unread, seller, courier. */
  async staffInbox(
    principal: UserPrincipal,
    filter: { unread?: boolean; sellerId?: string; courierUserId?: string; q?: string },
  ) {
    const unread = await this.unreadByThread(principal.userId);
    const code = filter.q ? normalizeParcelCode(filter.q) : null;
    const threads = await this.prisma.chatThread.findMany({
      where: {
        lastMessageAt: { not: null },
        ...(filter.sellerId ? { sellerId: filter.sellerId } : {}),
        ...(filter.courierUserId ? { courier: { userId: filter.courierUserId } } : {}),
        ...(filter.unread ? { id: { in: [...unread.keys()] } } : {}),
        ...(code
          ? {
              OR: [
                { parcel: { code: { contains: code } } },
                { parcel: { seller: { shopName: { contains: filter.q!, mode: 'insensitive' } } } },
              ],
            }
          : {}),
      },
      orderBy: { lastMessageAt: 'desc' },
      take: INBOX_LIMIT,
      include: {
        parcel: { select: PARCEL_FOR_CHAT },
        courier: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
        messages: { orderBy: { sequence: 'desc' }, take: 1 },
      },
    });
    return {
      unreadCount: unread.size,
      threads: threads.map((thread) => ({
        parcelCode: thread.parcel.code,
        sellerId: thread.sellerId,
        shopName: thread.parcel.seller.shopName,
        courier: thread.courier
          ? {
              userId: thread.courier.user.id,
              name: `${thread.courier.user.firstName} ${thread.courier.user.lastName}`,
            }
          : null,
        state: this.threads.stateOf(thread.parcel),
        lastMessage: thread.messages[0]?.body ?? null,
        lastMessageKind: thread.messages[0]?.senderKind ?? null,
        lastMessageAt: thread.lastMessageAt?.toISOString() ?? null,
        unread: unread.get(thread.id) ?? 0,
      })),
    };
  }

  /** The number for the menu badge: threads with something unread. */
  async staffUnread(principal: UserPrincipal) {
    return { unreadCount: (await this.unreadByThread(principal.userId)).size };
  }

  async courierUnread(principal: UserPrincipal) {
    const unread = await this.unreadByThread(principal.userId, principal.courierId!);
    return { unreadCount: [...unread.values()].reduce((sum, n) => sum + n, 0) };
  }
}
