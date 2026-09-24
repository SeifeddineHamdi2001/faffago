'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  PARCEL_STATUS_LABELS_FR,
  PICKUP_SLOT_LABELS_FR,
  PICKUP_STATUS_LABELS_FR,
  PickupStatus,
  canCancelPickup,
} from '@faffago/shared';
import { bff } from '@/lib/client/call';
import type { ApiError, PickupDetail, PickupView } from '@/lib/types';
import { ErrorAlert } from './account-actions';
import { ConfirmDialog } from './dialog';
import { addressSummary } from './pickup-address-fields';

const dateTime = new Intl.DateTimeFormat('fr-TN', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Africa/Tunis',
});

/** "2026-09-25" → "25/09/2026": a planned day, not an instant. */
function day(key: string): string {
  const [year, month, date] = key.split('-');
  return `${date}/${month}/${year}`;
}

function planned(pickup: PickupView): string | null {
  if (!pickup.plannedDate) return null;
  const slot = pickup.plannedSlot ? ` · ${PICKUP_SLOT_LABELS_FR[pickup.plannedSlot]}` : '';
  const who = pickup.ramasseurFirstName ? ` · ${pickup.ramasseurFirstName}` : '';
  return `${day(pickup.plannedDate)}${slot}${who}`;
}

function statusClass(status: PickupStatus): string {
  if (status === PickupStatus.EFFECTUE) return 'badge-ok';
  if (status === PickupStatus.ANNULE) return 'badge-muted';
  return 'badge-warn';
}

/** Ramassages (Vendeur 4.5): the requests and their history, newest first. */
export function PickupsScreen({
  pickups,
  canRequest,
}: {
  pickups: PickupView[];
  canRequest: boolean;
}) {
  return (
    <section>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-navy">Ramassages</h1>
        {canRequest && (
          <Link href="/vendeur/ramassages/nouveau" className="btn-primary">
            Demander un ramassage
          </Link>
        )}
      </div>
      {pickups.length === 0 ? (
        <p className="text-navy/70">Aucun ramassage demandé pour l’instant.</p>
      ) : (
        <ul className="space-y-3">
          {pickups.map((pickup) => (
            <li key={pickup.id} className="card text-sm">
              <div className="mb-1 flex flex-wrap items-center gap-3">
                <Link
                  href={`/vendeur/ramassages/${pickup.id}`}
                  className="font-semibold text-navy underline"
                >
                  Demandé le {dateTime.format(new Date(pickup.createdAt))}
                </Link>
                <span className={statusClass(pickup.status)}>
                  {PICKUP_STATUS_LABELS_FR[pickup.status]}
                </span>
              </div>
              <p className="text-navy/80">{addressSummary(pickup.address)}</p>
              <p className="text-navy/70">
                {pickup.expectedCount} colis
                {pickup.requestedSlot && ` · ${PICKUP_SLOT_LABELS_FR[pickup.requestedSlot]}`}
                {planned(pickup) && ` · Prévu le ${planned(pickup)}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * One request (Vendeur 4.5): where, when, which parcels, and once done which
 * were picked up and which were not. Cancellable while Demandé or Planifié,
 * at no cost (D-35).
 */
export function PickupDetailScreen({
  pickup,
  readOnly,
}: {
  pickup: PickupDetail;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const done = pickup.status === PickupStatus.EFFECTUE;

  async function cancel() {
    setBusy(true);
    const result = await bff('POST', `pickups/${pickup.id}/cancel`);
    setBusy(false);
    setConfirming(false);
    if (result.ok) router.refresh();
    else setError(result.error);
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-bold text-navy">Ramassage</h1>
        <span className={statusClass(pickup.status)}>{PICKUP_STATUS_LABELS_FR[pickup.status]}</span>
      </div>
      {error && <ErrorAlert error={error} />}
      <dl className="card mb-6 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-navy/70">Adresse</dt>
          <dd className="font-semibold text-navy">{addressSummary(pickup.address)}</dd>
          {pickup.address.landmark && <dd className="text-navy/70">{pickup.address.landmark}</dd>}
        </div>
        <div>
          <dt className="text-navy/70">Demandé le</dt>
          <dd className="font-semibold text-navy">
            {dateTime.format(new Date(pickup.createdAt))}
            {pickup.requestedSlot && ` · ${PICKUP_SLOT_LABELS_FR[pickup.requestedSlot]}`}
          </dd>
        </div>
        {planned(pickup) && (
          <div>
            <dt className="text-navy/70">Prévu le</dt>
            <dd className="font-semibold text-navy">{planned(pickup)}</dd>
          </div>
        )}
        <div>
          <dt className="text-navy/70">Colis</dt>
          <dd className="font-semibold text-navy">
            {done
              ? `${pickup.scannedCount} ramassés sur ${pickup.expectedCount}`
              : pickup.expectedCount}
          </dd>
        </div>
        {pickup.note && (
          <div className="sm:col-span-2">
            <dt className="text-navy/70">Note</dt>
            <dd className="text-navy">{pickup.note}</dd>
          </div>
        )}
      </dl>

      {pickup.parcels.length > 0 && (
        <section aria-labelledby="colis-title" className="mb-6">
          <h2 id="colis-title" className="mb-3 font-display text-lg font-bold text-navy">
            Colis
          </h2>
          <ul className="card divide-y divide-navy/10 text-sm">
            {pickup.parcels.map((parcel) => (
              <li key={parcel.code} className="flex flex-wrap items-center gap-3 py-2">
                <Link
                  href={`/vendeur/colis/${parcel.code}`}
                  className="font-mono font-semibold text-navy underline"
                >
                  {parcel.code}
                </Link>
                <span>{parcel.recipientName}</span>
                <span className="ml-auto">
                  {done ? (
                    <span className={parcel.pickedUp ? 'badge-ok' : 'badge-warn'}>
                      {parcel.pickedUp ? 'Ramassé' : 'Non ramassé'}
                    </span>
                  ) : (
                    PARCEL_STATUS_LABELS_FR[parcel.status]
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!readOnly && canCancelPickup(pickup.status) && (
        <button type="button" className="btn-danger" onClick={() => setConfirming(true)}>
          Annuler le ramassage
        </button>
      )}
      {confirming && (
        <ConfirmDialog
          title="Annuler le ramassage"
          message="Le ramassage est annulé, sans frais. Les colis restent chez vous, prêts pour une prochaine demande."
          confirmLabel="Annuler le ramassage"
          cancelLabel="Garder le ramassage"
          busy={busy}
          onConfirm={cancel}
          onCancel={() => setConfirming(false)}
        />
      )}
    </section>
  );
}
