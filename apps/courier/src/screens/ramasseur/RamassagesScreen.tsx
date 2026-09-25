import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { PickupDay, PickupView } from '../../api/types';
import { Card, Screen, T } from '../../components/ui';
import { useI18n } from '../../i18n';
import type { RootStackParams } from '../../navigation/types';
import { useData } from '../../state/useData';

type Nav = NativeStackNavigationProp<RootStackParams>;

/**
 * Ramassages (Coursier 4.6): the sellers he picks up from today — shop,
 * address, time slot, seller's phone — then those he closed today.
 */
export function RamassagesScreen() {
  const navigation = useNavigation<Nav>();
  const { t } = useI18n();
  const { data } = useData<PickupDay>('/coursier/ramassages');

  return (
    <Screen title={t('mesRamassages')}>
      {(data?.open.length ?? 0) === 0 ? <T muted>{t('noPickups')}</T> : null}
      {(data?.open ?? []).map((p) => (
        <PickupCard
          key={p.id}
          pickup={p}
          onPress={() => navigation.navigate('Pickup', { id: p.id })}
        />
      ))}
      {(data?.done.length ?? 0) > 0 ? (
        <>
          <T bold muted>
            {t('doneToday')}
          </T>
          {data!.done.map((p) => (
            <PickupCard key={p.id} pickup={p} />
          ))}
        </>
      ) : null}
    </Screen>
  );
}

function PickupCard({ pickup, onPress }: { pickup: PickupView; onPress?: () => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  return (
    <Card>
      <T bold size="large" onPress={onPress}>
        {pickup.shopName}
      </T>
      <T>{pickup.address}</T>
      <T muted>
        {i18n.rtl
          ? `${pickup.localiteNameAr ?? pickup.localiteNameFr}، ${pickup.delegationNameAr}`
          : `${pickup.localiteNameFr}, ${pickup.delegationNameFr}`}
      </T>
      <T>
        {pickup.plannedDate ? t('planned', { date: i18n.day(pickup.plannedDate) }) : ''}
        {pickup.plannedSlot ? ` · ${i18n.slot(pickup.plannedSlot)}` : ''}
        {` · ${t('scanned')} ${pickup.scannedCount}`}
      </T>
    </Card>
  );
}
