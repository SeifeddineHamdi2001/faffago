import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  ROLES_BY_PERMISSION,
  type NotificationParams,
  type NotificationType,
  type Permission,
} from '@faffago/shared';
import { CLOCK, type Clock } from '../common/clock';
import { apiError } from '../common/errors';
import { PrismaService } from '../common/prisma/prisma.service';

type Db = Prisma.TransactionClient | PrismaService;

/** Who a notification is for: one account, or everyone who acts on the subject. */
export type NotificationRecipients =
  | { userId: string }
  | { sellerId: string }
  | { courierId: string }
  /** Every active account holding the permission (Admin 4.18: filtered by role). */
  | { permission: Permission };

export interface SendOptions {
  parcelId?: string | null;
  /** The person whose action caused it: never told of his own doing. */
  exceptUserId?: string | null;
}

export const NOTIFICATIONS_PAGE_SIZE = 50;

/**
 * In-app notifications (Vendeur 4.13, Admin 4.18, Coursier 4.11). Written in the
 * caller's transaction whenever there is one, so a notification exists exactly
 * when the event that caused it committed: never for a rolled-back scan, never
 * missing for a committed one.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Resolves the recipients and stores one row each. Returns how many were told. */
  async send<T extends NotificationType>(
    db: Db,
    to: NotificationRecipients,
    type: T,
    params: NotificationParams[T],
    options: SendOptions = {},
  ): Promise<number> {
    const userIds = (await this.userIdsOf(db, to)).filter((id) => id !== options.exceptUserId);
    if (userIds.length === 0) return 0;
    const now = this.clock.now();
    await db.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        type,
        params: params as unknown as Prisma.InputJsonObject,
        parcelId: options.parcelId ?? null,
        createdAt: now,
      })),
    });
    return userIds.length;
  }

  private async userIdsOf(db: Db, to: NotificationRecipients): Promise<string[]> {
    if ('userId' in to) return [to.userId];
    if ('sellerId' in to) {
      const seller = await db.seller.findUnique({
        where: { id: to.sellerId },
        select: { userId: true },
      });
      return seller ? [seller.userId] : [];
    }
    if ('courierId' in to) {
      const courier = await db.courier.findUnique({
        where: { id: to.courierId },
        select: { userId: true },
      });
      return courier ? [courier.userId] : [];
    }
    const users = await db.user.findMany({
      where: { role: { in: [...ROLES_BY_PERMISSION[to.permission]] }, isActive: true },
      select: { id: true },
    });
    return users.map((user) => user.id);
  }

  /**
   * Whether the user (or, with no user, anyone) already has this type with
   * these parameters: the daily notices (a reminder, a pay due) run once,
   * however often the job looks.
   */
  async hasNotice(
    db: Db,
    userId: string | null,
    type: NotificationType,
    match: Record<string, string>,
  ): Promise<boolean> {
    const found = await db.notification.findFirst({
      where: {
        ...(userId ? { userId } : {}),
        type,
        AND: Object.entries(match).map(([key, value]) => ({
          params: { path: [key], equals: value },
        })),
      },
      select: { id: true },
    });
    return found !== null;
  }

  // ── The bell ───────────────────────────────────────────────

  async list(userId: string, options: { unreadOnly?: boolean; before?: Date | null } = {}) {
    const rows = await this.prisma.notification.findMany({
      where: {
        userId,
        ...(options.unreadOnly ? { readAt: null } : {}),
        ...(options.before ? { createdAt: { lt: options.before } } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: NOTIFICATIONS_PAGE_SIZE,
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        type: row.type,
        params: row.params,
        parcelId: row.parcelId,
        readAt: row.readAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      unreadCount: await this.unreadCount(userId),
      next:
        rows.length === NOTIFICATIONS_PAGE_SIZE
          ? (rows[rows.length - 1]?.createdAt.toISOString() ?? null)
          : null,
    };
  }

  unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(userId: string, id: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
      select: { id: true, readAt: true },
    });
    if (!notification) throw apiError(404, 'NOTIFICATION_INCONNUE', 'Notification inconnue');
    if (!notification.readAt) {
      await this.prisma.notification.updateMany({
        where: { id, userId, readAt: null },
        data: { readAt: this.clock.now() },
      });
    }
    return { unreadCount: await this.unreadCount(userId) };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: this.clock.now() },
    });
    return { unreadCount: 0 };
  }
}
