import { courierCashCarried, sumMillimes } from '@faffago/shared';
import type { Cash } from '../api/types';
import { Card, Screen, T } from '../components/ui';
import { useI18n } from '../i18n';
import { pendingDeliveries } from '../queue/queue';
import { useApp } from '../state/app';
import { useData } from '../state/useData';
import { colors } from '../theme';

/**
 * Ma caisse (Coursier 4.7): the cash carried, parcel by parcel, and what to
 * hand to the depot tonight — Livré scans still on the phone included, so
 * the total is right offline (4.9). The depot's count and its écart come with
 * the Caisse (phase 8); the ramasseur's bon cash with the bons (D-61).
 */
export function CaisseScreen() {
  const { recent } = useApp();
  const i18n = useI18n();
  const { t } = i18n;
  const { data } = useData<Cash>('/coursier/caisse');
  const pending = pendingDeliveries(recent);
  const total = courierCashCarried(
    (data?.parcels ?? []).map((p) => ({ codAmountMillimes: BigInt(p.codAmountMillimes) })),
    pending,
  );
  const pendingTotal = sumMillimes(pending.map((p) => p.collectedMillimes));

  return (
    <Screen title={t('maCaisse')}>
      <Card>
        <T muted>{t('aRemettre')}</T>
        <T bold size="huge" style={{ color: colors.orangeDark }} testID="cash-total">
          {i18n.money(total)}
        </T>
        {pendingTotal > 0n ? (
          <T muted>{t('ofWhichPending', { amount: i18n.money(pendingTotal) })}</T>
        ) : null}
      </Card>
      {total === 0n ? <T muted>{t('nothingToHandIn')}</T> : null}
      {(data?.parcels ?? []).map((p) => (
        <Card key={p.code}>
          <T bold>
            {p.code} · {i18n.money(p.codAmountMillimes)}
          </T>
          <T muted>
            {p.recipientName}
            {p.deliveredAt ? ` · ${i18n.time(p.deliveredAt)}` : ''}
          </T>
        </Card>
      ))}
    </Screen>
  );
}
