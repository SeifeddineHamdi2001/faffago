'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import {
  PARCEL_STATUS_LABELS_FR,
  RELAUNCH_SLOT_LABELS_FR,
  SANS_COURSIER_LABEL,
  SANS_ZONE_LABEL,
  ZONE_ASSIGNMENT_KIND_LABELS_FR,
  formatTunisDay,
  type ParcelStatus,
  type RelaunchSlot,
} from '@faffago/shared';
import { bff } from '@/lib/client/call';
import type { ApiError, CourierRow, TourParcelRow, TourneesView } from '@/lib/types';

function fullName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`;
}

/**
 * Tournées (Admin 4.5, D-52, D-55): the parcels at the depot due today, in
 * their zone's column under the livreur covering it today, each courier's
 * load, and the moves the team makes before dispatch. The Sortie coursier
 * scan is what assigns a parcel.
 */
export function TourneesScreen({ plan, couriers }: { plan: TourneesView; couriers: CourierRow[] }) {
  const router = useRouter();
  const selectId = useId();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [courierId, setCourierId] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  // Only a livreur who can go out today (D-53).
  const livreurs = couriers
    .filter(
      (c) =>
        c.role === 'LIVREUR' && c.isActive !== false && c.acceptsWork !== false && !c.absentToday,
    )
    .sort((a, b) => fullName(a).localeCompare(fullName(b), 'fr'));

  function toggle(ids: string[], on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
    setDone(null);
  }

  async function move(target: string | null) {
    setBusy(true);
    setError(null);
    setDone(null);
    // In the order of the page, whatever the order they were ticked.
    const ordered = [...plan.zones.flatMap((z) => z.parcels), ...plan.sansZone]
      .map((p) => p.id)
      .filter((id) => selected.has(id));
    const response = await bff<{ moved: number }>('POST', 'tournees/moves', {
      parcelIds: ordered,
      courierId: target,
    });
    setBusy(false);
    if (!response.ok) {
      setError(response.error);
      return;
    }
    const n = response.data.moved;
    setDone(n === 1 ? '1 colis déplacé' : `${n} colis déplacés`);
    setSelected(new Set());
    router.refresh();
  }

  const empty = plan.zones.length === 0 && plan.sansZone.length === 0;

  return (
    <section className="pb-28">
      <h1 className="mb-4 font-display text-2xl font-bold text-navy">
        Tournées du {formatTunisDay(plan.date)}
      </h1>

      {empty ? (
        <p className="card text-navy/70">Aucun colis à sortir aujourd’hui.</p>
      ) : (
        <>
          <h2 className="mb-2 font-display text-lg font-bold text-navy">Charge par livreur</h2>
          <ul aria-label="Charge par livreur" className="mb-6 flex flex-wrap gap-2">
            {plan.loads.map((load) => (
              <li key={load.courier.id} className="badge-muted text-sm">
                {fullName(load.courier)} : {load.count}
              </li>
            ))}
            {plan.withoutCourier > 0 && (
              <li className="badge-warn text-sm">
                {SANS_COURSIER_LABEL} : {plan.withoutCourier}
              </li>
            )}
          </ul>

          {plan.sansZone.length > 0 && (
            <Column
              title={SANS_ZONE_LABEL}
              header={<span className="badge-warn">{SANS_ZONE_LABEL}</span>}
              warn
              parcels={plan.sansZone}
              selected={selected}
              onToggle={toggle}
            />
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {plan.zones.map((zone) => (
              <Column
                key={zone.id}
                title={zone.name}
                header={
                  zone.livreur ? (
                    <span className="text-sm text-navy/80">
                      {fullName(zone.livreur)}
                      {zone.livreurKind &&
                        ` · ${ZONE_ASSIGNMENT_KIND_LABELS_FR[zone.livreurKind].toLowerCase()}`}
                    </span>
                  ) : (
                    <span className="badge-warn">{SANS_COURSIER_LABEL}</span>
                  )
                }
                warn={!zone.livreur}
                parcels={zone.parcels}
                selected={selected}
                onToggle={toggle}
              />
            ))}
          </div>
        </>
      )}

      {done && (
        <p role="status" className="mt-4 font-semibold text-green-800">
          {done}
        </p>
      )}

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-navy/10 bg-white p-4 shadow-lg">
          <div className="mx-auto flex max-w-5xl flex-wrap items-end gap-3">
            <p className="font-semibold text-navy">
              {selected.size === 1 ? '1 colis sélectionné' : `${selected.size} colis sélectionnés`}
            </p>
            <div className="min-w-48">
              <label htmlFor={selectId} className="field-label">
                Livreur
              </label>
              <select
                id={selectId}
                className="field"
                value={courierId}
                onChange={(e) => setCourierId(e.target.value)}
              >
                <option value="">Choisir…</option>
                {livreurs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {fullName(c)}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="btn-primary min-h-14"
              disabled={busy || !courierId}
              onClick={() => void move(courierId)}
            >
              Déplacer
            </button>
            <button
              type="button"
              className="btn-secondary min-h-14"
              disabled={busy}
              onClick={() => void move(null)}
            >
              Remettre selon la zone
            </button>
            {error && (
              <p role="alert" className="w-full text-sm text-red-700">
                {error.message}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function Column({
  title,
  header,
  warn,
  parcels,
  selected,
  onToggle,
}: {
  title: string;
  header: React.ReactNode;
  warn: boolean;
  parcels: TourParcelRow[];
  selected: Set<string>;
  onToggle: (ids: string[], on: boolean) => void;
}) {
  const titleId = useId();
  const all = parcels.every((p) => selected.has(p.id));
  return (
    <section
      aria-labelledby={titleId}
      className={`card mb-4 ${warn ? 'border-2 border-amber-400' : ''}`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id={titleId} className="font-display text-lg font-bold text-navy">
            {title}
          </h2>
          {header}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={all}
            aria-label={`Tout ${title}`}
            onChange={(e) =>
              onToggle(
                parcels.map((p) => p.id),
                e.target.checked,
              )
            }
          />
          Tout
        </label>
      </div>
      <ul className="divide-y divide-navy/10">
        {parcels.map((p) => (
          <li key={p.id} className="flex items-start gap-3 py-2">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5"
              aria-label={p.code}
              checked={selected.has(p.id)}
              onChange={(e) => onToggle([p.id], e.target.checked)}
            />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-mono font-semibold">{p.code}</p>
              <p className="text-navy/80">
                {p.localiteNameFr}, {p.delegationNameFr} · {p.shopName}
              </p>
              {p.status === 'RELANCE' && (
                <p className="text-navy/80">
                  {PARCEL_STATUS_LABELS_FR[p.status as ParcelStatus]}
                  {p.relaunchSlot &&
                    ` · ${RELAUNCH_SLOT_LABELS_FR[p.relaunchSlot as RelaunchSlot]}`}
                  {` · tentative ${p.attemptCount + 1}`}
                </p>
              )}
              {p.labelReprintNeeded && (
                <span className="badge-warn mt-1 inline-block">Étiquette à réimprimer</span>
              )}
              {p.moved && p.plannedLivreur && (
                <p className="font-semibold text-orange-dark">→ {fullName(p.plannedLivreur)}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
