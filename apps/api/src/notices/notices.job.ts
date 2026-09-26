import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import {
  END_OF_DAY_REMINDER_HOUR_TUNIS,
  ParcelLocation,
  ParcelStatus,
  Permission,
  RELANCE_TODAY_NOTICE_HOUR_TUNIS,
  VERIFY_WARNING_HOURS,
  CaisseSessionStatus,
  isDailyNoticeDue,
  tunisDayKey,
} from '@faffago/shared';
import { CLOCK, type Clock } from '../common/clock';
import { PrismaService } from '../common/prisma/prisma.service';
import { CaisseService } from '../money/caisse.service';
import { PayrollService } from '../money/payroll.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { TourneesService } from '../tournees/tournees.service';

const HOUR_MS = 3_600_000;

/**
 * The notices nobody's action sets off (Vendeur 4.13, Admin 4.18, Coursier
 * 4.11): 24 hours left on an À vérifier parcel, the relancé parcels of the
 * day, the reminder before couriers go home, and a livreur's pay coming due.
 *
 * Each one is sent once, however often the job looks: the parcel's own
 * earlier notice, or the day carried in the notification's parameters, is the
 * memory. A pass that had nothing to send is remembered in memory too, so the
 * minute-by-minute tick costs nothing between two days; a restart repeats it
 * and the notifications already sent stop the repeat.
 */
@Injectable()
export class NoticesJob {
  private readonly logger = new Logger(NoticesJob.name);
  private running = false;
  private readonly passedOn = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
    private readonly tournees: TourneesService,
    private readonly caisse: CaisseService,
    private readonly payroll: PayrollService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Plus que 24 h (D-76): the seller and the team following À vérifier, once per failure. */
  async warnVerifyDeadlines(): Promise<number> {
    const now = this.clock.now();
    const { settings } = await this.settings.current(this.prisma);
    const near = await this.prisma.parcel.findMany({
      where: {
        status: ParcelStatus.A_VERIFIER,
        verifyDeadlineAt: { gt: now, lte: new Date(now.getTime() + VERIFY_WARNING_HOURS * HOUR_MS) },
      },
      select: {
        id: true,
        code: true,
        sellerId: true,
        verifyDeadlineAt: true,
        seller: { select: { shopName: true } },
      },
    });
    let warned = 0;
    for (const parcel of near) {
      // The failure this deadline belongs to began one deadline ago.
      const since = new Date(parcel.verifyDeadlineAt!.getTime() - settings.verifyDeadlineHours * HOUR_MS);
      const already = await this.prisma.notification.findFirst({
        where: { parcelId: parcel.id, type: 'COLIS_24H_RESTANTES', createdAt: { gte: since } },
        select: { id: true },
      });
      if (already) continue;
      await this.prisma.$transaction(async (tx) => {
        const options = { parcelId: parcel.id };
        await this.notifications.send(tx, { sellerId: parcel.sellerId }, 'COLIS_24H_RESTANTES', {
          code: parcel.code,
        }, options);
        await this.notifications.send(
          tx,
          { permission: Permission.SUIVI_A_VERIFIER },
          'COLIS_24H_RESTANTES',
          { code: parcel.code, shopName: parcel.seller.shopName },
          options,
        );
      });
      warned += 1;
    }
    return warned;
  }

  /** Relancé parcels waiting in each livreur's column today (D-9). Returns the livreurs told. */
  async relancesToday(): Promise<number> {
    const now = this.clock.now();
    const day = tunisDayKey(now);
    if (!this.due('relances', now, RELANCE_TODAY_NOTICE_HOUR_TUNIS)) return 0;
    const plan = await this.tournees.plan();
    const counts = new Map<string, number>();
    for (const zone of plan.zones) {
      for (const parcel of zone.parcels) {
        if (parcel.status !== ParcelStatus.RELANCE || !parcel.plannedLivreur) continue;
        counts.set(parcel.plannedLivreur.id, (counts.get(parcel.plannedLivreur.id) ?? 0) + 1);
      }
    }
    let told = 0;
    for (const [userId, count] of counts) {
      if (await this.notifications.hasNotice(this.prisma, userId, 'COLIS_RELANCE_AUJOURDHUI', { day })) {
        continue;
      }
      await this.notifications.send(this.prisma, { userId }, 'COLIS_RELANCE_AUJOURDHUI', {
        count,
        day,
      });
      told += 1;
    }
    this.passedOn.set('relances', day);
    return told;
  }

  /**
   * Avant de rentrer: parcels a livreur still carries, the bons a ramasseur
   * still carries, cash not handed over (Coursier 4.11). Told once a day, and
   * only when there is something left.
   */
  async endOfDayReminders(): Promise<number> {
    const now = this.clock.now();
    const day = tunisDayKey(now);
    if (!this.due('fin-de-journee', now, END_OF_DAY_REMINDER_HOUR_TUNIS)) return 0;
    const couriers = await this.prisma.user.findMany({
      where: {
        role: { in: ['LIVREUR', 'RAMASSEUR'] },
        isActive: true,
        courier: { accountState: 'ACTIF' },
      },
      select: { id: true, role: true, courier: { select: { id: true } } },
    });
    let told = 0;
    for (const user of couriers) {
      const courierId = user.courier!.id;
      if (await this.notifications.hasNotice(this.prisma, user.id, 'RAPPEL_FIN_DE_JOURNEE', { day })) {
        continue;
      }
      const [parcels, bons, session] = await Promise.all([
        user.role === 'LIVREUR'
          ? this.prisma.parcel.count({
              where: {
                currentLivreurId: courierId,
                location: ParcelLocation.AVEC_LE_LIVREUR,
                status: { not: ParcelStatus.LIVRE },
              },
            })
          : Promise.resolve(0),
        user.role === 'RAMASSEUR'
          ? Promise.all([
              this.prisma.bonVersement.count({ where: { ramasseurId: courierId, status: 'EN_ROUTE' } }),
              this.prisma.bonRetour.count({ where: { ramasseurId: courierId, status: 'EN_ROUTE' } }),
            ]).then(([versement, retour]) => versement + retour)
          : Promise.resolve(0),
        this.caisse.session(user.id, day),
      ]);
      const cash =
        session.status !== CaisseSessionStatus.CLOTUREE && session.expected.totalMillimes > 0n;
      if (parcels === 0 && bons === 0 && !cash) continue;
      await this.notifications.send(this.prisma, { userId: user.id }, 'RAPPEL_FIN_DE_JOURNEE', {
        parcels,
        bons,
        cash,
        day,
      });
      told += 1;
    }
    this.passedOn.set('fin-de-journee', day);
    return told;
  }

  /** A livreur's fiche de paie comes due (Admin 4.18), once per period. */
  async couriersDueForPay(): Promise<number> {
    const now = this.clock.now();
    const day = tunisDayKey(now);
    if (!this.due('paie', now, RELANCE_TODAY_NOTICE_HOUR_TUNIS)) return 0;
    const rows = await this.payroll.overview();
    let told = 0;
    for (const row of rows) {
      if (!row.due) continue;
      const courierName = `${row.livreur.firstName} ${row.livreur.lastName}`;
      const params = { courierName, day: row.duePeriod.end };
      if (await this.notifications.hasNotice(this.prisma, null, 'COURSIER_A_PAYER', params)) {
        continue;
      }
      await this.notifications.send(
        this.prisma,
        { permission: Permission.PAIE_COURSIERS },
        'COURSIER_A_PAYER',
        params,
      );
      told += 1;
    }
    this.passedOn.set('paie', day);
    return told;
  }

  /** Whether a daily pass is due: its hour has come and it has not run on this Tunis day. */
  private due(pass: string, now: Date, hourTunis: number): boolean {
    return isDailyNoticeDue(now, hourTunis) && this.passedOn.get(pass) !== tunisDayKey(now);
  }

  @Interval(60_000)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (const [name, pass] of [
        ['24 h restantes', () => this.warnVerifyDeadlines()],
        ['relances du jour', () => this.relancesToday()],
        ['fin de journée', () => this.endOfDayReminders()],
        ['paie à préparer', () => this.couriersDueForPay()],
      ] as const) {
        try {
          const count = await pass();
          if (count > 0) this.logger.log(`${name} : ${count} notification(s)`);
        } catch (error) {
          this.logger.error(`Notifications « ${name} » impossibles`, error as Error);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
