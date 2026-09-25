import { Inject, Injectable } from '@nestjs/common';
import {
  PARCEL_MESSAGES,
  ParcelErrorCode,
  canLogCall,
  isValidParcelCode,
  normalizeParcelCode,
  type LogCallValues,
} from '@faffago/shared';
import type { UserPrincipal } from '../auth/principal';
import { CLOCK, type Clock } from '../common/clock';
import { apiError } from '../common/errors';
import { PrismaService } from '../common/prisma/prisma.service';

/** A call as the team reads it: who made it. */
export interface StaffCall {
  id: string;
  calledAt: Date;
  answered: boolean;
  note: string | null;
  staffName: string;
}

/** A call as the seller reads it: "Faffa Go", never the staff member (D-38). */
export interface SellerCall {
  calledAt: Date;
  answered: boolean;
  note: string | null;
}

const colisIntrouvable = () =>
  apiError(404, ParcelErrorCode.COLIS_INTROUVABLE, PARCEL_MESSAGES.COLIS_INTROUVABLE);

/**
 * Appels Faffa Go (Admin 4.6, Vendeur 4.8): the calls Service client makes
 * about a parcel, logged with the server's time, answered or not, and a note.
 * The seller reads them. Never edited, never deleted (D-73).
 */
@Injectable()
export class CallsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async log(principal: UserPrincipal, rawCode: string, values: LogCallValues): Promise<StaffCall> {
    const code = normalizeParcelCode(rawCode);
    if (!isValidParcelCode(code)) throw colisIntrouvable();
    const parcel = await this.prisma.parcel.findUnique({ where: { code } });
    if (!parcel) throw colisIntrouvable();
    if (!canLogCall(parcel.status)) {
      throw apiError(
        409,
        'APPEL_IMPOSSIBLE',
        'Ce colis n’est pas encore ramassé ou son parcours est terminé.',
      );
    }
    const call = await this.prisma.faffaGoCall.create({
      data: {
        parcelId: parcel.id,
        staffUserId: principal.userId,
        calledAt: this.clock.now(),
        answered: values.answered,
        note: values.note ? values.note : null,
      },
    });
    const staff = await this.prisma.user.findUniqueOrThrow({
      where: { id: principal.userId },
      select: { firstName: true, lastName: true },
    });
    return {
      ...this.sellerView(call),
      id: call.id,
      staffName: `${staff.firstName} ${staff.lastName}`,
    };
  }

  async forStaff(parcelId: string): Promise<StaffCall[]> {
    const calls = await this.prisma.faffaGoCall.findMany({
      where: { parcelId },
      orderBy: { calledAt: 'desc' },
    });
    const names = new Map(
      (
        await this.prisma.user.findMany({
          where: { id: { in: [...new Set(calls.map((c) => c.staffUserId))] } },
          select: { id: true, firstName: true, lastName: true },
        })
      ).map((u) => [u.id, `${u.firstName} ${u.lastName}`]),
    );
    return calls.map((call) => ({
      ...this.sellerView(call),
      id: call.id,
      staffName: names.get(call.staffUserId) ?? '',
    }));
  }

  async forSeller(parcelId: string): Promise<SellerCall[]> {
    const calls = await this.prisma.faffaGoCall.findMany({
      where: { parcelId },
      orderBy: { calledAt: 'desc' },
    });
    return calls.map((call) => this.sellerView(call));
  }

  private sellerView(call: { calledAt: Date; answered: boolean; note: string | null }): SellerCall {
    return { calledAt: call.calledAt, answered: call.answered, note: call.note };
  }
}
