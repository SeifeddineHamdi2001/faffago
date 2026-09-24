'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import {
  CHANGE_REQUEST_FIELD_LABELS_FR,
  CHANGE_REQUEST_STATUS_LABELS_FR,
  Permission,
  type ChangeRequestField,
  type ChangeRequestStatus,
} from '@faffago/shared';
import { bff } from '@/lib/client/call';
import type { ChangeRequestRow } from '@/lib/types';
import { Dialog } from './dialog';

const dateTime = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Africa/Tunis',
  dateStyle: 'short',
  timeStyle: 'short',
});

/**
 * A parcel's change requests on its Colis page (Vendeur 4.6, D-44, D-57):
 * each field asked, now and after. Service client and Admin apply a waiting
 * request as a whole, or refuse it with a reason the seller reads; the other
 * roles read.
 */
export function ChangeRequestsPanel({
  requests,
  permissions,
}: {
  requests: ChangeRequestRow[];
  permissions: Permission[];
}) {
  const router = useRouter();
  const canAct = permissions.includes(Permission.DEMANDES_VENDEUR);
  const [refusing, setRefusing] = useState<ChangeRequestRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function apply(request: ChangeRequestRow) {
    setBusy(true);
    setError(null);
    const response = await bff('POST', `demandes-modification/${request.id}/apply`);
    setBusy(false);
    if (!response.ok) {
      setError(response.error.message);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      {error && (
        <p role="alert" className="mb-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <ul className="space-y-2">
        {requests.map((request) => (
          <li key={request.id} className="card text-sm">
            <p className="font-semibold text-navy">
              {CHANGE_REQUEST_STATUS_LABELS_FR[request.status as ChangeRequestStatus]} ·{' '}
              {dateTime.format(new Date(request.createdAt))}
            </p>
            <ul className="mt-1">
              {request.fields.map((f) => (
                <li key={f.field}>
                  {CHANGE_REQUEST_FIELD_LABELS_FR[f.field as ChangeRequestField]} :{' '}
                  {f.before !== null ? `${f.before || '—'} → ${f.after ?? '—'}` : f.after}
                </li>
              ))}
            </ul>
            {request.sellerNote && <p className="mt-1 italic">« {request.sellerNote} »</p>}
            {request.refusalReason && <p className="mt-1">Raison : {request.refusalReason}</p>}
            {request.status === 'EN_ATTENTE' && request.applyRefusalMessage && (
              <p className="mt-1 text-amber-900">{request.applyRefusalMessage}</p>
            )}
            {canAct && request.status === 'EN_ATTENTE' && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busy || request.applyRefusal !== null}
                  onClick={() => void apply(request)}
                >
                  Appliquer
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setError(null);
                    setRefusing(request);
                  }}
                >
                  Refuser
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {refusing && (
        <RefuseDialog
          request={refusing}
          onClose={() => setRefusing(null)}
          onDone={() => {
            setRefusing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function RefuseDialog({
  request,
  onClose,
  onDone,
}: {
  request: ChangeRequestRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const reasonId = useId();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const response = await bff('POST', `demandes-modification/${request.id}/refuse`, {
      reason: reason.trim(),
    });
    setBusy(false);
    if (response.ok) onDone();
    else setError(response.error.issues?.[0]?.message ?? response.error.message);
  }

  return (
    <Dialog title="Refuser la demande" onDismiss={onClose}>
      <form onSubmit={submit} noValidate className="space-y-3">
        <p className="text-sm text-navy/80">Le vendeur lira cette raison.</p>
        <div>
          <label htmlFor={reasonId} className="field-label">
            Raison
          </label>
          <textarea
            id={reasonId}
            className="field"
            rows={3}
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Fermer
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            Refuser
          </button>
        </div>
      </form>
    </Dialog>
  );
}
