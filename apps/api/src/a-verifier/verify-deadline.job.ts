import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ParcelAction, ParcelStatus, SYSTEM_ACTOR } from '@faffago/shared';
import { CLOCK, type Clock } from '../common/clock';
import { PrismaService } from '../common/prisma/prisma.service';
import { ParcelEventService } from '../parcels/parcel-event.service';

/** Parcels returned per pass: a backlog after downtime drains over a few minutes. */
const BATCH_SIZE = 200;

/**
 * The 48-hour rule (Vendeur 4.9, rule 15): a parcel still À vérifier when its
 * deadline passes becomes a return, with the return fee frozen on it. The
 * deadline was set from the server's clock when the failure was recorded
 * (D-30), and it is read against the server's clock here.
 *
 * Each parcel is returned in its own transaction, through the parcel event
 * service, as the system (no human actor). The state machine re-reads the
 * locked parcel, so a seller deciding at the same instant wins or loses
 * cleanly: never both. Running twice returns nothing twice.
 *
 * A customer postponement never has a deadline (D-9), and any decision
 * clears it, so only undecided failures are found.
 */
@Injectable()
export class VerifyDeadlineJob {
  private readonly logger = new Logger(VerifyDeadlineJob.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ParcelEventService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Returns how many parcels became returns. */
  async returnExpired(): Promise<number> {
    const due = await this.prisma.parcel.findMany({
      where: { status: ParcelStatus.A_VERIFIER, verifyDeadlineAt: { lte: this.clock.now() } },
      orderBy: { verifyDeadlineAt: 'asc' },
      select: { id: true, code: true },
      take: BATCH_SIZE,
    });
    let returned = 0;
    for (const parcel of due) {
      try {
        const result = await this.events.run({
          parcelId: parcel.id,
          actor: SYSTEM_ACTOR,
          request: { action: ParcelAction.AUTO_RETOUR_48H },
        });
        if (result.ok) returned += 1;
      } catch (error) {
        // One parcel failing must not hold back the others.
        this.logger.error(`Retour automatique impossible pour ${parcel.code}`, error as Error);
      }
    }
    return returned;
  }

  @Interval(60_000)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const returned = await this.returnExpired();
      if (returned > 0) this.logger.log(`${returned} colis retourné(s) après 48 h sans décision`);
    } catch (error) {
      this.logger.error('Retours automatiques 48 h impossibles', error as Error);
    } finally {
      this.running = false;
    }
  }
}
