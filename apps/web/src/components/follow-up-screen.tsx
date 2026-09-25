import Link from 'next/link';
import {
  FAILURE_REASON_LABELS_FR,
  PARCEL_LOCATION_LABELS_FR,
  callOutcomeLabelFR,
} from '@faffago/shared';
import type { FollowUpList } from '@/lib/types';
import { LogCallButton } from './calls-panel';
import { TimeLeft } from './time-left';

const dateTime = new Intl.DateTimeFormat('fr-TN', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Africa/Tunis',
});

/**
 * À vérifier, the team's follow-up (Admin 4.6): every failed delivery,
 * soonest automatic return first, with the reason, the courier's note, the
 * attempt, where the parcel is, and the people to call. The team calls and
 * logs its calls; it never decides for the seller (D-4).
 */
export function FollowUpScreen({ list }: { list: FollowUpList }) {
  return (
    <section>
      <h1 className="mb-2 font-display text-2xl font-bold text-navy">À vérifier</h1>
      <p className="mb-6 text-sm text-navy/70">
        Le vendeur décide : Relancer, Retourner ou Changer de client. Faffa Go appelle le client ou
        le vendeur et note ses appels ; le vendeur les voit.
      </p>
      {list.items.length === 0 ? (
        <p className="card">Aucun colis à vérifier.</p>
      ) : (
        <ul className="space-y-3" aria-label="Colis à vérifier">
          {list.items.map((item) => (
            <li key={item.code} className="card text-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link
                    href={`/admin/colis/${item.code}`}
                    className="font-mono font-bold text-orange-dark underline"
                  >
                    {item.code}
                  </Link>
                  <p className="font-semibold">
                    {item.failureReason ? FAILURE_REASON_LABELS_FR[item.failureReason] : '—'} ·
                    Tentative {item.attemptCount} sur {item.maxAttempts} ·{' '}
                    {PARCEL_LOCATION_LABELS_FR[item.location]}
                  </p>
                </div>
                {item.verifyDeadlineAt && (
                  <TimeLeft
                    deadline={item.verifyDeadlineAt}
                    serverNow={list.now}
                    prefix="Retour dans"
                  />
                )}
              </div>
              {item.courierFailureNote && <p>Note du livreur : « {item.courierFailureNote} »</p>}
              <p className="mt-2">
                Client : {item.recipientName} · {item.recipientPhone}
                {item.recipientPhone2 && ` · ${item.recipientPhone2}`} · {item.delegationNameFr}
              </p>
              <p>
                Vendeur : {item.shopName} · {item.sellerContactName} · {item.sellerContactPhone}
              </p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-navy/70">
                  {item.lastCall
                    ? `Dernier appel : ${dateTime.format(new Date(item.lastCall.calledAt))} · ${callOutcomeLabelFR(item.lastCall.answered)}${item.lastCall.note ? ` · ${item.lastCall.note}` : ''} (${item.callCount})`
                    : 'Aucun appel'}
                </p>
                <LogCallButton code={item.code} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
