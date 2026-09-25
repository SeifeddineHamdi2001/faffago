import Link from 'next/link';
import { useId } from 'react';
import {
  CHARGE_STATUS_LABELS_FR,
  CHARGE_TYPE_LABELS_FR,
  FAILURE_REASON_LABELS_FR,
  PARCEL_CASH_STATUS_LABELS_FR,
  PARCEL_EVENT_LABELS_FR,
  PARCEL_LOCATION_LABELS_FR,
  PARCEL_STATUS_LABELS_FR,
  ParcelCashStatus,
  ParcelStatus,
  canLogCall,
  Permission,
  RELAUNCH_SLOT_LABELS_FR,
  ROLE_LABELS_FR,
  SANS_ZONE_FILTER,
  SANS_ZONE_LABEL,
  SCAN_SOURCE_LABELS_FR,
  formatDT,
  formatTunisDay,
  millimesFromJson,
  type ChargeStatus,
  type ChargeType,
  type FailureReason,
  type ParcelEventType,
  type ParcelLocation,
  type RelaunchSlot,
  type Role,
  type ScanSource,
} from '@faffago/shared';
import type {
  ColisFilters,
  ColisQuery,
  StaffEventRow,
  StaffParcelDetail,
  StaffParcelList,
} from '@/lib/types';
import { StaffCallsPanel } from './calls-panel';
import { ChangeRequestsPanel } from './change-requests-panel';
import { AdminScanCancel, ForcerStatut } from './forcage';
import { PrintLabels } from './print-labels';
import { TrackLine } from './track-line';

const dateTime = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Africa/Tunis',
  dateStyle: 'short',
  timeStyle: 'short',
});

function statusLabel(status: string | null): string {
  return status ? PARCEL_STATUS_LABELS_FR[status as ParcelStatus] : '—';
}

function money(value: string | null): string {
  return value === null ? '—' : formatDT(millimesFromJson(value));
}

/** The filters as they go in the page's address and the export's. */
function queryString(query: ColisQuery, page?: number): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key !== 'page' && value) params.set(key, String(value));
  }
  if (page && page > 1) params.set('page', String(page));
  return params.toString();
}

/**
 * Colis (Admin 4.3): every parcel, searched by code, customer name or phone,
 * or shop; filtered by status, cash status, seller, livreur, zone and
 * creation day; exported. The filters live in the address (a plain GET form).
 */
export function ColisScreen({
  list,
  query,
  filters,
}: {
  list: StaffParcelList;
  query: ColisQuery;
  filters: ColisFilters;
}) {
  const ids = {
    q: useId(),
    status: useId(),
    cash: useId(),
    seller: useId(),
    courier: useId(),
    zone: useId(),
    from: useId(),
    to: useId(),
  };
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const exportQuery = queryString(query);

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-navy">Colis</h1>
        <a
          className="btn-secondary"
          href={`/api/bff/colis/export${exportQuery ? `?${exportQuery}` : ''}`}
        >
          Exporter
        </a>
      </div>

      <form method="get" action="/admin/colis" className="card mb-4 grid gap-3 md:grid-cols-4">
        <div className="md:col-span-2">
          <label htmlFor={ids.q} className="field-label">
            Recherche
          </label>
          <input
            id={ids.q}
            name="q"
            className="field"
            defaultValue={query.q ?? ''}
            placeholder="Code, client, téléphone ou boutique"
          />
        </div>
        <Select id={ids.status} name="status" label="Statut" value={query.status} all="Tous">
          {Object.values(ParcelStatus).map((s) => (
            <option key={s} value={s}>
              {PARCEL_STATUS_LABELS_FR[s]}
            </option>
          ))}
        </Select>
        <Select
          id={ids.cash}
          name="cashStatus"
          label="Paiement"
          value={query.cashStatus}
          all="Tous"
        >
          {Object.values(ParcelCashStatus).map((s) => (
            <option key={s} value={s}>
              {PARCEL_CASH_STATUS_LABELS_FR[s]}
            </option>
          ))}
        </Select>
        <Select id={ids.seller} name="sellerId" label="Vendeur" value={query.sellerId} all="Tous">
          {filters.sellers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.shopName}
            </option>
          ))}
        </Select>
        <Select
          id={ids.courier}
          name="courierId"
          label="Livreur"
          value={query.courierId}
          all="Tous"
        >
          {filters.livreurs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.firstName} {c.lastName}
            </option>
          ))}
        </Select>
        <Select id={ids.zone} name="zoneId" label="Zone" value={query.zoneId} all="Toutes">
          {filters.zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
          <option value={SANS_ZONE_FILTER}>{SANS_ZONE_LABEL}</option>
        </Select>
        <div>
          <label htmlFor={ids.from} className="field-label">
            Créé du
          </label>
          <input
            id={ids.from}
            name="from"
            type="date"
            className="field"
            defaultValue={query.from ?? ''}
          />
        </div>
        <div>
          <label htmlFor={ids.to} className="field-label">
            au
          </label>
          <input
            id={ids.to}
            name="to"
            type="date"
            className="field"
            defaultValue={query.to ?? ''}
          />
        </div>
        <div className="flex items-end gap-2 md:col-span-4">
          <button type="submit" className="btn-primary">
            Rechercher
          </button>
          <Link href="/admin/colis" className="btn-secondary">
            Effacer
          </Link>
        </div>
      </form>

      {list.items.length === 0 ? (
        <p className="card text-navy/70">Aucun colis.</p>
      ) : (
        <>
          <p className="mb-2 text-sm text-navy/70">
            {list.total} colis · page {list.page} sur {pages}
          </p>
          <div className="card overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-navy/70">
                <tr>
                  <th className="py-2 pr-3 font-semibold">Colis</th>
                  <th className="py-2 pr-3 font-semibold">Vendeur</th>
                  <th className="py-2 pr-3 font-semibold">Destinataire</th>
                  <th className="py-2 pr-3 font-semibold">Lieu</th>
                  <th className="py-2 pr-3 font-semibold">Statut</th>
                  <th className="py-2 pr-3 font-semibold">Montant</th>
                  <th className="py-2 font-semibold">Livreur</th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((item) => (
                  <tr
                    key={item.code}
                    aria-label={item.code}
                    className="border-t border-navy/10 align-top"
                  >
                    <td className="py-2 pr-3">
                      <Link
                        href={`/admin/colis/${item.code}`}
                        className="font-mono font-semibold text-orange-dark underline"
                      >
                        {item.code}
                      </Link>
                      {item.labelReprintNeeded && (
                        <span className="badge-warn mt-1 block w-fit">Étiquette à réimprimer</span>
                      )}
                      <span className="block text-xs text-navy/60">
                        {dateTime.format(new Date(item.createdAt))}
                      </span>
                    </td>
                    <td className="py-2 pr-3">{item.shopName}</td>
                    <td className="py-2 pr-3">
                      {item.recipientName}
                      <span className="block text-navy/70">{item.recipientPhone}</span>
                    </td>
                    <td className="py-2 pr-3">
                      {item.localiteNameFr}, {item.delegationNameFr}
                      <span className="block text-navy/70">{item.zoneName ?? SANS_ZONE_LABEL}</span>
                    </td>
                    <td className="py-2 pr-3">
                      {statusLabel(item.status)}
                      {item.cashStatus && (
                        <span className="block text-navy/70">
                          {PARCEL_CASH_STATUS_LABELS_FR[item.cashStatus as ParcelCashStatus]}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3">{money(item.codAmountMillimes)}</td>
                    <td className="py-2">
                      {item.courier ? `${item.courier.firstName} ${item.courier.lastName}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav aria-label="Pages" className="mt-3 flex gap-2">
            {list.page > 1 && (
              <Link
                className="btn-secondary"
                href={`/admin/colis?${queryString(query, list.page - 1)}`}
              >
                Page précédente
              </Link>
            )}
            {list.page < pages && (
              <Link
                className="btn-secondary"
                href={`/admin/colis?${queryString(query, list.page + 1)}`}
              >
                Page suivante
              </Link>
            )}
          </nav>
        </>
      )}
    </section>
  );
}

function Select({
  id,
  name,
  label,
  value,
  all,
  children,
}: {
  id: string;
  name: string;
  label: string;
  value: string | undefined;
  all: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <select id={id} name={name} className="field" defaultValue={value ?? ''}>
        <option value="">{all}</option>
        {children}
      </select>
    </div>
  );
}

// ── Detail ──────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="card">
      <h2 id={id} className="mb-2 font-display text-lg font-bold text-navy">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Line({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-sm">
      <dt className="text-navy/70">{label}</dt>
      <dd className="text-right font-semibold">{value}</dd>
    </div>
  );
}

function actorText(event: StaffEventRow): string {
  if (!event.actor) return 'Règle automatique';
  const role = event.actor.role ? ` (${ROLE_LABELS_FR[event.actor.role as Role]})` : '';
  return `${event.actor.name}${role}`;
}

/**
 * One parcel for the team (Admin 4.3): the track line, the customer, the
 * seller, the money, the courier's reason and the whole event log — who,
 * when, how, where. Réimprimer l'étiquette for Dépôt and Admin (A-9).
 */
export function ColisDetailScreen({
  parcel,
  permissions,
  livreurs = [],
}: {
  parcel: StaffParcelDetail;
  permissions: Permission[];
  /** For Forcer un statut, when the parcel is put with a livreur. */
  livreurs?: ColisFilters['livreurs'];
}) {
  const canReprint = permissions.includes(Permission.REIMPRIMER_ETIQUETTE);
  const status = parcel.status as ParcelStatus;
  return (
    <section>
      <p className="mb-4 text-sm">
        <Link href="/admin/colis" className="font-semibold text-orange-dark underline">
          ← Colis
        </Link>
      </p>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-mono text-2xl font-bold text-navy">{parcel.code}</h1>
        <p className="font-semibold text-navy">
          {statusLabel(parcel.status)} ·{' '}
          {PARCEL_LOCATION_LABELS_FR[parcel.location as ParcelLocation]}
        </p>
      </div>
      <div className="mb-4">
        <TrackLine status={status} />
      </div>
      {parcel.labelReprintNeeded && (
        <p role="status" className="mb-4 rounded-lg bg-amber-100 p-3 font-semibold text-amber-900">
          Étiquette à réimprimer : une modification a changé ce qui est imprimé.
        </p>
      )}

      {canReprint && (
        <div className="card mb-4">
          <PrintLabels path={`colis/${parcel.code}/label`} title="Réimprimer l’étiquette" />
        </div>
      )}
      {permissions.includes(Permission.FORCER_STATUT) && (
        <div className="mb-4">
          <ForcerStatut
            code={parcel.code}
            current={{
              status: parcel.status,
              location: parcel.location,
              cashStatus: parcel.money.cashStatus,
            }}
            livreurs={livreurs}
            permissions={permissions}
          />
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Destinataire">
          <p className="font-semibold">{parcel.recipientName}</p>
          <p>
            {parcel.recipientPhone}
            {parcel.recipientPhone2 && ` · ${parcel.recipientPhone2}`}
          </p>
          <p>{parcel.address}</p>
          {parcel.landmark && <p className="text-navy/70">{parcel.landmark}</p>}
          <p className="text-navy/80">
            {parcel.localiteNameFr}, {parcel.delegationNameFr} ·{' '}
            {parcel.zoneName ?? SANS_ZONE_LABEL}
          </p>
          {parcel.meetingPoint && <p>Point de rendez-vous : {parcel.meetingPoint}</p>}
          {parcel.addressMemory && (
            <div className="mt-2 rounded border border-navy/15 p-2">
              <p className="font-semibold text-navy">
                Mémoire d’adresse
                {parcel.addressMemory.deliveredHere && (
                  <span className="badge-warn ms-2">Déjà livré ici</span>
                )}
              </p>
              {parcel.addressMemory.note && <p>{parcel.addressMemory.note}</p>}
              {parcel.addressMemory.meetingPoint && (
                <p>Point de rendez-vous : {parcel.addressMemory.meetingPoint}</p>
              )}
            </div>
          )}
        </Section>

        <Section title="Colis">
          <p>
            Vendeur :{' '}
            <Link
              href={`/admin/vendeurs/${parcel.seller.id}`}
              className="font-semibold text-orange-dark underline"
            >
              {parcel.seller.shopName}
            </Link>{' '}
            · {parcel.seller.contactPhone}
          </p>
          <p>
            {parcel.productDescription} · {parcel.pieceCount} pièce(s)
            {parcel.isExchange && ' · Échange'}
            {parcel.openingAllowed && ' · Ouverture autorisée'}
          </p>
          {parcel.courierNote && <p className="text-navy/80">Note : {parcel.courierNote}</p>}
          {parcel.currentLivreur && (
            <p>
              Avec : {parcel.currentLivreur.firstName} {parcel.currentLivreur.lastName}
            </p>
          )}
          {parcel.plannedLivreur && (
            <p>
              Prévu pour : {parcel.plannedLivreur.firstName} {parcel.plannedLivreur.lastName}
            </p>
          )}
          {parcel.lastFailureReason && (
            <p>
              {`Tentative ${parcel.attemptCount} · ${FAILURE_REASON_LABELS_FR[parcel.lastFailureReason as FailureReason]}`}
              {parcel.lastFailureNote && ` · « ${parcel.lastFailureNote} »`}
            </p>
          )}
          {parcel.verifyDeadlineAt && (
            <p>Décision du vendeur avant le {dateTime.format(new Date(parcel.verifyDeadlineAt))}</p>
          )}
          {parcel.relaunchDate && (
            <p>
              Relancé pour le {formatTunisDay(parcel.relaunchDate)}
              {parcel.relaunchSlot &&
                ` · ${RELAUNCH_SLOT_LABELS_FR[parcel.relaunchSlot as RelaunchSlot]}`}
            </p>
          )}
        </Section>

        <Section title="Argent">
          <dl>
            <Line label="Montant COD" value={money(parcel.money.codAmountMillimes)} />
            <Line label="Frais de livraison" value={money(parcel.money.deliveryFeeMillimes)} />
            <Line label="Frais de retour" value={money(parcel.money.returnFeeMillimes)} />
            <Line
              label="Changement de client"
              value={money(parcel.money.changeClientFeeMillimes)}
            />
            {parcel.money.courierRateMillimes && (
              <Line label="Tarif livreur" value={money(parcel.money.courierRateMillimes)} />
            )}
            <Line
              label="Argent"
              value={
                parcel.money.cashStatus
                  ? PARCEL_CASH_STATUS_LABELS_FR[parcel.money.cashStatus as ParcelCashStatus]
                  : '—'
              }
            />
            <Line label="Bon de versement" value={parcel.money.bonNumber ?? '—'} />
          </dl>
          {parcel.money.charges.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {parcel.money.charges.map((charge, index) => (
                <li key={index}>
                  {CHARGE_TYPE_LABELS_FR[charge.type as ChargeType]} ·{' '}
                  {money(charge.amountMillimes)} ·{' '}
                  {CHARGE_STATUS_LABELS_FR[charge.status as ChargeStatus]}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <StaffCallsPanel
        code={parcel.code}
        calls={parcel.calls}
        canLog={
          permissions.includes(Permission.SUIVI_A_VERIFIER) &&
          canLogCall(parcel.status as ParcelStatus)
        }
      />

      {parcel.clientChanges.length > 0 && (
        <section aria-labelledby="anciens-clients-title" className="mt-6">
          <h2 id="anciens-clients-title" className="mb-2 font-display text-lg font-bold text-navy">
            Changement de client
          </h2>
          <ul className="space-y-2 text-sm">
            {parcel.clientChanges.map((change, index) => (
              <li key={index} className="card">
                <p className="font-semibold">
                  {dateTime.format(new Date(change.at))} · Ancien client : {change.previousName} ·{' '}
                  {[change.previousPhone, change.previousPhone2].filter(Boolean).join(' · ')}
                </p>
                <p>
                  {change.previousPlace} · {change.previousAddress}
                  {change.previousLandmark && ` (${change.previousLandmark})`}
                </p>
                <p>
                  COD {money(change.previousCodMillimes)} → {money(change.newCodMillimes)} · Frais{' '}
                  {money(change.feeMillimes)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {parcel.changeRequests.length > 0 && (
        <>
          <h2 className="mb-2 mt-6 font-display text-lg font-bold text-navy">
            Demandes de modification
          </h2>
          <ChangeRequestsPanel requests={parcel.changeRequests} permissions={permissions} />
        </>
      )}

      <h2 className="mb-2 mt-6 font-display text-lg font-bold text-navy">Journal du colis</h2>
      <ol aria-label="Journal du colis" className="space-y-2">
        {parcel.events.map((event, index) => (
          <li key={index} className="card text-sm">
            <p className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">
                {PARCEL_EVENT_LABELS_FR[event.type as ParcelEventType] ?? event.type}
                {event.cancelledAfterPickup && ' · Après ramassage'}
              </span>
              <span className="text-navy/70">{dateTime.format(new Date(event.at))}</span>
            </p>
            <p>
              {actorText(event)}
              {event.source && ` · ${SCAN_SOURCE_LABELS_FR[event.source as ScanSource]}`}
            </p>
            {event.previousStatus !== event.newStatus && (
              <p className="text-navy/80">
                {statusLabel(event.previousStatus)} → {statusLabel(event.newStatus)}
              </p>
            )}
            {event.previousLocation !== event.newLocation && event.newLocation && (
              <p className="text-navy/80">
                {event.previousLocation
                  ? PARCEL_LOCATION_LABELS_FR[event.previousLocation as ParcelLocation]
                  : '—'}{' '}
                → {PARCEL_LOCATION_LABELS_FR[event.newLocation as ParcelLocation]}
              </p>
            )}
            {event.reasonCode && (
              <p>
                {FAILURE_REASON_LABELS_FR[event.reasonCode as FailureReason]}
                {event.reasonText && ` · « ${event.reasonText} »`}
              </p>
            )}
            {!event.reasonCode && event.reasonText && <p>« {event.reasonText} »</p>}
            {event.plannedFor && <p>Prévu pour {event.plannedFor}</p>}
            {event.gps && (
              <p className="text-navy/70">
                GPS {event.gps.lat}, {event.gps.lng}
                {event.gps.accuracyM !== null && ` (± ${event.gps.accuracyM} m)`}
              </p>
            )}
            {event.deviceTime && (
              <p className="text-navy/70">
                Heure du téléphone : {dateTime.format(new Date(event.deviceTime))}
              </p>
            )}
            {event.scan && (
              <p className="mt-1 flex flex-wrap gap-2">
                {event.scan.manualEntry && <span className="badge-warn">Saisie manuelle</span>}
                {event.scan.cancelled && <span className="badge-muted">Scan annulé</span>}
                {event.scan.clockSkewFlagged && <span className="badge-warn">Horloge décalée</span>}
                {event.positionMissing && <span className="badge-warn">Sans position</span>}
              </p>
            )}
            {event.scan?.adminCancellable && (
              <AdminScanCancel scanId={event.scan.id} permissions={permissions} />
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
