'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import {
  EXCEPTION_KIND_LABELS_FR,
  ExceptionKind,
  PICKUP_SLOT_LABELS_FR,
  Permission,
  ROLE_LABELS_FR,
  SCAN_ACTION_LABELS_FR,
  formatTunisDay,
  type PickupSlot,
  type Role,
  type ScanAction,
} from '@faffago/shared';
import { bff } from '@/lib/client/call';
import { dt } from '@/lib/money';
import type { ExceptionsQueue, LateBon } from '@/lib/types';

const dateTime = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Africa/Tunis',
  dateStyle: 'short',
  timeStyle: 'short',
});

function Row({
  kind,
  count,
  children,
}: {
  kind: ExceptionKind;
  count: number;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={`card mb-4 ${count > 0 ? 'border-2 border-amber-400' : ''}`}
    >
      <h2 id={id} className="mb-2 font-display text-lg font-bold text-navy">
        {EXCEPTION_KIND_LABELS_FR[kind]} ({count})
      </h2>
      {count === 0 ? <p className="text-sm text-navy/70">Rien à signaler.</p> : children}
    </section>
  );
}

/**
 * Exceptions, first rows (Admin 4.7, D-50): what is stuck, each row leading
 * to the screen where it is dealt with. Every staff role reads the queue; a
 * link to act shows only to the roles that may act (D-11).
 */
export function ExceptionsScreen({
  queue,
  permissions,
}: {
  queue: ExceptionsQueue;
  permissions: Permission[];
}) {
  const router = useRouter();
  const canPlan = permissions.includes(Permission.PLANIFIER_RAMASSAGES_TOURNEES);
  const canApply = permissions.includes(Permission.DEMANDES_VENDEUR);
  const canTreat = permissions.includes(Permission.SCAN_DEPOT);
  const canCaisse = permissions.includes(Permission.CAISSE);
  const canArchive = permissions.includes(Permission.SCAN_DEPOT);
  const [treating, setTreating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function treat(scanId: string) {
    setTreating(scanId);
    setError(null);
    const response = await bff('POST', `exceptions/manual-entries/${scanId}/treat`);
    setTreating(null);
    if (!response.ok) {
      setError(response.error.message);
      return;
    }
    router.refresh();
  }

  const lateBons = (rows: LateBon[], verb: string, action: React.ReactNode) => (
    <ul className="divide-y divide-navy/10 text-sm">
      {rows.map((row) => (
        <li
          key={`${row.kind}-${row.id}`}
          className="flex flex-wrap items-center justify-between gap-2 py-2"
        >
          <span>
            <strong>{row.number}</strong> · {row.shopName}
            {row.ramasseur && ` · ${row.ramasseur.firstName} ${row.ramasseur.lastName}`}
            <span className="block text-navy/70">
              {verb} le {dateTime.format(new Date(row.since))}
            </span>
          </span>
          {action}
        </li>
      ))}
    </ul>
  );

  return (
    <section>
      <h1 className="mb-4 font-display text-2xl font-bold text-navy">Exceptions</h1>

      <Row kind={ExceptionKind.COLIS_AU_DEPOT_SANS_TOURNEE} count={queue.depotWaiting.length}>
        <ul className="divide-y divide-navy/10 text-sm">
          {queue.depotWaiting.map((row) => (
            <li key={row.code} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <Link
                  href={`/admin/colis/${row.code}`}
                  className="font-mono font-semibold text-orange-dark underline"
                >
                  {row.code}
                </Link>{' '}
                · {row.shopName} · {row.delegationNameFr}
                {row.zoneName ? ` · ${row.zoneName}` : ''}
                <span className="block text-navy/70">
                  Au dépôt depuis le {dateTime.format(new Date(row.since))}
                </span>
              </span>
              {canPlan && (
                <Link href="/admin/tournees" className="btn-secondary">
                  Assigner
                </Link>
              )}
            </li>
          ))}
        </ul>
      </Row>

      <Row kind={ExceptionKind.A_VERIFIER_LIMITE_PROCHE} count={queue.verifyNearLimit.length}>
        <ul className="divide-y divide-navy/10 text-sm">
          {queue.verifyNearLimit.map((row) => (
            <li key={row.code} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <Link
                  href={`/admin/colis/${row.code}`}
                  className="font-mono font-semibold text-orange-dark underline"
                >
                  {row.code}
                </Link>{' '}
                · {row.shopName}
                <span className="block text-navy/70">
                  Retour automatique le {dateTime.format(new Date(row.deadline))} · client{' '}
                  {row.recipientPhone} · vendeur {row.sellerPhone}
                </span>
              </span>
              <Link href="/admin/a-verifier" className="btn-secondary">
                Appeler le client / le vendeur
              </Link>
            </li>
          ))}
        </ul>
      </Row>

      <Row kind={ExceptionKind.ARGENT_NON_REMIS} count={queue.cashNotHandedOver.length}>
        <ul className="divide-y divide-navy/10 text-sm">
          {queue.cashNotHandedOver.map((row) => (
            <li
              key={`${row.courier.userId}-${row.day}`}
              className="flex flex-wrap items-center justify-between gap-2 py-2"
            >
              <span>
                {row.courier.firstName} {row.courier.lastName} (
                {ROLE_LABELS_FR[row.courier.role as Role]}) · {formatTunisDay(row.day)} ·{' '}
                {dt(row.amountMillimes)}
              </span>
              {canCaisse && (
                <Link
                  href={`/admin/caisse/${row.courier.userId}/${row.day}`}
                  className="btn-secondary"
                >
                  Ouvrir la caisse
                </Link>
              )}
            </li>
          ))}
        </ul>
      </Row>

      <Row kind={ExceptionKind.BON_EN_ROUTE_NON_REMIS} count={queue.bonsEnRoute.length}>
        {lateBons(queue.bonsEnRoute, 'En route depuis', null)}
        <p className="mt-2 text-sm text-navy/70">Contactez le ramasseur.</p>
      </Row>

      <Row kind={ExceptionKind.BON_SIGNE_NON_ARCHIVE} count={queue.bonsNotArchived.length}>
        {lateBons(
          queue.bonsNotArchived,
          'Remis',
          canArchive ? (
            <Link href="/admin/scan" className="btn-secondary">
              Archiver
            </Link>
          ) : null,
        )}
      </Row>

      <Row kind={ExceptionKind.RAMASSAGE_NON_EFFECTUE} count={queue.pickupsLate.length}>
        <ul className="divide-y divide-navy/10 text-sm">
          {queue.pickupsLate.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {row.shopName} · prévu le {formatTunisDay(row.plannedDate)}
                {row.plannedSlot && ` · ${PICKUP_SLOT_LABELS_FR[row.plannedSlot as PickupSlot]}`}
                {row.ramasseur && ` · ${row.ramasseur.firstName} ${row.ramasseur.lastName}`}
              </span>
              {canPlan && (
                <Link href={`/admin/ramassages/${row.id}`} className="btn-secondary">
                  Replanifier
                </Link>
              )}
            </li>
          ))}
        </ul>
      </Row>

      <Row kind={ExceptionKind.DEMANDE_VENDEUR} count={queue.changeRequests.length}>
        <ul className="divide-y divide-navy/10 text-sm">
          {queue.changeRequests.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <span className="font-mono font-semibold">{row.parcel.code}</span> ·{' '}
                {row.parcel.shopName}
                {row.applyRefusalMessage && (
                  <span className="block text-amber-900">{row.applyRefusalMessage}</span>
                )}
              </span>
              <Link href={`/admin/colis/${row.parcel.code}`} className="btn-secondary">
                {canApply ? 'Appliquer / refuser' : 'Voir la demande'}
              </Link>
            </li>
          ))}
        </ul>
      </Row>

      <Row kind={ExceptionKind.SAISIE_MANUELLE} count={queue.manualEntries.length}>
        {error && (
          <p role="alert" className="mb-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <ul className="divide-y divide-navy/10 text-sm">
          {queue.manualEntries.map((row) => (
            <li key={row.scanId} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {row.parcelCode ? (
                  <Link
                    href={`/admin/colis/${row.parcelCode}`}
                    className="font-mono font-semibold text-orange-dark underline"
                  >
                    {row.parcelCode}
                  </Link>
                ) : (
                  <span className="font-mono font-semibold">Code inconnu</span>
                )}
                <span className="block">
                  {row.rawCode} · {SCAN_ACTION_LABELS_FR[row.action as ScanAction] ?? row.action} ·{' '}
                  {row.actor.name} ({ROLE_LABELS_FR[row.actor.role as Role]})
                  {!row.accepted && ' · refusé'}
                </span>
                <span className="block text-navy/70">{dateTime.format(new Date(row.at))}</span>
              </span>
              {canTreat && (
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={treating === row.scanId}
                  onClick={() => void treat(row.scanId)}
                >
                  Marquer comme traité
                </button>
              )}
            </li>
          ))}
        </ul>
      </Row>
      {queue.sellersMissingCin && (
        <Row kind={ExceptionKind.CIN_MANQUANT} count={queue.sellersMissingCin.length}>
          <ul className="divide-y divide-navy/10 text-sm">
            {queue.sellersMissingCin.map((row) => (
              <li
                key={row.sellerId}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <span>
                  {row.shopName} · {row.contactFullName}
                </span>
                <Link href={`/admin/vendeurs/${row.sellerId}`} className="btn-secondary">
                  Ajouter le numéro de CIN
                </Link>
              </li>
            ))}
          </ul>
        </Row>
      )}
    </section>
  );
}
