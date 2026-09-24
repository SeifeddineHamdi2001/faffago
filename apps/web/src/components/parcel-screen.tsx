'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';
import {
  CHANGE_REQUEST_FIELDS,
  CHANGE_REQUEST_FIELD_LABELS_FR,
  CHANGE_REQUEST_STATUS_LABELS_FR,
  PARCEL_STATUS_LABELS_FR,
  ParcelStatus,
  canCancelStatus,
  canRequestChange,
  formatDT,
  localitesOfTree,
  millimesFromJson,
  parcelChangeRequestSchema,
  type GeoTreeView,
} from '@faffago/shared';
import { bff } from '@/lib/client/call';
import type { ApiError, ParcelChangeRequest, ParcelEdit, SellerParcel } from '@/lib/types';
import { ErrorAlert, fieldErrors } from './account-actions';
import { Field } from './create-courier-form';
import { ConfirmDialog, Dialog } from './dialog';
import { LocalitePicker } from './localite-picker';
import { ParcelForm } from './parcel-form';
import { PrintLabels } from './print-labels';

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
  const [open, setOpen] = useState<
    'annuler' | 'demande' | 'modifier-demande' | 'retirer-demande' | null
  >(null);
  const [reprint, setReprint] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const status = parcel.status;
  const canEdit = !readOnly && status === ParcelStatus.CREE;
  const canCancel = !readOnly && canCancelStatus(status);
  // One waiting request per parcel: the seller edits or withdraws it (D-44).
  const waiting = parcel.changeRequests.find((r) => r.status === 'EN_ATTENTE') ?? null;
  const canRequest = !readOnly && canRequestChange(status) && !waiting;
  const pickedUp = status !== ParcelStatus.CREE;

  async function cancel() {
    setBusy(true);
    const result = await bff<SellerParcel>('POST', `parcels/${parcel.code}/cancel`);
    setBusy(false);
    setOpen(null);
    if (result.ok) router.refresh();
    else setError(result.error);
  }

  async function withdraw(request: ParcelChangeRequest) {
    setBusy(true);
    const result = await bff(
      'POST',
      `parcels/${parcel.code}/change-requests/${request.id}/withdraw`,
    );
    setBusy(false);
    setOpen(null);
    if (result.ok) router.refresh();
    else setError(result.error);
  }

  function requestDone() {
    setOpen(null);
    router.refresh();
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
        <div role="status" className="mb-4 space-y-3 rounded-xl bg-orange/15 p-4">
          <p className="text-sm font-semibold text-navy">{REPRINT_WARNING}</p>
          <PrintLabels path={`parcels/${parcel.code}/label`} title="Réimprimer l’étiquette" />
        </div>
      )}
      {!readOnly && !reprint && (
        <div className="mb-6">
          <PrintLabels path={`parcels/${parcel.code}/label`} title="Imprimer l’étiquette" />
        </div>
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
                <RequestedFields request={request} />
                {request.sellerNote && <p className="mt-1 text-navy/70">{request.sellerNote}</p>}
                {request === waiting && !readOnly && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {canRequestChange(status) && (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setOpen('modifier-demande')}
                      >
                        Modifier la demande
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setOpen('retirer-demande')}
                    >
                      Retirer la demande
                    </button>
                  </div>
                )}
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
          tree={tree}
          onDone={requestDone}
          onCancel={() => setOpen(null)}
        />
      )}
      {open === 'modifier-demande' && waiting && (
        <ChangeRequestDialog
          code={parcel.code}
          tree={tree}
          request={waiting}
          onDone={requestDone}
          onCancel={() => setOpen(null)}
        />
      )}
      {open === 'retirer-demande' && waiting && (
        <ConfirmDialog
          title="Retirer la demande"
          message="Faffa Go n’appliquera pas cette demande. Vous pourrez en envoyer une autre."
          confirmLabel="Retirer la demande"
          cancelLabel="Garder la demande"
          busy={busy}
          onConfirm={() => withdraw(waiting)}
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

function RequestedFields({ request }: { request: ParcelChangeRequest }) {
  return (
    <ul className="mt-1 text-navy/80">
      {CHANGE_REQUEST_FIELDS.filter((f) => request.requestedFields[f]).map((f) => (
        <li key={f}>
          {CHANGE_REQUEST_FIELD_LABELS_FR[f]} :{' '}
          {f === 'localiteId' && request.requestedLocalite
            ? `${request.requestedLocalite.nameFr} — ${request.requestedLocalite.delegationNameFr}`
            : request.requestedFields[f]}
        </li>
      ))}
    </ul>
  );
}

/**
 * Vendeur 4.6, D-44: the seller asks, Faffa Go applies it (phase 5). Given a
 * waiting request, the same form edits it: what is sent replaces it.
 */
function ChangeRequestDialog({
  code,
  tree,
  request,
  onDone,
  onCancel,
}: {
  code: string;
  tree: GeoTreeView;
  request?: ParcelChangeRequest;
  onDone: () => void;
  onCancel: () => void;
}) {
  const localites = useMemo(() => localitesOfTree(tree), [tree]);
  const fields = request?.requestedFields ?? {};
  const [values, setValues] = useState({
    recipientPhone: fields.recipientPhone ?? '',
    recipientPhone2: fields.recipientPhone2 ?? '',
    localiteId: fields.localiteId ?? '',
    address: fields.address ?? '',
    landmark: fields.landmark ?? '',
    note: request?.sellerNote ?? '',
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
    const result = request
      ? await bff('PATCH', `parcels/${code}/change-requests/${request.id}`, body)
      : await bff('POST', `parcels/${code}/change-requests`, body);
    setBusy(false);
    if (result.ok) onDone();
    else setApiError(result.error);
  }

  return (
    <Dialog
      title={request ? 'Modifier la demande' : 'Demander une modification'}
      onDismiss={onCancel}
    >
      {apiError && <ErrorAlert error={apiError} />}
      <form onSubmit={submit} className="max-h-[70vh] space-y-3 overflow-y-auto pr-1" noValidate>
        <p className="text-sm text-navy/70">
          Remplissez seulement ce qui change. Faffa Go applique la modification ; une nouvelle
          localité est appliquée quand le colis est au dépôt.
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
        <LocalitePicker
          tree={tree}
          localites={localites}
          value={values.localiteId}
          onChange={set('localiteId')}
          error={errors.localiteId}
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
            {request ? 'Enregistrer la demande' : 'Envoyer la demande'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
