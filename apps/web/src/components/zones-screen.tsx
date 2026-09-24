'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import {
  ROLE_LABELS_FR,
  ZONE_ASSIGNMENT_KIND_LABELS_FR,
  ZONE_ROLES,
  SAME_TITULAR_AND_BACKUP_MESSAGE,
  ZoneAssignmentKind,
  isSameTitularAndBackup,
  type ZoneAssignmentsValues,
  type ZoneRole,
} from '@faffago/shared';
import { bff } from '@/lib/client/call';
import type { ApiError, CourierRow, ZoneRow } from '@/lib/types';
import { ErrorAlert } from './account-actions';
import { Dialog } from './dialog';

const KINDS = [ZoneAssignmentKind.TITULAIRE, ZoneAssignmentKind.BACKUP] as const;

type Picks = Record<ZoneRole, Record<ZoneAssignmentKind, string>>;

function picksOf(zone: ZoneRow): Picks {
  const of = (role: ZoneRole) => ({
    TITULAIRE: zone.assignments[role].TITULAIRE?.id ?? '',
    BACKUP: zone.assignments[role].BACKUP?.id ?? '',
  });
  return { LIVREUR: of('LIVREUR'), RAMASSEUR: of('RAMASSEUR') };
}

/** "Livreur titulaire", "Ramasseur backup". */
function slotLabel(role: ZoneRole, kind: ZoneAssignmentKind): string {
  return `${ROLE_LABELS_FR[role]} ${ZONE_ASSIGNMENT_KIND_LABELS_FR[kind].toLowerCase()}`;
}

/**
 * Paramètres › Zones (Admin 4.5, 4.16, D-51): each zone with its délégations
 * and its four couriers — a livreur and a ramasseur, each a titular and a
 * backup. Délégations move between zones in Paramètres › Géographie.
 */
export function ZonesScreen({ zones, couriers }: { zones: ZoneRow[]; couriers: CourierRow[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<ZoneRow | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  async function setActive(zone: ZoneRow, isActive: boolean) {
    setError(null);
    const result = await bff('PATCH', `zones/${zone.id}`, { isActive });
    if (!result.ok) setError(result.error);
    else router.refresh();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-navy/70">
          Les délégations changent de zone dans l’onglet Géographie.
        </p>
        <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
          Créer une zone
        </button>
      </div>

      {error && <ErrorAlert error={error} />}

      <div className="space-y-4">
        {zones.map((zone) => (
          <ZoneCard
            key={zone.id}
            zone={zone}
            couriers={couriers}
            onRename={() => setRenaming(zone)}
            onSetActive={(isActive) => setActive(zone, isActive)}
          />
        ))}
      </div>

      {creating && (
        <ZoneNameDialog
          title="Créer une zone"
          submitLabel="Créer"
          initial=""
          onCancel={() => setCreating(false)}
          onSubmit={(name) => bff('POST', 'zones', { name })}
          onDone={() => {
            setCreating(false);
            router.refresh();
          }}
        />
      )}
      {renaming && (
        <ZoneNameDialog
          title="Renommer la zone"
          submitLabel="Enregistrer"
          initial={renaming.name}
          onCancel={() => setRenaming(null)}
          onSubmit={(name) => bff('PATCH', `zones/${renaming.id}`, { name })}
          onDone={() => {
            setRenaming(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function ZoneCard({
  zone,
  couriers,
  onRename,
  onSetActive,
}: {
  zone: ZoneRow;
  couriers: CourierRow[];
  onRename: () => void;
  onSetActive: (isActive: boolean) => void;
}) {
  const router = useRouter();
  const titleId = useId();
  const [picks, setPicks] = useState<Picks>(() => picksOf(zone));
  const [status, setStatus] = useState<
    { kind: 'saved' } | { kind: 'error'; message: string } | null
  >(null);
  const [busy, setBusy] = useState(false);

  /**
   * Couriers who can take new work (D-12), plus whoever already holds the
   * slot: the API keeps him in place even after he stopped taking work.
   */
  function optionsFor(role: ZoneRole, kind: ZoneAssignmentKind) {
    const current = zone.assignments[role][kind];
    const eligible = couriers.filter(
      (c) =>
        c.role === role &&
        c.isActive !== false &&
        c.acceptsWork !== false &&
        c.accountState !== 'INACTIF',
    );
    if (current && !eligible.some((c) => c.id === current.id)) {
      return [
        ...eligible.map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName}` })),
        {
          id: current.id,
          label: `${current.firstName} ${current.lastName} (ne reçoit plus de travail)`,
        },
      ];
    }
    return eligible.map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName}` }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setStatus(null);
    const body: ZoneAssignmentsValues = {
      LIVREUR: {
        titulaireId: picks.LIVREUR.TITULAIRE || null,
        backupId: picks.LIVREUR.BACKUP || null,
      },
      RAMASSEUR: {
        titulaireId: picks.RAMASSEUR.TITULAIRE || null,
        backupId: picks.RAMASSEUR.BACKUP || null,
      },
    };
    if (ZONE_ROLES.some((role) => isSameTitularAndBackup(body[role]))) {
      setStatus({ kind: 'error', message: SAME_TITULAR_AND_BACKUP_MESSAGE });
      return;
    }
    setBusy(true);
    const result = await bff('PUT', `zones/${zone.id}/assignments`, body);
    setBusy(false);
    if (result.ok) {
      setStatus({ kind: 'saved' });
      router.refresh();
    } else {
      setStatus({ kind: 'error', message: result.error.message });
    }
  }

  return (
    <section aria-labelledby={titleId} className="card">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={titleId} className="font-display text-lg font-bold text-navy">
            {zone.name}
          </h2>
          {!zone.isActive && <span className="badge-muted">Désactivée</span>}
          <p className="mt-1 text-sm text-navy/70">
            {zone.delegations.length > 0
              ? zone.delegations.map((d) => d.nameFr).join(', ')
              : 'Aucune délégation'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={onRename}>
            Renommer
          </button>
          {zone.isActive ? (
            <button type="button" className="btn-danger" onClick={() => onSetActive(false)}>
              Désactiver
            </button>
          ) : (
            <button type="button" className="btn-secondary" onClick={() => onSetActive(true)}>
              Réactiver
            </button>
          )}
        </div>
      </div>

      {zone.isActive && (
        <form onSubmit={save} noValidate>
          <div className="grid gap-3 sm:grid-cols-2">
            {ZONE_ROLES.flatMap((role) =>
              KINDS.map((kind) => {
                const id = `${zone.id}-${role}-${kind}`;
                return (
                  <div key={id}>
                    <label htmlFor={id} className="field-label">
                      {slotLabel(role, kind)}
                    </label>
                    <select
                      id={id}
                      className="field"
                      value={picks[role][kind]}
                      onChange={(e) =>
                        setPicks((p) => ({ ...p, [role]: { ...p[role], [kind]: e.target.value } }))
                      }
                    >
                      <option value="">Personne</option>
                      {optionsFor(role, kind).map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              }),
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="submit" className="btn-primary" disabled={busy}>
              Enregistrer les coursiers
            </button>
            {status?.kind === 'saved' && (
              <p role="status" className="text-sm font-semibold text-green-800">
                Enregistré
              </p>
            )}
            {status?.kind === 'error' && (
              <p role="alert" className="text-sm text-red-700">
                {status.message}
              </p>
            )}
          </div>
        </form>
      )}
    </section>
  );
}

function ZoneNameDialog({
  title,
  submitLabel,
  initial,
  onCancel,
  onSubmit,
  onDone,
}: {
  title: string;
  submitLabel: string;
  initial: string;
  onCancel: () => void;
  onSubmit: (name: string) => Promise<{ ok: true } | { ok: false; error: ApiError }>;
  onDone: () => void;
}) {
  const inputId = useId();
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await onSubmit(name.trim());
    setBusy(false);
    if (result.ok) onDone();
    else setError(result.error.message);
  }

  return (
    <Dialog title={title} onDismiss={onCancel}>
      <form onSubmit={submit} noValidate>
        <label htmlFor={inputId} className="field-label">
          Nom de la zone
        </label>
        <input
          id={inputId}
          className="field"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {error && (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Annuler
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {submitLabel}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
