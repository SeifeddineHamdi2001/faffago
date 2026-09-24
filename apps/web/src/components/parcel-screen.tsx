'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';
import {
  CHANGE_REQUEST_FIELDS,
  CHANGE_REQUEST_FIELD_LABELS_FR,
  CHANGE_REQUEST_STATUS_LABELS_FR,
  CANCELLATION_AFTER_PICKUP_LABEL_FR,
  FAILURE_REASON_LABELS_FR,
  PARCEL_CASH_STATUS_LABELS_FR,
  PARCEL_EVENT_LABELS_FR,
  PARCEL_LOCATION_LABELS_FR,
  PARCEL_STATUS_LABELS_FR,
  ParcelStatus,
  canCancelStatus,
  canRequestChange,
  formatDT,
  localitesOfTree,
  millimesFromJson,
  parcelChangeRequestSchema,
  parcelMoneyFor,
  timelineActorLabel,
  type GeoTreeView,
} from '@faffago/shared';
import { bff } from '@/lib/client/call';
import type {
  ApiError,
  ParcelChangeRequest,
  ParcelEdit,
  SellerParcel,
  SellerParcelDetail,
} from '@/lib/types';
import { ErrorAlert, fieldErrors } from './account-actions';
import { Field } from './create-courier-form';
import { ConfirmDialog, Dialog } from './dialog';
import { LocalitePicker } from './localite-picker';
import { ParcelForm } from './parcel-form';
import { PrintLabels } from './print-labels';
import { TrackLine } from './track-line';

// Tunis time, whether the page is drawn on the server or in the browser.
const dateTime = new Intl.DateTimeFormat('fr-TN', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Africa/Tunis',
});

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
  parcel: SellerParcelDetail;
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
      <p className="mb-3 text-sm text-navy/70">
        Créé le {dateTime.format(new Date(parcel.createdAt))}
        {parcel.attemptCount > 0 && (
          <span className="ml-2 font-semibold text-navy">
            · Tentative {parcel.attemptCount} sur {parcel.maxAttempts}
          </span>
        )}
      </p>
      <div className="mb-6">
        <TrackLine status={parcel.status} />
      </div>
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

      <MoneyBlock parcel={parcel} />

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
                {request.refusalReason && (
                  <p className="mt-1 text-navy">Raison du refus : {request.refusalReason}</p>
                )}
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

      <Timeline parcel={parcel} />

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

/**
 * The money of the parcel (Vendeur 4.8, D-40): COD, the delivery fee frozen
 * on it, and the net as an estimate before retenue; a return shows its return
 * fee instead. The bon de versement stays the only real figure.
 */
function MoneyBlock({ parcel }: { parcel: SellerParcelDetail }) {
  const money = parcelMoneyFor({
    status: parcel.status,
    codAmountMillimes: millimesFromJson(parcel.codAmountMillimes),
    deliveryFeeMillimes: millimesFromJson(parcel.deliveryFeeMillimes),
    returnFeeMillimes: millimesFromJson(parcel.returnFeeMillimes),
  });
  return (
    <section aria-labelledby="argent-title" className="card mb-6 text-sm">
      <h2 id="argent-title" className="mb-2 font-display text-lg font-bold text-navy">
        Argent
      </h2>
      <dl className="space-y-1">
        <MoneyLine label="Montant COD" value={formatDT(money.cod)} />
        {money.kind === 'LIVRAISON' && (
          <>
            <MoneyLine label="Frais de livraison" value={`− ${formatDT(money.deliveryFee)}`} />
            <MoneyLine label="Net estimé" value={formatDT(money.estimatedNet)} strong />
            <p className="text-navy/70">
              Estimation avant retenue à la source : le bon de versement fait foi.
            </p>
          </>
        )}
        {money.kind === 'RETOUR' && (
          <MoneyLine label="Frais de retour" value={`− ${formatDT(money.returnFee)}`} strong />
        )}
        {money.kind === 'ANNULE' && <p className="text-navy/70">Aucun frais.</p>}
        {parcel.cashStatus && (
          <MoneyLine
            label="Paiement"
            value={`${PARCEL_CASH_STATUS_LABELS_FR[parcel.cashStatus]}${
              parcel.bonNumber ? ` · ${parcel.bonNumber}` : ''
            }`}
          />
        )}
      </dl>
    </section>
  );
}

function MoneyLine({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-navy/70">{label}</dt>
      <dd className={strong ? 'font-bold text-navy' : 'text-navy'}>{value}</dd>
    </div>
  );
}

/**
 * The history (Vendeur 4.8, D-38): when, what, who and where. Couriers by
 * first name only, the team as "Faffa Go", the place as a label, never GPS.
 */
function Timeline({ parcel }: { parcel: SellerParcelDetail }) {
  if (parcel.timeline.length === 0) return null;
  return (
    <section aria-labelledby="historique-title" className="mb-8">
      <h2 id="historique-title" className="mb-3 font-display text-lg font-bold text-navy">
        Historique
      </h2>
      <ol className="space-y-2 border-l-2 border-navy/15 pl-4 text-sm">
        {[...parcel.timeline].reverse().map((entry, i) => (
          <li key={`${entry.at}-${i}`}>
            <p className="font-semibold text-navy">
              {PARCEL_EVENT_LABELS_FR[entry.type]}
              {entry.failureReason && ` · ${FAILURE_REASON_LABELS_FR[entry.failureReason]}`}
              {entry.cancelledAfterPickup && ` · ${CANCELLATION_AFTER_PICKUP_LABEL_FR}`}
            </p>
            <p className="text-navy/70">
              {dateTime.format(new Date(entry.at))} · {timelineActorLabel(entry.actor)}
              {entry.location && ` · ${PARCEL_LOCATION_LABELS_FR[entry.location]}`}
            </p>
          </li>
        ))}
      </ol>
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
