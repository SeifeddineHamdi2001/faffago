import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../i18n';
import { useApp } from '../state/app';
import { TOUCH_MIN, colors, font } from '../theme';

/**
 * Arabic reads right to left (Coursier 2). The layout follows the language
 * in each component rather than flipping the whole app, which on Android
 * needs a restart.
 */
export function useDir() {
  const { rtl } = useI18n();
  return {
    rtl,
    row: (rtl ? 'row-reverse' : 'row') as ViewStyle['flexDirection'],
    text: {
      textAlign: rtl ? 'right' : 'left',
      writingDirection: rtl ? 'rtl' : 'ltr',
    } as TextStyle,
  };
}

export function T({
  children,
  style,
  size = 'body',
  bold,
  muted,
  center,
  testID,
  onPress,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
  size?: keyof typeof font;
  bold?: boolean;
  muted?: boolean;
  center?: boolean;
  testID?: string;
  onPress?: () => void;
}) {
  const dir = useDir();
  return (
    <Text
      testID={testID}
      onPress={onPress}
      accessibilityRole={onPress ? 'link' : undefined}
      style={[
        dir.text,
        { fontSize: font[size], color: muted ? colors.navyMuted : colors.navy },
        bold && { fontWeight: '700' },
        center && { textAlign: 'center' },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

type Variant = 'primary' | 'success' | 'danger' | 'secondary';

const VARIANTS: Record<Variant, { bg: string; fg: string; border: string }> = {
  // Orange carries navy text: white on #FF6B35 fails WCAG AA (CLAUDE.md, UI).
  primary: { bg: colors.orange, fg: colors.navy, border: colors.orange },
  success: { bg: colors.green, fg: colors.white, border: colors.green },
  danger: { bg: colors.red, fg: colors.white, border: colors.red },
  secondary: { bg: colors.white, fg: colors.navy, border: colors.border },
};

export function BigButton({
  label,
  onPress,
  variant = 'primary',
  disabled,
  busy,
  testID,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  busy?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const v = VARIANTS[variant];
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: v.bg, borderColor: v.border },
        (disabled || busy) && { opacity: 0.5 },
        pressed && { opacity: 0.8 },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <Text style={[styles.buttonText, { color: v.fg }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string }) {
  const dir = useDir();
  const { label, style, ...rest } = props;
  return (
    <View style={{ marginBottom: 12 }}>
      <T bold>{label}</T>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.navyMuted}
        style={[styles.input, dir.text, style]}
        {...rest}
      />
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Badge({ label, tone = 'warn' }: { label: string; tone?: 'warn' | 'info' }) {
  return (
    <View
      style={[
        styles.badge,
        tone === 'warn' ? { backgroundColor: colors.amberBg } : { backgroundColor: '#E0E7FF' },
      ]}
    >
      <Text style={{ color: tone === 'warn' ? colors.amberText : colors.navy, fontWeight: '700' }}>
        {label}
      </Text>
    </View>
  );
}

/** "3 scans en attente d'envoi" and "Hors ligne" (Coursier 4.9), on every screen. */
export function QueueBanner() {
  const { pendingCount, online } = useApp();
  const { t } = useI18n();
  if (pendingCount === 0 && online) return null;
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <T bold center style={{ color: colors.amberText }}>
        {[
          !online ? t('offline') : null,
          pendingCount > 0 ? t('pendingScans', { count: pendingCount }) : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </T>
    </View>
  );
}

/** A screen: the banner at the top, content that scrolls, the main actions at the bottom (Coursier 1). */
export function Screen({
  title,
  children,
  footer,
  scroll = true,
}: {
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
}) {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <QueueBanner />
      {title ? (
        <T size="large" bold style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          {title}
        </T>
      ) : null}
      {scroll ? (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>{children}</ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{children}</View>
      )}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  button: {
    minHeight: TOUCH_MIN,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonText: { fontSize: font.large, fontWeight: '700' },
  input: {
    minHeight: TOUCH_MIN,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: font.large,
    color: colors.navy,
    backgroundColor: colors.white,
    marginTop: 4,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 6,
  },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' },
  banner: { backgroundColor: colors.amberBg, padding: 10 },
  footer: {
    padding: 16,
    gap: 10,
    borderTopWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
});
