import { useState } from 'react';
import { Linking } from 'react-native';
import {
  CourierOperationKind,
  MEETING_POINT_MAX_LENGTH,
  telLink,
  whatsappLink,
  whatsappMessageFr,
} from '@faffago/shared';
import type { Tour } from '../../api/types';
import { Badge, BigButton, Card, Field, Screen, T } from '../../components/ui';
import { useI18n } from '../../i18n';
import type { RootScreenProps } from '../../navigation/types';
import { useApp } from '../../state/app';
import { useData } from '../../state/useData';
import { colors } from '../../theme';
import { placeOf } from './stops';

/**
 * Trouver le client (Coursier 4.3), without a map: the address and landmark
 * in large text, never shortened; the address memory; calls to both
 * numbers and to the seller (Coursier rule 12); the ready WhatsApp message;
 * and the meeting point, kept in the memory.
 */
export function StopScreen({ route, navigation }: RootScreenProps<'Stop'>) {
  const { recordOperation } = useApp();
  const i18n = useI18n();
  const { t } = i18n;
  const { data } = useData<Tour>('/coursier/tournee');
  const stop = [...(data?.toDeliver ?? []), ...(data?.toBringBack ?? [])].find(
    (s) => s.code === route.params.code,
  );
  const [meetingPoint, setMeetingPoint] = useState('');
  const [saved, setSaved] = useState(false);

  if (!stop) {
    return (
      <Screen>
        <T muted>{t('noStops')}</T>
      </Screen>
    );
  }

  async function saveMeetingPoint() {
    if (!stop || !meetingPoint.trim()) return;
    await recordOperation({
      kind: CourierOperationKind.NOTE_ADRESSE,
      parcelCode: stop.code,
      meetingPoint: meetingPoint.trim(),
    });
    setSaved(true);
  }

  return (
    <Screen
      title={stop.recipientName}
      footer={
        stop.status === 'EN_LIVRAISON' ? (
          <BigButton label={t('scan')} onPress={() => navigation.navigate('Scanner', {})} />
        ) : undefined
      }
    >
      <Card>
        <T bold size="huge" style={{ color: colors.orangeDark }}>
          {i18n.money(stop.codAmountMillimes)}
        </T>
        <T muted>{placeOf(stop, i18n.rtl)}</T>
        <T size="large">{stop.address}</T>
        {stop.landmark ? (
          <T size="large" bold>
            {t('landmark')} : {stop.landmark}
          </T>
        ) : null}
        {stop.meetingPoint ? (
          <T>
            {t('meetingPoint')} : {stop.meetingPoint}
          </T>
        ) : null}
        <T muted>
          {stop.shopName} · {stop.code}
        </T>
        {stop.sellerNote ? (
          <T>
            {t('sellerNote')} : {stop.sellerNote}
          </T>
        ) : null}
      </Card>

      {stop.memory ? (
        <Card>
          <T bold>{t('addressNote')}</T>
          {stop.memory.deliveredHere ? <Badge label={t('deliveredHere')} /> : null}
          {stop.memory.note ? <T size="large">{stop.memory.note}</T> : null}
          {stop.memory.meetingPoint ? (
            <T>
              {t('meetingPoint')} : {stop.memory.meetingPoint}
            </T>
          ) : null}
        </Card>
      ) : null}

      <BigButton
        variant="secondary"
        label={`${t('call')} · ${stop.recipientPhone}`}
        onPress={() => void Linking.openURL(telLink(stop.recipientPhone))}
      />
      {stop.recipientPhone2 ? (
        <BigButton
          variant="secondary"
          label={`${t('callPhone2')} · ${stop.recipientPhone2}`}
          onPress={() => void Linking.openURL(telLink(stop.recipientPhone2!))}
        />
      ) : null}
      <BigButton
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
      <BigButton
        variant="secondary"
        label={`${t('callSeller')} · ${stop.sellerPhone}`}
        onPress={() => void Linking.openURL(telLink(stop.sellerPhone))}
      />
      <BigButton
        testID="open-stop-chat"
        variant="secondary"
        label={t('chatWithSeller')}
        onPress={() => navigation.navigate('Chat', { code: stop.code })}
      />

      <Card>
        <Field
          label={t('meetingPoint')}
          value={meetingPoint}
          onChangeText={(text) => {
            setMeetingPoint(text);
            setSaved(false);
          }}
          maxLength={MEETING_POINT_MAX_LENGTH}
        />
        <BigButton
          variant="secondary"
          label={t('saveMeetingPoint')}
          disabled={!meetingPoint.trim()}
          onPress={() => void saveMeetingPoint()}
        />
        {saved ? (
          <T bold style={{ color: colors.green }}>
            {t('meetingPointSaved')}
          </T>
        ) : null}
      </Card>
    </Screen>
  );
}
