'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  PRODUCT_CATEGORY_LABELS_FR,
  SELLER_STATUT_LABELS_FR,
  SellerStatut,
  formatDT,
  formatRatePercent,
  millimesFromJson,
  pickupAddressSchema,
  type GeoTreeView,
  type ProductCategory,
} from '@faffago/shared';
import { bff } from '@/lib/client/call';
import type { ApiError, PickupAddress, SellerProfile } from '@/lib/types';
import { ErrorAlert, fieldErrors } from './account-actions';
import { Dialog } from './dialog';
import {
  EMPTY_ADDRESS,
  PickupAddressFields,
  addressPayload,
  addressSummary,
  type PickupAddressDraft,
} from './pickup-address-fields';

/**
 * Profil (Vendeur 4.14): the shop, the contact person and the statut,
 * read-only (changes go through Faffa Go); the rates, the same for every
 * seller; and the pickup addresses, which the seller adds, corrects and
 * chooses the default of. No password screen: the admin changes it.
 */
export function ProfileScreen({
  profile,
  addresses,
  tree,
  readOnly,
}: {
  profile: SellerProfile;
  addresses: PickupAddress[];
  tree: GeoTreeView;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<PickupAddress | 'NOUVELLE' | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const rates = profile.rates;
  const money = (value: string) => formatDT(millimesFromJson(value));

  async function makeDefault(address: PickupAddress) {
    const result = await bff('POST', `pickup-addresses/${address.id}/default`);
    if (result.ok) router.refresh();
    else setError(result.error);
  }

  return (
    <section className="space-y-6">
      <h1 className="font-display text-2xl font-bold text-navy">Profil</h1>
      {error && <ErrorAlert error={error} />}

      <section aria-labelledby="boutique-title" className="card text-sm">
        <h2 id="boutique-title" className="mb-3 font-display text-lg font-bold text-navy">
          Boutique et contact
        </h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Item label="Boutique" value={profile.shopName} />
          <Item
            label="Catégorie de produits"
            value={PRODUCT_CATEGORY_LABELS_FR[profile.productCategory as ProductCategory]}
          />
          {profile.storeLink && <Item label="Lien de la boutique" value={profile.storeLink} />}
          <Item label="Personne de contact" value={profile.contactFullName} />
          <Item label="Téléphone" value={profile.contactPhone} />
          {profile.email && <Item label="Email (identifiant de connexion)" value={profile.email} />}
          <Item
            label="Statut"
            value={SELLER_STATUT_LABELS_FR[profile.statut as SellerStatut]}
            note={
              profile.statut === SellerStatut.CIN_UNIQUEMENT
                ? `Retenue à la source de ${formatRatePercent(rates.retenueRateBps)} % sur chaque paiement, après les frais Faffa Go.`
                : undefined
            }
          />
        </dl>
        <p className="mt-3 text-navy/70">
          Pour modifier ces informations ou votre mot de passe, contactez Faffa Go.
        </p>
      </section>

      <section aria-labelledby="tarifs-title" className="card text-sm">
        <h2 id="tarifs-title" className="mb-3 font-display text-lg font-bold text-navy">
          Tarifs
        </h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Item label="Frais de livraison" value={money(rates.deliveryFeeMillimes)} />
          <Item label="Frais de retour" value={money(rates.returnFeeMillimes)} />
          <Item label="Changement de client" value={money(rates.changeClientFeeMillimes)} />
          <Item
            label="Ramassage"
            value={`${money(rates.pickupFeeMillimes)} en dessous de ${rates.pickupFreeThreshold} colis, gratuit à partir de ${rates.pickupFreeThreshold}`}
          />
        </dl>
        <p className="mt-3 text-navy/70">Les mêmes pour tous les vendeurs.</p>
      </section>

      <section aria-labelledby="adresses-title" className="card text-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="adresses-title" className="font-display text-lg font-bold text-navy">
            Adresses de ramassage
          </h2>
          {!readOnly && (
            <button type="button" className="btn-secondary" onClick={() => setEditing('NOUVELLE')}>
              Ajouter une adresse
            </button>
          )}
        </div>
        {addresses.length === 0 ? (
          <p className="text-navy/70">
            Aucune adresse : elle est demandée à votre premier ramassage.
          </p>
        ) : (
          <ul className="divide-y divide-navy/10">
            {addresses.map((address) => (
              <li key={address.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="flex-1">
                  {addressSummary(address)}
                  {address.landmark && (
                    <span className="block text-navy/60">{address.landmark}</span>
                  )}
                </span>
                {address.isDefault ? (
                  <span className="badge-ok">Par défaut</span>
                ) : (
                  !readOnly && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => makeDefault(address)}
                    >
                      Choisir par défaut
                    </button>
                  )
                )}
                {!readOnly && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setEditing(address)}
                  >
                    Modifier
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {editing && (
        <AddressDialog
          tree={tree}
          address={editing === 'NOUVELLE' ? null : editing}
          onDone={() => {
            setEditing(null);
            router.refresh();
          }}
          onCancel={() => setEditing(null)}
        />
      )}
    </section>
  );
}

function Item({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <dt className="text-navy/70">{label}</dt>
      <dd className="font-semibold text-navy">{value}</dd>
      {note && <dd className="text-navy/70">{note}</dd>}
    </div>
  );
}

/**
 * Ajouter or Modifier a pickup address. An address a pickup already used is
 * replaced rather than rewritten: that pickup keeps the old one (D-35).
 */
function AddressDialog({
  tree,
  address,
  onDone,
  onCancel,
}: {
  tree: GeoTreeView;
  address: PickupAddress | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<PickupAddressDraft>(
    address
      ? {
          label: address.label ?? '',
          localiteId: address.localiteId,
          address: address.address,
          landmark: address.landmark ?? '',
        }
      : EMPTY_ADDRESS,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const body = addressPayload(draft);
    const parsed = pickupAddressSchema.safeParse(body);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setBusy(true);
    const result = address
      ? await bff('PATCH', `pickup-addresses/${address.id}`, body)
      : await bff('POST', 'pickup-addresses', body);
    setBusy(false);
    if (result.ok) onDone();
    else setApiError(result.error);
  }

  return (
    <Dialog title={address ? 'Modifier l’adresse' : 'Ajouter une adresse'} onDismiss={onCancel}>
      {apiError && <ErrorAlert error={apiError} />}
      <form onSubmit={submit} className="max-h-[70vh] space-y-3 overflow-y-auto pr-1" noValidate>
        {address && (
          <p className="text-sm text-navy/70">
            Les ramassages déjà demandés gardent l’ancienne adresse.
          </p>
        )}
        <PickupAddressFields
          tree={tree}
          value={draft}
          onChange={setDraft}
          errors={errors}
          idPrefix="adresse"
        />
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Annuler
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            Enregistrer
          </button>
        </div>
      </form>
    </Dialog>
  );
}
