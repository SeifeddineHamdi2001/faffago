import { Injectable } from '@nestjs/common';
import {
  COURIER_OPERATION_ERROR_MESSAGES_FR,
  CourierOperationError,
  CourierOperationKind,
  courierOperationSchema,
  type CourierOperationResult,
} from '@faffago/shared';
import type { UserPrincipal } from '../auth/principal';
import { AddressMemoryService } from './address-memory.service';
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
 * scans, cancellations, Terminer le ramassage, notes d'adresse. Each
 * operation runs in its own transaction and gets its own answer; one refused
 * or unreadable operation never holds back the ones after it.
 */
@Injectable()
export class CourierSyncService {
  constructor(
    private readonly scans: CourierScansService,
    private readonly pickups: CourierPickupsService,
    private readonly memory: AddressMemoryService,
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
    }
  }
}
