import type { Tour } from '../../api/types';
import { Card, Screen, T } from '../../components/ui';
import { useI18n } from '../../i18n';
import { useData } from '../../state/useData';

/**
 * Retour au dépôt (Coursier 4.5): the failed parcels he must bring back
 * tonight. The depot scans them in (Retour de tournée) and they leave the list.
 */
export function RetourDepotScreen() {
  const i18n = useI18n();
  const { t } = i18n;
  const { data } = useData<Tour>('/coursier/tournee');
  const parcels = data?.toBringBack ?? [];
  return (
    <Screen title={t('retourAuDepot')}>
      <T bold size="large">
        {parcels.length > 0
          ? t('toBringBackCount', { count: parcels.length })
          : t('nothingToBringBack')}
      </T>
      {parcels.map((p) => (
        <Card key={p.code}>
          <T bold>{p.code}</T>
          <T>
            {p.recipientName} · {i18n.status(p.status)}
          </T>
          {p.lastFailureReason ? <T muted>{i18n.reason(p.lastFailureReason)}</T> : null}
        </Card>
      ))}
    </Screen>
  );
}
