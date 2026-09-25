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
 * the total is right offline (4.9); a ramasseur's bon cash still to hand to
 * sellers; then the depot's count of his last days, conforme or the écart
 * (D-84): a livreur's shortfall is his debt, a ramasseur's goes to HR.
 */
export function CaisseScreen() {
  const { recent, session } = useApp();
  const isRamasseur = session?.user.role === 'RAMASSEUR';
  const i18n = useI18n();
  const { t } = i18n;
  const { data } = useData<Cash>('/coursier/caisse');
  const pending = pendingDeliveries(recent);
  const total = courierCashCarried(
    (data?.parcels ?? []).map((p) => ({ codAmountMillimes: BigInt(p.codAmountMillimes) })),
    pending,
  );
  const pendingTotal = sumMillimes(pending.map((p) => p.collectedMillimes));
  const bonCash = BigInt(data?.bonCashMillimes ?? '0');

  return (
    <Screen title={t('maCaisse')}>
      <Card>
        <T muted>{t('aRemettre')}</T>
        <T bold size="huge" style={{ color: colors.orangeDark }} testID="cash-total">
          {i18n.money(total + bonCash)}
        </T>
        {pendingTotal > 0n ? (
          <T muted>{t('ofWhichPending', { amount: i18n.money(pendingTotal) })}</T>
        ) : null}
        {bonCash > 0n ? <T>{t('bonCash', { amount: i18n.money(bonCash) })}</T> : null}
      </Card>
      {total + bonCash === 0n ? <T muted>{t('nothingToHandIn')}</T> : null}
      {(data?.bons ?? []).map((b) => (
        <Card key={b.number}>
          <T bold>
            {b.number} · {i18n.money(b.netMillimes)}
          </T>
          <T muted>{b.shopName}</T>
        </Card>
      ))}
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
      {(data?.sessions.length ?? 0) > 0 ? (
        <Card>
          <T bold>{t('caisseResults')}</T>
          {data!.sessions.map((s) => (
            <T key={s.day} testID={`caisse-${s.day}`}>
              {s.status !== 'CLOTUREE'
                ? t('countedNotClosed', { date: i18n.day(s.day) })
                : s.conforme
                  ? t('conformeLine', { date: i18n.day(s.day) })
                  : t('ecartLine', {
                      date: i18n.day(s.day),
                      amount: i18n.money(s.ecartMillimes ?? '0'),
                    })}
              {s.status === 'CLOTUREE' && s.debtMillimes
                ? ` · ${t('debtCreated', { amount: i18n.money(s.debtMillimes) })}`
                : ''}
              {s.status === 'CLOTUREE' &&
              isRamasseur &&
              !s.conforme &&
              (s.ecartMillimes ?? '').startsWith('-')
                ? ` · ${t('hrReported')}`
                : ''}
            </T>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
