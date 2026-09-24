'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import {
  PICKUP_SLOT_LABELS_FR,
  PickupSlot,
  formatDT,
  formatTunisDay,
  isTunisDayKey,
  millimesFromJson,
  tunisDayKey,
} from '@faffago/shared';
import { bff } from '@/lib/client/call';
import type { CourierRow, RamassageDetail, RamassageRow, ZoneCourierRef } from '@/lib/types';
import { Dialog } from './dialog';

const TABS = [
  { status: 'DEMANDE', label: 'Demandés' },
  { status: 'PLANIFIE', label: 'Planifiés' },
  { status: 'EFFECTUE', label: 'Effectués' },
  { status: 'ANNULE', label: 'Annulés' },
] as const;

type Suggestion = { ramasseur: ZoneCourierRef | null; kind: 'TITULAIRE' | 'BACKUP' | null };

function fullName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`;
}

function slotLabel(slot: string | null): string | null {
  return slot ? PICKUP_SLOT_LABELS_FR[slot as PickupSlot] : null;
}

function suggestionText(s: Suggestion | null): string {
  if (!s?.ramasseur) return 'Aucun ramasseur de la zone ce jour-là';
  return s.kind === 'BACKUP' ? 'Backup de la zone ce jour-là' : 'Titulaire de la zone ce jour-là';
}

/**
 * Ramassages, the team's side (Admin 4.4, D-58): the requests to plan, the
 * pickups planned, done and cancelled. Planifier pre-fills the ramasseur
 * covering the zone of the pickup's address on the day chosen (A-14, D-52).
 * The team never cancels a request: the seller does (D-35).
 */
export function RamassagesScreen({
  rows,
  status,
  couriers,
}: {
  rows: RamassageRow[];
  status: string;
  couriers: CourierRow[];
}) {
  const [planning, setPlanning] = useState<RamassageRow | null>(null);
  const ramasseurs = couriers
    .filter((c) => c.role === 'RAMASSEUR' && c.isActive !== false && c.acceptsWork !== false)
    .sort((a, b) => fullName(a).localeCompare(fullName(b), 'fr'));

  return (
    <section>
      <h1 className="mb-4 font-display text-2xl font-bold text-navy">Ramassages</h1>
      <nav
        aria-label="Statut des ramassages"
        className="mb-6 flex flex-wrap gap-2 border-b border-navy/10"
      >
        {TABS.map((tab) => (
          <Link
            key={tab.status}
            href={`/admin/ramassages?statut=${tab.status}`}
            aria-current={tab.status === status ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-3 text-sm font-semibold ${
              tab.status === status
                ? 'border-orange text-navy'
                : 'border-transparent text-navy/70 hover:text-navy'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="card text-navy/70">Aucun ramassage.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <RamassageCard key={row.id} row={row} onPlan={() => setPlanning(row)} />
          ))}
        </div>
      )}

      {planning && (
        <PlanDialog row={planning} ramasseurs={ramasseurs} onClose={() => setPlanning(null)} />
      )}
    </section>
  );
}

function RamassageCard({ row, onPlan }: { row: RamassageRow; onPlan: () => void }) {
  const titleId = useId();
  const plannable = row.status === 'DEMANDE' || row.status === 'PLANIFIE';
  return (
    <article aria-labelledby={titleId} className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="text-sm">
          <h2 id={titleId} className="font-display text-lg font-bold text-navy">
            {row.shopName}
          </h2>
          <p>{row.address.address}</p>
          {row.address.landmark && <p className="text-navy/70">{row.address.landmark}</p>}
          <p className="text-navy/80">
            {row.address.localiteNameFr}, {row.address.delegationNameFr}
            {row.address.zone ? ` · ${row.address.zone.name}` : ''}
          </p>
          <p className="text-navy/80">
            {row.contactPhone} · {row.expectedCount} colis
            {row.requestedSlot && ` · créneau demandé : ${slotLabel(row.requestedSlot)}`}
          </p>
          {row.note && <p className="mt-1 italic text-navy/80">« {row.note} »</p>}
          {row.plannedDate && (
            <p className="mt-1 font-semibold text-navy">
              Planifié le {formatTunisDay(row.plannedDate)} · {slotLabel(row.plannedSlot)}
              {row.ramasseur && ` · ${fullName(row.ramasseur)}`}
            </p>
          )}
          {row.status === 'DEMANDE' && (
            <p className="mt-1 text-navy/70">
              Ramasseur de la zone aujourd’hui :{' '}
              {row.suggestion?.ramasseur ? fullName(row.suggestion.ramasseur) : 'aucun'}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/ramassages/${row.id}`} className="btn-secondary">
            Détail
          </Link>
          {plannable && (
            <button type="button" className="btn-primary" onClick={onPlan}>
              {row.status === 'PLANIFIE' ? 'Replanifier' : 'Planifier'}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function PlanDialog({
  row,
  ramasseurs,
  onClose,
}: {
  row: RamassageRow;
  ramasseurs: CourierRow[];
  onClose: () => void;
}) {
  const router = useRouter();
  const ids = { date: useId(), slot: useId(), ramasseur: useId() };
  const [date, setDate] = useState(row.plannedDate ?? tunisDayKey(new Date()));
  const [slot, setSlot] = useState<string>(
    row.plannedSlot ?? row.requestedSlot ?? PickupSlot.MATIN,
  );
  const [suggestion, setSuggestion] = useState<Suggestion | null>(row.suggestion);
  const [ramasseurId, setRamasseurId] = useState(
    row.ramasseur?.id ?? row.suggestion?.ramasseur?.id ?? '',
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function changeDate(value: string) {
    setDate(value);
    if (!isTunisDayKey(value)) return;
    const response = await bff<Suggestion>(
      'GET',
      `ramassages/${row.id}/suggestion?date=${encodeURIComponent(value)}`,
    );
    if (!response.ok) return;
    setSuggestion(response.data);
    if (response.data.ramasseur) setRamasseurId(response.data.ramasseur.id);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await bff('POST', `ramassages/${row.id}/plan`, { date, slot, ramasseurId });
    setBusy(false);
    if (!response.ok) {
      setError(response.error.issues?.[0]?.message ?? response.error.message);
      return;
    }
    onClose();
    router.refresh();
  }

  // The ramasseur already chosen stays in the list even if he stopped taking work.
  const options = [...ramasseurs];
  const current = row.ramasseur;
  if (current && !options.some((c) => c.id === current.id)) {
    options.push({ ...current, role: 'RAMASSEUR', phone: '', zones: [], absentToday: false });
  }

  return (
    <Dialog title="Planifier le ramassage" onDismiss={onClose}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <p className="text-sm text-navy/80">
          {row.shopName} · {row.address.localiteNameFr}, {row.address.delegationNameFr}
        </p>
        <div>
          <label htmlFor={ids.date} className="field-label">
            Jour
          </label>
          <input
            id={ids.date}
            type="date"
            className="field"
            value={date}
            onChange={(e) => void changeDate(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor={ids.slot} className="field-label">
            Créneau
          </label>
          <select
            id={ids.slot}
            className="field"
            value={slot}
            onChange={(e) => setSlot(e.target.value)}
          >
            {Object.values(PickupSlot).map((s) => (
              <option key={s} value={s}>
                {PICKUP_SLOT_LABELS_FR[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={ids.ramasseur} className="field-label">
            Ramasseur
          </label>
          <select
            id={ids.ramasseur}
            className="field"
            value={ramasseurId}
            onChange={(e) => setRamasseurId(e.target.value)}
          >
            <option value="">Choisir…</option>
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {fullName(c)}
              </option>
            ))}
          </select>
          <p className="mt-1 text-sm text-navy/70">
            {suggestionText(suggestion)}
            {suggestion?.ramasseur && ` : ${fullName(suggestion.ramasseur)}`}
          </p>
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Fermer
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            Planifier
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** One pickup: the parcels announced, and what the ramasseur takes on the same visit. */
export function RamassageDetailScreen({ detail }: { detail: RamassageDetail }) {
  const emporterId = useId();
  const { bonsVersement, bonsRetour } = detail.aEmporter;
  return (
    <section>
      <p className="mb-4 text-sm">
        <Link
          href={`/admin/ramassages?statut=${detail.status}`}
          className="font-semibold text-orange-dark underline"
        >
          ← Ramassages
        </Link>
      </p>
      <RamassageCard row={detail} onPlan={() => undefined} />

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="card">
          <h2 className="mb-2 font-display text-lg font-bold text-navy">Colis annoncés</h2>
          {detail.parcels.length === 0 ? (
            <p className="text-sm text-navy/70">
              Le vendeur a indiqué {detail.expectedCount} colis, sans les lister.
            </p>
          ) : (
            <ul aria-label="Colis annoncés" className="divide-y divide-navy/10 text-sm">
              {detail.parcels.map((p) => (
                <li key={p.code} className="py-2">
                  <span className="font-mono">{p.code}</span> · {p.recipientName} ·{' '}
                  {p.pickedUp ? 'Ramassé' : 'À ramasser'}
                </li>
              ))}
            </ul>
          )}
        </div>

        <section aria-labelledby={emporterId} className="card">
          <h2 id={emporterId} className="mb-2 font-display text-lg font-bold text-navy">
            À emporter
          </h2>
          {bonsVersement.length + bonsRetour.length === 0 ? (
            <p className="text-sm text-navy/70">Rien à emporter pour ce vendeur.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {bonsVersement.map((bon) => (
                <li key={bon.number}>
                  {bon.number} · {formatDT(millimesFromJson(bon.netMillimes))}
                </li>
              ))}
              {bonsRetour.map((bon) => (
                <li key={bon.number}>
                  {bon.number} · {bon.parcelCount} colis
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}
