'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  BON_STATUS_LABELS_FR,
  CAISSE_LINE_ORIGIN_LABELS_FR,
  CAISSE_SESSION_STATUS_LABELS_FR,
  ROLE_LABELS_FR,
  caisseCountSchema,
  type BonStatus,
  type Role,
} from '@faffago/shared';
import { bff } from '@/lib/client/call';
import { day, dt, dtInput, ecart, when } from '@/lib/money';
import type { CaisseSession } from '@/lib/types';

/**
 * One courier's caisse for one day (Admin 4.9, D-79): the parcels he
 * delivered (a scan tardif marked), the bons he took out, Compter —
 * recounted until closed — and Clôturer.
 */
export function CaisseSessionScreen({ session }: { session: CaisseSession }) {
  const router = useRouter();
  const [counted, setCounted] = useState(
    session.countedMillimes ? dtInput(session.countedMillimes) : '',
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const closed = session.status === 'CLOTUREE';
  const base = `caisse/${session.courier.userId}/${session.day}`;

  async function count(event: FormEvent) {
    event.preventDefault();
    const parsed = caisseCountSchema.safeParse({ counted });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Montant invalide');
      return;
    }
    setBusy(true);
    setError(null);
    const response = await bff('POST', `${base}/compter`, { counted });
    setBusy(false);
    if (!response.ok) setError(response.error.message);
    router.refresh();
  }

  async function close() {
    setBusy(true);
    setError(null);
    const response = await bff('POST', `${base}/cloturer`);
    setBusy(false);
    if (!response.ok) setError(response.error.message);
    router.refresh();
  }

  return (
    <section>
      <p className="mb-2 text-sm">
        <Link href={`/admin/caisse?date=${session.day}`} className="text-orange-dark underline">
          ← Caisse du {day(session.day)}
        </Link>
      </p>
      <h1 className="mb-1 font-display text-2xl font-bold text-navy">
        {session.courier.firstName} {session.courier.lastName}
      </h1>
      <p className="mb-4 text-sm text-navy/70">
        {ROLE_LABELS_FR[session.courier.role as Role]} · journée du {day(session.day)} ·{' '}
        <strong>{CAISSE_SESSION_STATUS_LABELS_FR[session.status]}</strong>
        {session.countedAt && ` · compté le ${when(session.countedAt)}`}
        {session.closedAt && ` · clôturé le ${when(session.closedAt)}`}
      </p>

      <dl className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Figure label="Livraisons" value={dt(session.expected.deliveryMillimes)} />
        <Figure label="Argent des bons" value={dt(session.expected.bonCashMillimes)} />
        <Figure label="Attendu" value={dt(session.expected.totalMillimes)} strong />
        <Figure label="Écart" value={ecart(session.ecartMillimes)} />
      </dl>

      {!closed && (
        <form onSubmit={count} className="card mb-4 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="compte" className="field-label">
              Montant compté (DT)
            </label>
            <input
              id="compte"
              className="field"
              inputMode="decimal"
              placeholder="85,000"
              value={counted}
              onChange={(event) => setCounted(event.target.value)}
            />
          </div>
          <button type="submit" className="btn-secondary" disabled={busy}>
            {session.status === 'COMPTEE' ? 'Recompter' : 'Compter'}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy || session.status !== 'COMPTEE'}
            onClick={close}
          >
            Clôturer
          </button>
          <p className="w-full text-sm text-navy/70">
            À la clôture, l’argent des colis passe « Au dépôt ».{' '}
            {session.courier.role === 'LIVREUR'
              ? 'Un manque devient une dette, déduite de sa paie.'
              : 'Un manque est signalé aux RH ; les bons non remis reviennent au dépôt.'}
          </p>
        </form>
      )}
      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-900">
          {error}
        </p>
      )}
      {closed && session.debt && (
        <p className="mb-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          Dette créée : {dt(session.debt.amountMillimes)}, déduite de sa prochaine paie.
        </p>
      )}
      {closed && session.ecartFlagged && (
        <p className="mb-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          Écart positif{' '}
          {session.ecartCheckedAt ? `vérifié : ${session.ecartNote}` : 'à vérifier par l’admin'}.
        </p>
      )}

      {session.lines.length > 0 && (
        <section className="card mb-4">
          <h2 className="mb-2 font-display text-lg font-bold text-navy">
            Colis livrés ({session.lines.length})
          </h2>
          <ul className="divide-y divide-navy/10 text-sm">
            {session.lines.map((line) => (
              <li key={line.parcelId} className="flex justify-between gap-2 py-2">
                <span>
                  <Link
                    href={`/admin/colis/${line.code}`}
                    className="font-mono text-orange-dark underline"
                  >
                    {line.code}
                  </Link>{' '}
                  · {line.shopName}
                  {line.origin === 'TARDIF' && (
                    <span className="ml-2 rounded bg-amber-100 px-1 text-xs text-amber-900">
                      {CAISSE_LINE_ORIGIN_LABELS_FR.TARDIF} · livré le {day(line.scanDay)}
                    </span>
                  )}
                </span>
                <span>{dt(line.codMillimes)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {session.bons.length > 0 && (
        <section className="card mb-4">
          <h2 className="mb-2 font-display text-lg font-bold text-navy">
            Bons de versement emportés
          </h2>
          <ul className="divide-y divide-navy/10 text-sm">
            {session.bons.map((bon) => (
              <li key={bon.bonVersementId} className="flex justify-between gap-2 py-2">
                <span>
                  {bon.number} · {bon.shopName} · {BON_STATUS_LABELS_FR[bon.status as BonStatus]}
                </span>
                <span>
                  {dt(bon.takenOutMillimes)}
                  {bon.remisMillimes !== '0' && ' · remis'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {session.bonsRetourEnRoute.length > 0 && (
        <section className="card mb-4">
          <h2 className="mb-2 font-display text-lg font-bold text-navy">Bons de retour en route</h2>
          <ul className="text-sm">
            {session.bonsRetourEnRoute.map((bon) => (
              <li key={bon.number}>
                {bon.number} · {bon.shopName} · {bon.pendingLines} article(s) non remis : ils
                reviennent au dépôt à la clôture
              </li>
            ))}
          </ul>
        </section>
      )}
      {session.lines.length === 0 && session.bons.length === 0 && (
        <p className="card text-sm text-navy/70">Rien à compter pour cette journée.</p>
      )}
    </section>
  );
}

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`card flex flex-col-reverse gap-1 ${strong ? 'border-2 border-orange' : ''}`}>
      <dt className="text-sm font-semibold text-navy/70">{label}</dt>
      <dd className="font-display text-xl font-bold text-navy">{value}</dd>
    </div>
  );
}
