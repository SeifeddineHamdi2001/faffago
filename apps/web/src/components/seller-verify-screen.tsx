import Link from 'next/link';
import {
  FAILURE_REASON_LABELS_FR,
  PARCEL_LOCATION_LABELS_FR,
  formatDT,
  millimesFromJson,
} from '@faffago/shared';
import type { SellerVerifyList } from '@/lib/types';
import { TimeLeft } from './time-left';

/**
 * À vérifier (Vendeur 4.9): each failed delivery with its reason, the
 * courier's note (D-71), the attempt and the time left before the automatic
 * return. The seller calls his customer from his own phone, then decides on
 * the parcel's page.
 */
export function SellerVerifyScreen({ list }: { list: SellerVerifyList }) {
  return (
    <section>
      <h1 className="mb-2 font-display text-2xl font-bold text-navy">À vérifier</h1>
      <p className="mb-6 text-sm text-navy/70">
        Appelez votre client, puis choisissez : Relancer, Retourner ou Changer de client. Sans
        décision sous 48 heures, le colis vous est retourné automatiquement.
      </p>
      {list.items.length === 0 ? (
        <p className="card text-navy">Aucun colis à vérifier.</p>
      ) : (
        <ul className="space-y-3">
          {list.items.map((item) => (
            <li key={item.code} className="card text-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono font-bold text-navy">{item.code}</p>
                  <p className="font-semibold text-navy">
                    À vérifier
                    {item.failureReason && ` · ${FAILURE_REASON_LABELS_FR[item.failureReason]}`}
                  </p>
                </div>
                {item.verifyDeadlineAt && (
                  <TimeLeft deadline={item.verifyDeadlineAt} serverNow={list.now} />
                )}
              </div>
              {item.courierFailureNote && (
                <p className="mt-1 text-navy">Note du livreur : « {item.courierFailureNote} »</p>
              )}
              <p className="mt-2 text-navy/80">
                {item.recipientName} · {item.recipientPhone} · {item.localiteNameFr},{' '}
                {item.delegationNameFr} · {formatDT(millimesFromJson(item.codAmountMillimes))}
              </p>
              <p className="text-navy/70">
                Tentative {item.attemptCount} sur {item.maxAttempts} ·{' '}
                {PARCEL_LOCATION_LABELS_FR[item.location]}
                {item.callCount > 0 &&
                  ` · ${item.callCount} appel${item.callCount > 1 ? 's' : ''} Faffa Go`}
              </p>
              <div className="mt-3">
                <Link href={`/vendeur/colis/${item.code}#decision`} className="btn-primary">
                  Décider
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
