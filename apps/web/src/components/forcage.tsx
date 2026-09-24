'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import {
  PARCEL_LOCATION_LABELS_FR,
  PARCEL_STATUS_LABELS_FR,
  Permission,
  forcedTargets,
  targetNeedsLivreur,
  type ParcelLocation,
  type ParcelState,
  type ParcelStatus,
} from '@faffago/shared';
import { bff } from '@/lib/client/call';
import type { ApiError } from '@/lib/types';
import { Dialog } from './dialog';

interface Livreur {
  id: string;
  firstName: string;
  lastName: string;
}

function stateLabel(state: ParcelState): string {
  return `${PARCEL_STATUS_LABELS_FR[state.status]} · ${PARCEL_LOCATION_LABELS_FR[state.location]}`;
}

function messageOf(error: ApiError): string {
  return error.issues?.[0]?.message ?? error.message;
}

/**
 * Forcer un statut (Admin 4.3, D-56): the admin corrects a scanning mistake,
 * with a reason, audited. Only the moves phase 5 allows are offered; the API
 * checks them again.
 */
export function ForcerStatut({
  code,
  current,
  livreurs,
  permissions,
}: {
  code: string;
  current: { status: string; location: string };
  livreurs: Livreur[];
  permissions: Permission[];
}) {
  const router = useRouter();
  const ids = { target: useId(), livreur: useId(), reason: useId() };
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState('');
  const [livreurId, setLivreurId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!permissions.includes(Permission.FORCER_STATUT)) return null;
  const targets = forcedTargets({
    status: current.status as ParcelStatus,
    location: current.location as ParcelLocation,
  });
  if (targets.length === 0) {
    return (
      <p className="text-sm text-navy/70">Aucune correction de statut possible pour ce colis.</p>
    );
  }
  const chosen = targets.find((t) => `${t.status}|${t.location}` === target);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!chosen) {
      setError('Choisissez le nouvel état');
      return;
    }
    setBusy(true);
    setError(null);
    const response = await bff('POST', `colis/${code}/forcer-statut`, {
      status: chosen.status,
      location: chosen.location,
      ...(targetNeedsLivreur(chosen) && livreurId ? { livreurId } : {}),
      reason: reason.trim(),
    });
    setBusy(false);
    if (!response.ok) {
      setError(messageOf(response.error));
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button type="button" className="btn-danger" onClick={() => setOpen(true)}>
        Forcer un statut
      </button>
      {open && (
        <Dialog title="Forcer un statut" onDismiss={() => setOpen(false)}>
          <form onSubmit={submit} noValidate className="space-y-4">
            <p className="text-sm text-navy/80">
              Seulement pour corriger une erreur de scan. La correction et sa raison sont
              enregistrées dans le journal d’audit.
            </p>
            <div>
              <label htmlFor={ids.target} className="field-label">
                Nouvel état
              </label>
              <select
                id={ids.target}
                className="field"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                <option value="">Choisir…</option>
                {targets.map((t) => (
                  <option key={`${t.status}|${t.location}`} value={`${t.status}|${t.location}`}>
                    {stateLabel(t)}
                  </option>
                ))}
              </select>
            </div>
            {chosen && targetNeedsLivreur(chosen) && (
              <div>
                <label htmlFor={ids.livreur} className="field-label">
                  Livreur
                </label>
                <select
                  id={ids.livreur}
                  className="field"
                  value={livreurId}
                  onChange={(e) => setLivreurId(e.target.value)}
                >
                  <option value="">Choisir…</option>
                  {livreurs.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.firstName} {l.lastName}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label htmlFor={ids.reason} className="field-label">
                Raison
              </label>
              <textarea
                id={ids.reason}
                className="field"
                rows={3}
                maxLength={500}
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
              <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
                Fermer
              </button>
              <button type="submit" className="btn-primary" disabled={busy}>
                Corriger
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}

/** A depot scan cancelled after its window: the admin's, with a reason (A-11, D-56). */
export function AdminScanCancel({
  scanId,
  permissions,
}: {
  scanId: string;
  permissions: Permission[];
}) {
  const router = useRouter();
  const reasonId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!permissions.includes(Permission.FORCER_STATUT)) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await bff('POST', `scans/depot/${scanId}/cancel-admin`, {
      reason: reason.trim(),
    });
    setBusy(false);
    if (!response.ok) {
      setError(messageOf(response.error));
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button type="button" className="btn-secondary mt-2" onClick={() => setOpen(true)}>
        Annuler ce scan
      </button>
      {open && (
        <Dialog title="Annuler ce scan" onDismiss={() => setOpen(false)}>
          <form onSubmit={submit} noValidate className="space-y-4">
            <p className="text-sm text-navy/80">
              Le colis revient à son état d’avant le scan. La raison est enregistrée dans le journal
              d’audit.
            </p>
            <div>
              <label htmlFor={reasonId} className="field-label">
                Raison
              </label>
              <textarea
                id={reasonId}
                className="field"
                rows={3}
                maxLength={500}
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
              <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
                Fermer
              </button>
              <button type="submit" className="btn-primary" disabled={busy}>
                Annuler le scan
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
