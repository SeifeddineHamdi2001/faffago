import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { AllowImpersonation, Authenticated, CurrentPrincipal } from '../auth/decorators';
import type { Principal } from '../auth/principal';
import { PrismaService } from '../common/prisma/prisma.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { NotificationsService } from './notifications.service';

const listQuery = z
  .object({
    unread: z.enum(['true', 'false']).optional(),
    before: z.string().datetime().optional(),
  })
  .strict();
type ListQuery = z.output<typeof listQuery>;

/**
 * The bell, for every role: each person reads and clears his own notifications
 * only. Under "Voir comme le vendeur" (D-5) the admin reads the seller's, and
 * cannot mark anything read: a write is refused whatever the route says.
 */
@Controller('notifications')
@Authenticated()
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  private async ownerOf(principal: Principal): Promise<string> {
    if (principal.kind === 'user') return principal.userId;
    const seller = await this.prisma.seller.findUniqueOrThrow({
      where: { id: principal.sellerId },
      select: { userId: true },
    });
    return seller.userId;
  }

  @Get()
  @AllowImpersonation()
  async list(
    @Query(new ZodValidationPipe(listQuery)) query: ListQuery,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.notifications.list(await this.ownerOf(principal), {
      unreadOnly: query.unread === 'true',
      before: query.before ? new Date(query.before) : null,
    });
  }

  @Get('unread-count')
  @AllowImpersonation()
  async unread(@CurrentPrincipal() principal: Principal) {
    return { unreadCount: await this.notifications.unreadCount(await this.ownerOf(principal)) };
  }

  @Post('read-all')
  @HttpCode(200)
  async readAll(@CurrentPrincipal() principal: Principal) {
    return this.notifications.markAllRead(await this.ownerOf(principal));
  }

  @Post(':id/read')
  @HttpCode(200)
  async read(@Param('id', ParseUUIDPipe) id: string, @CurrentPrincipal() principal: Principal) {
    return this.notifications.markRead(await this.ownerOf(principal), id);
  }
}
