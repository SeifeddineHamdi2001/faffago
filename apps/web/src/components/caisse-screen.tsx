'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { CAISSE_SESSION_STATUS_LABELS_FR, ROLE_LABELS_FR, type Role } from '@faffago/shared';
import { bff } from '@/lib/client/call';
import { day, dt, ecart } from '@/lib/money';
import type { CaisseEcartRow, CaisseEcarts, CaisseSummary } from '@/lib/types';
import { Dialog } from './dialog';

const STATUS_STYLE = {
  OUVERTE: 'bg-amber-100 text-amber-900',
  COMPTEE: 'bg-blue-100 text-blue-900',
  CLOTUREE: 'bg-green-100 text-green-900',
} as const;

/**
 * Caisse, the day (Admin 4.9, D-79, answer 1): every courier with money that
 * day — counted, closed or still open — with the totals; each opens his
 * session. The admin also sees the écarts left to look at.
 */
export function CaisseScreen({
  summary,
  today,
  ecarts,
}: {
  summary: CaisseSummary;
  today: string;
  /** The admin's list (CAISSE_ECARTS); null for Dépôt. */
  ecarts: CaisseEcarts | null;
}) {
  const { rows, totals } = summary;
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-navy">Caisse</h1>
        <Link href="/admin/caisse/depart" className="btn-primary">
          Départ ramasseur
        </Link>
      </div>

      <form
        method="get"
        action="/admin/caisse"
        className="card mb-4 flex flex-wrap items-end gap-3"
      >
        <div>
          <label htmlFor="date" className="field-label">
            Journée
          </label>
          <input
            id="date"
            name="date"
            type="date"
            className="field"
            defaultValue={summary.day}
            max={today}
          />
        </div>
        <button type="submit" className="btn-secondary">
          Afficher
        </button>
      </form>

      <h2 className="mb-2 font-display text-lg font-bold text-navy">
        Journée du {day(summary.day)}
      </h2>
      <dl className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Tile label="Attendu" value={dt(totals.expectedMillimes)} />
        <Tile label="Compté" value={dt(totals.countedMillimes)} />
        <Tile label="Écart" value={ecart(totals.ecartMillimes)} />
        <Tile label="Clôturées" value={`${totals.byStatus.CLOTUREE} / ${rows.length}`} />
        <Tile
          label="Encore ouvertes"
          value={String(totals.byStatus.OUVERTE + totals.byStatus.COMPTEE)}
        />
      </dl>

      {rows.length === 0 ? (
        <p className="card text-sm text-navy/70">
          Aucun coursier n’a d’argent à remettre ce jour-là.
        </p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-navy/70">
              <tr>
                <th className="py-2">Coursier</th>
                <th>Colis</th>
                <th>Bons</th>
                <th className="text-right">Attendu</th>
                <th className="text-right">Compté</th>
                <th className="text-right">Écart</th>
                <th>État</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy/10">
              {rows.map((row) => (
                <tr key={row.courier.userId}>
                  <td className="py-2">
                    <Link
                      href={`/admin/caisse/${row.courier.userId}/${summary.day}`}
                      className="font-semibold text-orange-dark underline"
                    >
                      {row.courier.firstName} {row.courier.lastName}
                    </Link>
                    <span className="block text-navy/70">
                      {ROLE_LABELS_FR[row.courier.role as Role]}
                    </span>
                  </td>
                  <td>
                    {row.parcelCount}
                    {row.lateCount > 0 && (
                      <span className="ml-1 rounded bg-amber-100 px-1 text-xs text-amber-900">
                        {row.lateCount} tardif{row.lateCount > 1 ? 's' : ''}
                      </span>
                    )}
                  </td>
                  <td>{row.bonCount}</td>
                  <td className="text-right">{dt(row.expectedMillimes)}</td>
                  <td className="text-right">{dt(row.countedMillimes)}</td>
                  <td className="text-right">{ecart(row.ecartMillimes)}</td>
                  <td>
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[row.status]}`}
                    >
                      {CAISSE_SESSION_STATUS_LABELS_FR[row.status]}
                    </span>
                    {row.ecartFlagged && !row.ecartChecked && (
                      <span className="ml-1 text-xs font-semibold text-red-700">À vérifier</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {summary.day === today && (
        <p className="mt-2 text-sm text-navy/70">
          Un Livré synchronisé après la clôture de sa journée est compté dans la caisse du jour,
          signalé « scan tardif ».
        </p>
      )}

      {ecarts && <Ecarts ecarts={ecarts} />}
    </section>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="card flex flex-col-reverse gap-1">
      <dt className="text-sm font-semibold text-navy/70">{label}</dt>
      <dd className="font-display text-xl font-bold text-navy">{value}</dd>
    </div>
  );
}

/** Admin only: surpluses to check with a note (answer 3), ramasseur shortfalls for HR. */
function Ecarts({ ecarts }: { ecarts: CaisseEcarts }) {
  const router = useRouter();
  const [checking, setChecking] = useState<CaisseEcartRow | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!checking) return;
    setBusy(true);
    setError(null);
    const response = await bff('POST', `caisse/sessions/${checking.sessionId}/verifier-ecart`, {
      note,
    });
    setBusy(false);
    if (!response.ok) {
      setError(response.error.message);
      return;
    }
    setChecking(null);
    setNote('');
    router.refresh();
  }

  return (
    <>
      <section className="card mt-6">
        <h2 className="mb-2 font-display text-lg font-bold text-navy">
          Écarts positifs à vérifier ({ecarts.aVerifier.length})
        </h2>
        {ecarts.aVerifier.length === 0 ? (
          <p className="text-sm text-navy/70">Aucun écart positif en attente.</p>
        ) : (
          <ul className="divide-y divide-navy/10 text-sm">
            {ecarts.aVerifier.map((row) => (
              <li
                key={row.sessionId}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <span>
                  {row.courier.firstName} {row.courier.lastName} · {day(row.day)} · écart{' '}
                  <strong>{ecart(row.ecartMillimes)}</strong>
                </span>
                <button type="button" className="btn-secondary" onClick={() => setChecking(row)}>
                  Vérifier
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card mt-4">
        <h2 className="mb-2 font-display text-lg font-bold text-navy">
          Écarts des ramasseurs, pour les RH
        </h2>
        {ecarts.ramasseurs.length === 0 ? (
          <p className="text-sm text-navy/70">Aucun manque.</p>
        ) : (
          <ul className="divide-y divide-navy/10 text-sm">
            {ecarts.ramasseurs.map((row) => (
              <li key={row.sessionId} className="py-2">
                {row.courier.firstName} {row.courier.lastName} · {day(row.day)} · manque{' '}
                <strong>{ecart(row.ecartMillimes)}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card mt-4">
        <h2 className="mb-2 font-display text-lg font-bold text-navy">
          Bons corrigés après clôture, non couverts par un surplus (RH)
        </h2>
        {ecarts.bonsCorriges.length === 0 ? (
          <p className="text-sm text-navy/70">Aucun manque.</p>
        ) : (
          <ul className="divide-y divide-navy/10 text-sm">
            {ecarts.bonsCorriges.map((row) => (
              <li key={row.correctionId} className="py-2">
                {row.courier ? `${row.courier.firstName} ${row.courier.lastName}` : '—'}
                {row.day && ` · ${day(row.day)}`} · {row.bonNumber} · manque{' '}
                <strong>{dt(row.shortfallMillimes)}</strong>
                <span className="block text-navy/70">{row.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {checking && (
        <Dialog title="Vérifier l’écart" onDismiss={() => setChecking(null)}>
          <form onSubmit={submit} className="space-y-3">
            <p className="text-sm">
              {checking.courier.firstName} {checking.courier.lastName} · {day(checking.day)} · écart{' '}
              {ecart(checking.ecartMillimes)}. Le coursier n’est pas crédité.
            </p>
            <label htmlFor="note-ecart" className="field-label">
              Note
            </label>
            <textarea
              id="note-ecart"
              className="field"
              required
              minLength={5}
              maxLength={500}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <button type="submit" className="btn-primary" disabled={busy}>
                Marquer comme vérifié
              </button>
              <button type="button" className="btn-secondary" onClick={() => setChecking(null)}>
                Annuler
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
