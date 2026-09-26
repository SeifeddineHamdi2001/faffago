import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Permission, chatMessageSchema, type ChatMessageValues } from '@faffago/shared';
import { AllowImpersonation, CurrentPrincipal, RequirePermission } from '../auth/decorators';
import type { Principal, UserPrincipal } from '../auth/principal';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ChatService } from './chat.service';

const inboxQuery = z
  .object({
    unread: z.enum(['true', 'false']).optional(),
    sellerId: z.string().uuid().optional(),
    courierUserId: z.string().uuid().optional(),
    q: z.string().trim().min(1).max(100).optional(),
  })
  .strict();
type InboxQuery = z.output<typeof inboxQuery>;

/**
 * The parcel chat (Vendeur 4.10, Coursier 4.8, Admin 4.8). One door per
 * space, each with its own permission, so the ramasseur — who holds none of
 * them — has no way in (A-23). A livreur writes through the courier app's
 * queue (`POST /scans/courier`), which applies each message once; here he
 * only reads.
 */
@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  // ── The seller ─────────────────────────────────────────────

  @Get('seller/:code')
  @RequirePermission(Permission.ESPACE_VENDEUR)
  @AllowImpersonation()
  sellerThread(@Param('code') code: string, @CurrentPrincipal() principal: Principal) {
    return this.chat.thread(principal, 'SELLER', code);
  }

  @Post('seller/:code/messages')
  @RequirePermission(Permission.ESPACE_VENDEUR)
  @HttpCode(200)
  sellerPost(
    @Param('code') code: string,
    @Body(new ZodValidationPipe(chatMessageSchema)) body: ChatMessageValues,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.chat.post(principal as UserPrincipal, 'SELLER', code, body);
  }

  // ── The livreur ────────────────────────────────────────────

  @Get('courier')
  @RequirePermission(Permission.APP_LIVREUR)
  courierThreads(@CurrentPrincipal() principal: Principal) {
    return this.chat.courierThreads(principal as UserPrincipal);
  }

  @Get('courier/unread')
  @RequirePermission(Permission.APP_LIVREUR)
  courierUnread(@CurrentPrincipal() principal: Principal) {
    return this.chat.courierUnread(principal as UserPrincipal);
  }

  @Get('courier/:code')
  @RequirePermission(Permission.APP_LIVREUR)
  courierThread(@Param('code') code: string, @CurrentPrincipal() principal: Principal) {
    return this.chat.thread(principal, 'COURIER', code);
  }

  // ── The team ───────────────────────────────────────────────

  @Get('staff')
  @RequirePermission(Permission.CHATS_STAFF)
  staffInbox(
    @Query(new ZodValidationPipe(inboxQuery)) query: InboxQuery,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.chat.staffInbox(principal as UserPrincipal, {
      unread: query.unread === 'true',
      sellerId: query.sellerId,
      courierUserId: query.courierUserId,
      q: query.q,
    });
  }

  @Get('staff/unread')
  @RequirePermission(Permission.CHATS_STAFF)
  staffUnread(@CurrentPrincipal() principal: Principal) {
    return this.chat.staffUnread(principal as UserPrincipal);
  }

  @Get('staff/:code')
  @RequirePermission(Permission.CHATS_STAFF)
  staffThread(@Param('code') code: string, @CurrentPrincipal() principal: Principal) {
    return this.chat.thread(principal, 'STAFF', code);
  }

  @Post('staff/:code/messages')
  @RequirePermission(Permission.CHATS_STAFF)
  @HttpCode(200)
  staffPost(
    @Param('code') code: string,
    @Body(new ZodValidationPipe(chatMessageSchema)) body: ChatMessageValues,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.chat.post(principal as UserPrincipal, 'STAFF', code, body);
  }
}
