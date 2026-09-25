import { Linking } from 'react-native';
import { BigButton, Screen, T } from '../components/ui';
import { useI18n } from '../i18n';
import { useApp } from '../state/app';

/** Location is required to use the app (D-63): asked after login. */
export function LocationScreen({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <Screen
      title={t('appName')}
      footer={
        <>
          <BigButton testID="allow-location" label={t('allow')} onPress={onRetry} />
          <BigButton
            variant="secondary"
            label={t('openSettings')}
            onPress={() => void Linking.openSettings()}
          />
        </>
      }
    >
      <T size="large">{t('locationNeeded')}</T>
    </Screen>
  );
}

/**
 * Forced update (tech-stack 5): the queue is sent first — the upload stays
 * open to an outdated app (D-14) — and the app blocks once it is empty.
 */
export function UpdateScreen() {
  const { t } = useI18n();
  const { pendingCount } = useApp();
  return (
    <Screen title={t('updateTitle')}>
      <T size="large" testID="update-message">
        {pendingCount > 0 ? t('updateSending', { count: pendingCount }) : t('updateInstall')}
      </T>
    </Screen>
  );
}
