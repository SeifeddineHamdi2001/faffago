'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { formatTunisDay, tunisDayKey } from '@faffago/shared';
import { bff } from '@/lib/client/call';
import type { AbsenceRow, ApiError, CourierRow } from '@/lib/types';

interface AbsenceResult {
  absence: AbsenceRow;
  pickupsMoved: { id: string; shopName: string; ramasseur: { id: string; firstName: string } }[];
  pickupsNotMoved: { id: string; shopName: string }[];
}

/**
 * Absences (Admin 4.5, 4.15, D-52): the days to come a courier is marked
 * absent, marking another and removing one. Admin and Dépôt act; the
 * Service client only reads the "Absent aujourd'hui" badge on the list.
 * A ramasseur's pickups planned that day move to his zone's backup; those
 * nobody could take are listed to re-plan.
 */
export function CourierAbsencesDialog({
  courier,
  onClose,
}: {
  courier: CourierRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const dayId = useId();
  const reasonId = useId();
  const [absences, setAbsences] = useState<AbsenceRow[] | null>(null);
  const [date, setDate] = useState(() => tunisDayKey(new Date()));
  const [reason, setReason] = useState('');
  const [result, setResult] = useState<AbsenceResult | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const name = `${courier.firstName} ${courier.lastName}`;

  async function load() {
    const response = await bff<AbsenceRow[]>('GET', `couriers/${courier.id}/absences`);
    if (response.ok) setAbsences(response.data);
    else setError(response.error);
  }

  useEffect(() => {
    void load();
    // Loaded once when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function mark(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setResult(null);
    setBusy(true);
    const response = await bff<AbsenceResult>('POST', `couriers/${courier.id}/absences`, {
      date,
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    });
    setBusy(false);
    if (!response.ok) {
      setError(response.error);
      return;
    }
    setResult(response.data);
    setReason('');
    router.refresh();
    await load();
  }

  async function remove(day: string) {
    setError(null);
    setResult(null);
    const response = await bff('DELETE', `couriers/${courier.id}/absences/${day}`);
    if (!response.ok) {
      setError(response.error);
      return;
    }
    router.refresh();
    await load();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/60 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Absences de ${name}`}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
        className="max-h-full w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
      >
        <h2 className="mb-4 font-display text-lg font-bold text-navy">Absences de {name}</h2>

        <h3 className="field-label">Absences prévues</h3>
        {absences === null ? (
          <p className="mb-4 text-sm text-navy/70">Chargement…</p>
        ) : absences.length === 0 ? (
          <p className="mb-4 text-sm text-navy/70">Aucune absence prévue.</p>
        ) : (
          <ul className="mb-4 space-y-2">
            {absences.map((absence) => (
              <li key={absence.date} className="flex items-center justify-between gap-3 text-sm">
                <span>
                  <span className="font-semibold">{formatTunisDay(absence.date)}</span>
                  {absence.reason && <span className="text-navy/70"> · {absence.reason}</span>}
                </span>
                <button
                  type="button"
                  className="btn-secondary"
                  aria-label={`Retirer le ${formatTunisDay(absence.date)}`}
                  onClick={() => remove(absence.date)}
                >
                  Retirer
                </button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={mark} noValidate className="space-y-3 border-t border-navy/10 pt-4">
          <div>
            <label htmlFor={dayId} className="field-label">
              Jour
            </label>
            <input
              id={dayId}
              type="date"
              className="field"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor={reasonId} className="field-label">
              Motif (facultatif)
            </label>
            <input
              id={reasonId}
              className="field"
              value={reason}
              maxLength={200}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <p className="text-sm text-navy/70">Ce jour-là, ses zones passent à leur backup.</p>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error.issues?.[0]?.message ?? error.message}
            </p>
          )}
          {result && (
            <div role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-900">
              <p className="font-semibold">Absent le {formatTunisDay(result.absence.date)}.</p>
              {result.pickupsMoved.length + result.pickupsNotMoved.length > 0 && (
                <ul className="mt-1 list-disc pl-5">
                  {result.pickupsMoved.map((pickup) => (
                    <li key={pickup.id}>
                      {pickup.shopName} : ramassage confié à {pickup.ramasseur.firstName}
                    </li>
                  ))}
                  {result.pickupsNotMoved.map((pickup) => (
                    <li key={pickup.id}>
                      {pickup.shopName} : aucun backup disponible, à replanifier
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Fermer
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              Marquer absent
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
