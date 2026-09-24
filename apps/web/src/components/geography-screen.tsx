'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import { SANS_ZONE_LABEL } from '@faffago/shared';
import { bff } from '@/lib/client/call';
import type { ApiError, GeographyRow } from '@/lib/types';
import { ErrorAlert } from './account-actions';
import { Dialog } from './dialog';

interface ZoneChoice {
  id: string;
  name: string;
  isActive: boolean;
}

interface Editing {
  title: string;
  path: string;
  nameFr: string;
  nameAr: string;
}

/**
 * Paramètres › Géographie (Admin 4.16, D-17, D-51): the 4 gouvernorats and 48
 * délégations, renamed in French and Arabic but never added nor deactivated,
 * each délégation's zone, and the way to its localités. The admin's Arabic
 * names are the review path for the native-speaker check.
 */
export function GeographyScreen({
  gouvernorats,
  zones,
}: {
  gouvernorats: GeographyRow[];
  zones: ZoneChoice[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const activeZones = zones.filter((zone) => zone.isActive);

  async function moveToZone(delegationId: string, zoneId: string) {
    setError(null);
    const result = await bff('PATCH', `delegations/${delegationId}`, { zoneId: zoneId || null });
    if (!result.ok) setError(result.error);
    router.refresh();
  }

  return (
    <div>
      <p className="mb-4 text-sm">
        <Link
          href="/admin/parametres/geographie/autre"
          className="font-semibold text-orange-dark underline"
        >
          Colis classés sous Autre
        </Link>
      </p>

      {error && <ErrorAlert error={error} />}

      <div className="space-y-6">
        {gouvernorats.map((gouvernorat) => (
          <section key={gouvernorat.id} className="card overflow-x-auto">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-lg font-bold text-navy">
                {gouvernorat.nameFr}{' '}
                <span dir="rtl" lang="ar" className="font-normal text-navy/70">
                  {gouvernorat.nameAr}
                </span>
              </h2>
              <button
                type="button"
                className="btn-secondary"
                aria-label={`Modifier le gouvernorat ${gouvernorat.nameFr}`}
                onClick={() =>
                  setEditing({
                    title: `Modifier ${gouvernorat.nameFr}`,
                    path: `gouvernorats/${gouvernorat.id}`,
                    nameFr: gouvernorat.nameFr,
                    nameAr: gouvernorat.nameAr,
                  })
                }
              >
                Modifier
              </button>
            </div>
            <table className="w-full text-left text-sm">
              <thead className="text-navy/70">
                <tr>
                  <th className="py-2 pr-3 font-semibold">Délégation</th>
                  <th className="py-2 pr-3 font-semibold">Nom en arabe</th>
                  <th className="py-2 pr-3 font-semibold">Zone</th>
                  <th className="py-2 pr-3 font-semibold">Localités</th>
                  <th className="py-2 font-semibold">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {gouvernorat.delegations.map((delegation) => {
                  const selectId = `zone-${delegation.id}`;
                  return (
                    <tr
                      key={delegation.id}
                      aria-label={delegation.nameFr}
                      className="border-t border-navy/10"
                    >
                      <td className="py-2 pr-3">
                        <span className="font-semibold">{delegation.nameFr}</span>
                        <span className="block text-xs text-navy/60">{delegation.code}</span>
                      </td>
                      <td className="py-2 pr-3" dir="rtl" lang="ar">
                        {delegation.nameAr}
                      </td>
                      <td className="py-2 pr-3">
                        <label htmlFor={selectId} className="sr-only">
                          Zone de {delegation.nameFr}
                        </label>
                        <select
                          id={selectId}
                          className="field"
                          value={delegation.zone?.id ?? ''}
                          onChange={(e) => moveToZone(delegation.id, e.target.value)}
                        >
                          <option value="">{SANS_ZONE_LABEL}</option>
                          {activeZones.map((zone) => (
                            <option key={zone.id} value={zone.id}>
                              {zone.name}
                            </option>
                          ))}
                        </select>
                        {!delegation.zone && (
                          <span className="badge-warn mt-1 inline-block">{SANS_ZONE_LABEL}</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <Link
                          href={`/admin/parametres/geographie/${delegation.id}`}
                          className="font-semibold text-orange-dark underline"
                        >
                          Localités ({delegation.localiteCount})
                        </Link>
                      </td>
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() =>
                            setEditing({
                              title: `Modifier ${delegation.nameFr}`,
                              path: `delegations/${delegation.id}`,
                              nameFr: delegation.nameFr,
                              nameAr: delegation.nameAr,
                            })
                          }
                        >
                          Modifier
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ))}
      </div>

      {editing && (
        <NamesDialog
          editing={editing}
          onCancel={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/** French and Arabic names, both required for gouvernorats and délégations (A-18). */
function NamesDialog({
  editing,
  onCancel,
  onDone,
}: {
  editing: Editing;
  onCancel: () => void;
  onDone: () => void;
}) {
  const frId = useId();
  const arId = useId();
  const [nameFr, setNameFr] = useState(editing.nameFr);
  const [nameAr, setNameAr] = useState(editing.nameAr);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await bff('PATCH', editing.path, {
      nameFr: nameFr.trim(),
      nameAr: nameAr.trim(),
    });
    setBusy(false);
    if (result.ok) onDone();
    else setError(result.error.issues?.[0]?.message ?? result.error.message);
  }

  return (
    <Dialog title={editing.title} onDismiss={onCancel}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <div>
          <label htmlFor={frId} className="field-label">
            Nom en français
          </label>
          <input
            id={frId}
            className="field"
            value={nameFr}
            onChange={(e) => setNameFr(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor={arId} className="field-label">
            Nom en arabe
          </label>
          <input
            id={arId}
            className="field"
            dir="rtl"
            lang="ar"
            value={nameAr}
            onChange={(e) => setNameAr(e.target.value)}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3">
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
