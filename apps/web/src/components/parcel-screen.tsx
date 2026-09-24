'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  CHANGE_REQUEST_FIELDS,
  CHANGE_REQUEST_FIELD_LABELS_FR,
  CHANGE_REQUEST_STATUS_LABELS_FR,
  PARCEL_STATUS_LABELS_FR,
  ParcelStatus,
  canCancelStatus,
  canRequestChange,
  formatDT,
  millimesFromJson,
  parcelChangeRequestSchema,
  type GeoTreeView,
} from '@faffago/shared';
import { bff } from '@/lib/client/call';
import type { ApiError, ParcelEdit, SellerParcel } from '@/lib/types';
import { ErrorAlert, fieldErrors } from './account-actions';
import { Field } from './create-courier-form';
import { ConfirmDialog, Dialog } from './dialog';
import { ParcelForm } from './parcel-form';

const dateTime = new Intl.DateTimeFormat('fr-TN', { dateStyle: 'short', timeStyle: 'short' });

export const REPRINT_WARNING =
  'Colis modifié. Réimprimez l’étiquette : celle déjà imprimée porte les anciennes informations.';

/**
 * A parcel for its seller, with what he can do next (Vendeur 4.6): Modifier
 * and Annuler before pickup; after it, Annuler (the return flow, D-28) and
 * Demander une modification. The timeline and the money block come with
 * Détail du colis. "Voir comme le vendeur" shows it without any action (D-5).
 */
export function ParcelScreen({
  parcel,
  tree,
  readOnly,
}: {
  parcel: SellerParcel;
  tree: GeoTreeView;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState<'annuler' | 'demande' | null>(null);
  const [reprint, setReprint] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const status = parcel.status;
  const canEdit = !readOnly && status === ParcelStatus.CREE;
  const canCancel = !readOnly && canCancelStatus(status);
  const canRequest = !readOnly && canRequestChange(status);
  const pickedUp = status !== ParcelStatus.CREE;

  async function cancel() {
    setBusy(true);
    const result = await bff<SellerParcel>('POST', `parcels/${parcel.code}/cancel`);
    setBusy(false);
    setOpen(null);
    if (result.ok) router.refresh();
    else setError(result.error);
  }

  if (editing) {
    return (
      <section>
        <h1 className="mb-6 font-display text-2xl font-bold text-navy">Modifier {parcel.code}</h1>
        <ParcelForm
          tree={tree}
          parcel={parcel}
          onCancel={() => setEditing(false)}
          onEdited={(edit: ParcelEdit) => {
            setEditing(false);
            setReprint(edit.reprintLabel);
            router.refresh();
          }}
        />
      </section>
    );
  }

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-bold text-navy">{parcel.code}</h1>
        <span className="badge-muted">{PARCEL_STATUS_LABELS_FR[status]}</span>
      </div>
      <p className="mb-6 text-sm text-navy/70">
        Créé le {dateTime.format(new Date(parcel.createdAt))}
      </p>
      {reprint && (
        <p
          role="status"
          className="mb-4 rounded-xl bg-orange/15 p-4 text-sm font-semibold text-navy"
        >
          {REPRINT_WARNING}
        </p>
      )}
      {error && <ErrorAlert error={error} />}

      <dl className="card mb-6 grid gap-3 text-sm sm:grid-cols-2">
        <Item label="Destinataire" value={parcel.recipientName} />
        <Item
          label="Téléphone"
          value={[parcel.recipientPhone, parcel.recipientPhone2].filter(Boolean).join(' · ')}
        />
        <Item
          label="Localité"
          value={`${parcel.localite.nameFr} — ${parcel.delegation.nameFr}, ${parcel.delegation.gouvernoratNameFr}`}
        />
        <Item
          label="Adresse"
          value={parcel.landmark ? `${parcel.address} (${parcel.landmark})` : parcel.address}
        />
        <Item
          label="Produit"
          value={`${parcel.productDescription} · ${parcel.pieceCount} pièce${parcel.pieceCount > 1 ? 's' : ''}`}
        />
        <Item label="Montant COD" value={formatDT(millimesFromJson(parcel.codAmountMillimes))} />
        {(parcel.isExchange || parcel.openingAllowed) && (
          <Item
            label="Options"
            value={[
              parcel.isExchange && 'Colis d’échange',
              parcel.openingAllowed && 'Ouverture autorisée',
            ]
              .filter(Boolean)
              .join(' · ')}
          />
        )}
        {parcel.courierNote && <Item label="Note pour le coursier" value={parcel.courierNote} />}
      </dl>

      {(canEdit || canCancel || canRequest) && (
        <div className="mb-8 flex flex-wrap gap-2">
          {canEdit && (
            <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
              Modifier
            </button>
          )}
          {canRequest && (
            <button type="button" className="btn-secondary" onClick={() => setOpen('demande')}>
              Demander une modification
            </button>
          )}
          {canCancel && (
            <button type="button" className="btn-danger" onClick={() => setOpen('annuler')}>
              Annuler le colis
            </button>
          )}
        </div>
      )}

      {parcel.changeRequests.length > 0 && (
        <section aria-labelledby="demandes-title">
          <h2 id="demandes-title" className="mb-3 font-display text-lg font-bold text-navy">
            Demandes de modification
          </h2>
          <ul className="space-y-2">
            {parcel.changeRequests.map((request) => (
              <li key={request.id} className="card text-sm">
                <p className="font-semibold text-navy">
                  {CHANGE_REQUEST_STATUS_LABELS_FR[request.status]} ·{' '}
                  {dateTime.format(new Date(request.createdAt))}
                </p>
                <ul className="mt-1 text-navy/80">
                  {CHANGE_REQUEST_FIELDS.filter((f) => request.requestedFields[f]).map((f) => (
                    <li key={f}>
                      {CHANGE_REQUEST_FIELD_LABELS_FR[f]} : {request.requestedFields[f]}
                    </li>
                  ))}
                </ul>
                {request.sellerNote && <p className="mt-1 text-navy/70">{request.sellerNote}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {open === 'annuler' && (
        <ConfirmDialog
          title="Annuler le colis"
          message={
            pickedUp
              ? `Le colis a déjà été ramassé : il devient un retour et vous sera rendu. Frais de retour : ${formatDT(
                  millimesFromJson(parcel.returnFeeMillimes),
                )}, déduits de votre prochain paiement.`
              : 'Le colis sera annulé. Cette action est définitive.'
          }
          confirmLabel="Annuler le colis"
          cancelLabel="Garder le colis"
          busy={busy}
          onConfirm={cancel}
          onCancel={() => setOpen(null)}
        />
      )}
      {open === 'demande' && (
        <ChangeRequestDialog
          code={parcel.code}
          onDone={() => {
            setOpen(null);
            router.refresh();
          }}
          onCancel={() => setOpen(null)}
        />
      )}
    </section>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-navy/70">{label}</dt>
      <dd className="font-semibold text-navy">{value}</dd>
    </div>
  );
}

/** Vendeur 4.6: the seller asks, Faffa Go applies it (phase 5). */
function ChangeRequestDialog({
  code,
  onDone,
  onCancel,
}: {
  code: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState({
    recipientPhone: '',
    recipientPhone2: '',
    address: '',
    landmark: '',
    note: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof values) => (value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const body = Object.fromEntries(
      Object.entries(values).filter(([, value]) => value.trim() !== ''),
    );
    const parsed = parcelChangeRequestSchema.safeParse(body);
    if (!parsed.success) {
      const found = fieldErrors(parsed.error.issues);
      setErrors(found);
      // The "at least one change" rule has no field of its own.
      if (found['']) setApiError({ message: found[''] });
      return;
    }
    setBusy(true);
    const result = await bff('POST', `parcels/${code}/change-requests`, body);
    setBusy(false);
    if (result.ok) onDone();
    else setApiError(result.error);
  }

  return (
    <Dialog title="Demander une modification" onDismiss={onCancel}>
      {apiError && <ErrorAlert error={apiError} />}
      <form onSubmit={submit} className="space-y-3" noValidate>
        <p className="text-sm text-navy/70">
          Remplissez seulement ce qui change. Faffa Go applique la modification.
        </p>
        <Field
          id="cr-phone"
          label="Nouveau téléphone"
          value={values.recipientPhone}
          onChange={set('recipientPhone')}
          error={errors.recipientPhone}
          inputMode="tel"
        />
        <Field
          id="cr-phone2"
          label="Nouveau téléphone 2"
          value={values.recipientPhone2}
          onChange={set('recipientPhone2')}
          error={errors.recipientPhone2}
          inputMode="tel"
        />
        <Field
          id="cr-address"
          label="Nouvelle adresse"
          value={values.address}
          onChange={set('address')}
          error={errors.address}
        />
        <Field
          id="cr-landmark"
          label="Nouveau repère"
          value={values.landmark}
          onChange={set('landmark')}
          error={errors.landmark}
        />
        <Field
          id="cr-note"
          label="Note pour Faffa Go (facultatif)"
          value={values.note}
          onChange={set('note')}
          error={errors.note}
        />
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Annuler
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            Envoyer la demande
          </button>
        </div>
      </form>
    </Dialog>
  );
}
