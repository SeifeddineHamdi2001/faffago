'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import {
  DEBT_STATUS_LABELS_FR,
  PAY_PLAN_LABELS_FR,
  PAYSLIP_STATUS_LABELS_FR,
  PayPlan,
  type PayPlan as PayPlanT,
} from '@faffago/shared';
import { bff } from '@/lib/client/call';
import { day, dt } from '@/lib/money';
import type { CourierDebtRow, PayrollRow, PayslipRow } from '@/lib/types';
import { Dialog } from './dialog';

/**
 * Paie coursiers (Admin 4.12, D-82): each livreur's period due, what the fiche
 * would pay at the frozen rates less his debts, Préparer la fiche, the plan
 * change from the next period (A-16), his debts; then the fiches to pay.
 */
export function PayrollScreen({ rows, payslips }: { rows: PayrollRow[]; payslips: PayslipRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [debtsOf, setDebtsOf] = useState<PayrollRow | null>(null);

  async function call(method: 'POST' | 'PATCH', path: string, body?: unknown) {
    setError(null);
    const response = await bff(method, path, body);
    if (!response.ok) setError(response.error.message);
    router.refresh();
  }

  return (
    <section>
      <h1 className="mb-4 font-display text-2xl font-bold text-navy">Paie coursiers</h1>
      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-900">
          {error}
        </p>
      )}
      <div className="space-y-3">
        {rows.length === 0 && <p className="card text-sm text-navy/70">Aucun livreur.</p>}
        {rows.map((row) => (
          <article
            key={row.livreur.userId}
            className={`card ${row.due ? 'border-2 border-orange' : ''}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-navy">
                  {row.livreur.firstName} {row.livreur.lastName}
                  {!row.livreur.isActive && (
                    <span className="ml-2 text-sm text-navy/70">(inactif)</span>
                  )}
                </h2>
                <p className="text-sm text-navy/70">
                  Plan {PAY_PLAN_LABELS_FR[row.payPlan as PayPlanT]}
                  {row.pendingPayPlan &&
                    ` · ${PAY_PLAN_LABELS_FR[row.pendingPayPlan as PayPlanT]} à partir du ${day(row.pendingPayPlanFrom)}`}
                </p>
                <p className="text-sm">
                  Période due : du {day(row.duePeriod.start)} au {day(row.duePeriod.end)} ·{' '}
                  {row.parcelCount} colis · brut {dt(row.grossMillimes)} − dettes{' '}
                  {dt(row.deductionsMillimes)} = <strong>{dt(row.netMillimes)}</strong>
                </p>
                {row.cashWithCourierCount > 0 && (
                  <p className="text-sm text-amber-800">
                    {row.cashWithCourierCount} colis dont la caisse n’est pas clôturée : la fiche
                    attend.
                  </p>
                )}
                {row.debtsMillimes !== '0' && (
                  <p className="text-sm">Dettes en cours : {dt(row.debtsMillimes)}</p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor={`plan-${row.livreur.userId}`}>
                  Plan de paie
                </label>
                <select
                  id={`plan-${row.livreur.userId}`}
                  className="field"
                  defaultValue={row.pendingPayPlan ?? row.payPlan}
                  onChange={(event) =>
                    call('PATCH', `paie/livreurs/${row.livreur.userId}/plan`, {
                      payPlan: event.target.value,
                    })
                  }
                >
                  {Object.values(PayPlan).map((plan) => (
                    <option key={plan} value={plan}>
                      {PAY_PLAN_LABELS_FR[plan]}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn-secondary" onClick={() => setDebtsOf(row)}>
                  Dettes
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!row.due}
                  onClick={() => call('POST', 'paie/fiches', { livreurId: row.livreur.userId })}
                >
                  Préparer la fiche
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      <section className="card mt-6">
        <h2 className="mb-2 font-display text-lg font-bold text-navy">Fiches de paie</h2>
        {payslips.length === 0 ? (
          <p className="text-sm text-navy/70">Aucune fiche.</p>
        ) : (
          <ul className="divide-y divide-navy/10 text-sm">
            {payslips.map((slip) => (
              <li key={slip.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <strong>{slip.number}</strong> · {slip.livreur.firstName} {slip.livreur.lastName}{' '}
                  · du {day(slip.period.start)} au {day(slip.period.end)} · {slip.parcelCount} colis
                  · net {dt(slip.netMillimes)} · {PAYSLIP_STATUS_LABELS_FR[slip.status]}
                </span>
                <span className="flex gap-2">
                  <a
                    href={`/api/bff/paie/fiches/${slip.id}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-secondary"
                  >
                    Imprimer
                  </a>
                  {slip.status === 'A_PAYER' && (
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => call('POST', `paie/fiches/${slip.id}/payer`)}
                    >
                      Marquer payée
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {debtsOf && <DebtsDialog row={debtsOf} onClose={() => setDebtsOf(null)} />}
    </section>
  );
}

/** His debts; the admin cancels one with a note (Admin rule 5). */
function DebtsDialog({ row, onClose }: { row: PayrollRow; onClose: () => void }) {
  const router = useRouter();
  const [debts, setDebts] = useState<CourierDebtRow[] | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    void bff<CourierDebtRow[]>('GET', `paie/livreurs/${row.livreur.userId}/dettes`).then(
      (response) => {
        if (!live) return;
        if (response.ok) setDebts(response.data);
        else setError(response.error.message);
      },
    );
    return () => {
      live = false;
    };
  }, [row.livreur.userId, version]);

  async function cancel(event: FormEvent) {
    event.preventDefault();
    const response = await bff('POST', `paie/dettes/${cancelling}/annuler`, { note });
    if (!response.ok) {
      setError(response.error.message);
      return;
    }
    setCancelling(null);
    setNote('');
    setVersion((v) => v + 1);
    router.refresh();
  }

  return (
    <Dialog title={`Dettes de ${row.livreur.firstName}`} onDismiss={onClose}>
      {debts === null && !error && <p className="text-sm">Chargement…</p>}
      {debts?.length === 0 && <p className="text-sm text-navy/70">Aucune dette.</p>}
      <ul className="mb-3 divide-y divide-navy/10 text-sm">
        {debts?.map((debt) => (
          <li key={debt.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>
              {debt.caisseDay ? `Caisse du ${day(debt.caisseDay)}` : 'Dette'} ·{' '}
              {dt(debt.amountMillimes)} · reste {dt(debt.remainingMillimes)} ·{' '}
              {DEBT_STATUS_LABELS_FR[debt.status]}
              {debt.cancelReason && ` : ${debt.cancelReason}`}
            </span>
            {debt.status === 'EN_COURS' && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setCancelling(debt.id)}
              >
                Annuler
              </button>
            )}
          </li>
        ))}
      </ul>
      {cancelling && (
        <form onSubmit={cancel} className="space-y-2">
          <label htmlFor="dette-note" className="field-label">
            Note
          </label>
          <textarea
            id="dette-note"
            className="field"
            required
            minLength={5}
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <button type="submit" className="btn-primary">
            Annuler la dette
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <button type="button" className="btn-secondary mt-3" onClick={onClose}>
        Fermer
      </button>
    </Dialog>
  );
}
