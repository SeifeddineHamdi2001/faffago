import Link from 'next/link';
import { useId } from 'react';
import {
  DEPOT_SCAN_MODE_LABELS_FR,
  EXCEPTION_KIND_LABELS_FR,
  ExceptionKind,
  PICKUP_SLOT_LABELS_FR,
  Permission,
  ROLE_LABELS_FR,
  formatTunisDay,
  type DepotScanMode,
  type PickupSlot,
  type Role,
} from '@faffago/shared';
import type { ExceptionsQueue } from '@/lib/types';

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
  const canPlan = permissions.includes(Permission.PLANIFIER_RAMASSAGES_TOURNEES);
  const canApply = permissions.includes(Permission.DEMANDES_VENDEUR);

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
        <ul className="divide-y divide-navy/10 text-sm">
          {queue.manualEntries.map((row) => (
            <li key={row.scanId} className="py-2">
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
                {row.rawCode} ·{' '}
                {DEPOT_SCAN_MODE_LABELS_FR[row.action as DepotScanMode] ?? row.action} ·{' '}
                {row.actor.name} ({ROLE_LABELS_FR[row.actor.role as Role]})
                {!row.accepted && ' · refusé'}
              </span>
              <span className="block text-navy/70">{dateTime.format(new Date(row.at))}</span>
            </li>
          ))}
        </ul>
      </Row>
    </section>
  );
}
