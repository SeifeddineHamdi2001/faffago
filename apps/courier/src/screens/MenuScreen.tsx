import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { View } from 'react-native';
import type { Profile } from '../api/types';
import { BigButton, Card, Screen, T, useDir } from '../components/ui';
import { APP_VERSION } from '../config';
import { useI18n } from '../i18n';
import type { RootStackParams } from '../navigation/types';
import { useApp } from '../state/app';
import { useData } from '../state/useData';

type Nav = NativeStackNavigationProp<RootStackParams>;

/**
 * Menu and Profil (Coursier 3, 4.12): role, zones and pay plan read-only, set
 * by the admin; language and PIN set on the phone; no password change (Q7).
 * Mes gains for a livreur (D-82); Chat and Notifications come after launch
 * (CLAUDE.md).
 */
export function MenuScreen() {
  const navigation = useNavigation<Nav>();
  const { lang, setLang, logout, pendingCount } = useApp();
  const i18n = useI18n();
  const { t } = i18n;
  const dir = useDir();
  const { data } = useData<Profile>('/coursier/moi');

  return (
    <Screen
      title={t('profil')}
      footer={
        <>
          {pendingCount > 0 ? <T muted>{t('logoutPending', { count: pendingCount })}</T> : null}
          <BigButton
            testID="logout"
            variant="secondary"
            label={t('logout')}
            onPress={() => void logout()}
          />
        </>
      }
    >
      {data ? (
        <Card>
          <T bold size="large">
            {data.firstName} {data.lastName}
          </T>
          <T>{data.phone}</T>
          <T>
            {t('role')} : {data.role === 'LIVREUR' ? t('roleLivreur') : t('roleRamasseur')}
          </T>
          <T bold>{t('zones')}</T>
          {data.zones.length === 0 ? <T muted>{t('noZone')}</T> : null}
          {data.zones.map((z) => (
            <T key={`${z.name}-${z.kind}`}>
              {z.name} · {i18n.zoneKind(z.kind)}
            </T>
          ))}
          {data.payPlan ? (
            <>
              <T>
                {t('payPlan')} : {i18n.payPlan(data.payPlan)}
              </T>
              <T muted>{t('payPlanChange')}</T>
            </>
          ) : null}
        </Card>
      ) : null}
      <Card>
        <T bold>{t('language')}</T>
        <View style={{ flexDirection: dir.row, gap: 12 }}>
          <BigButton
            testID="lang-FR"
            style={{ flex: 1 }}
            variant={lang === 'FR' ? 'primary' : 'secondary'}
            label={t('french')}
            onPress={() => void setLang('FR')}
          />
          <BigButton
            testID="lang-AR"
            style={{ flex: 1 }}
            variant={lang === 'AR' ? 'primary' : 'secondary'}
            label={t('arabic')}
            onPress={() => void setLang('AR')}
          />
        </View>
      </Card>
      {data?.role === 'LIVREUR' ? (
        <BigButton
          testID="open-gains"
          label={t('mesGains')}
          onPress={() => navigation.navigate('Gains')}
        />
      ) : null}
      <BigButton
        variant="secondary"
        label={t('changePin')}
        onPress={() => navigation.navigate('ChangePin')}
      />
      <T muted>{t('passwordAdminOnly')}</T>
      <T muted>{t('appVersion', { version: APP_VERSION })}</T>
    </Screen>
  );
}
