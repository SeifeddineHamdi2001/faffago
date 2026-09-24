'use client';

import { useRouter } from 'next/navigation';
import type { GeoTreeView } from '@faffago/shared';
import { ParcelForm } from './parcel-form';

/**
 * Créer un colis (Vendeur 4.2). After saving, the parcel's page opens; the
 * label is printed from there (Étiquettes). A suspended seller creates
 * nothing (Vendeur 2.5, D-25); "Voir comme le vendeur" writes nothing (D-5).
 */
export function CreateParcelScreen({
  tree,
  readOnly,
  suspended,
}: {
  tree: GeoTreeView;
  readOnly: boolean;
  suspended: boolean;
}) {
  const router = useRouter();
  return (
    <section>
      <h1 className="mb-6 font-display text-2xl font-bold text-navy">Créer un colis</h1>
      {suspended ? (
        <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-900">
          Votre compte est suspendu : vous ne pouvez pas créer de colis.
        </p>
      ) : readOnly ? (
        <p className="text-navy/70">
          Consultation en lecture seule : aucun colis ne peut être créé.
        </p>
      ) : (
        <ParcelForm
          tree={tree}
          onCreated={(parcel) => router.push(`/vendeur/colis/${parcel.code}`)}
        />
      )}
    </section>
  );
}
