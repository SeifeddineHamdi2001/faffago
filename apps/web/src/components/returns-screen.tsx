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
import { day, when } from '@/lib/money';
import type { BonRetourRow, DepartRamasseur, ReturnsBySeller } from '@/lib/types';
import { Dialog } from './dialog';

type CorrectedLine = { bon: BonRetourRow; line: BonRetourRow['lines'][number] };

/**
 * Retours (Admin 4.11, D-81): the returns and échange items waiting, by
 * seller, with their bon de retour. Parcels join a bon at the scan station
 * (Préparation retours); here the bon is printed and given a visit. The
 * admin corrects a line scanned Retour reçu by mistake (D-88).
 */
export function ReturnsScreen({
  groups,
  remis,
  ramasseurs,
  permissions,
  today,
}: {
  groups: ReturnsBySeller[];
  remis: BonRetourRow[];
  ramasseurs: DepartRamasseur[];
  permissions: string[];
  today: string;
}) {
  const canPrint = permissions.includes(Permission.BONS_RETOUR);
  const canAssign = permissions.includes(Permission.PLANIFIER_RAMASSAGES_TOURNEES);
  const canCorrect = permissions.includes(Permission.CORRIGER_BON);
  const [assigning, setAssigning] = useState<BonRetourRow | null>(null);
  const [correcting, setCorrecting] = useState<CorrectedLine | null>(null);
  const receivedLines = (bon: BonRetourRow) =>
    canCorrect &&
    bon.lines.some((line) => line.received) && (
      <ul className="mt-2 w-full divide-y divide-navy/10 border-t border-navy/10">
        {bon.lines
          .filter((line) => line.received)
          .map((line) => (
            <li
              key={`${line.code}-${line.itemType}`}
              className="flex flex-wrap items-center justify-between gap-2 py-1"
            >
              <span>
                <span className="font-mono">{line.code}</span>
                {line.itemType === 'ARTICLE_RECUPERE' && ' · ancien article'} · reçu le{' '}
                {line.receivedAt ? when(line.receivedAt) : ''}
              </span>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setCorrecting({ bon, line })}
              >
                Corriger
              </button>
            </li>
          ))}
      </ul>
    );

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
                  {bon.correctedAt && ` · Corrigé le ${when(bon.correctedAt)}`}
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
              {receivedLines(bon)}
            </div>
          ))}
        </section>
      ))}
      {canCorrect && remis.length > 0 && (
        <section className="card mb-4">
          <h2 className="mb-2 font-display text-lg font-bold text-navy">Bons de retour remis</h2>
          <p className="mb-2 text-sm text-navy/70">
            Un retour scanné reçu par erreur se corrige ici, tant que le bon n’est pas archivé.
          </p>
          {remis.map((bon) => (
            <div
              key={bon.id}
              className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-navy/5 p-3 text-sm"
            >
              <span>
                <strong>{bon.number}</strong> · {bon.seller.shopName}
                {bon.remisAt && ` · remis le ${when(bon.remisAt)}`}
              </span>
              {receivedLines(bon)}
            </div>
          ))}
        </section>
      )}
      {correcting && <CorrectLineDialog target={correcting} onDone={() => setCorrecting(null)} />}
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

/** Corriger une ligne scanned Retour reçu by mistake (D-88): the admin, with a reason. */
function CorrectLineDialog({ target, onDone }: { target: CorrectedLine; onDone: () => void }) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const response = await bff('POST', `bons-retour/${target.bon.id}/corriger`, {
      parcelCode: target.line.code,
      itemType: target.line.itemType,
      reason,
    });
    if (!response.ok) {
      setError(response.error.message);
      return;
    }
    onDone();
    router.refresh();
  }

  return (
    <Dialog title={`Corriger ${target.line.code}`} onDismiss={onDone}>
      <form className="space-y-3" onSubmit={submit}>
        <p className="text-sm">
          Seulement pour un retour scanné reçu par erreur. Si la caisse du ramasseur de ce jour est
          ouverte, le retour repart avec lui ; sinon il revient au dépôt et le bon redevient
          préparé. Aucun frais ne change. Le vendeur voit « Correction Faffa Go », jamais la raison.
        </p>
        <label htmlFor="br-correction" className="field-label">
          Raison
        </label>
        <textarea
          id="br-correction"
          className="field"
          required
          minLength={5}
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button type="submit" className="btn-primary">
            Corriger le retour
          </button>
          <button type="button" className="btn-secondary" onClick={onDone}>
            Retour
          </button>
        </div>
      </form>
    </Dialog>
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
