'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  PICKUP_SLOT_LABELS_FR,
  PickupSlot,
  pickupRequestSchema,
  type GeoTreeView,
} from '@faffago/shared';
import { newUuid } from '@/lib/client/uuid';
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
 * Demander un ramassage (Vendeur 4.5, D-98): the address, the window and a
 * note. The seller does not list or count his parcels: the ramasseur's scans
 * count them, and the fee follows. On the first request the seller fills the
 * pickup address, which is saved in his profile and chosen next time. The fee
 * rule is shown before he confirms.
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
  const [slot, setSlot] = useState<PickupSlot | ''>('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [clientRequestId] = useState(() => newUuid());

  async function submit(event: FormEvent) {
    event.preventDefault();
    const body = {
      clientRequestId,
      ...(addressChoice === NEW_ADDRESS
        ? { newAddress: addressPayload(draft) }
        : { pickupAddressId: addressChoice }),
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

      <section aria-labelledby="colis-a-ramasser" className="card space-y-2">
        <h2 id="colis-a-ramasser" className="font-display text-lg font-bold text-navy">
          Colis à ramasser
        </h2>
        <p className="text-sm font-semibold text-navy">
          {readyParcels.length} colis créé(s) en attente de ramassage
        </p>
        <p className="text-sm text-navy/70">
          Le ramasseur scanne vos colis sur place : leur nombre est compté automatiquement.
        </p>
        <Link href="/vendeur/colis/a-ramasser" className="text-sm text-orange-dark underline">
          Imprimer les étiquettes des colis à ramasser
        </Link>
      </section>

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
