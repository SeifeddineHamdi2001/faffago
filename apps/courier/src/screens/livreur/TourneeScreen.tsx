import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { Linking, View } from 'react-native';
import { telLink, whatsappLink, whatsappMessageFr } from '@faffago/shared';
import type { Stop, Tour } from '../../api/types';
import { Badge, BigButton, Card, Screen, T, useDir } from '../../components/ui';
import { useI18n } from '../../i18n';
import type { RootStackParams } from '../../navigation/types';
import { cacheGet, cacheSet } from '../../queue/sqlite';
import { useApp } from '../../state/app';
import { scannedToday, useData } from '../../state/useData';
import { colors, font } from '../../theme';
import { moveStop, orderStops, placeOf } from './stops';

type Nav = NativeStackNavigationProp<RootStackParams>;

/**
 * Ma tournée (Coursier 4.2): the parcels scanned out to him, a stop each,
 * with what finds the customer and the buttons Appeler, WhatsApp, Scanner.
 * A parcel he has just scanned leaves the list at once, even offline.
 */
export function TourneeScreen() {
  const navigation = useNavigation<Nav>();
  const { session, recent } = useApp();
  const i18n = useI18n();
  const { t } = i18n;
  const dir = useDir();
  const { data } = useData<Tour>('/coursier/tournee');
  const orderKey = `order:${session?.user.id ?? ''}`;
  const [order, setOrder] = useState<string[]>([]);

  useEffect(() => {
    void cacheGet<string[]>(orderKey).then((saved) => setOrder(saved ?? []));
  }, [orderKey]);

  const done = scannedToday(recent);
  const stops = useMemo(
    () =>
      orderStops(
        (data?.toDeliver ?? []).filter((s) => !done.has(s.code)),
        order,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, order, recent],
  );

  function move(code: string, delta: -1 | 1) {
    const next = moveStop(
      stops.map((s) => s.code),
      code,
      delta,
    );
    setOrder(next);
    void cacheSet(orderKey, next);
  }

  const toBringBack = data?.toBringBack.length ?? 0;

  return (
    <Screen title={t('maTournee')}>
      {toBringBack > 0 ? (
        <BigButton
          variant="secondary"
          label={`${t('retourAuDepot')} · ${toBringBack}`}
          onPress={() => navigation.navigate('RetourDepot')}
        />
      ) : null}
      {stops.length === 0 ? <T muted>{t('noStops')}</T> : null}
      {stops.map((stop, index) => {
        const showHeader =
          index === 0 || stops[index - 1]!.delegationNameFr !== stop.delegationNameFr;
        return (
          <View key={stop.code} style={{ gap: 8 }}>
            {showHeader ? (
              <T bold muted>
                {i18n.rtl ? stop.delegationNameAr : stop.delegationNameFr}
              </T>
            ) : null}
            <StopCard
              stop={stop}
              onOpen={() => navigation.navigate('Stop', { code: stop.code })}
              onScan={() => navigation.navigate('Scanner', {})}
              onUp={index > 0 ? () => move(stop.code, -1) : undefined}
              onDown={index < stops.length - 1 ? () => move(stop.code, 1) : undefined}
              rtl={dir.rtl}
            />
          </View>
        );
      })}
    </Screen>
  );
}

export function StopCard({
  stop,
  onOpen,
  onScan,
  onUp,
  onDown,
  rtl,
}: {
  stop: Stop;
  onOpen: () => void;
  onScan?: () => void;
  onUp?: () => void;
  onDown?: () => void;
  rtl: boolean;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const dir = useDir();
  const row = { flexDirection: dir.row, gap: 8, flexWrap: 'wrap' as const };
  return (
    <Card>
      <View style={row}>
        <T bold size="large" style={{ flex: 1 }}>
          {stop.recipientName}
        </T>
        <T bold size="large" style={{ color: colors.orangeDark }}>
          {i18n.money(stop.codAmountMillimes)}
        </T>
      </View>
      <T muted>{placeOf(stop, rtl)}</T>
      <T size="large" onPress={onOpen}>
        {stop.address}
      </T>
      {stop.landmark ? (
        <T>
          {t('landmark')} : {stop.landmark}
        </T>
      ) : null}
      <View style={row}>
        <Badge tone="info" label={t('attempt', { n: stop.attemptNumber, m: stop.maxAttempts })} />
        {stop.isExchange ? <Badge label={t('exchange')} /> : null}
        {stop.openingAllowed ? <Badge tone="info" label={t('openingAllowed')} /> : null}
        {stop.memory?.deliveredHere ? <Badge label={t('deliveredHere')} /> : null}
        {stop.relaunchDate ? (
          <Badge
            label={`${t(stop.relaunchOrigin === 'CLIENT' ? 'postponedTo' : 'relaunchedTo', {
              date: i18n.day(stop.relaunchDate),
            })}${stop.relaunchSlot ? ` · ${i18n.slot(stop.relaunchSlot)}` : ''}`}
          />
        ) : null}
      </View>
      {stop.memory?.note ? <T style={{ fontSize: font.body }}>{stop.memory.note}</T> : null}
      {stop.sellerNote ? (
        <T muted>
          {t('sellerNote')} : {stop.sellerNote}
        </T>
      ) : null}
      <View style={row}>
        <BigButton
          style={{ flex: 1 }}
          variant="secondary"
          label={t('call')}
          onPress={() => void Linking.openURL(telLink(stop.recipientPhone))}
        />
        <BigButton
          style={{ flex: 1 }}
          variant="secondary"
          label={t('whatsapp')}
          onPress={() =>
            void Linking.openURL(
              whatsappLink(
                stop.recipientPhone,
                whatsappMessageFr(stop.shopName, stop.delegationNameFr),
              ),
            )
          }
        />
        {onScan ? <BigButton style={{ flex: 1 }} label={t('scan')} onPress={onScan} /> : null}
      </View>
      {onUp || onDown ? (
        <View style={row}>
          {onUp ? (
            <BigButton style={{ flex: 1 }} variant="secondary" label={t('moveUp')} onPress={onUp} />
          ) : null}
          {onDown ? (
            <BigButton
              style={{ flex: 1 }}
              variant="secondary"
              label={t('moveDown')}
              onPress={onDown}
            />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}
