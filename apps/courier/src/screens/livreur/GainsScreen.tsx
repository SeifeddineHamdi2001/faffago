import type { Gains } from '../../api/types';
import { Card, Screen, T } from '../../components/ui';
import { useI18n } from '../../i18n';
import { useData } from '../../state/useData';
import { colors } from '../../theme';

/**
 * Mes gains (Coursier 4.10, D-82), livreur only: what the next fiche would
 * pay today — parcels livrés × their frozen rates − his debts — the period,
 * the next payment date, and his fiches.
 */
export function GainsScreen() {
  const i18n = useI18n();
  const { t } = i18n;
  const { data } = useData<Gains>('/coursier/gains');
  if (!data) {
    return (
      <Screen title={t('mesGains')}>
        <T muted>…</T>
      </Screen>
    );
  }
  return (
    <Screen title={t('mesGains')}>
      <Card>
        <T muted>{t('gainsDue')}</T>
        <T bold size="huge" style={{ color: colors.orangeDark }} testID="gains-due">
          {i18n.money(data.dueMillimes)}
        </T>
        <T>
          {t('gainsPeriod', { start: i18n.day(data.period.start), end: i18n.day(data.period.end) })}
        </T>
        <T>
          {t('gainsParcels', { count: data.parcelCount, amount: i18n.money(data.grossMillimes) })}
        </T>
        {data.debtsMillimes !== '0' ? (
          <T>{t('gainsDebts', { amount: i18n.money(data.debtsMillimes) })}</T>
        ) : null}
        {data.carriedDebtMillimes !== '0' ? (
          <T>{t('gainsCarried', { amount: i18n.money(data.carriedDebtMillimes) })}</T>
        ) : null}
        <T bold>{t('gainsNext', { date: i18n.day(data.nextPaymentDate) })}</T>
        <T muted>
          {t('payPlan')} : {i18n.payPlan(data.payPlan)}
        </T>
        {data.pendingPayPlan && data.pendingPayPlanFrom ? (
          <T muted>
            {t('gainsPlanPending', {
              date: i18n.day(data.pendingPayPlanFrom),
              plan: i18n.payPlan(data.pendingPayPlan),
            })}
          </T>
        ) : null}
      </Card>
      <T bold>{t('mesFiches')}</T>
      {data.fiches.length === 0 ? <T muted>{t('noFiches')}</T> : null}
      {data.fiches.map((fiche) => (
        <Card key={fiche.id}>
          <T>
            {t('ficheLine', {
              number: fiche.number,
              start: i18n.day(fiche.period.start),
              end: i18n.day(fiche.period.end),
              amount: i18n.money(fiche.netMillimes),
              status: fiche.status === 'PAYEE' ? t('fichePayee') : t('ficheAPayer'),
            })}
          </T>
        </Card>
      ))}
    </Screen>
  );
}
