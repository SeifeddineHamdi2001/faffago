import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  COURIER_OPERATION_ERROR_MESSAGES_FR,
  CourierOperationError,
  CourierOperationKind,
  ParcelStatus,
  Role,
  SCAN_REFUSAL_MESSAGES_FR,
  ScanRefusal,
  parcelCodeFromScan,
  type CourierAddressNoteOperation,
  type CourierOperationResult,
} from '@faffago/shared';
import type { UserPrincipal } from '../auth/principal';
import { CLOCK, type Clock } from '../common/clock';
import { PrismaService } from '../common/prisma/prisma.service';
import { applyOnce, type OperationAnswer } from './courier-operations';

/** What a courier, or the team, reads about a customer's phone (Coursier 4.3). */
export interface AddressMemoryView {
  note: string | null;
  meetingPoint: string | null;
  /** "Déjà livré ici": a parcel to this number was delivered before. */
  deliveredHere: boolean;
  updatedAt: string | null;
}

/**
 * Mémoire d'adresse (Coursier 4.3): after a successful delivery the livreur
 * saves a short note, linked to the customer's phone; the next courier going
 * to that number reads it with "Déjà livré ici". A meeting point is recorded
 * on the parcel and kept in the memory too.
 *
 * Couriers and staff only, never the seller: no seller route reads it.
 */
@Injectable()
export class AddressMemoryService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** The memory of each phone number, and whether a parcel was delivered there. */
  async forPhones(phones: readonly string[]): Promise<Map<string, AddressMemoryView>> {
    const unique = [...new Set(phones)];
    if (unique.length === 0) return new Map();
    const [memories, delivered] = await Promise.all([
      this.prisma.addressMemory.findMany({ where: { customerPhone: { in: unique } } }),
      this.prisma.parcel.groupBy({
        by: ['recipientPhone'],
        where: { recipientPhone: { in: unique }, status: ParcelStatus.LIVRE },
        _count: { _all: true },
      }),
    ]);
    const byPhone = new Map(memories.map((m) => [m.customerPhone, m]));
    const deliveredPhones = new Set(delivered.map((d) => d.recipientPhone));
    const result = new Map<string, AddressMemoryView>();
    for (const phone of unique) {
      const memory = byPhone.get(phone);
      if (!memory && !deliveredPhones.has(phone)) continue;
      result.set(phone, {
        note: memory?.note ? memory.note : null,
        meetingPoint: memory?.meetingPoint ?? null,
        deliveredHere: deliveredPhones.has(phone),
        updatedAt: memory ? memory.updatedAt.toISOString() : null,
      });
    }
    return result;
  }

  /** Saves the note or the meeting point, once per id the phone drew. */
  save(actor: UserPrincipal, op: CourierAddressNoteOperation): Promise<CourierOperationResult> {
    const now = this.clock.now();
    return applyOnce(
      this.prisma,
      actor,
      { ...op, kind: CourierOperationKind.NOTE_ADRESSE },
      now,
      (tx) => this.write(tx, actor, op),
    );
  }

  private async write(
    tx: Prisma.TransactionClient,
    actor: UserPrincipal,
    op: CourierAddressNoteOperation,
  ): Promise<OperationAnswer> {
    const refused = (code: ScanRefusal): OperationAnswer => ({
      ok: false,
      code,
      message: SCAN_REFUSAL_MESSAGES_FR[code],
    });
    if (actor.role !== Role.LIVREUR) return refused(ScanRefusal.ROLE_NON_AUTORISE);
    if (!op.note && !op.meetingPoint) {
      return {
        ok: false,
        code: CourierOperationError.NOTE_VIDE,
        message: COURIER_OPERATION_ERROR_MESSAGES_FR.NOTE_VIDE,
      };
    }
    const code = parcelCodeFromScan(op.parcelCode);
    const parcel = code ? await tx.parcel.findUnique({ where: { code } }) : null;
    if (!parcel) return refused(ScanRefusal.CODE_INCONNU);
    // His parcel: the one he carries, or the one he delivered.
    if (parcel.currentLivreurId !== actor.courierId)
      return refused(ScanRefusal.COLIS_AUTRE_COURSIER);
    if (op.note && parcel.status !== ParcelStatus.LIVRE) {
      return {
        ok: false,
        code: CourierOperationError.NOTE_APRES_LIVRAISON,
        message: COURIER_OPERATION_ERROR_MESSAGES_FR.NOTE_APRES_LIVRAISON,
      };
    }

    if (op.meetingPoint) {
      // Recorded on the parcel (Coursier 4.3). Neither status nor place moves.
      await tx.parcel.update({ where: { id: parcel.id }, data: { meetingPoint: op.meetingPoint } });
    }
    const deliveryCount = await tx.parcel.count({
      where: { recipientPhone: parcel.recipientPhone, status: ParcelStatus.LIVRE },
    });
    await tx.addressMemory.upsert({
      where: { customerPhone: parcel.recipientPhone },
      create: {
        customerPhone: parcel.recipientPhone,
        note: op.note ?? '',
        meetingPoint: op.meetingPoint,
        delegationId: parcel.delegationId,
        lastCourierUserId: actor.userId,
        deliveryCount,
      },
      update: {
        ...(op.note ? { note: op.note } : {}),
        ...(op.meetingPoint ? { meetingPoint: op.meetingPoint } : {}),
        delegationId: parcel.delegationId,
        lastCourierUserId: actor.userId,
        deliveryCount,
      },
    });
    return { ok: true, code: null, message: 'Mémoire d’adresse enregistrée' };
  }
}
