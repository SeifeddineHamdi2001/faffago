import { Inject, Injectable } from '@nestjs/common';
import {
  COURIER_OPERATION_ERROR_MESSAGES_FR,
  CourierOperationError,
  CourierOperationKind,
  courierOperationSchema,
  type CourierChatMessageOperation,
  type CourierOperationResult,
} from '@faffago/shared';
import type { UserPrincipal } from '../auth/principal';
import { ChatService } from '../chat/chat.service';
import { CLOCK, type Clock } from '../common/clock';
import { PrismaService } from '../common/prisma/prisma.service';
import { AddressMemoryService } from './address-memory.service';
import { applyOnce } from './courier-operations';
import { CourierPickupsService } from './courier-pickups.service';
import { CourierScansService, type CourierRequestMeta } from './courier-scans.service';

/** The id an unreadable operation carried, if any, so the phone can drop it. */
function idOf(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const id = record.clientScanId ?? record.operationId;
  return typeof id === 'string' ? id : null;
}

/**
 * The courier app's queue, in the order the phone recorded it (Coursier 4.9):
 * scans, cancellations, Terminer le ramassage, notes d'adresse, chat messages. Each
 * operation runs in its own transaction and gets its own answer; one refused
 * or unreadable operation never holds back the ones after it.
 */
@Injectable()
export class CourierSyncService {
  constructor(
    private readonly scans: CourierScansService,
    private readonly pickups: CourierPickupsService,
    private readonly memory: AddressMemoryService,
    private readonly chat: ChatService,
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async sync(
    actor: UserPrincipal,
    operations: readonly unknown[],
    meta: CourierRequestMeta,
  ): Promise<CourierOperationResult[]> {
    const results: CourierOperationResult[] = [];
    for (const raw of operations) results.push(await this.one(actor, raw, meta));
    return results;
  }

  private one(
    actor: UserPrincipal,
    raw: unknown,
    meta: CourierRequestMeta,
  ): Promise<CourierOperationResult> {
    const parsed = courierOperationSchema.safeParse(raw);
    if (!parsed.success) {
      const kind = (raw as { kind?: unknown } | null)?.kind;
      return Promise.resolve({
        kind: Object.values(CourierOperationKind).includes(kind as CourierOperationKind)
          ? (kind as CourierOperationKind)
          : null,
        id: idOf(raw),
        ok: false,
        replayed: false,
        code: CourierOperationError.OPERATION_INVALIDE,
        message: COURIER_OPERATION_ERROR_MESSAGES_FR.OPERATION_INVALIDE,
        parcel: null,
      });
    }
    const op = parsed.data;
    switch (op.kind) {
      case CourierOperationKind.SCAN:
        return this.scans.scan(actor, op, meta);
      case CourierOperationKind.ANNULATION:
        return this.scans.cancel(actor, op);
      case CourierOperationKind.TERMINER_RAMASSAGE:
        return this.pickups.finish(actor, op);
      case CourierOperationKind.NOTE_ADRESSE:
        return this.memory.save(actor, op);
      case CourierOperationKind.MESSAGE_CHAT:
        return this.message(actor, op);
    }
  }

  /**
   * A chat message from the queue, applied once under the id the phone drew:
   * the message's own id, so it is stored once whatever the signal did. A
   * refused one (the chat closed while the phone was offline) is answered
   * once, with why, and not tried again.
   */
  private message(
    actor: UserPrincipal,
    op: CourierChatMessageOperation,
  ): Promise<CourierOperationResult> {
    return applyOnce(
      this.prisma,
      actor,
      { ...op, kind: CourierOperationKind.MESSAGE_CHAT },
      this.clock.now(),
      async (tx) => {
        const result = await this.chat.postIn(tx, actor, 'COURIER', op.parcelCode, {
          messageId: op.operationId,
          body: op.body,
        });
        return result.ok
          ? { ok: true, code: null, message: 'Message envoyé' }
          : { ok: false, code: result.code, message: result.message };
      },
    );
  }
}
