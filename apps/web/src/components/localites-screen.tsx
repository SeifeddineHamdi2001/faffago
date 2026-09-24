'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import { bff } from '@/lib/client/call';
import type { ApiError, LocaliteAdminRow } from '@/lib/types';
import { ErrorAlert } from './account-actions';
import { Dialog } from './dialog';

interface DelegationHeader {
  id: string;
  code: string;
  nameFr: string;
  gouvernoratNameFr: string;
}

type Editing = { mode: 'add' } | { mode: 'edit'; localite: LocaliteAdminRow };

/**
 * One délégation's localités (D-17): add, rename, fill the optional Arabic
 * name, the postal code and the other spellings, deactivate or reactivate.
 * The Autre row keeps its name and is never deactivated.
 */
export function LocalitesScreen({
  delegation,
  localites,
}: {
  delegation: DelegationHeader;
  localites: LocaliteAdminRow[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  async function setActive(localite: LocaliteAdminRow, isActive: boolean) {
    setError(null);
    const result = await bff('PATCH', `localites/${localite.id}`, { isActive });
    if (!result.ok) setError(result.error);
    router.refresh();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-display text-lg font-bold text-navy">
          {delegation.nameFr}{' '}
          <span className="font-normal text-navy/70">
            {delegation.gouvernoratNameFr} · {delegation.code}
          </span>
        </h2>
        <button type="button" className="btn-primary" onClick={() => setEditing({ mode: 'add' })}>
          Ajouter une localité
        </button>
      </div>

      {error && <ErrorAlert error={error} />}

      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-navy/70">
            <tr>
              <th className="py-2 pr-3 font-semibold">Localité</th>
              <th className="py-2 pr-3 font-semibold">Nom en arabe</th>
              <th className="py-2 pr-3 font-semibold">Code postal</th>
              <th className="py-2 pr-3 font-semibold">Autres noms</th>
              <th className="py-2 font-semibold">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {localites.map((localite) => (
              <tr
                key={localite.id}
                aria-label={localite.nameFr}
                className="border-t border-navy/10"
              >
                <td className="py-2 pr-3">
                  <span className="font-semibold">{localite.nameFr}</span>
                  {!localite.isActive && <span className="badge-muted ml-2">Désactivée</span>}
                </td>
                <td className="py-2 pr-3" dir="rtl" lang="ar">
                  {localite.nameAr ?? ''}
                </td>
                <td className="py-2 pr-3">{localite.postalCode ?? ''}</td>
                <td className="py-2 pr-3">{localite.aliases.join(', ')}</td>
                <td className="py-2 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setEditing({ mode: 'edit', localite })}
                    >
                      Modifier
                    </button>
                    {!localite.isOther &&
                      (localite.isActive ? (
                        <button
                          type="button"
                          className="btn-danger"
                          onClick={() => setActive(localite, false)}
                        >
                          Désactiver
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => setActive(localite, true)}
                        >
                          Réactiver
                        </button>
                      ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <LocaliteDialog
          delegationId={delegation.id}
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

/** "Jardins Gammarth, Gammarth 2" → two aliases; empty pieces dropped. */
function parseAliases(text: string): string[] {
  return text
    .split(',')
    .map((alias) => alias.trim())
    .filter(Boolean);
}

function LocaliteDialog({
  delegationId,
  editing,
  onCancel,
  onDone,
}: {
  delegationId: string;
  editing: Editing;
  onCancel: () => void;
  onDone: () => void;
}) {
  const current = editing.mode === 'edit' ? editing.localite : null;
  const isOther = current?.isOther ?? false;
  const ids = { fr: useId(), ar: useId(), postal: useId(), aliases: useId() };
  const [nameFr, setNameFr] = useState(current?.nameFr ?? '');
  const [nameAr, setNameAr] = useState(current?.nameAr ?? '');
  const [postalCode, setPostalCode] = useState(current?.postalCode ?? '');
  const [aliases, setAliases] = useState(current?.aliases.join(', ') ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const fields = {
      nameAr: nameAr.trim() || null,
      postalCode: postalCode.trim() || null,
      aliases: parseAliases(aliases),
    };
    setBusy(true);
    const result = current
      ? await bff('PATCH', `localites/${current.id}`, {
          // The Autre row keeps its name (D-17): never send one.
          ...(isOther ? {} : { nameFr: nameFr.trim() }),
          ...fields,
        })
      : await bff('POST', 'localites', { delegationId, nameFr: nameFr.trim(), ...fields });
    setBusy(false);
    if (result.ok) onDone();
    else setError(result.error.issues?.[0]?.message ?? result.error.message);
  }

  return (
    <Dialog
      title={current ? `Modifier ${current.nameFr}` : 'Ajouter une localité'}
      onDismiss={onCancel}
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <div>
          <label htmlFor={ids.fr} className="field-label">
            Nom en français
          </label>
          <input
            id={ids.fr}
            className="field"
            value={nameFr}
            disabled={isOther}
            onChange={(e) => setNameFr(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor={ids.ar} className="field-label">
            Nom en arabe
          </label>
          <input
            id={ids.ar}
            className="field"
            dir="rtl"
            lang="ar"
            value={nameAr}
            onChange={(e) => setNameAr(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor={ids.postal} className="field-label">
            Code postal
          </label>
          <input
            id={ids.postal}
            className="field"
            inputMode="numeric"
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor={ids.aliases} className="field-label">
            Autres noms (séparés par des virgules)
          </label>
          <input
            id={ids.aliases}
            className="field"
            value={aliases}
            onChange={(e) => setAliases(e.target.value)}
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
