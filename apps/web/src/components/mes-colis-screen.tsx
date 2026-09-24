'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  MAX_LABELS_PER_PDF,
  PARCEL_CASH_STATUS_LABELS_FR,
  PARCEL_GROUP_LABELS_FR,
  PARCEL_STATUS_LABELS_FR,
  ParcelGroup,
  formatDT,
  millimesFromJson,
} from '@faffago/shared';
import type { ParcelList } from '@/lib/types';
import { PrintLabels } from './print-labels';
import { TrackLine } from './track-line';

export interface ParcelFilters {
  group: ParcelGroup;
  q: string;
  from: string;
  to: string;
  page: number;
}

const date = new Intl.DateTimeFormat('fr-TN', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Africa/Tunis',
});

/** The address of Mes colis for these filters, in the words the seller sees. */
export function mesColisHref(filters: ParcelFilters, change: Partial<ParcelFilters> = {}): string {
  const next = { ...filters, ...change };
  const params = new URLSearchParams();
  if (next.group !== ParcelGroup.TOUS) params.set('groupe', next.group);
  if (next.q) params.set('q', next.q);
  if (next.from) params.set('du', next.from);
  if (next.to) params.set('au', next.to);
  if (next.page > 1) params.set('page', String(next.page));
  const query = params.toString();
  return `/vendeur/colis${query ? `?${query}` : ''}`;
}

/** The same filters for the API: Exporter takes exactly what the table shows. */
function apiQuery(filters: ParcelFilters): string {
  const params = new URLSearchParams({ group: filters.group });
  if (filters.q) params.set('q', filters.q);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  return params.toString();
}

/**
 * Mes colis (Vendeur 4.7): the seller's parcels by status group, with the
 * count of each; search by code, name or phone; a date range; Exporter; and
 * a selection to print labels in one batch (Vendeur 4.4).
 */
export function MesColisScreen({
  list,
  filters,
  readOnly,
  invalidFilter,
}: {
  list: ParcelList;
  filters: ParcelFilters;
  readOnly: boolean;
  invalidFilter: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const toggle = (code: string) =>
    setSelected((current) =>
      current.includes(code) ? current.filter((c) => c !== code) : [...current, code],
    );
  const onPage = list.items.map((parcel) => parcel.code);
  const allOnPage = onPage.length > 0 && onPage.every((code) => selected.includes(code));

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-navy">Mes colis</h1>
        {!readOnly && (
          <a className="btn-secondary" href={`/api/bff/parcels/export?${apiQuery(filters)}`}>
            Exporter
          </a>
        )}
      </div>

      <nav aria-label="Filtrer par statut" className="mb-4 flex flex-wrap gap-2">
        {Object.values(ParcelGroup).map((group) => (
          <Link
            key={group}
            href={mesColisHref(filters, { group, page: 1 })}
            aria-current={filters.group === group ? 'page' : undefined}
            className={`rounded-full px-3 py-1 text-sm font-semibold ${
              filters.group === group ? 'bg-orange text-navy' : 'bg-navy/5 text-navy'
            }`}
          >
            {PARCEL_GROUP_LABELS_FR[group]} ({list.counts[group]})
          </Link>
        ))}
      </nav>

      <form method="get" action="/vendeur/colis" className="card mb-4 grid gap-3 sm:grid-cols-4">
        {filters.group !== ParcelGroup.TOUS && (
          <input type="hidden" name="groupe" value={filters.group} />
        )}
        <div className="sm:col-span-2">
          <label htmlFor="q" className="field-label">
            Rechercher
          </label>
          <input
            id="q"
            name="q"
            className="field"
            defaultValue={filters.q}
            placeholder="Code, nom ou téléphone"
          />
        </div>
        <div>
          <label htmlFor="du" className="field-label">
            Du
          </label>
          <input id="du" name="du" type="date" className="field" defaultValue={filters.from} />
        </div>
        <div>
          <label htmlFor="au" className="field-label">
            Au
          </label>
          <input id="au" name="au" type="date" className="field" defaultValue={filters.to} />
        </div>
        <div className="flex gap-2 sm:col-span-4">
          <button type="submit" className="btn-primary">
            Filtrer
          </button>
          <Link href="/vendeur/colis" className="btn-secondary">
            Effacer
          </Link>
        </div>
      </form>

      {invalidFilter && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-900">
          Filtre invalide : tous les colis sont affichés.
        </p>
      )}

      {!readOnly && selected.length > 0 && (
        <div className="mb-4 rounded-xl bg-navy/5 p-3">
          <PrintLabels
            path="parcels/labels"
            query={`codes=${selected.slice(0, MAX_LABELS_PER_PDF).join(',')}`}
            title={`Imprimer ${selected.length} étiquette${selected.length > 1 ? 's' : ''}`}
          />
        </div>
      )}

      {list.items.length === 0 ? (
        <p className="text-navy/70">Aucun colis.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-navy/70">
              <tr>
                {!readOnly && (
                  <th className="p-2">
                    <input
                      type="checkbox"
                      aria-label="Tout sélectionner sur cette page"
                      checked={allOnPage}
                      onChange={() =>
                        setSelected((current) =>
                          allOnPage
                            ? current.filter((code) => !onPage.includes(code))
                            : [...new Set([...current, ...onPage])],
                        )
                      }
                    />
                  </th>
                )}
                <th className="p-2">Code</th>
                <th className="p-2">Destinataire</th>
                <th className="p-2">Délégation</th>
                <th className="p-2">Suivi</th>
                <th className="p-2">Statut</th>
                <th className="p-2">Paiement</th>
                <th className="p-2">COD</th>
                <th className="p-2">Date</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((parcel) => (
                <tr key={parcel.code} className="border-t border-navy/10">
                  {!readOnly && (
                    <td className="p-2">
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
                  <td className="p-2">
                    <TrackLine status={parcel.status} compact />
                  </td>
                  <td className="p-2">{PARCEL_STATUS_LABELS_FR[parcel.status]}</td>
                  <td className="p-2">
                    {parcel.cashStatus ? PARCEL_CASH_STATUS_LABELS_FR[parcel.cashStatus] : '—'}
                  </td>
                  <td className="whitespace-nowrap p-2">
                    {formatDT(millimesFromJson(parcel.codAmountMillimes))}
                  </td>
                  <td className="whitespace-nowrap p-2">
                    {date.format(new Date(parcel.createdAt))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <nav aria-label="Pages" className="mt-4 flex items-center gap-3 text-sm">
          {filters.page > 1 && (
            <Link
              className="btn-secondary"
              href={mesColisHref(filters, { page: filters.page - 1 })}
            >
              Précédent
            </Link>
          )}
          <span>
            Page {filters.page} sur {pages} · {list.total} colis
          </span>
          {filters.page < pages && (
            <Link
              className="btn-secondary"
              href={mesColisHref(filters, { page: filters.page + 1 })}
            >
              Suivant
            </Link>
          )}
        </nav>
      )}
    </section>
  );
}
