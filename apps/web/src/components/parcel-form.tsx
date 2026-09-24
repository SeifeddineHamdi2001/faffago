'use client';

import { useMemo, useState, type FormEvent } from 'react';
import {
  createParcelSchema,
  formatDT,
  localitesOfTree,
  millimesFromJson,
  tryParseDT,
  type GeoTreeView,
} from '@faffago/shared';
import { bff } from '@/lib/client/call';
import type { ApiError, ParcelEdit, SellerParcel } from '@/lib/types';
import { ErrorAlert, fieldErrors } from './account-actions';
import { Field } from './create-courier-form';
import { LocalitePicker } from './localite-picker';

interface Values {
  recipientName: string;
  recipientPhone: string;
  recipientPhone2: string;
  localiteId: string;
  address: string;
  landmark: string;
  productDescription: string;
  pieceCount: string;
  codAmountMillimes: string;
  isExchange: boolean;
  openingAllowed: boolean;
  courierNote: string;
}

const EMPTY: Values = {
  recipientName: '',
  recipientPhone: '',
  recipientPhone2: '',
  localiteId: '',
  address: '',
  landmark: '',
  productDescription: '',
  pieceCount: '1',
  codAmountMillimes: '',
  isExchange: false,
  openingAllowed: false,
  courierNote: '',
};

function valuesOf(parcel: SellerParcel): Values {
  return {
    recipientName: parcel.recipientName,
    recipientPhone: parcel.recipientPhone,
    recipientPhone2: parcel.recipientPhone2 ?? '',
    localiteId: parcel.localite.id,
    address: parcel.address,
    landmark: parcel.landmark ?? '',
    productDescription: parcel.productDescription,
    pieceCount: String(parcel.pieceCount),
    codAmountMillimes: formatDT(millimesFromJson(parcel.codAmountMillimes), { suffix: false }),
    isExchange: parcel.isExchange,
    openingAllowed: parcel.openingAllowed,
    courierNote: parcel.courierNote ?? '',
  };
}

/** What the API reads: optional texts left empty are null. */
function payloadOf(values: Values) {
  return {
    recipientName: values.recipientName,
    recipientPhone: values.recipientPhone,
    recipientPhone2: values.recipientPhone2.trim() || null,
    localiteId: values.localiteId,
    address: values.address,
    landmark: values.landmark.trim() || null,
    productDescription: values.productDescription,
    pieceCount: values.pieceCount,
    codAmountMillimes: values.codAmountMillimes,
    isExchange: values.isExchange,
    openingAllowed: values.openingAllowed,
    courierNote: values.courierNote.trim() || null,
  };
}

type Payload = ReturnType<typeof payloadOf>;

/** Only what the seller changed; the COD compared as an amount, not as typed. */
function changesOf(initial: Payload, next: Payload): Partial<Payload> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(next) as (keyof Payload)[]) {
    const same =
      key === 'codAmountMillimes'
        ? tryParseDT(initial.codAmountMillimes) === tryParseDT(next.codAmountMillimes)
        : key === 'pieceCount'
          ? Number.parseInt(initial.pieceCount, 10) === Number.parseInt(next.pieceCount, 10)
          : initial[key] === next[key];
    if (!same) out[key] = next[key];
  }
  return out as Partial<Payload>;
}

/**
 * Créer un colis (Vendeur 4.2) and Modifier (4.6), one form. Keyboard first:
 * every field in order, Enter saves. Creation carries a UUID drawn when the
 * form opens, so a double click creates one parcel, not two.
 */
export function ParcelForm({
  tree,
  parcel,
  onCreated,
  onEdited,
  onCancel,
}: {
  tree: GeoTreeView;
  /** Given: Modifier; absent: Créer un colis. */
  parcel?: SellerParcel;
  onCreated?: (parcel: SellerParcel) => void;
  onEdited?: (edit: ParcelEdit) => void;
  onCancel?: () => void;
}) {
  const localites = useMemo(() => localitesOfTree(tree), [tree]);
  const initial = useMemo(() => (parcel ? valuesOf(parcel) : EMPTY), [parcel]);
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [clientRequestId] = useState(() => crypto.randomUUID());

  const set =
    <K extends keyof Values>(key: K) =>
    (value: Values[K]) =>
      setValues((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const payload = payloadOf(values);
    const parsed = createParcelSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    setApiError(null);
    setBusy(true);
    if (parcel) {
      const changes = changesOf(payloadOf(initial), payload);
      const result = await bff<ParcelEdit>('PATCH', `parcels/${parcel.code}`, changes);
      setBusy(false);
      if (result.ok) onEdited?.(result.data);
      else setApiError(result.error);
      return;
    }
    const result = await bff<SellerParcel>('POST', 'parcels', { ...payload, clientRequestId });
    if (result.ok) {
      onCreated?.(result.data);
      return;
    }
    setBusy(false);
    setApiError(result.error);
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {apiError && <ErrorAlert error={apiError} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="recipientName"
          label="Nom du destinataire"
          value={values.recipientName}
          onChange={set('recipientName')}
          error={errors.recipientName}
        />
        <Field
          id="recipientPhone"
          label="Téléphone"
          value={values.recipientPhone}
          onChange={set('recipientPhone')}
          error={errors.recipientPhone}
          inputMode="tel"
        />
        <Field
          id="recipientPhone2"
          label="Téléphone 2 (facultatif)"
          value={values.recipientPhone2}
          onChange={set('recipientPhone2')}
          error={errors.recipientPhone2}
          inputMode="tel"
        />
      </div>
      <LocalitePicker
        tree={tree}
        localites={localites}
        value={values.localiteId}
        onChange={set('localiteId')}
        error={errors.localiteId}
      />
      <Field
        id="address"
        label="Adresse"
        value={values.address}
        onChange={set('address')}
        error={errors.address}
      />
      <Field
        id="landmark"
        label="Repère (facultatif)"
        value={values.landmark}
        onChange={set('landmark')}
        error={errors.landmark}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <Field
            id="productDescription"
            label="Description du produit"
            value={values.productDescription}
            onChange={set('productDescription')}
            error={errors.productDescription}
          />
        </div>
        <Field
          id="pieceCount"
          label="Nombre de pièces"
          value={values.pieceCount}
          onChange={set('pieceCount')}
          error={errors.pieceCount}
          inputMode="decimal"
        />
      </div>
      <Field
        id="codAmountMillimes"
        label="Montant COD (DT)"
        value={values.codAmountMillimes}
        onChange={set('codAmountMillimes')}
        error={errors.codAmountMillimes}
        inputMode="decimal"
      />
      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={values.isExchange}
            onChange={(e) => set('isExchange')(e.target.checked)}
          />
          Colis d’échange
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={values.openingAllowed}
            onChange={(e) => set('openingAllowed')(e.target.checked)}
          />
          Ouverture autorisée
        </label>
      </div>
      <Field
        id="courierNote"
        label="Note pour le coursier (facultatif)"
        value={values.courierNote}
        onChange={set('courierNote')}
        error={errors.courierNote}
      />
      <div className="flex justify-end gap-3 pt-2">
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Annuler
          </button>
        )}
        <button type="submit" className="btn-primary" disabled={busy}>
          {parcel ? 'Enregistrer' : 'Créer le colis'}
        </button>
      </div>
    </form>
  );
}
