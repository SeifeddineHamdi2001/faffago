'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';
import {
  BON_STATUS_LABELS_FR,
  SELLER_STATUT_LABELS_FR,
  buildBonVersement,
  formatRatePercent,
  millimesFromJson,
  type BonStatus,
  type ChargeType,
  type SellerStatut,
} from '@faffago/shared';
import { bff } from '@/lib/client/call';
import { day, dt, when } from '@/lib/money';
import type {
  BonVersementDetail,
  BonVersementRow,
  DepartRamasseur,
  SellerPayoutDetail,
  SellerPayoutSummary,
} from '@/lib/types';
import { Dialog } from './dialog';

/** Paiements vendeurs (Admin 4.10): every seller with money to pay, or fees to deduct. */
export function PayoutsScreen({ rows }: { rows: SellerPayoutSummary[] }) {
  return (
    <section>
      <h1 className="mb-4 font-display text-2xl font-bold text-navy">Paiements vendeurs</h1>
      {rows.length === 0 ? (
        <p className="card text-sm text-navy/70">Aucun vendeur à payer.</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-navy/70">
              <tr>
                <th className="py-2">Vendeur</th>
                <th className="text-right">Payable maintenant</th>
                <th className="text-right">Chez les coursiers</th>
                <th className="text-right">Frais à déduire</th>
                <th>Bons en cours</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy/10">
              {rows.map((row) => (
                <tr key={row.seller.id}>
                  <td className="py-2">
                    <Link
                      href={`/admin/paiements/${row.seller.id}`}
                      className="font-semibold text-orange-dark underline"
                    >
                      {row.seller.shopName}
                    </Link>
                    <span className="block text-navy/70">
                      {SELLER_STATUT_LABELS_FR[row.seller.statut as SellerStatut]}
                    </span>
                  </td>
                  <td className="text-right">
                    {dt(row.payableMillimes)} ({row.payableCount})
                  </td>
                  <td className="text-right">{dt(row.withCouriersMillimes)}</td>
                  <td className="text-right">{dt(row.pendingChargesMillimes)}</td>
                  <td>{row.bonsEnCours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * One seller (Admin 4.10): every parcel payable, all ticked; the preview is
 * the same calculation the server makes (A-2, A-3); Préparer le bon, then
 * print it. Below, his bons: print, assign a visit (answer 4), cancel (A-5).
 */
export function SellerPayoutScreen({
  detail,
  ramasseurs,
  today,
}: {
  detail: SellerPayoutDetail;
  ramasseurs: DepartRamasseur[];
  today: string;
}) {
  const router = useRouter();
  const [ticked, setTicked] = useState<Set<string>>(() => new Set(detail.parcels.map((p) => p.id)));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState<BonVersementDetail | null>(null);

  const preview = useMemo(
    () =>
      buildBonVersement({
        parcels: detail.parcels
          .filter((p) => ticked.has(p.id))
          .map((p) => ({ parcelId: p.id, codMillimes: millimesFromJson(p.codMillimes) })),
        pendingCharges: detail.charges.map((c) => ({
          chargeId: c.id,
          type: c.type as ChargeType,
          amountMillimes: millimesFromJson(c.amountMillimes),
          createdAt: new Date(c.createdAt),
        })),
        sellerStatut: detail.seller.statut as SellerStatut,
        retenueRateBps: detail.retenueRateBps,
      }),
    [detail, ticked],
  );

  function toggle(id: string) {
    setTicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function prepare() {
    setBusy(true);
    setError(null);
    const response = await bff<BonVersementDetail>('POST', 'bons-versement', {
      sellerId: detail.seller.id,
      parcelIds: [...ticked],
    });
    setBusy(false);
    if (!response.ok) {
      setError(response.error.message);
      return;
    }
    setPrepared(response.data);
    router.refresh();
  }

  const included = new Set(preview.includedChargeIds);
  return (
    <section>
      <p className="mb-2 text-sm">
        <Link href="/admin/paiements" className="text-orange-dark underline">
          ← Paiements vendeurs
        </Link>
      </p>
      <h1 className="mb-1 font-display text-2xl font-bold text-navy">{detail.seller.shopName}</h1>
      <p className="mb-4 text-sm text-navy/70">
        {SELLER_STATUT_LABELS_FR[detail.seller.statut as SellerStatut]} · contact{' '}
        {detail.seller.contactFullName} · {detail.seller.contactPhone}
      </p>

      {prepared && (
        <p role="status" className="mb-4 rounded-xl bg-green-50 p-4 text-sm text-green-900">
          Bon {prepared.number} préparé : {dt(prepared.netMillimes)}.{' '}
          <a
            href={`/api/bff/bons-versement/${prepared.id}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Imprimer (2 exemplaires)
          </a>
        </p>
      )}

      <section className="card mb-4">
        <h2 className="mb-2 font-display text-lg font-bold text-navy">
          Colis payables ({detail.parcels.length})
        </h2>
        {detail.parcels.length === 0 ? (
          <p className="text-sm text-navy/70">Aucun colis livré dont l’argent est au dépôt.</p>
        ) : (
          <ul className="divide-y divide-navy/10 text-sm">
            {detail.parcels.map((p) => (
              <li key={p.id} className="py-2">
                <label className="flex items-center gap-3">
                  <input type="checkbox" checked={ticked.has(p.id)} onChange={() => toggle(p.id)} />
                  <span className="flex-1">
                    <span className="font-mono">{p.code}</span> · {p.recipientName} · livré le{' '}
                    {when(p.deliveredAt)}
                  </span>
                  <span>{dt(p.codMillimes)}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card mb-4">
        <h2 className="mb-2 font-display text-lg font-bold text-navy">Frais Faffa Go en attente</h2>
        {detail.charges.length === 0 ? (
          <p className="text-sm text-navy/70">Aucun frais en attente.</p>
        ) : (
          <ul className="divide-y divide-navy/10 text-sm">
            {detail.charges.map((c) => (
              <li key={c.id} className="flex justify-between gap-2 py-2">
                <span>
                  {c.label}
                  {c.parcelCode && ` · ${c.parcelCode}`} · {when(c.createdAt)}
                  {!included.has(c.id) && ticked.size > 0 && (
                    <span className="ml-2 rounded bg-amber-100 px-1 text-xs text-amber-900">
                      Reporté
                    </span>
                  )}
                </span>
                <span>− {dt(c.amountMillimes)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card mb-4" aria-label="Calcul du bon">
        <dl className="space-y-1 text-sm">
          <Line
            label={`Total des colis (${ticked.size})`}
            value={dt(preview.totalCodMillimes.toString())}
          />
          <Line label="− Frais Faffa Go" value={`− ${dt(preview.totalFeesMillimes.toString())}`} />
          <Line label="= Base après frais" value={dt(preview.baseAfterFeesMillimes.toString())} />
          {preview.retenueMillimes > 0n && (
            <Line
              label={`− Retenue à la source ${formatRatePercent(preview.retenueRateBps)} %`}
              value={`− ${dt(preview.retenueMillimes.toString())}`}
            />
          )}
          <Line label="Net payé en espèces" value={dt(preview.netMillimes.toString())} strong />
          {preview.soldeDebiteurMillimes > 0n && (
            <Line
              label="Solde débiteur (frais reportés au prochain bon)"
              value={dt(preview.soldeDebiteurMillimes.toString())}
            />
          )}
        </dl>
        <button
          type="button"
          className="btn-primary mt-3"
          disabled={busy || !preview.generated}
          onClick={prepare}
        >
          Préparer le bon
        </button>
        {error && (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </section>

      <Bons bons={detail.bons} ramasseurs={ramasseurs} today={today} />
    </section>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${strong ? 'text-base font-bold' : ''}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** His bons: print, assign a visit when no pickup is planned, cancel while Préparé. */
function Bons({
  bons,
  ramasseurs,
  today,
}: {
  bons: BonVersementRow[];
  ramasseurs: DepartRamasseur[];
  today: string;
}) {
  const router = useRouter();
  const [assigning, setAssigning] = useState<BonVersementRow | null>(null);
  const [cancelling, setCancelling] = useState<BonVersementRow | null>(null);
  const [ramasseurId, setRamasseurId] = useState('');
  const [date, setDate] = useState(today);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function send(event: FormEvent, path: string, body: unknown) {
    event.preventDefault();
    setError(null);
    const response = await bff('POST', path, body);
    if (!response.ok) {
      setError(response.error.message);
      return;
    }
    setAssigning(null);
    setCancelling(null);
    router.refresh();
  }

  return (
    <section className="card">
      <h2 className="mb-2 font-display text-lg font-bold text-navy">Bons de versement</h2>
      {bons.length === 0 ? (
        <p className="text-sm text-navy/70">Aucun bon.</p>
      ) : (
        <ul className="divide-y divide-navy/10 text-sm">
          {bons.map((bon) => (
            <li key={bon.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <strong>{bon.number}</strong> · {BON_STATUS_LABELS_FR[bon.status as BonStatus]} ·{' '}
                {dt(bon.netMillimes)} · {bon.parcelCount} colis
                <span className="block text-navy/70">
                  {bon.visit?.ramasseur
                    ? `${bon.status === 'EN_ROUTE' ? 'Avec' : 'Prévu avec'} ${bon.visit.ramasseur.firstName}${
                        bon.visit.plannedDate ? ` le ${day(bon.visit.plannedDate)}` : ''
                      }${bon.visit.viaPickup ? ' (ramassage)' : ''}`
                    : bon.status === 'PREPARE'
                      ? 'En attente d’une visite'
                      : bon.cancelReason
                        ? `Annulé : ${bon.cancelReason}`
                        : ''}
                </span>
              </span>
              <span className="flex gap-2">
                {bon.status !== 'ANNULE' && (
                  <a
                    href={`/api/bff/bons-versement/${bon.id}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-secondary"
                  >
                    Imprimer
                  </a>
                )}
                {bon.status === 'PREPARE' && (
                  <>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setAssigning(bon)}
                    >
                      Affecter
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setCancelling(bon)}
                    >
                      Annuler le bon
                    </button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {assigning && (
        <Dialog title={`Affecter ${assigning.number}`} onDismiss={() => setAssigning(null)}>
          <form
            className="space-y-3"
            onSubmit={(event) =>
              send(event, `bons-versement/${assigning.id}/affecter`, { ramasseurId, date })
            }
          >
            <label htmlFor="bon-ramasseur" className="field-label">
              Ramasseur
            </label>
            <select
              id="bon-ramasseur"
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
            <label htmlFor="bon-date" className="field-label">
              Jour
            </label>
            <input
              id="bon-date"
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
              <button type="button" className="btn-secondary" onClick={() => setAssigning(null)}>
                Annuler
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {cancelling && (
        <Dialog title={`Annuler ${cancelling.number}`} onDismiss={() => setCancelling(null)}>
          <form
            className="space-y-3"
            onSubmit={(event) => send(event, `bons-versement/${cancelling.id}/annuler`, { reason })}
          >
            <p className="text-sm">
              Les colis redeviennent payables et les frais repassent en attente. Le numéro n’est
              jamais réutilisé.
            </p>
            <label htmlFor="bon-raison" className="field-label">
              Raison
            </label>
            <textarea
              id="bon-raison"
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
                Annuler le bon
              </button>
              <button type="button" className="btn-secondary" onClick={() => setCancelling(null)}>
                Retour
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </section>
  );
}
