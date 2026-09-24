'use client';

import { useMemo } from 'react';
import { localitesOfTree, type GeoTreeView } from '@faffago/shared';
import { Field } from './create-courier-form';
import { LocalitePicker } from './localite-picker';

export interface PickupAddressDraft {
  label: string;
  localiteId: string;
  address: string;
  landmark: string;
}

export const EMPTY_ADDRESS: PickupAddressDraft = {
  label: '',
  localiteId: '',
  address: '',
  landmark: '',
};

/** What the API reads: optional texts left empty are null. */
export function addressPayload(draft: PickupAddressDraft) {
  return {
    label: draft.label.trim() || null,
    localiteId: draft.localiteId,
    address: draft.address,
    landmark: draft.landmark.trim() || null,
  };
}

/**
 * A pickup address (Vendeur 4.5): gouvernorat, délégation, localité, address,
 * landmark, and an optional name to tell several apart. Used by the first
 * request and by Profil.
 */
export function PickupAddressFields({
  tree,
  value,
  onChange,
  errors,
  idPrefix,
}: {
  tree: GeoTreeView;
  value: PickupAddressDraft;
  onChange: (value: PickupAddressDraft) => void;
  errors: Record<string, string>;
  idPrefix: string;
}) {
  const localites = useMemo(() => localitesOfTree(tree), [tree]);
  const set = (key: keyof PickupAddressDraft) => (next: string) =>
    onChange({ ...value, [key]: next });
  return (
    <div className="space-y-3">
      <LocalitePicker
        tree={tree}
        localites={localites}
        value={value.localiteId}
        onChange={set('localiteId')}
        error={errors.localiteId}
      />
      <Field
        id={`${idPrefix}-address`}
        label="Adresse"
        value={value.address}
        onChange={set('address')}
        error={errors.address}
      />
      <Field
        id={`${idPrefix}-landmark`}
        label="Repère (facultatif)"
        value={value.landmark}
        onChange={set('landmark')}
        error={errors.landmark}
      />
      <Field
        id={`${idPrefix}-label`}
        label="Nom de l’adresse (facultatif, ex. Entrepôt)"
        value={value.label}
        onChange={set('label')}
        error={errors.label}
      />
    </div>
  );
}

/** "Entrepôt — 4 rue de Rome, Khaznadar (Le Bardo)". */
export function addressSummary(address: {
  label: string | null;
  address: string;
  localiteNameFr: string;
  delegationNameFr: string;
}): string {
  const place = `${address.address}, ${address.localiteNameFr} (${address.delegationNameFr})`;
  return address.label ? `${address.label} — ${place}` : place;
}
