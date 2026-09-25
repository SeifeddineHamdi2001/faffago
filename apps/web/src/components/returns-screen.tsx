'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  BON_STATUS_LABELS_FR,
  PARCEL_STATUS_LABELS_FR,
  Permission,
  type BonStatus,
  type ParcelStatus,
} from '@faffago/shared';
import { bff } from '@/lib/client/call';
import { day } from '@/lib/money';
import type { BonRetourRow, DepartRamasseur, ReturnsBySeller } from '@/lib/types';
import { Dialog } from './dialog';

/**
 * Retours (Admin 4.11, D-81): the returns and échange items waiting, by
 * seller, with their bon de retour. Parcels join a bon at the scan station
 * (Préparation retours); here the bon is printed and given a visit.
 */
export function ReturnsScreen({
  groups,
  ramasseurs,
  permissions,
  today,
}: {
  groups: ReturnsBySeller[];
  ramasseurs: DepartRamasseur[];
  permissions: string[];
  today: string;
}) {
  const canPrint = permissions.includes(Permission.BONS_RETOUR);
  const canAssign = permissions.includes(Permission.PLANIFIER_RAMASSAGES_TOURNEES);
  const [assigning, setAssigning] = useState<BonRetourRow | null>(null);

  return (
    <section>
      <h1 className="mb-1 font-display text-2xl font-bold text-navy">Retours</h1>
      <p className="mb-4 text-sm text-navy/70">
        Les retours rejoignent le bon de retour de leur vendeur au scan, mode Préparation retours.
      </p>
      {groups.length === 0 && <p className="card text-sm text-navy/70">Aucun retour en attente.</p>}
      {groups.map((group) => (
        <section key={group.seller.id} className="card mb-4">
          <h2 className="mb-2 font-display text-lg font-bold text-navy">{group.seller.shopName}</h2>
          {group.returns.length > 0 && (
            <ul className="mb-3 divide-y divide-navy/10 text-sm">
              {group.returns.map((line) => (
                <li
                  key={`${line.code}-${line.itemType}`}
                  className="flex flex-wrap justify-between gap-2 py-1"
                >
                  <span>
                    <span className="font-mono">{line.code}</span> ·{' '}
                    {line.itemType === 'ARTICLE_RECUPERE'
                      ? 'Ancien article (échange)'
                      : line.recipientName}
                  </span>
                  <span className="text-navy/70">
                    {PARCEL_STATUS_LABELS_FR[line.status as ParcelStatus]}
                    {!line.atDepot && line.status === 'RETOUR_AU_DEPOT' && ' · pas encore au dépôt'}
                    {line.bonNumber
                      ? ` · ${line.bonNumber}`
                      : line.atDepot
                        ? ' · à scanner dans un bon'
                        : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {group.bons.map((bon) => (
            <div
              key={bon.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-navy/5 p-3 text-sm"
            >
              <span>
                <strong>{bon.number}</strong> · {BON_STATUS_LABELS_FR[bon.status as BonStatus]} ·{' '}
                {bon.lines.length} article(s), {bon.pendingCount} à remettre
                <span className="block text-navy/70">
                  {bon.visit?.ramasseur
                    ? `${bon.status === 'EN_ROUTE' ? 'Avec' : 'Prévu avec'} ${bon.visit.ramasseur.firstName}${
                        bon.visit.plannedDate ? ` le ${day(bon.visit.plannedDate)}` : ''
                      }`
                    : 'En attente d’une visite'}
                </span>
              </span>
              <span className="flex gap-2">
                {canPrint && (
                  <a
                    href={`/api/bff/bons-retour/${bon.id}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-secondary"
                  >
                    Imprimer
                  </a>
                )}
                {canAssign && bon.status === 'PREPARE' && (
                  <button type="button" className="btn-secondary" onClick={() => setAssigning(bon)}>
                    Affecter
                  </button>
                )}
              </span>
            </div>
          ))}
        </section>
      ))}
      {assigning && (
        <AssignDialog
          bon={assigning}
          ramasseurs={ramasseurs}
          today={today}
          onDone={() => setAssigning(null)}
        />
      )}
    </section>
  );
}

function AssignDialog({
  bon,
  ramasseurs,
  today,
  onDone,
}: {
  bon: BonRetourRow;
  ramasseurs: DepartRamasseur[];
  today: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [ramasseurId, setRamasseurId] = useState('');
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const response = await bff('POST', `bons-retour/${bon.id}/affecter`, { ramasseurId, date });
    if (!response.ok) {
      setError(response.error.message);
      return;
    }
    onDone();
    router.refresh();
  }

  return (
    <Dialog title={`Affecter ${bon.number}`} onDismiss={onDone}>
      <form className="space-y-3" onSubmit={submit}>
        <label htmlFor="br-ramasseur" className="field-label">
          Ramasseur
        </label>
        <select
          id="br-ramasseur"
          className="field"
          required
          value={ramasseurId}
          onChange={(event) => setRamasseurId(event.target.value)}
        >
          <option value="" disabled>
            Choisir
          </option>
          {ramasseurs.map((r) => (
            <option key={r.userId} value={r.userId}>
              {r.firstName} {r.lastName}
            </option>
          ))}
        </select>
        <label htmlFor="br-date" className="field-label">
          Jour
        </label>
        <input
          id="br-date"
          type="date"
          className="field"
          min={today}
          required
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button type="submit" className="btn-primary">
            Affecter
          </button>
          <button type="button" className="btn-secondary" onClick={onDone}>
            Annuler
          </button>
        </div>
      </form>
    </Dialog>
  );
}
