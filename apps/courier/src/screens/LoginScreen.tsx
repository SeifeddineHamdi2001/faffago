import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { ApiError } from '../api/client';
import type { CourierRole } from '../api/types';
import { BigButton, Field, Screen, T, useDir } from '../components/ui';
import { useI18n } from '../i18n';
import { storage } from '../session/storage';
import { useApp } from '../state/app';
import { colors } from '../theme';

/**
 * Coursier 2: Livreur or Ramasseur first, then phone and password. The last
 * role used is pre-selected. The same phone may hold one account per role.
 */
export function LoginScreen() {
  const { login, notice } = useApp();
  const i18n = useI18n();
  const { t } = i18n;
  const dir = useDir();
  const [role, setRole] = useState<CourierRole | null>(null);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(notice ? t('sessionExpired') : null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void storage.lastRole().then((last) => {
      if (last) setRole((current) => current ?? last);
    });
  }, []);

  async function submit() {
    if (!role) {
      setError(t('chooseRoleFirst'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(role, phone.trim(), password);
    } catch (e) {
      setError(e instanceof ApiError ? i18n.refusal(e.code, e.message) : t('networkError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title={t('loginTitle')}
      footer={
        <BigButton testID="login" label={t('login')} onPress={() => void submit()} busy={busy} />
      }
    >
      <T muted>{t('loginSteps')}</T>
      <View style={{ flexDirection: dir.row, gap: 12 }}>
        {(['LIVREUR', 'RAMASSEUR'] as const).map((r) => (
          <BigButton
            key={r}
            testID={`role-${r}`}
            label={r === 'LIVREUR' ? t('roleLivreur') : t('roleRamasseur')}
            variant={role === r ? 'primary' : 'secondary'}
            onPress={() => setRole(r)}
            style={{ flex: 1, minHeight: 72 }}
          />
        ))}
      </View>
      <Field
        label={t('phone')}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        autoComplete="tel"
        maxLength={16}
      />
      <Field
        label={t('password')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
      />
      {error ? (
        <T bold style={{ color: colors.red }} testID="login-error">
          {error}
        </T>
      ) : null}
    </Screen>
  );
}
