import { Inject, Injectable } from '@nestjs/common';
import type { Courier, PayPlan, Prisma } from '@prisma/client';
import {
  PAY_PLAN_LABELS_FR,
  buildPayslip,
  businessDateOf,
  currentEarnings,
  documentDateKey,
  duePayPeriod,
  isPayslipDue,
  nextPaymentDate,
  payPeriodOn,
  schedulePlanChange,
  sumMillimes,
  type Millimes,
  type PayPeriod,
  type PayPlanSchedule,
} from '@faffago/shared';
import { AuditAction, AuditService } from '../audit/audit.service';
import type { UserPrincipal } from '../auth/principal';
import type { RequestMeta } from '../auth/sessions.service';
import { CLOCK, type Clock } from '../common/clock';
import { apiError } from '../common/errors';
import { PrismaService } from '../common/prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { nextDocumentNumber } from './document-numbers';

type Db = Prisma.TransactionClient;

const pasUnLivreur = () =>
  apiError(404, 'PAS_UN_LIVREUR', 'Ce compte n’est pas un livreur : sa paie est gérée par les RH');
const ficheIntrouvable = () => apiError(404, 'FICHE_INTROUVABLE', 'Fiche de paie introuvable');

interface UnpaidParcel {
  parcelId: string;
  code: string;
  rateMillimes: Millimes;
  /** The business day of his Livré (A-12). */
  day: string;
  cashWithCourier: boolean;
}

function scheduleOf(courier: Courier): PayPlanSchedule {
  return {
    plan: courier.payPlan!,
    since: courier.payPlanSince,
    pendingPlan: courier.pendingPayPlan,
    pendingFrom: courier.pendingPayPlanFrom,
  };
}

function periodView(period: PayPeriod) {
  return { start: documentDateKey(period.start), end: documentDateKey(period.end) };
}

/**
 * Livreur pay (Admin 4.12, Coursier 4.10, A-15, A-16, D-82): per parcel
 * livré at the rate frozen at delivery, on the plan he chose, minus his
 * debts. A fiche is prepared, with its deductions, in one transaction.
 */
@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private today(): Date {
    return businessDateOf(this.clock.now());
  }

  /**
   * His delivered parcels not yet on a fiche, up to a day: the parcel is
   * his (it stays with the livreur who delivered it), and its day is the
   * one of the Livré that stands.
   */
  private async unpaid(db: Db, courierId: string, upTo: Date): Promise<UnpaidParcel[]> {
    const parcels = await db.parcel.findMany({
      where: {
        currentLivreurId: courierId,
        status: 'LIVRE',
        courierRateMillimes: { not: null },
        payslipLine: { none: {} },
      },
      select: {
        id: true,
        code: true,
        courierRateMillimes: true,
        cashStatus: true,
        scans: {
          where: { action: 'LIVRE', accepted: true, cancelledAt: null },
          orderBy: { receivedAt: 'desc' },
          take: 1,
          select: { businessDate: true },
        },
      },
    });
    return parcels
      .filter((parcel) => parcel.scans[0] && parcel.scans[0].businessDate <= upTo)
      .map((parcel) => ({
        parcelId: parcel.id,
        code: parcel.code,
        rateMillimes: parcel.courierRateMillimes!,
        day: documentDateKey(parcel.scans[0]!.businessDate),
        cashWithCourier: parcel.cashStatus === 'CHEZ_LE_COURSIER',
      }))
      .sort((a, b) => a.day.localeCompare(b.day) || a.code.localeCompare(b.code));
  }

  private openDebts(db: Db, courierId: string) {
    return db.courierDebt.findMany({
      where: { courierId, status: 'EN_COURS', remainingMillimes: { gt: 0 } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  private async livreurOf(db: Db, userId: string) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        firstName: true,
        lastName: true,
        isActive: true,
        courier: true,
      },
    });
    if (!user?.courier || user.role !== 'LIVREUR' || !user.courier.payPlan) throw pasUnLivreur();
    return { ...user, courier: user.courier };
  }

  // ── Paie coursiers ────────────────────────────────────────

  /** Every livreur: his plan, the period due, what it would pay, his debts (Admin 4.12). */
  async overview() {
    const today = this.today();
    const users = await this.prisma.user.findMany({
      where: { role: 'LIVREUR', courier: { payPlan: { not: null } } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, isActive: true, courier: true },
    });
    const rows = [];
    for (const user of users) {
      const courier = user.courier!;
      const schedule = scheduleOf(courier);
      const due = duePayPeriod(schedule, today);
      const [unpaid, debts, last, aPayer] = await Promise.all([
        this.unpaid(this.prisma, courier.id, due.end),
        this.openDebts(this.prisma, courier.id),
        this.prisma.payslip.findFirst({
          where: { courierId: courier.id },
          orderBy: { periodEnd: 'desc' },
          select: { periodEnd: true },
        }),
        this.prisma.payslip.count({ where: { courierId: courier.id, status: 'A_PAYER' } }),
      ]);
      const cashWithCourier = unpaid.filter((parcel) => parcel.cashWithCourier).length;
      const payable = unpaid.filter((parcel) => !parcel.cashWithCourier);
      const slip = buildPayslip(
        payable.map((parcel) => ({
          parcelId: parcel.parcelId,
          courierRateMillimes: parcel.rateMillimes,
        })),
        debts.map((debt) => ({
          debtId: debt.id,
          remainingMillimes: debt.remainingMillimes,
          createdAt: debt.createdAt,
        })),
      );
      if (!user.isActive && payable.length === 0 && debts.length === 0 && aPayer === 0) continue;
      rows.push({
        livreur: {
          userId: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          isActive: user.isActive,
        },
        payPlan: courier.payPlan!,
        pendingPayPlan: courier.pendingPayPlan,
        pendingPayPlanFrom: courier.pendingPayPlanFrom
          ? documentDateKey(courier.pendingPayPlanFrom)
          : null,
        currentPeriod: periodView(payPeriodOn(schedule, today)),
        duePeriod: periodView(due),
        due: isPayslipDue({
          period: due,
          today,
          lastPaidPeriodEnd: last?.periodEnd ?? null,
          unpaidParcels: unpaid.length,
          cashStillWithCourier: cashWithCourier,
        }),
        parcelCount: payable.length,
        cashWithCourierCount: cashWithCourier,
        grossMillimes: slip.grossMillimes,
        deductionsMillimes: slip.deductionsMillimes,
        netMillimes: slip.netMillimes,
        debtsMillimes: sumMillimes(debts.map((debt) => debt.remainingMillimes)),
        payslipsAPayer: aPayer,
      });
    }
    return rows;
  }

  /**
   * Prepares the fiche of the period due (D-82): every delivered parcel not
   * yet paid up to its end, at its frozen rate, minus his debts oldest
   * first; the debts are deducted now, what does not fit carries over.
   */
  async prepare(actor: UserPrincipal, userId: string) {
    const id = await this.prisma.$transaction(async (tx) => {
      const livreur = await this.livreurOf(tx, userId);
      await tx.$queryRaw`SELECT "id" FROM "couriers" WHERE "id" = ${livreur.courier.id}::uuid FOR UPDATE`;
      const today = this.today();
      const period = duePayPeriod(scheduleOf(livreur.courier), today);
      const unpaid = await this.unpaid(tx, livreur.courier.id, period.end);
      const last = await tx.payslip.findFirst({
        where: { courierId: livreur.courier.id },
        orderBy: { periodEnd: 'desc' },
      });
      const due = isPayslipDue({
        period,
        today,
        lastPaidPeriodEnd: last?.periodEnd ?? null,
        unpaidParcels: unpaid.length,
        cashStillWithCourier: unpaid.filter((parcel) => parcel.cashWithCourier).length,
      });
      if (!due) {
        throw apiError(
          409,
          'FICHE_NON_DUE',
          'Pas de fiche à préparer : période non terminée, déjà payée, sans colis, ou une caisse n’est pas clôturée',
        );
      }
      const debts = await this.openDebts(tx, livreur.courier.id);
      const slip = buildPayslip(
        unpaid.map((parcel) => ({
          parcelId: parcel.parcelId,
          courierRateMillimes: parcel.rateMillimes,
        })),
        debts.map((debt) => ({
          debtId: debt.id,
          remainingMillimes: debt.remainingMillimes,
          createdAt: debt.createdAt,
        })),
      );
      const { settings } = await this.settings.current(tx);
      const now = this.clock.now();
      const payslip = await tx.payslip.create({
        data: {
          number: await nextDocumentNumber(tx, 'FICHE_PAIE', now),
          courierId: livreur.courier.id,
          payPlan: livreur.courier.payPlan as PayPlan,
          periodStart: period.start,
          periodEnd: period.end,
          parcelCount: slip.parcelCount,
          ratePerParcelMillimes: settings.courierRatePerParcelMillimes,
          grossMillimes: slip.grossMillimes,
          deductionsMillimes: slip.deductionsMillimes,
          netMillimes: slip.netMillimes,
          preparedByUserId: actor.userId,
          preparedAt: now,
        },
      });
      await tx.payslipParcel.createMany({
        data: unpaid.map((parcel) => ({
          payslipId: payslip.id,
          parcelId: parcel.parcelId,
          rateMillimes: parcel.rateMillimes,
        })),
      });
      for (const line of slip.deductions) {
        await tx.payslipDeduction.create({
          data: { payslipId: payslip.id, debtId: line.debtId, amountMillimes: line.amountMillimes },
        });
        const debt = debts.find((d) => d.id === line.debtId)!;
        const remaining = debt.remainingMillimes - line.amountMillimes;
        await tx.courierDebt.update({
          where: { id: debt.id },
          data: {
            remainingMillimes: remaining,
            ...(remaining === 0n ? { status: 'DEDUITE' } : {}),
          },
        });
      }
      return payslip.id;
    });
    return this.detail(id);
  }

  async payslips(filter: { userId?: string; status?: string } = {}) {
    const rows = await this.prisma.payslip.findMany({
      where: {
        ...(filter.userId ? { courier: { userId: filter.userId } } : {}),
        ...(filter.status ? { status: filter.status as never } : {}),
      },
      orderBy: { preparedAt: 'desc' },
      take: 200,
      include: {
        courier: { select: { user: { select: { id: true, firstName: true, lastName: true } } } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      number: row.number,
      livreur: {
        userId: row.courier.user.id,
        firstName: row.courier.user.firstName,
        lastName: row.courier.user.lastName,
      },
      payPlan: row.payPlan,
      period: { start: documentDateKey(row.periodStart), end: documentDateKey(row.periodEnd) },
      parcelCount: row.parcelCount,
      grossMillimes: row.grossMillimes,
      deductionsMillimes: row.deductionsMillimes,
      netMillimes: row.netMillimes,
      status: row.status,
      preparedAt: row.preparedAt,
      paidAt: row.paidAt,
    }));
  }

  /** A fiche, whole: its parcels grouped by rate, its deductions. For a livreur, only his own. */
  async detail(id: string, courierUserId?: string) {
    const row = await this.prisma.payslip.findUnique({
      where: { id },
      include: {
        courier: {
          select: { userId: true, user: { select: { firstName: true, lastName: true } } },
        },
        parcels: {
          include: { parcel: { select: { code: true, deliveredAt: true } } },
          orderBy: { parcel: { deliveredAt: 'asc' } },
        },
        deductions: {
          include: {
            debt: {
              select: { createdAt: true, caisseSession: { select: { businessDate: true } } },
            },
          },
        },
      },
    });
    if (!row || (courierUserId && row.courier.userId !== courierUserId)) throw ficheIntrouvable();
    const byRate = new Map<string, number>();
    for (const line of row.parcels) {
      const key = line.rateMillimes.toString();
      byRate.set(key, (byRate.get(key) ?? 0) + 1);
    }
    return {
      id: row.id,
      number: row.number,
      livreur: { userId: row.courier.userId, ...row.courier.user },
      payPlan: row.payPlan,
      payPlanLabel: PAY_PLAN_LABELS_FR[row.payPlan],
      period: { start: documentDateKey(row.periodStart), end: documentDateKey(row.periodEnd) },
      parcelCount: row.parcelCount,
      rates: [...byRate.entries()].map(([rate, count]) => ({
        rateMillimes: BigInt(rate),
        count,
        totalMillimes: BigInt(rate) * BigInt(count),
      })),
      grossMillimes: row.grossMillimes,
      deductions: row.deductions.map((line) => ({
        debtId: line.debtId,
        amountMillimes: line.amountMillimes,
        caisseDay: line.debt.caisseSession
          ? documentDateKey(line.debt.caisseSession.businessDate)
          : null,
      })),
      deductionsMillimes: row.deductionsMillimes,
      netMillimes: row.netMillimes,
      status: row.status,
      preparedAt: row.preparedAt,
      paidAt: row.paidAt,
      parcels: row.parcels.map((line) => ({
        code: line.parcel.code,
        deliveredAt: line.parcel.deliveredAt,
        rateMillimes: line.rateMillimes,
      })),
    };
  }

  /** Marquer Payée (Admin 4.12). Asked twice, it answers the same. */
  async markPaid(actor: UserPrincipal, id: string, meta: RequestMeta) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "payslips" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const row = await tx.payslip.findUnique({ where: { id } });
      if (!row) throw ficheIntrouvable();
      if (row.status === 'PAYEE') return;
      await tx.payslip.update({
        where: { id },
        data: { status: 'PAYEE', paidAt: this.clock.now(), paidByUserId: actor.userId },
      });
      await this.audit.record(tx, {
        actor: { userId: actor.userId, role: actor.role },
        action: AuditAction.PAIEMENT_FICHE,
        entityType: 'payslip',
        entityId: id,
        after: { numero: row.number, net: row.netMillimes.toString() },
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
    });
    return this.detail(id);
  }

  /** Changer le plan de paie (A-16, answer 8): from the day after the current period. */
  async changePlan(actor: UserPrincipal, userId: string, plan: PayPlan, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const livreur = await this.livreurOf(tx, userId);
      await tx.$queryRaw`SELECT "id" FROM "couriers" WHERE "id" = ${livreur.courier.id}::uuid FOR UPDATE`;
      const before = scheduleOf(livreur.courier);
      const next = schedulePlanChange(before, plan, this.today());
      await tx.courier.update({
        where: { id: livreur.courier.id },
        data: {
          payPlan: next.plan,
          payPlanSince: next.since,
          pendingPayPlan: next.pendingPlan,
          pendingPayPlanFrom: next.pendingFrom,
        },
      });
      const show = (schedule: PayPlanSchedule) => ({
        plan: schedule.plan,
        depuis: documentDateKey(schedule.since),
        prochain: schedule.pendingPlan,
        aPartirDu: schedule.pendingFrom ? documentDateKey(schedule.pendingFrom) : null,
      });
      await this.audit.record(tx, {
        actor: { userId: actor.userId, role: actor.role },
        action: AuditAction.CHANGEMENT_PLAN_PAIE,
        entityType: 'courier',
        entityId: livreur.courier.id,
        before: show(before),
        after: show(next),
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return {
        payPlan: next.plan,
        pendingPayPlan: next.pendingPlan,
        pendingPayPlanFrom: next.pendingFrom ? documentDateKey(next.pendingFrom) : null,
      };
    });
  }

  /** His debts: en cours first, then the history (Admin 4.15). */
  async debts(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { courier: { select: { id: true } } },
    });
    if (!user?.courier) throw pasUnLivreur();
    const rows = await this.prisma.courierDebt.findMany({
      where: { courierId: user.courier.id },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: { caisseSession: { select: { businessDate: true } } },
    });
    return rows.map((debt) => ({
      id: debt.id,
      status: debt.status,
      amountMillimes: debt.amountMillimes,
      remainingMillimes: debt.remainingMillimes,
      caisseDay: debt.caisseSession ? documentDateKey(debt.caisseSession.businessDate) : null,
      createdAt: debt.createdAt,
      cancelReason: debt.cancelReason,
    }));
  }

  // ── Mes gains (the app) ───────────────────────────────────

  /**
   * Mes gains (Coursier 4.10, D-82): what the next fiche would pay today —
   * his delivered parcels not yet paid × their rates − his debts — the
   * period, the next payment date and his fiches.
   */
  async earnings(actor: UserPrincipal) {
    const user = await this.livreurOf(this.prisma, actor.userId);
    const today = this.today();
    const schedule = scheduleOf(user.courier);
    const period = payPeriodOn(schedule, today);
    const [unpaid, debts, fiches] = await Promise.all([
      this.unpaid(this.prisma, user.courier.id, today),
      this.openDebts(this.prisma, user.courier.id),
      this.payslips({ userId: actor.userId }),
    ]);
    const earnings = currentEarnings(
      unpaid.map((parcel) => parcel.rateMillimes),
      debts.map((debt) => ({
        debtId: debt.id,
        remainingMillimes: debt.remainingMillimes,
        createdAt: debt.createdAt,
      })),
    );
    return {
      payPlan: user.courier.payPlan!,
      pendingPayPlan: user.courier.pendingPayPlan,
      pendingPayPlanFrom: user.courier.pendingPayPlanFrom
        ? documentDateKey(user.courier.pendingPayPlanFrom)
        : null,
      period: periodView(period),
      nextPaymentDate: documentDateKey(nextPaymentDate(period)),
      ...earnings,
      debtsOpenMillimes: sumMillimes(debts.map((debt) => debt.remainingMillimes)),
      fiches: fiches.slice(0, 12),
    };
  }
}
