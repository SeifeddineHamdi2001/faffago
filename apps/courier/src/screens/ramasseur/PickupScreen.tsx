import { useState } from 'react';
import { Linking } from 'react-native';
import { CourierOperationKind, ScanAction, telLink } from '@faffago/shared';
import type { PickupDay } from '../../api/types';
import { BigButton, Card, Screen, T } from '../../components/ui';
import { useI18n } from '../../i18n';
import type { RootScreenProps } from '../../navigation/types';
import { QueueStatus } from '../../queue/queue';
import { useApp } from '../../state/app';
import { useData } from '../../state/useData';
import { colors } from '../../theme';
import { AEmporterCard } from './AEmporterCard';

/** Free from this many parcels (Vendeur rule 11, A-13); the API decides the fee. */
const FREE_THRESHOLD = 5;

/**
 * One pickup (Coursier 4.6): who to hand cash to, the parcels expected and
 * scanned — missing ones stay listed, extra ones of the same seller are
 * welcome (D-47) — then Terminer le ramassage, which closes the visit and
 * charges the pickup fee below 5 parcels, none at 0 (A-13). Between the two,
 * À emporter and its steps Bon de versement and Retours (D-84).
 */
export function PickupScreen({ route, navigation }: RootScreenProps<'Pickup'>) {
  const { recent, recordOperation } = useApp();
  const i18n = useI18n();
  const { t } = i18n;
  const { data } = useData<PickupDay>('/coursier/ramassages');
  const [confirming, setConfirming] = useState(false);
  const pickup = [...(data?.open ?? []), ...(data?.done ?? [])].find(
    (p) => p.id === route.params.id,
  );

  if (!pickup) {
    return (
      <Screen>
        <T muted>{t('noPickups')}</T>
      </Screen>
    );
  }

  // Scans still on the phone count at once, even offline.
  const localCodes = new Set(
    recent
      .filter(
        (r) =>
          r.kind === CourierOperationKind.SCAN &&
          r.action === ScanAction.RAMASSAGE &&
          r.operation.kind === CourierOperationKind.SCAN &&
          r.operation.pickupId === pickup.id &&
          (r.status === QueueStatus.EN_ATTENTE || r.status === QueueStatus.ACCEPTE),
      )
      .map((r) => r.parcelCode),
  );
  const listed = pickup.parcels.map((p) => ({
    ...p,
    scanned: p.scanned || localCodes.has(p.code),
  }));
  const extraLocal = [...localCodes].filter(
    (code): code is string => code !== null && !pickup.parcels.some((p) => p.code === code),
  );
  const expected = listed.filter((p) => p.expected);
  const missing = expected.filter((p) => !p.scanned);
  const extra = [
    ...listed.filter((p) => !p.expected && p.scanned).map((p) => p.code),
    ...extraLocal,
  ];
  const scannedCount = listed.filter((p) => p.scanned).length + extraLocal.length;
  const open = pickup.status === 'PLANIFIE';
  const finishing = recent.some(
    (r) =>
      r.kind === CourierOperationKind.TERMINER_RAMASSAGE &&
      r.operation.kind === CourierOperationKind.TERMINER_RAMASSAGE &&
      r.operation.pickupId === pickup.id &&
      r.status !== QueueStatus.REFUSE,
  );

  async function finish() {
    await recordOperation({ kind: CourierOperationKind.TERMINER_RAMASSAGE, pickupId: pickup!.id });
    setConfirming(false);
    navigation.goBack();
  }

  return (
    <Screen
      title={pickup.shopName}
      footer={
        open && !finishing ? (
          confirming ? (
            <>
              <T bold size="large">
                {t('finishConfirm', { count: scannedCount })}
              </T>
              <T>
                {scannedCount === 0
                  ? t('finishNone')
                  : scannedCount < FREE_THRESHOLD
                    ? t('finishFee')
                    : ''}
              </T>
              <BigButton
                testID="finish-confirm"
                label={t('confirm')}
                onPress={() => void finish()}
              />
              <BigButton
                variant="secondary"
                label={t('back')}
                onPress={() => setConfirming(false)}
              />
            </>
          ) : (
            <>
              <BigButton
                testID="scan-parcels"
                label={t('scanParcels')}
                onPress={() => navigation.navigate('Scanner', { pickupId: pickup.id })}
              />
              <BigButton
                testID="finish"
                variant="secondary"
                label={t('finishPickup')}
                onPress={() => setConfirming(true)}
              />
            </>
          )
        ) : undefined
      }
    >
      <Card style={{ borderColor: colors.orange, borderWidth: 2 }}>
        <T bold size="large">
          {t('contact', { name: pickup.contactName })}
        </T>
        <T>{t('cashOnlyToContact')}</T>
        <BigButton
          variant="secondary"
          label={`${t('callSeller')} · ${pickup.sellerPhone}`}
          onPress={() => void Linking.openURL(telLink(pickup.sellerPhone))}
        />
      </Card>
      <Card>
        <T size="large">{pickup.address}</T>
        {pickup.landmark ? (
          <T>
            {t('landmark')} : {pickup.landmark}
          </T>
        ) : null}
        {pickup.plannedSlot ? <T muted>{i18n.slot(pickup.plannedSlot)}</T> : null}
        {pickup.note ? <T muted>{pickup.note}</T> : null}
      </Card>
      <AEmporterCard
        aEmporter={pickup.aEmporter}
        onScanBon={() => navigation.navigate('Scanner', { pickupId: pickup.id, step: 'BON' })}
        onScanRetours={() =>
          navigation.navigate('Scanner', { pickupId: pickup.id, step: 'RETOURS' })
        }
      />
      <Card>
        <T bold size="large" testID="pickup-counts">
          {`${t('scanned')} ${scannedCount} · ${t('expected')} ${
            pickup.declaredCount ?? expected.length
          }`}
        </T>
        {pickup.declaredCount ? (
          <T muted>{t('declared', { count: pickup.declaredCount })}</T>
        ) : null}
        {missing.length > 0 ? <T bold>{t('missing')}</T> : null}
        {missing.map((p) => (
          <T key={p.code}>{p.code}</T>
        ))}
        {extra.length > 0 ? <T bold>{t('extra')}</T> : null}
        {extra.map((code) => (
          <T key={code}>{code}</T>
        ))}
      </Card>
    </Screen>
  );
}
