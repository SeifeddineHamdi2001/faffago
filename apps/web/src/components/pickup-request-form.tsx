'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  PICKUP_SLOT_LABELS_FR,
  PickupSlot,
  formatDT,
  millimesFromJson,
  pickupRequestSchema,
  type GeoTreeView,
} from '@faffago/shared';
import { bff } from '@/lib/client/call';
import type { ApiError, PickupAddress, PickupView, ReadyParcel } from '@/lib/types';
import { ErrorAlert } from './account-actions';
import {
  EMPTY_ADDRESS,
  PickupAddressFields,
  addressPayload,
  addressSummary,
  type PickupAddressDraft,
} from './pickup-address-fields';

const NEW_ADDRESS = 'NOUVELLE';

/**
 * Demander un ramassage (Vendeur 4.5): the parcels ready, or how many; the
 * window; a note. On the first request the seller fills the pickup address,
 * which is saved in his profile and chosen next time. The fee rule is shown
 * before he confirms.
 */
export function PickupRequestForm({
  tree,
  addresses,
  readyParcels,
  feeRule,
}: {
  tree: GeoTreeView;
  addresses: PickupAddress[];
  readyParcels: ReadyParcel[];
  /** "Moins de 5 colis : ramassage à 2,000 DT", or null when free. */
  feeRule: string | null;
}) {
  const router = useRouter();
  const [addressChoice, setAddressChoice] = useState(
    addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? NEW_ADDRESS,
  );
  const [draft, setDraft] = useState<PickupAddressDraft>(EMPTY_ADDRESS);
  const [mode, setMode] = useState<'LISTE' | 'NOMBRE'>(
    readyParcels.length > 0 ? 'LISTE' : 'NOMBRE',
  );
  const [selected, setSelected] = useState<string[]>(readyParcels.map((p) => p.code));
  const [declaredCount, setDeclaredCount] = useState('');
  const [slot, setSlot] = useState<PickupSlot | ''>('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [clientRequestId] = useState(() => crypto.randomUUID());

  const toggle = (code: string) =>
    setSelected((current) =>
      current.includes(code) ? current.filter((c) => c !== code) : [...current, code],
    );

  async function submit(event: FormEvent) {
    event.preventDefault();
    const body = {
      clientRequestId,
      ...(addressChoice === NEW_ADDRESS
        ? { newAddress: addressPayload(draft) }
        : { pickupAddressId: addressChoice }),
      ...(mode === 'LISTE' ? { parcelCodes: selected } : { declaredCount }),
      requestedSlot: slot,
      note: note.trim() || null,
    };
    const parsed = pickupRequestSchema.safeParse(body);
    if (!parsed.success) {
      const found: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        // The new address's own fields report under their name.
        const key = issue.path[0] === 'newAddress' ? String(issue.path[1]) : String(issue.path[0]);
        found[key] ??= issue.message;
      }
      setErrors(found);
      return;
    }
    setErrors({});
    setApiError(null);
    setBusy(true);
    const result = await bff<PickupView>('POST', 'pickups', body);
    if (result.ok) {
      router.push(`/vendeur/ramassages/${result.data.id}`);
      return;
    }
    setBusy(false);
    setApiError(result.error);
  }

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      {apiError && <ErrorAlert error={apiError} />}

      <fieldset className="card space-y-3">
        <legend className="font-display text-lg font-bold text-navy">Adresse de ramassage</legend>
        {addresses.length > 0 && (
          <div className="space-y-2">
            {addresses.map((address) => (
              <label key={address.id} className="flex items-start gap-2">
                <input
                  type="radio"
                  name="adresse"
                  className="mt-1"
                  checked={addressChoice === address.id}
                  onChange={() => setAddressChoice(address.id)}
                />
                <span>{addressSummary(address)}</span>
              </label>
            ))}
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="adresse"
                checked={addressChoice === NEW_ADDRESS}
                onChange={() => setAddressChoice(NEW_ADDRESS)}
              />
              Nouvelle adresse
            </label>
          </div>
        )}
        {addressChoice === NEW_ADDRESS && (
          <>
            {addresses.length === 0 && (
              <p className="text-sm text-navy/70">
                Elle est enregistrée dans votre profil et proposée la prochaine fois.
              </p>
            )}
            <PickupAddressFields
              tree={tree}
              value={draft}
              onChange={setDraft}
              errors={errors}
              idPrefix="nouvelle-adresse"
            />
          </>
        )}
        {errors.pickupAddressId && <p className="text-sm text-red-700">{errors.pickupAddressId}</p>}
      </fieldset>

      <fieldset className="card space-y-3">
        <legend className="font-display text-lg font-bold text-navy">Colis à ramasser</legend>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="mode"
              checked={mode === 'LISTE'}
              onChange={() => setMode('LISTE')}
              disabled={readyParcels.length === 0}
            />
            Choisir les colis prêts
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="mode"
              checked={mode === 'NOMBRE'}
              onChange={() => setMode('NOMBRE')}
            />
            Indiquer seulement le nombre
          </label>
        </div>
        {mode === 'LISTE' ? (
          <ul className="max-h-80 divide-y divide-navy/10 overflow-y-auto text-sm">
            {readyParcels.map((parcel) => (
              <li key={parcel.code}>
                <label className="flex flex-wrap items-center gap-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.includes(parcel.code)}
                    onChange={() => toggle(parcel.code)}
                  />
                  <span className="font-mono font-semibold">{parcel.code}</span>
                  <span>{parcel.recipientName}</span>
                  <span className="text-navy/60">{parcel.delegationNameFr}</span>
                  <span className="ml-auto">
                    {formatDT(millimesFromJson(parcel.codAmountMillimes))}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <div>
            <label htmlFor="declaredCount" className="field-label">
              Nombre de colis
            </label>
            <input
              id="declaredCount"
              className="field max-w-40"
              inputMode="numeric"
              value={declaredCount}
              onChange={(e) => setDeclaredCount(e.target.value)}
            />
            {readyParcels.length === 0 && (
              <p className="mt-1 text-sm text-navy/70">Aucun colis créé en attente de ramassage.</p>
            )}
          </div>
        )}
        {(errors.parcelCodes || errors.declaredCount) && (
          <p className="text-sm text-red-700">{errors.parcelCodes ?? errors.declaredCount}</p>
        )}
        {mode === 'LISTE' && (
          <p className="text-sm font-semibold text-navy">{selected.length} colis choisis</p>
        )}
      </fieldset>

      <fieldset className="card space-y-3">
        <legend className="font-display text-lg font-bold text-navy">Créneau</legend>
        <div className="flex flex-wrap gap-4">
          {Object.values(PickupSlot).map((value) => (
            <label key={value} className="flex items-center gap-2">
              <input
                type="radio"
                name="creneau"
                checked={slot === value}
                onChange={() => setSlot(value)}
              />
              {PICKUP_SLOT_LABELS_FR[value]}
            </label>
          ))}
        </div>
        {errors.requestedSlot && <p className="text-sm text-red-700">{errors.requestedSlot}</p>}
        <div>
          <label htmlFor="note" className="field-label">
            Note pour le ramasseur (facultatif)
          </label>
          <input
            id="note"
            className="field"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </fieldset>

      {feeRule && (
        <p role="note" className="rounded-xl bg-orange/15 p-4 text-sm font-semibold text-navy">
          {feeRule}
        </p>
      )}
      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={busy}>
          Demander le ramassage
        </button>
      </div>
    </form>
  );
}
