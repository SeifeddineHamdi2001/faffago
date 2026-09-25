import { Linking } from 'react-native';
import { telLink } from '@faffago/shared';
import type { PickupDay } from '../../api/types';
import { BigButton, Card, Screen, T } from '../../components/ui';
import { useI18n } from '../../i18n';
import type { RootScreenProps } from '../../navigation/types';
import { useData } from '../../state/useData';
import { colors } from '../../theme';
import { AEmporterCard } from './AEmporterCard';

/**
 * A visit with nothing to pick up (answer 4, D-84): only bons to hand over,
 * to the contact person alone.
 */
export function VisitScreen({ route, navigation }: RootScreenProps<'Visit'>) {
  const i18n = useI18n();
  const { t } = i18n;
  const { data } = useData<PickupDay>('/coursier/ramassages');
  const visit = data?.visits.find((v) => v.sellerId === route.params.sellerId);

  if (!visit) {
    return (
      <Screen>
        <T muted>{t('noPickups')}</T>
      </Screen>
    );
  }
  return (
    <Screen title={visit.shopName}>
      <Card style={{ borderColor: colors.orange, borderWidth: 2 }}>
        <T bold size="large">
          {t('contact', { name: visit.contactName })}
        </T>
        <T>{t('cashOnlyToContact')}</T>
        <BigButton
          variant="secondary"
          label={`${t('callSeller')} · ${visit.sellerPhone}`}
          onPress={() => void Linking.openURL(telLink(visit.sellerPhone))}
        />
      </Card>
      {visit.address ? (
        <Card>
          <T size="large">{visit.address}</T>
          {visit.landmark ? (
            <T>
              {t('landmark')} : {visit.landmark}
            </T>
          ) : null}
          <T muted>
            {i18n.rtl
              ? `${visit.localiteNameAr ?? visit.localiteNameFr ?? ''}، ${visit.delegationNameAr ?? ''}`
              : `${visit.localiteNameFr ?? ''}, ${visit.delegationNameFr ?? ''}`}
          </T>
        </Card>
      ) : null}
      <AEmporterCard
        aEmporter={visit.aEmporter}
        onScanBon={() => navigation.navigate('Scanner', { step: 'BON' })}
        onScanRetours={() => navigation.navigate('Scanner', { step: 'RETOURS' })}
      />
    </Screen>
  );
}
