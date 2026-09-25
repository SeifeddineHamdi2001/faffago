import { useRef, useState } from 'react';
import { View } from 'react-native';
import {
  ADDRESS_NOTE_MAX_LENGTH,
  CourierOperationKind,
  FAILURE_NOTE_MAX_LENGTH,
  FAILURE_REASONS_IN_ORDER,
  FailureReason,
  RelaunchSlot,
  ScanAction,
  isWithinCancelWindow,
  postponementChoices,
} from '@faffago/shared';
import type { Tour } from '../../api/types';
import { BigButton, Card, Field, Screen, T, useDir } from '../../components/ui';
import { useI18n } from '../../i18n';
import type { RootScreenProps } from '../../navigation/types';
import type { QueueRow } from '../../queue/queue';
import { useApp } from '../../state/app';
import { useData } from '../../state/useData';
import { colors } from '../../theme';
import { placeOf } from './stops';

type Step = 'CHOIX' | 'LIVRE' | 'ECHEC' | 'FAIT';

/**
 * Livrer (Coursier 4.4). Livré shows the COD in large type and asks the
 * courier to confirm it — the customer pays exactly the COD (A-24) — and, for
 * an échange, that the old item was collected (A-10). Échec asks a reason
 * from the fixed list; Reporté par le client asks the day, tomorrow up to a
 * week (D-9). The scan is recorded on the phone at once; Annuler stays one
 * minute (A-11); after Livré a note d'adresse can be saved (4.3).
 */
export function DeliverScreen({ route, navigation }: RootScreenProps<'Deliver'>) {
  const { recordScan, cancelLastScan, recordOperation, cancelWindowSeconds, online } = useApp();
  const i18n = useI18n();
  const { t } = i18n;
  const dir = useDir();
  const { data } = useData<Tour>('/coursier/tournee');
  // Kept once found: after the scan is sent, the parcel leaves the tour.
  const found = data?.toDeliver.find((s) => s.code === route.params.code);
  const kept = useRef(found);
  if (found) kept.current = found;
  const stop = kept.current;
  const [step, setStep] = useState<Step>('CHOIX');
  const [amountConfirmed, setAmountConfirmed] = useState(false);
  const [itemConfirmed, setItemConfirmed] = useState(false);
  const [reason, setReason] = useState<FailureReason | null>(null);
  const [postponedTo, setPostponedTo] = useState<string | null>(null);
  const [slot, setSlot] = useState<RelaunchSlot | null>(null);
  const [note, setNote] = useState('');
  const [addressNote, setAddressNote] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [row, setRow] = useState<QueueRow | null>(null);
  const [busy, setBusy] = useState(false);

  if (!stop) {
    return (
      <Screen footer={<BigButton label={t('back')} onPress={() => navigation.goBack()} />}>
        <T size="large">{t('notInTour')}</T>
      </Screen>
    );
  }

  const manual = route.params.manual;
  const toggle = (label: string, value: boolean, set: (v: boolean) => void, testID: string) => (
    <BigButton
      testID={testID}
      variant={value ? 'success' : 'secondary'}
      label={`${value ? '✓ ' : ''}${label}`}
      onPress={() => set(!value)}
    />
  );

  async function confirmDelivery() {
    setBusy(true);
    const recorded = await recordScan({
      action: ScanAction.LIVRE,
      rawCode: stop!.code,
      manual,
      collectedMillimes: stop!.codAmountMillimes,
      exchangeItemCollected: stop!.isExchange ? true : null,
    });
    finish(recorded);
  }

  async function confirmFailure() {
    if (!reason) return;
    setBusy(true);
    const recorded = await recordScan({
      action: ScanAction.ECHEC,
      rawCode: stop!.code,
      manual,
      failureReason: reason,
      postponedTo: reason === FailureReason.REPORTE_PAR_LE_CLIENT ? postponedTo : null,
      relaunchSlot: reason === FailureReason.REPORTE_PAR_LE_CLIENT ? slot : null,
      note: note.trim() || null,
    });
    finish(recorded);
  }

  function finish(recorded: QueueRow) {
    setRow(recorded);
    setBusy(false);
    setMessage(online ? t('scanSaved') : t('scanQueued'));
    setStep('FAIT');
  }

  const header = (
    <Card>
      <T bold size="large">
        {stop.recipientName}
      </T>
      <T muted>
        {placeOf(stop, i18n.rtl)} · {stop.code}
      </T>
    </Card>
  );

  if (step === 'CHOIX') {
    return (
      <Screen
        footer={
          <View style={{ flexDirection: dir.row, gap: 12 }}>
            <BigButton
              testID="choose-livre"
              style={{ flex: 1, minHeight: 72 }}
              variant="success"
              label={t('livre')}
              onPress={() => setStep('LIVRE')}
            />
            <BigButton
              testID="choose-echec"
              style={{ flex: 1, minHeight: 72 }}
              variant="danger"
              label={t('echec')}
              onPress={() => setStep('ECHEC')}
            />
          </View>
        }
      >
        {header}
        <T bold size="huge" center style={{ color: colors.orangeDark }}>
          {i18n.money(stop.codAmountMillimes)}
        </T>
      </Screen>
    );
  }

  if (step === 'LIVRE') {
    const ready = amountConfirmed && (!stop.isExchange || itemConfirmed);
    return (
      <Screen
        footer={
          <>
            <BigButton
              testID="confirm-delivery"
              variant="success"
              label={t('confirmDelivery')}
              disabled={!ready}
              busy={busy}
              onPress={() => void confirmDelivery()}
            />
            <BigButton variant="secondary" label={t('back')} onPress={() => setStep('CHOIX')} />
          </>
        }
      >
        {header}
        <T bold>{t('amountToCollect')}</T>
        <T bold size="huge" center style={{ color: colors.orangeDark }} testID="cod">
          {i18n.money(stop.codAmountMillimes)}
        </T>
        {toggle(
          t('confirmAmount', { amount: i18n.money(stop.codAmountMillimes) }),
          amountConfirmed,
          setAmountConfirmed,
          'confirm-amount',
        )}
        {stop.isExchange
          ? toggle(t('confirmExchange'), itemConfirmed, setItemConfirmed, 'confirm-exchange')
          : null}
      </Screen>
    );
  }

  if (step === 'ECHEC') {
    const needsDate = reason === FailureReason.REPORTE_PAR_LE_CLIENT;
    const ready = reason !== null && (!needsDate || postponedTo !== null);
    return (
      <Screen
        footer={
          <>
            <BigButton
              testID="confirm-failure"
              variant="danger"
              label={t('confirmFailure')}
              disabled={!ready}
              busy={busy}
              onPress={() => void confirmFailure()}
            />
            <BigButton variant="secondary" label={t('back')} onPress={() => setStep('CHOIX')} />
          </>
        }
      >
        {header}
        <T bold>{t('chooseReason')}</T>
        {FAILURE_REASONS_IN_ORDER.map((r) => (
          <BigButton
            key={r}
            testID={`reason-${r}`}
            variant={reason === r ? 'danger' : 'secondary'}
            label={i18n.reason(r)}
            onPress={() => setReason(r)}
          />
        ))}
        {needsDate ? (
          <>
            <T bold>{t('postponeDate')}</T>
            <View style={{ flexDirection: dir.row, flexWrap: 'wrap', gap: 8 }}>
              {postponementChoices(new Date()).map((day) => (
                <BigButton
                  key={day}
                  testID={`day-${day}`}
                  style={{ minWidth: 96 }}
                  variant={postponedTo === day ? 'primary' : 'secondary'}
                  label={i18n.day(day)}
                  onPress={() => setPostponedTo(day)}
                />
              ))}
            </View>
            <T bold>{t('slotOptional')}</T>
            <View style={{ flexDirection: dir.row, gap: 8 }}>
              {Object.values(RelaunchSlot).map((s) => (
                <BigButton
                  key={s}
                  style={{ flex: 1 }}
                  variant={slot === s ? 'primary' : 'secondary'}
                  label={i18n.slot(s)}
                  onPress={() => setSlot(slot === s ? null : s)}
                />
              ))}
            </View>
          </>
        ) : null}
        <Field
          label={t('noteOptional')}
          value={note}
          onChangeText={setNote}
          maxLength={FAILURE_NOTE_MAX_LENGTH}
          multiline
        />
        <T muted testID="note-visible-to-seller">
          {t('noteVisibleToSeller')}
        </T>
      </Screen>
    );
  }

  // FAIT
  const delivered = row?.action === ScanAction.LIVRE;
  const cancellable =
    row !== null && isWithinCancelWindow(new Date(row.deviceTime), new Date(), cancelWindowSeconds);
  return (
    <Screen
      footer={
        <>
          {cancellable ? (
            <BigButton
              testID="cancel-scan"
              variant="secondary"
              label={t('cancelLastScan')}
              onPress={() =>
                void cancelLastScan().then((outcome) => {
                  if (outcome === 'TOO_LATE') {
                    setMessage(t('cancelTooLate'));
                    return;
                  }
                  navigation.goBack();
                })
              }
            />
          ) : null}
          <BigButton label={t('close')} onPress={() => navigation.goBack()} />
        </>
      }
    >
      {header}
      <T
        bold
        size="large"
        style={{ color: delivered ? colors.green : colors.red }}
        testID="done-message"
      >
        {`${delivered ? t('livre') : i18n.reason(reason)} · ${message ?? ''}`}
      </T>
      {delivered ? (
        <Card>
          <Field
            label={t('addressNote')}
            placeholder={t('addressNoteHint')}
            value={addressNote}
            onChangeText={setAddressNote}
            maxLength={ADDRESS_NOTE_MAX_LENGTH}
            multiline
          />
          <BigButton
            variant="secondary"
            label={t('saveNote')}
            disabled={!addressNote.trim()}
            onPress={() =>
              void recordOperation({
                kind: CourierOperationKind.NOTE_ADRESSE,
                parcelCode: stop.code,
                note: addressNote.trim(),
              }).then(() => {
                setAddressNote('');
                setMessage(t('noteSaved'));
              })
            }
          />
        </Card>
      ) : null}
    </Screen>
  );
}
