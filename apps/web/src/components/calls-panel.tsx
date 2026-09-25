'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { callOutcomeLabelFR, logCallSchema } from '@faffago/shared';
import { bff } from '@/lib/client/call';
import type { ApiError, StaffCall } from '@/lib/types';
import { ErrorAlert } from './account-actions';
import { Dialog } from './dialog';

const dateTime = new Intl.DateTimeFormat('fr-TN', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Africa/Tunis',
});

/**
 * Noter un appel (Admin 4.6): answered or not, and a note. The time is the
 * server's. The seller reads it under Appels Faffa Go, as "Faffa Go".
 */
export function LogCallButton({
  code,
  label = 'Noter un appel',
}: {
  code: string;
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [answered, setAnswered] = useState<'' | 'oui' | 'non'>('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  function close() {
    setOpen(false);
    setAnswered('');
    setNote('');
    setError(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const body = { answered: answered === 'oui', ...(note.trim() ? { note: note.trim() } : {}) };
    if (!answered || !logCallSchema.safeParse(body).success) {
      setError({ message: 'Indiquez si le client a répondu.' });
      return;
    }
    setBusy(true);
    const result = await bff<StaffCall>('POST', `colis/${code}/appels`, body);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    close();
    router.refresh();
  }

  return (
    <>
      <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && (
        <Dialog title={`Noter un appel · ${code}`} onDismiss={close}>
          {error && <ErrorAlert error={error} />}
          <form onSubmit={submit} className="space-y-4" noValidate>
            <fieldset>
              <legend className="field-label">Résultat de l’appel</legend>
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="answered"
                    checked={answered === 'oui'}
                    onChange={() => setAnswered('oui')}
                  />
                  {callOutcomeLabelFR(true)}
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="answered"
                    checked={answered === 'non'}
                    onChange={() => setAnswered('non')}
                  />
                  {callOutcomeLabelFR(false)}
                </label>
              </div>
            </fieldset>
            <div>
              <label htmlFor="call-note" className="field-label">
                Note (visible par le vendeur)
              </label>
              <textarea
                id="call-note"
                className="field"
                rows={3}
                maxLength={300}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" className="btn-secondary" onClick={close}>
                Annuler
              </button>
              <button type="submit" className="btn-primary" disabled={busy}>
                Enregistrer l’appel
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}

/** Appels Faffa Go on the Colis page, with who called. */
export function StaffCallsPanel({
  code,
  calls,
  canLog,
}: {
  code: string;
  calls: StaffCall[];
  canLog: boolean;
}) {
  if (calls.length === 0 && !canLog) return null;
  return (
    <section aria-labelledby="appels-title" className="mt-6">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 id="appels-title" className="font-display text-lg font-bold text-navy">
          Appels Faffa Go
        </h2>
        {canLog && <LogCallButton code={code} />}
      </div>
      {calls.length === 0 ? (
        <p className="text-sm text-navy/70">Aucun appel.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {calls.map((call) => (
            <li key={call.id} className="card">
              <p className="font-semibold text-navy">
                {dateTime.format(new Date(call.calledAt))} · {callOutcomeLabelFR(call.answered)} ·{' '}
                {call.staffName}
              </p>
              {call.note && <p className="text-navy/80">{call.note}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
