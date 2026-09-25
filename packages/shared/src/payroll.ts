import { buildPayslip, payPeriodFor, type PayPeriod, type PayslipDebtInput } from './fees.js';
import type { Millimes } from './money.js';
import { z } from 'zod';
import { PayPlan as PayPlanEnum, type PayPlan } from './statuses.js';

/**
 * Livreur pay over time (Admin 4.12, A-16, D-82): which plan is in force on a
 * day, the period that day belongs to, and when a fiche is due. Days are
 * UTC-midnight Dates of the Tunis business day, like `businessDateOf`.
 */

export interface PayPlanSchedule {
  /** The plan in force since `since`. */
  plan: PayPlan;
  since: Date;
  /** A change waiting for the next period (A-16), from `pendingFrom` on. */
  pendingPlan: PayPlan | null;
  pendingFrom: Date | null;
}

const DAY_MS = 86_400_000;

function addDays(day: Date, days: number): Date {
  return new Date(day.getTime() + days * DAY_MS);
}

function later(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

function earlier(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}

/** The plan in force on a day, and since when. */
export function payPlanOn(schedule: PayPlanSchedule, day: Date): { plan: PayPlan; since: Date } {
  if (schedule.pendingPlan && schedule.pendingFrom && day >= schedule.pendingFrom) {
    return { plan: schedule.pendingPlan, since: schedule.pendingFrom };
  }
  return { plan: schedule.plan, since: schedule.since };
}

/**
 * The period a day belongs to: the calendar period of the plan in force,
 * starting no earlier than that plan and ending before a pending one takes
 * over. A plan that starts mid-week gives a short first week (answer 8).
 */
export function payPeriodOn(schedule: PayPlanSchedule, day: Date): PayPeriod {
  const { plan, since } = payPlanOn(schedule, day);
  const calendar = payPeriodFor(plan, day);
  let end = calendar.end;
  if (schedule.pendingPlan && schedule.pendingFrom && day < schedule.pendingFrom) {
    end = earlier(end, addDays(schedule.pendingFrom, -1));
  }
  return { start: later(calendar.start, since), end };
}

/** A pending change whose day has come becomes the plan in force. */
function rolled(schedule: PayPlanSchedule, today: Date): PayPlanSchedule {
  if (schedule.pendingPlan && schedule.pendingFrom && schedule.pendingFrom <= today) {
    return {
      plan: schedule.pendingPlan,
      since: schedule.pendingFrom,
      pendingPlan: null,
      pendingFrom: null,
    };
  }
  return schedule;
}

/**
 * The admin changes a livreur's plan: it takes effect the day after the
 * current period ends, never mid-period (A-16, answer 8). A change still
 * waiting is replaced; choosing the plan in force cancels it.
 */
export function schedulePlanChange(
  schedule: PayPlanSchedule,
  newPlan: PayPlan,
  today: Date,
): PayPlanSchedule {
  const current = rolled(schedule, today);
  const base = { plan: current.plan, since: current.since };
  if (newPlan === current.plan) return { ...base, pendingPlan: null, pendingFrom: null };
  const period = payPeriodOn({ ...base, pendingPlan: null, pendingFrom: null }, today);
  return { ...base, pendingPlan: newPlan, pendingFrom: addDays(period.end, 1) };
}

/** The period that ended with yesterday: the one the Paie coursiers screen pays today. */
export function duePayPeriod(schedule: PayPlanSchedule, today: Date): PayPeriod {
  return payPeriodOn(schedule, addDays(today, -1));
}

/** Paid the day after the period ends (Coursier 4.10). */
export function nextPaymentDate(period: PayPeriod): Date {
  return addDays(period.end, 1);
}

/**
 * A fiche is due once the period is over, not yet paid, with parcels to pay
 * and none of them with its cash still with him (D-82, answer 7).
 */
export function isPayslipDue(input: {
  period: PayPeriod;
  today: Date;
  lastPaidPeriodEnd: Date | null;
  /** Delivered, not on a fiche, delivered on or before the period's end. */
  unpaidParcels: number;
  /** Of those, the ones whose caisse is not closed yet. */
  cashStillWithCourier: number;
}): boolean {
  if (input.today <= input.period.end) return false;
  if (input.lastPaidPeriodEnd && input.lastPaidPeriodEnd >= input.period.end) return false;
  return input.unpaidParcels > 0 && input.cashStillWithCourier === 0;
}

export interface CurrentEarnings {
  parcelCount: number;
  grossMillimes: Millimes;
  /** What the debts en cours take from it, oldest first. */
  debtsMillimes: Millimes;
  dueMillimes: Millimes;
  /** Debt that does not fit, carried to the next period. */
  carriedDebtMillimes: Millimes;
}

/**
 * Mes gains (Coursier 4.10): parcels livrés × their frozen rates − debts =
 * amount due, computed exactly as the fiche will be (`buildPayslip`).
 */
export function currentEarnings(
  rates: readonly Millimes[],
  debts: readonly PayslipDebtInput[],
): CurrentEarnings {
  const slip = buildPayslip(
    rates.map((courierRateMillimes, index) => ({ parcelId: String(index), courierRateMillimes })),
    debts,
  );
  return {
    parcelCount: slip.parcelCount,
    grossMillimes: slip.grossMillimes,
    debtsMillimes: slip.deductionsMillimes,
    dueMillimes: slip.netMillimes,
    carriedDebtMillimes: slip.carriedDebtMillimes,
  };
}

// ── Forms ───────────────────────────────────────────────────

/** Préparer la fiche of a livreur's period due (D-82). */
export const preparePayslipSchema = z.object({ livreurId: z.string().uuid() }).strict();
export type PreparePayslipValues = z.output<typeof preparePayslipSchema>;

/** Changer le plan de paie: from the next period (A-16). */
export const changePayPlanSchema = z.object({ payPlan: z.nativeEnum(PayPlanEnum) }).strict();
export type ChangePayPlanValues = z.output<typeof changePayPlanSchema>;
