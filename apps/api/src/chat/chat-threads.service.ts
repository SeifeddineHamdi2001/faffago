import { Injectable } from '@nestjs/common';
import type { Parcel, Prisma } from '@prisma/client';
import { chatStateFor, type ChatThreadState } from '@faffago/shared';

/**
 * The parcel chat's thread (Q14 to Q16, A-23).
 *
 * The thread is created by the Sortie coursier scan and by nothing else: no
 * livreur, no thread. It is one thread for the parcel's whole life, and only
 * the livreur it points at can write in it. Whether it is open, read-only or
 * closed is never stored as a step of its own: it is read from the parcel
 * every time (`chatStateFor`), so it cannot drift from it however the parcel
 * moved.
 */
@Injectable()
export class ChatThreadsService {
  /**
   * Sortie coursier: opens the thread, or, when the parcel goes out again
   * after a relance or a change of client, points the same thread at the new
   * livreur, who reads everything written before him.
   */
  async openOnDispatch(
    tx: Prisma.TransactionClient,
    parcel: Pick<Parcel, 'id' | 'sellerId' | 'currentLivreurId'>,
  ): Promise<void> {
    if (!parcel.currentLivreurId) return;
    await tx.chatThread.upsert({
      where: { parcelId: parcel.id },
      create: {
        parcelId: parcel.id,
        sellerId: parcel.sellerId,
        courierId: parcel.currentLivreurId,
        state: 'OUVERT',
      },
      update: { courierId: parcel.currentLivreurId, state: 'OUVERT' },
    });
  }

  /** The state a thread is in now, from its parcel. */
  stateOf(parcel: Pick<Parcel, 'status' | 'location' | 'cashStatus'>): ChatThreadState {
    // A thread exists only once a livreur has taken the parcel out.
    return chatStateFor({
      status: parcel.status,
      location: parcel.location,
      cashStatus: parcel.cashStatus,
      hasBeenDispatched: true,
    }) as ChatThreadState;
  }
}
