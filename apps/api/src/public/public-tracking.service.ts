import { Injectable } from '@nestjs/common';
import {
  PUBLIC_TIMELINE_EVENT_TYPES,
  ParcelEventType,
  PublicStatus,
  delegationNameFor,
  isValidParcelCode,
  normalizeParcelCode,
  publicStatusFor,
  type Langue,
  type PublicTrackingView,
} from '@faffago/shared';
import { apiError } from '../common/errors';
import { PrismaService } from '../common/prisma/prisma.service';
import { PublicTrackingThrottleService } from './public-tracking-throttle.service';

const codeInconnu = () =>
  apiError(404, 'CODE_INCONNU', 'Aucun colis trouvé avec ce code. Vérifiez le code sur l’étiquette.');

/**
 * The return trip of a cancellation after pickup (D-28) is never shown: the
 * customer's order simply ends at "Commande annulée" (D-31). Every other
 * return still shows Départ retour and Retour reçu.
 */
const RETURN_TRIP_EVENT_TYPES: readonly ParcelEventType[] = [
  ParcelEventType.DEPART_RETOUR,
  ParcelEventType.RETOUR_RECU,
];

/** Thrown by `track` when the visitor's IP is slowed down (Landing 4.4). */
export class TooManyTrackingAttemptsError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super('TROP_DE_TENTATIVES');
  }
}

/**
 * Public tracking (Landing 4): anyone with a code sees where it is, never the
 * customer's name, phone, address, the failure reason or an internal note
 * (Landing 4.3). Rate-limited per IP (Landing 4.4).
 */
@Injectable()
export class PublicTrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly throttle: PublicTrackingThrottleService,
  ) {}

  async track(rawCode: string, ip: string, langue: Langue): Promise<PublicTrackingView> {
    const retryAfter = this.throttle.retryAfterSeconds(ip);
    if (retryAfter > 0) throw new TooManyTrackingAttemptsError(retryAfter);

    const code = normalizeParcelCode(rawCode);
    if (!isValidParcelCode(code)) {
      this.throttle.recordFailure(ip);
      throw codeInconnu();
    }

    const parcel = await this.prisma.parcel.findUnique({
      where: { code },
      select: {
        id: true,
        code: true,
        status: true,
        relaunchOrigin: true,
        relaunchDate: true,
        cancelledAt: true,
        createdAt: true,
        codAmountMillimes: true,
        seller: { select: { shopName: true } },
        delegation: { select: { code: true, nameFr: true, nameAr: true } },
        currentLivreur: { select: { user: { select: { firstName: true } } } },
      },
    });
    if (!parcel) {
      this.throttle.recordFailure(ip);
      throw codeInconnu();
    }
    this.throttle.recordSuccess(ip);

    // Only the whitelisted event types (A-17, Q2), and never one whose scan
    // was later cancelled: a Sortie coursier undone at the depot must not
    // read "En cours de livraison" (D-54). The seller's own timeline shows
    // both; the public page shows neither.
    const events = await this.prisma.parcelEvent.findMany({
      where: { parcelId: parcel.id, type: { in: [...PUBLIC_TIMELINE_EVENT_TYPES] } },
      orderBy: { sequence: 'asc' },
      select: { type: true, serverTime: true, scanId: true },
    });
    const status = publicStatusFor(parcel);
    let visible = events;
    const scanIds = [...new Set(events.map((e) => e.scanId).filter((id): id is string => !!id))];
    if (scanIds.length > 0) {
      const cancelled = new Set(
        (
          await this.prisma.scan.findMany({
            where: { id: { in: scanIds }, cancelledAt: { not: null } },
            select: { id: true },
          })
        ).map((scan) => scan.id),
      );
      visible = events.filter((event) => !event.scanId || !cancelled.has(event.scanId));
    }
    if (parcel.cancelledAt) {
      visible = visible.filter((event) => !RETURN_TRIP_EVENT_TYPES.includes(event.type));
    }

    return {
      code: parcel.code,
      status,
      lastUpdateAt: (visible.at(-1)?.serverTime ?? parcel.createdAt).toISOString(),
      shopName: parcel.seller.shopName,
      delegationName: delegationNameFor(parcel.delegation, langue),
      codAmountMillimes: parcel.codAmountMillimes.toString(),
      livreurFirstName:
        status === PublicStatus.EN_COURS_DE_LIVRAISON
          ? (parcel.currentLivreur?.user.firstName ?? null)
          : null,
      // He asked for the date himself, so showing it back to him reveals nothing (D-9).
      postponedTo:
        status === PublicStatus.LIVRAISON_REPORTEE_CLIENT && parcel.relaunchDate
          ? parcel.relaunchDate.toISOString().slice(0, 10)
          : null,
      timeline: visible.map((event) => ({ type: event.type, at: event.serverTime.toISOString() })),
    };
  }
}
