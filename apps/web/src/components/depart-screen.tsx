'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BON_KIND_LABELS_FR, BonKind } from '@faffago/shared';
import { bff } from '@/lib/client/call';
import { day, dt } from '@/lib/money';
import type { DepartBon, DepartRamasseur, Departure } from '@/lib/types';

/**
 * Départ ramasseur (D-80, D-81, answer 5): the bons handed to a ramasseur as
 * he leaves. A bon de versement goes with its cash, which joins his caisse
 * of the day; a bon de retour with its parcels.
 */
export function DepartScreen({
  ramasseurs,
  departure,
}: {
  ramasseurs: DepartRamasseur[];
  departure: Departure | null;
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState<Set<string>>(
    () => new Set(departure?.prevus.map((bon) => bon.id) ?? []),
  );
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggle(id: string) {
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handOut() {
    if (!departure) return;
    const all = [...departure.prevus, ...departure.autres].filter((bon) => chosen.has(bon.id));
    setBusy(true);
    setError(null);
    const response = await bff('POST', 'caisse/depart', {
      ramasseurId: departure.ramasseur.userId,
      bonsVersement: all.filter((bon) => bon.kind === BonKind.BON_VERSEMENT).map((bon) => bon.id),
      bonsRetour: all.filter((bon) => bon.kind === BonKind.BON_RETOUR).map((bon) => bon.id),
    });
    setBusy(false);
    if (!response.ok) {
      setError(response.error.message);
      return;
    }
    setDone(`${all.length} bon(s) remis à ${departure.ramasseur.firstName}.`);
    setChosen(new Set());
    router.refresh();
  }

  const cash = departure
    ? [...departure.prevus, ...departure.autres]
        .filter((bon) => chosen.has(bon.id) && bon.netMillimes !== null)
        .reduce((total, bon) => total + BigInt(bon.netMillimes!), 0n)
    : 0n;

  return (
    <section>
      <p className="mb-2 text-sm">
        <Link href="/admin/caisse" className="text-orange-dark underline">
          ← Caisse
        </Link>
      </p>
      <h1 className="mb-4 font-display text-2xl font-bold text-navy">Départ ramasseur</h1>

      <form
        method="get"
        action="/admin/caisse/depart"
        className="card mb-4 flex flex-wrap items-end gap-3"
      >
        <div>
          <label htmlFor="ramasseur" className="field-label">
            Ramasseur
          </label>
          <select
            id="ramasseur"
            name="ramasseur"
            className="field"
            defaultValue={departure?.ramasseur.userId ?? ''}
          >
            <option value="" disabled>
              Choisir
            </option>
            {ramasseurs.map((r) => (
              <option key={r.userId} value={r.userId}>
                {r.firstName} {r.lastName}
                {r.bonsPrevus > 0 ? ` (${r.bonsPrevus} prévu${r.bonsPrevus > 1 ? 's' : ''})` : ''}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">
          Afficher ses bons
        </button>
      </form>

      {departure && (
        <>
          <BonList
            title="Prévus pour lui"
            bons={departure.prevus}
            chosen={chosen}
            toggle={toggle}
          />
          <BonList
            title="Autres bons préparés"
            bons={departure.autres}
            chosen={chosen}
            toggle={toggle}
          />
          <div className="card flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              Argent remis avec les bons : <strong>{dt(cash.toString())}</strong>
            </p>
            <button
              type="button"
              className="btn-primary"
              disabled={busy || chosen.size === 0}
              onClick={handOut}
            >
              Remettre au ramasseur
            </button>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-900">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="mt-4 rounded-xl bg-green-50 p-4 text-sm text-green-900">
          {done}
        </p>
      )}
    </section>
  );
}

function BonList({
  title,
  bons,
  chosen,
  toggle,
}: {
  title: string;
  bons: DepartBon[];
  chosen: Set<string>;
  toggle: (id: string) => void;
}) {
  return (
    <section className="card mb-4">
      <h2 className="mb-2 font-display text-lg font-bold text-navy">
        {title} ({bons.length})
      </h2>
      {bons.length === 0 ? (
        <p className="text-sm text-navy/70">Aucun bon.</p>
      ) : (
        <ul className="divide-y divide-navy/10 text-sm">
          {bons.map((bon) => (
            <li key={bon.id} className="py-2">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={chosen.has(bon.id)}
                  onChange={() => toggle(bon.id)}
                />
                <span className="flex-1">
                  {BON_KIND_LABELS_FR[bon.kind]} {bon.number} · {bon.shopName}
                  {bon.plannedDate && ` · prévu le ${day(bon.plannedDate)}`}
                </span>
                <span>
                  {bon.netMillimes !== null ? dt(bon.netMillimes) : `${bon.lineCount} article(s)`}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
