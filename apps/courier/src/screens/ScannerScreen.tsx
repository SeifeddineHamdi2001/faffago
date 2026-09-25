import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import {
  BonKind,
  ScanAction,
  isRepeatRead,
  isWithinCancelWindow,
  parcelCodeFromScan,
  parseBonScan,
} from '@faffago/shared';
import type { PickupDay, Tour } from '../api/types';
import { BigButton, Card, Field, Screen, T } from '../components/ui';
import { useI18n } from '../i18n';
import type { RootStackParams, ScanStep } from '../navigation/types';
import { QueueStatus, findPreviousScan, lastScan, type QueueRow } from '../queue/queue';
import { useApp } from '../state/app';
import { useData } from '../state/useData';
import { colors } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParams>;

interface Feedback {
  ok: boolean;
  text: string;
}

/**
 * The Scanner (Coursier 3, 4.4, 4.6): the camera reads the label's Code128 or
 * its QR (D-36); a damaged label is typed, allowed but flagged (Coursier
 * rule 1). What the scan does depends on the courier: the livreur opens
 * Livré / Échec for a parcel of his tour, the ramasseur records the step of
 * his visit — a pickup scan, a bon de versement's QR, a return — and keeps
 * scanning (D-84).
 */
export function ScannerScreen({
  pickupId,
  step = 'COLIS',
}: {
  pickupId?: string;
  step?: ScanStep;
}) {
  const navigation = useNavigation<Nav>();
  const { session, recent, recordScan, cancelLastScan, cancelWindowSeconds } = useApp();
  const i18n = useI18n();
  const { t } = i18n;
  const [permission, requestPermission] = useCameraPermissions();
  const [typed, setTyped] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [lastRow, setLastRow] = useState<QueueRow | null>(null);
  const lastRead = useRef<{ code: string; at: number } | null>(null);
  const isRamasseur = session?.user.role === 'RAMASSEUR';
  const tour = useData<Tour>('/coursier/tournee');
  const pickups = useData<PickupDay>('/coursier/ramassages');

  if (isRamasseur && step === 'COLIS' && !pickupId) {
    const open = isRamasseur ? (pickups.data?.open ?? []) : [];
    return (
      <Screen title={t('scanTitle')}>
        <T size="large">{t('choosePickupFirst')}</T>
        {open.map((p) => (
          <BigButton
            key={p.id}
            variant="secondary"
            label={p.shopName}
            onPress={() => navigation.navigate('Scanner', { pickupId: p.id })}
          />
        ))}
      </Screen>
    );
  }

  function alreadyScanned(previous: QueueRow): Feedback {
    return {
      ok: false,
      text: t('alreadyScanned', {
        action: i18n.scanAction(previous.action),
        time: i18n.time(previous.deviceTime),
      }),
    };
  }

  async function handle(raw: string, manual: boolean) {
    if (isRamasseur && step === 'BON') {
      const bon = parseBonScan(raw);
      if (!bon || bon.kind !== BonKind.BON_VERSEMENT) {
        setFeedback({ ok: false, text: t('unreadableBon') });
        return;
      }
      const already = recent.some(
        (r) =>
          r.action === ScanAction.BON_VERSEMENT_REMIS &&
          r.operation.kind === 'SCAN' &&
          r.operation.rawCode.trim().toUpperCase() === raw.trim().toUpperCase() &&
          (r.status === QueueStatus.EN_ATTENTE || r.status === QueueStatus.ACCEPTE),
      );
      if (already) {
        setFeedback({ ok: false, text: t('bonAlreadyScanned') });
        return;
      }
      await recordScan({ action: ScanAction.BON_VERSEMENT_REMIS, rawCode: raw, manual });
      setFeedback({ ok: true, text: t('bonScanned') });
      return;
    }
    const code = parcelCodeFromScan(raw);
    if (!code) {
      setFeedback({ ok: false, text: t('unreadableCode') });
      return;
    }
    if (isRamasseur && step === 'RETOURS') {
      const previous = findPreviousScan(recent, code, ScanAction.RETOUR_RECU);
      if (previous) {
        setFeedback(alreadyScanned(previous));
        return;
      }
      await recordScan({ action: ScanAction.RETOUR_RECU, rawCode: raw, manual });
      setFeedback({ ok: true, text: t('retourSaved', { code }) });
      return;
    }
    if (isRamasseur) {
      const previous = findPreviousScan(recent, code, ScanAction.RAMASSAGE);
      if (previous) {
        setFeedback(alreadyScanned(previous));
        return;
      }
      const row = await recordScan({
        action: ScanAction.RAMASSAGE,
        rawCode: raw,
        pickupId,
        manual,
      });
      setLastRow(row);
      setFeedback({ ok: true, text: `${t('scanSaved')} · ${code}` });
      return;
    }
    const previous =
      findPreviousScan(recent, code, ScanAction.LIVRE) ??
      findPreviousScan(recent, code, ScanAction.ECHEC);
    if (previous) {
      setFeedback(alreadyScanned(previous));
      return;
    }
    if (!tour.data?.toDeliver.some((s) => s.code === code)) {
      setFeedback({ ok: false, text: t('notInTour') });
      return;
    }
    setFeedback(null);
    navigation.navigate('Deliver', { code, manual });
  }

  function onRead(value: string) {
    const now = Date.now();
    if (isRepeatRead(lastRead.current, value, now)) return;
    lastRead.current = { code: value, at: now };
    void handle(value, false);
  }

  const standing = lastScan(recent);
  // A bon's steps are corrected by the admin, never undone from the phone (D-84).
  const canCancel =
    isRamasseur &&
    step === 'COLIS' &&
    lastRow !== null &&
    standing?.id === lastRow.id &&
    isWithinCancelWindow(new Date(lastRow.deviceTime), new Date(), cancelWindowSeconds);

  return (
    <Screen
      title={
        isRamasseur
          ? `${t('scanTitle')} · ${t(step === 'BON' ? 'stepBon' : step === 'RETOURS' ? 'stepRetours' : 'stepColis')}`
          : t('scanTitle')
      }
      footer={
        canCancel ? (
          <BigButton
            variant="secondary"
            label={t('cancelLastScan')}
            onPress={() =>
              void cancelLastScan().then((outcome) => {
                setLastRow(null);
                setFeedback({
                  ok: outcome !== 'TOO_LATE',
                  text: outcome === 'TOO_LATE' ? t('cancelTooLate') : t('scanCancelled'),
                });
              })
            }
          />
        ) : undefined
      }
    >
      {permission?.granted ? (
        <View style={{ height: 280, borderRadius: 14, overflow: 'hidden' }}>
          <CameraView
            testID="camera"
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['code128', 'qr'] }}
            onBarcodeScanned={({ data }) => onRead(data)}
          />
        </View>
      ) : (
        <Card>
          <T>{t('cameraNeeded')}</T>
          <BigButton label={t('allow')} onPress={() => void requestPermission()} />
        </Card>
      )}
      {feedback ? (
        <Card
          style={{
            backgroundColor: feedback.ok ? colors.green : colors.red,
            borderColor: feedback.ok ? colors.green : colors.red,
          }}
        >
          <T bold size="large" style={{ color: colors.white }} testID="scan-feedback">
            {feedback.text}
          </T>
        </Card>
      ) : null}
      {isRamasseur && step !== 'COLIS' ? (
        <T muted>{t(step === 'BON' ? 'scanBonHint' : 'scanRetoursHint')}</T>
      ) : null}
      <Card>
        <T muted>{t('typeCodeHint')}</T>
        <Field
          label={step === 'BON' ? t('bonNumber') : t('parcelCode')}
          value={typed}
          onChangeText={setTyped}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <BigButton
          testID="validate-code"
          variant="secondary"
          label={t('validate')}
          disabled={!typed.trim()}
          onPress={() => {
            void handle(typed.trim(), true);
            setTyped('');
          }}
        />
      </Card>
    </Screen>
  );
}
