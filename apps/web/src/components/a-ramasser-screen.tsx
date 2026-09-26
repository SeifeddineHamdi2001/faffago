'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  MAX_LABELS_PER_PDF,
  PICKUP_STATUS_LABELS_FR,
  formatDT,
  millimesFromJson,
} from '@faffago/shared';
import type { AwaitingParcel } from '@/lib/types';
import { PrintLabels } from './print-labels';

const date = new Intl.DateTimeFormat('fr-TN', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Africa/Tunis',
});

/**
 * À ramasser (D-98): the seller's Créé parcels only, to print their labels and
 * the list before the ramasseur comes. Every parcel starts selected; the list
 * prints without the menu.
 */
export function ARamasserScreen({
  parcels,
  readOnly,
  canRequest,
}: {
  parcels: AwaitingParcel[];
  readOnly: boolean;
  canRequest: boolean;
}) {
  const [selected, setSelected] = useState<string[]>(parcels.map((p) => p.code));
  const all = parcels.length > 0 && selected.length === parcels.length;
  const toggle = (code: string) =>
    setSelected((current) =>
      current.includes(code) ? current.filter((c) => c !== code) : [...current, code],
    );
  const notRequested = parcels.filter((p) => p.pickup === null).length;
  const totalCod = parcels.reduce((sum, p) => sum + millimesFromJson(p.codAmountMillimes), 0n);

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-navy">Colis à ramasser</h1>
        <div className="flex flex-wrap gap-2 print:hidden">
          {parcels.length > 0 && (
            <button type="button" className="btn-secondary" onClick={() => window.print()}>
              Imprimer la liste
            </button>
          )}
          {canRequest && notRequested > 0 && (
            <Link href="/vendeur/ramassages/nouveau" className="btn-primary">
              Demander un ramassage
            </Link>
          )}
        </div>
      </div>
      <p className="mb-4 text-sm text-navy/70">
        {parcels.length} colis · {formatDT(totalCod)} à encaisser. Collez l’étiquette sur chaque
        colis avant le passage du ramasseur.
      </p>

      {!readOnly && selected.length > 0 && (
        <div className="mb-4 rounded-xl bg-navy/5 p-3 print:hidden">
          <PrintLabels
            path="parcels/labels"
            query={`codes=${selected.slice(0, MAX_LABELS_PER_PDF).join(',')}`}
            title={`Imprimer ${selected.length} étiquette${selected.length > 1 ? 's' : ''}`}
          />
        </div>
      )}

      {parcels.length === 0 ? (
        <p className="text-navy/70">Aucun colis en attente de ramassage.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-navy/70">
              <tr>
                {!readOnly && (
                  <th className="p-2 print:hidden">
                    <input
                      type="checkbox"
                      aria-label="Tout sélectionner"
                      checked={all}
                      onChange={() => setSelected(all ? [] : parcels.map((p) => p.code))}
                    />
                  </th>
                )}
                <th className="p-2">Code</th>
                <th className="p-2">Destinataire</th>
                <th className="p-2">Délégation</th>
                <th className="p-2">COD</th>
                <th className="p-2">Créé le</th>
                <th className="p-2">Ramassage</th>
              </tr>
            </thead>
            <tbody>
              {parcels.map((parcel) => (
                <tr key={parcel.code} className="border-t border-navy/10">
                  {!readOnly && (
                    <td className="p-2 print:hidden">
                      <input
                        type="checkbox"
                        aria-label={`Sélectionner ${parcel.code}`}
                        checked={selected.includes(parcel.code)}
                        onChange={() => toggle(parcel.code)}
                      />
                    </td>
                  )}
                  <td className="p-2">
                    <Link
                      href={`/vendeur/colis/${parcel.code}`}
                      className="font-mono font-semibold text-navy underline"
                    >
                      {parcel.code}
                    </Link>
                  </td>
                  <td className="p-2">
                    {parcel.recipientName}
                    <span className="block text-navy/60">{parcel.recipientPhone}</span>
                  </td>
                  <td className="p-2">{parcel.delegationNameFr}</td>
                  <td className="whitespace-nowrap p-2">
                    {formatDT(millimesFromJson(parcel.codAmountMillimes))}
                  </td>
                  <td className="whitespace-nowrap p-2">
                    {date.format(new Date(parcel.createdAt))}
                  </td>
                  <td className="p-2">
                    {parcel.pickup ? (
                      <Link
                        href={`/vendeur/ramassages/${parcel.pickup.id}`}
                        className="text-orange-dark underline"
                      >
                        {PICKUP_STATUS_LABELS_FR[parcel.pickup.status]}
                      </Link>
                    ) : (
                      'Pas encore demandé'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
