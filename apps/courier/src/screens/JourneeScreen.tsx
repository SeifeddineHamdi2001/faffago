import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { View } from 'react-native';
import { courierCashCarried } from '@faffago/shared';
import type { Cash, PickupDay, Tour } from '../api/types';
import { BigButton, Card, Screen, T, useDir } from '../components/ui';
import { useI18n } from '../i18n';
import type { TabParams } from '../navigation/types';
import { QueueStatus, pendingDeliveries } from '../queue/queue';
import { useApp } from '../state/app';
import { scannedToday, useData } from '../state/useData';
import { colors } from '../theme';

type Nav = BottomTabNavigationProp<TabParams>;

function Tile({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  return (
    <Card style={{ flex: 1, minHeight: 96 }}>
      <T muted>{label}</T>
      <T bold size="huge" onPress={onPress}>
        {value}
      </T>
    </Card>
  );
}

/**
 * Ma journée (Coursier 4.1): today in a few numbers, the progress of the
 * tour, and Avant de rentrer — what is still open at the end of the day.
 * Also the scans the server refused today, with why (Coursier 4.9).
 */
export function JourneeScreen() {
  const navigation = useNavigation<Nav>();
  const { session, recent } = useApp();
  const i18n = useI18n();
  const { t } = i18n;
  const dir = useDir();
  const isLivreur = session?.user.role === 'LIVREUR';
  const tour = useData<Tour>(isLivreur ? '/coursier/tournee' : '/coursier/ramassages');
  const cash = useData<Cash>('/coursier/caisse');

  const carried = courierCashCarried(
    (cash.data?.parcels ?? []).map((p) => ({ codAmountMillimes: BigInt(p.codAmountMillimes) })),
    pendingDeliveries(recent),
  );
  const refused = recent.filter((r) => r.status === QueueStatus.REFUSE);

  let tiles;
  const before: string[] = [];
  if (isLivreur) {
    const data = tour.data as Tour | null;
    const done = scannedToday(recent);
    const remaining = (data?.toDeliver ?? []).filter((s) => !done.has(s.code)).length;
    const doneCount = Math.max(data?.doneToday ?? 0, done.size);
    const toBringBack = data?.toBringBack.length ?? 0;
    tiles = (
      <>
        <View style={{ flexDirection: dir.row, gap: 12 }}>
          <Tile
            label={t('aLivrer')}
            value={String(remaining)}
            onPress={() => navigation.navigate('Tournee')}
          />
          <Tile
            label={t('cashPorte')}
            value={i18n.money(carried)}
            onPress={() => navigation.navigate('Caisse')}
          />
        </View>
        <Card>
          <T bold>{t('progress', { done: doneCount, total: doneCount + remaining })}</T>
          <View
            style={{
              flexDirection: dir.row,
              height: 14,
              borderRadius: 7,
              overflow: 'hidden',
              backgroundColor: colors.border,
            }}
          >
            <View
              style={{
                flex: doneCount,
                backgroundColor: colors.green,
              }}
            />
            <View style={{ flex: remaining }} />
          </View>
        </Card>
      </>
    );
    if (toBringBack > 0) before.push(t('toBringBackCount', { count: toBringBack }));
  } else {
    const data = tour.data as PickupDay | null;
    const open = data?.open.length ?? 0;
    tiles = (
      <View style={{ flexDirection: dir.row, gap: 12 }}>
        <Tile
          label={t('ramassages')}
          value={String(open)}
          onPress={() => navigation.navigate('Ramassages')}
        />
        <Tile
          label={t('cashPorte')}
          value={i18n.money(carried)}
          onPress={() => navigation.navigate('Caisse')}
        />
      </View>
    );
    if (open > 0) before.push(`${t('ramassages')} : ${open}`);
  }
  if (carried > 0n) before.push(t('cashToHandIn', { amount: i18n.money(carried) }));

  return (
    <Screen title={`${t('maJournee')} · ${session?.user.firstName ?? ''}`}>
      {tiles}
      <Card>
        <T bold>{t('avantDeRentrer')}</T>
        {before.length === 0 ? (
          <T muted>{t('nothingOpen')}</T>
        ) : (
          before.map((line) => <T key={line}>{line}</T>)
        )}
      </Card>
      {refused.length > 0 ? (
        <Card style={{ borderColor: colors.red }}>
          <T bold style={{ color: colors.red }}>
            {t('refusedScans')}
          </T>
          {refused.map((row) => (
            <T key={row.id}>
              {row.parcelCode ?? ''} · {i18n.time(row.deviceTime)} ·{' '}
              {i18n.refusal(row.code, row.message ?? '')}
            </T>
          ))}
        </Card>
      ) : null}
      {tour.loadedAt ? <T muted>{t('lastUpdate', { time: i18n.time(tour.loadedAt) })}</T> : null}
      <BigButton variant="secondary" label={t('refresh')} onPress={() => void tour.reload()} />
    </Screen>
  );
}
