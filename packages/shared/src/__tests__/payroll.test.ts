import { describe, expect, it } from 'vitest';
import {
  currentEarnings,
  duePayPeriod,
  isPayslipDue,
  nextPaymentDate,
  payPeriodOn,
  payPlanOn,
  schedulePlanChange,
  type PayPlanSchedule,
} from '../payroll.js';
import { PayPlan } from '../statuses.js';

const d = (key: string) => new Date(`${key}T00:00:00.000Z`);
const key = (date: Date) => date.toISOString().slice(0, 10);

const weekly: PayPlanSchedule = {
  plan: PayPlan.HEBDOMADAIRE,
  since: d('2026-01-01'),
  pendingPlan: null,
  pendingFrom: null,
};

describe('payPeriodOn (A-16)', () => {
  it('runs Monday to Sunday for a weekly plan', () => {
    const period = payPeriodOn(weekly, d('2026-09-25')); // a Friday
    expect([key(period.start), key(period.end)]).toEqual(['2026-09-21', '2026-09-27']);
  });

  it('starts a plan’s first period on the day it took effect', () => {
    const since = { ...weekly, since: d('2026-09-23') };
    const period = payPeriodOn(since, d('2026-09-25'));
    expect([key(period.start), key(period.end)]).toEqual(['2026-09-23', '2026-09-27']);
  });
});

describe('schedulePlanChange — the next period, never mid-period (A-16, answer 8)', () => {
  it('takes effect the day after the current period ends', () => {
    const monthly = { ...weekly, plan: PayPlan.MENSUEL };
    const changed = schedulePlanChange(monthly, PayPlan.HEBDOMADAIRE, d('2026-09-10'));
    expect(changed.plan).toBe(PayPlan.MENSUEL);
    expect(changed.pendingPlan).toBe(PayPlan.HEBDOMADAIRE);
    expect(key(changed.pendingFrom!)).toBe('2026-10-01');
  });

  it('gives a first short week when a month ends mid-week (answer 8)', () => {
    const monthly = { ...weekly, plan: PayPlan.MENSUEL };
    const changed = schedulePlanChange(monthly, PayPlan.HEBDOMADAIRE, d('2026-09-10'));
    // 1 October 2026 is a Thursday.
    const first = payPeriodOn(changed, d('2026-10-02'));
    expect([key(first.start), key(first.end)]).toEqual(['2026-10-01', '2026-10-04']);
    const second = payPeriodOn(changed, d('2026-10-07'));
    expect([key(second.start), key(second.end)]).toEqual(['2026-10-05', '2026-10-11']);
  });

  it('ends the old plan’s last period the day before the new one', () => {
    const daily = { ...weekly, plan: PayPlan.JOURNALIER };
    const weeklyToMonthly = schedulePlanChange(weekly, PayPlan.MENSUEL, d('2026-09-23'));
    expect(key(weeklyToMonthly.pendingFrom!)).toBe('2026-09-28');
    const last = payPeriodOn(weeklyToMonthly, d('2026-09-27'));
    expect([key(last.start), key(last.end)]).toEqual(['2026-09-21', '2026-09-27']);
    const first = payPeriodOn(weeklyToMonthly, d('2026-09-29'));
    expect([key(first.start), key(first.end)]).toEqual(['2026-09-28', '2026-09-30']);
    // A daily plan's period is today: the change applies tomorrow.
    expect(key(schedulePlanChange(daily, PayPlan.MENSUEL, d('2026-09-25')).pendingFrom!)).toBe(
      '2026-09-26',
    );
  });

  it('rolls a pending change that has already taken effect before planning the next', () => {
    const pending: PayPlanSchedule = {
      plan: PayPlan.MENSUEL,
      since: d('2026-01-01'),
      pendingPlan: PayPlan.HEBDOMADAIRE,
      pendingFrom: d('2026-10-01'),
    };
    const changed = schedulePlanChange(pending, PayPlan.JOURNALIER, d('2026-10-07'));
    expect(changed).toMatchObject({
      plan: PayPlan.HEBDOMADAIRE,
      pendingPlan: PayPlan.JOURNALIER,
    });
    expect(key(changed.since)).toBe('2026-10-01');
    expect(key(changed.pendingFrom!)).toBe('2026-10-12');
  });

  it('replaces a change still waiting, and choosing the plan in force cancels it', () => {
    const pending: PayPlanSchedule = {
      ...weekly,
      pendingPlan: PayPlan.MENSUEL,
      pendingFrom: d('2026-09-28'),
    };
    expect(schedulePlanChange(pending, PayPlan.JOURNALIER, d('2026-09-24'))).toMatchObject({
      plan: PayPlan.HEBDOMADAIRE,
      pendingPlan: PayPlan.JOURNALIER,
    });
    expect(schedulePlanChange(pending, PayPlan.HEBDOMADAIRE, d('2026-09-24'))).toMatchObject({
      plan: PayPlan.HEBDOMADAIRE,
      pendingPlan: null,
      pendingFrom: null,
    });
  });
});

describe('payPlanOn', () => {
  it('reads the pending plan from its date on', () => {
    const pending: PayPlanSchedule = {
      ...weekly,
      pendingPlan: PayPlan.MENSUEL,
      pendingFrom: d('2026-09-28'),
    };
    expect(payPlanOn(pending, d('2026-09-27')).plan).toBe(PayPlan.HEBDOMADAIRE);
    expect(payPlanOn(pending, d('2026-09-28')).plan).toBe(PayPlan.MENSUEL);
  });
});

describe('duePayPeriod and nextPaymentDate (D-82, answer 7)', () => {
  it('is the period that ended with yesterday or before', () => {
    const period = duePayPeriod(weekly, d('2026-09-28')); // a Monday
    expect([key(period.start), key(period.end)]).toEqual(['2026-09-21', '2026-09-27']);
  });

  it('pays the day after the period ends', () => {
    expect(key(nextPaymentDate(payPeriodOn(weekly, d('2026-09-25'))))).toBe('2026-09-28');
  });
});

describe('isPayslipDue (D-82, answer 7)', () => {
  const period = { start: d('2026-09-21'), end: d('2026-09-27') };

  it('is due once the period is over, with parcels to pay and every caisse closed', () => {
    expect(
      isPayslipDue({
        period,
        today: d('2026-09-28'),
        lastPaidPeriodEnd: d('2026-09-20'),
        unpaidParcels: 12,
        cashStillWithCourier: 0,
      }),
    ).toBe(true);
  });

  it('waits while a parcel of the period still has its cash with him', () => {
    expect(
      isPayslipDue({
        period,
        today: d('2026-09-28'),
        lastPaidPeriodEnd: null,
        unpaidParcels: 12,
        cashStillWithCourier: 1,
      }),
    ).toBe(false);
  });

  it('is not due before the period ends, twice, or with nothing to pay', () => {
    const base = {
      period,
      lastPaidPeriodEnd: null,
      unpaidParcels: 3,
      cashStillWithCourier: 0,
    };
    expect(isPayslipDue({ ...base, today: d('2026-09-27') })).toBe(false);
    expect(
      isPayslipDue({ ...base, today: d('2026-09-28'), lastPaidPeriodEnd: d('2026-09-27') }),
    ).toBe(false);
    expect(isPayslipDue({ ...base, today: d('2026-09-28'), unpaidParcels: 0 })).toBe(false);
  });
});

describe('currentEarnings — Mes gains (Coursier 4.10)', () => {
  it('is parcels livrés at their frozen rate minus debts en cours', () => {
    expect(
      currentEarnings(
        [3500n, 3500n, 4000n],
        [{ debtId: 'd1', remainingMillimes: 5000n, createdAt: d('2026-09-22') }],
      ),
    ).toEqual({
      parcelCount: 3,
      grossMillimes: 11_000n,
      debtsMillimes: 5_000n,
      dueMillimes: 6_000n,
      carriedDebtMillimes: 0n,
    });
  });

  it('never shows a negative amount due: the rest of the debt carries over', () => {
    expect(
      currentEarnings(
        [3500n],
        [{ debtId: 'd1', remainingMillimes: 5000n, createdAt: d('2026-09-22') }],
      ),
    ).toMatchObject({ dueMillimes: 0n, debtsMillimes: 3500n, carriedDebtMillimes: 1500n });
  });
});
