import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BigButton, Screen, T } from '../components/ui';
import { useI18n } from '../i18n';
import { isValidPin } from '../session/storage';
import { useApp } from '../state/app';
import { TOUCH_MIN, colors, font } from '../theme';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

/**
 * The 4-digit PIN (Coursier 2, 4.12): chosen after each login, asked when the
 * app is reopened. It never leaves the phone (D-7); forgotten, the courier
 * logs out and back in with his password.
 */
export function PinScreen({ mode, onDone }: { mode: 'create' | 'unlock'; onDone?: () => void }) {
  const { setPin, unlock, logout } = useApp();
  const { t } = useI18n();
  const [entry, setEntry] = useState('');
  const [first, setFirst] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const prompt =
    mode === 'unlock' ? t('pinEnter') : first === null ? t('pinCreate') : t('pinConfirm');

  async function complete(pin: string) {
    if (!isValidPin(pin)) return;
    if (mode === 'unlock') {
      if (!(await unlock(pin))) setError(t('pinWrong'));
    } else if (first === null) {
      setFirst(pin);
    } else if (pin === first) {
      await setPin(pin);
      onDone?.();
    } else {
      setFirst(null);
      setError(t('pinMismatch'));
    }
    setEntry('');
  }

  function press(key: string) {
    if (key === '⌫') {
      setEntry((current) => current.slice(0, -1));
      return;
    }
    if (!key || entry.length >= 4) return;
    setError(null);
    const next = entry + key;
    setEntry(next);
    if (next.length === 4) void complete(next);
  }

  return (
    <Screen
      title={t('appName')}
      footer={
        mode === 'unlock' ? (
          <BigButton variant="secondary" label={t('pinForgotten')} onPress={() => void logout()} />
        ) : undefined
      }
    >
      <T size="large" bold center>
        {prompt}
      </T>
      <View style={styles.dots} accessibilityLabel={`${entry.length}/4`}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.dot, i < entry.length && styles.dotFilled]} />
        ))}
      </View>
      {error ? (
        <T bold center style={{ color: colors.red }} testID="pin-error">
          {error}
        </T>
      ) : null}
      <View style={styles.pad}>
        {KEYS.map((key, i) => (
          <Pressable
            key={i}
            testID={key ? `pin-${key}` : undefined}
            accessibilityRole="button"
            accessibilityLabel={key === '⌫' ? t('erase') : key}
            disabled={!key}
            onPress={() => press(key)}
            style={[styles.key, !key && { opacity: 0 }]}
          >
            <Text style={styles.keyText}>{key}</Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 18, marginVertical: 16 },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.navy },
  dotFilled: { backgroundColor: colors.navy },
  pad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    direction: 'ltr',
  },
  key: {
    width: '28%',
    minHeight: TOUCH_MIN + 16,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: { fontSize: font.huge, color: colors.navy, fontWeight: '700' },
});
