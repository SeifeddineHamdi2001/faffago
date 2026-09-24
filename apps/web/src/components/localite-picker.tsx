'use client';

import { useId, useMemo, useState } from 'react';
import {
  localiteFullLabel,
  searchLocalites,
  type GeoTreeView,
  type LocaliteRecord,
} from '@faffago/shared';

/**
 * Gouvernorat → délégation → localité, or one search box across localités and
 * their other names (Vendeur 4.2, D-17). A search result fills all three.
 * The délégation is never chosen on its own: it comes from the localité.
 */
export function LocalitePicker({
  tree,
  localites,
  value,
  onChange,
  error,
}: {
  tree: GeoTreeView;
  localites: LocaliteRecord[];
  value: string;
  onChange: (localiteId: string) => void;
  error?: string;
}) {
  const id = useId();
  const selected = localites.find((l) => l.id === value) ?? null;
  const [query, setQuery] = useState('');
  const [gouvernorat, setGouvernorat] = useState(selected?.delegation.gouvernoratCode ?? '');
  const [delegation, setDelegation] = useState(selected?.delegation.id ?? '');

  const hits = useMemo(() => searchLocalites(query, localites, { limit: 8 }), [query, localites]);
  const delegations = tree.gouvernorats.find((g) => g.code === gouvernorat)?.delegations ?? [];
  const inDelegation = delegations.find((d) => d.id === delegation)?.localites ?? [];

  function choose(localite: LocaliteRecord) {
    setGouvernorat(localite.delegation.gouvernoratCode);
    setDelegation(localite.delegation.id);
    setQuery('');
    onChange(localite.id);
  }

  return (
    <fieldset className="space-y-3">
      <legend className="field-label">Gouvernorat / Délégation / Localité</legend>
      <div>
        <label htmlFor={`${id}-search`} className="sr-only">
          Rechercher une localité
        </label>
        <input
          id={`${id}-search`}
          className="field"
          placeholder="Rechercher une localité (ex. Ennasr, 2026)"
          value={query}
          autoComplete="off"
          onChange={(e) => setQuery(e.target.value)}
        />
        {hits.length > 0 && (
          <ul className="mt-1 rounded-xl border border-navy/15 bg-white" aria-label="Résultats">
            {hits.map((hit) => (
              <li key={hit.localite.id}>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-navy/5 focus:bg-navy/5"
                  onClick={() => choose(hit.localite)}
                >
                  {hit.label}
                  {hit.matchedAlias && <span className="text-navy/60"> ({hit.matchedAlias})</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor={`${id}-gouvernorat`} className="field-label">
            Gouvernorat
          </label>
          <select
            id={`${id}-gouvernorat`}
            className="field"
            value={gouvernorat}
            onChange={(e) => {
              setGouvernorat(e.target.value);
              setDelegation('');
              onChange('');
            }}
          >
            <option value="">Choisir…</option>
            {tree.gouvernorats.map((g) => (
              <option key={g.code} value={g.code}>
                {g.nameFr}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-delegation`} className="field-label">
            Délégation
          </label>
          <select
            id={`${id}-delegation`}
            className="field"
            value={delegation}
            disabled={!gouvernorat}
            onChange={(e) => {
              setDelegation(e.target.value);
              onChange('');
            }}
          >
            <option value="">Choisir…</option>
            {delegations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nameFr}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-localite`} className="field-label">
            Localité
          </label>
          <select
            id={`${id}-localite`}
            className="field"
            value={value}
            disabled={!delegation}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">Choisir…</option>
            {/* Autre is already last in the tree (D-17). */}
            {inDelegation.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nameFr}
              </option>
            ))}
          </select>
        </div>
      </div>
      {selected && <p className="text-sm text-navy/70">{localiteFullLabel(selected)}</p>}
      {error && (
        <p id={`${id}-error`} className="text-sm text-red-700">
          {error}
        </p>
      )}
    </fieldset>
  );
}
