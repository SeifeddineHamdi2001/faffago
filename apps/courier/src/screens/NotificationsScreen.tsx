import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, View } from 'react-native';
import { notificationTarget, notificationText } from '@faffago/shared';
import type { NotificationItem, NotificationList } from '../api/types';
import { BigButton, Card, Screen, T, useDir } from '../components/ui';
import { useI18n } from '../i18n';
import type { RootStackParams } from '../navigation/types';
import { useApp } from '../state/app';
import { useData } from '../state/useData';
import { colors } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParams>;

/**
 * Notifications (Coursier 4.11), in the courier's language: the API keeps a
 * type and its parameters, the text is made here (A-24). Unread ones are bold
 * with a dot; a tap marks one read and opens what it is about. Offline, the
 * last list is shown and nothing is marked.
 */
export function NotificationsScreen() {
  const navigation = useNavigation<Nav>();
  const { api, lang, session, refreshUnread } = useApp();
  const { t } = useI18n();
  const dir = useDir();
  const { data, reload } = useData<NotificationList>('/notifications');

  async function markRead(item: NotificationItem) {
    if (item.readAt) return;
    try {
      await api.request('POST', `/notifications/${item.id}/read`);
      await Promise.all([reload(), refreshUnread()]);
    } catch {
      // No signal: it stays unread, and shows so.
    }
  }

  async function markAll() {
    try {
      await api.request('POST', '/notifications/read-all');
      await Promise.all([reload(), refreshUnread()]);
    } catch {
      // No signal: try again later.
    }
  }

  function open(item: NotificationItem) {
    void markRead(item);
    const target = notificationTarget(item.type, item.params as never);
    if (target.screen === 'CHAT') navigation.navigate('Chat', { code: target.code });
    else if (target.screen === 'PICKUP') navigation.navigate('Pickup', { id: target.pickupId });
    else if (target.screen === 'TOUR') {
      navigation.navigate('Tabs', {
        screen: session?.user.role === 'LIVREUR' ? 'Tournee' : 'Ramassages',
      });
    }
  }

  const items = data?.items ?? [];
  return (
    <Screen
      footer={
        items.some((item) => !item.readAt) ? (
          <BigButton
            testID="mark-all-read"
            variant="secondary"
            label={t('markAllRead')}
            onPress={() => void markAll()}
          />
        ) : undefined
      }
    >
      {items.length === 0 ? <T muted>{t('notificationsEmpty')}</T> : null}
      {items.map((item) => {
        const unread = item.readAt === null;
        return (
          <Pressable
            key={item.id}
            testID={`notification-${item.id}`}
            accessibilityRole="button"
            onPress={() => open(item)}
          >
            <Card>
              <View style={{ flexDirection: dir.row, gap: 10, alignItems: 'flex-start' }}>
                <View
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 6,
                    marginTop: 6,
                    backgroundColor: unread ? colors.orangeDark : 'transparent',
                  }}
                />
                <View style={{ flex: 1 }}>
                  <T bold={unread}>
                    {notificationText(item.type, item.params as never, lang === 'AR' ? 'ar' : 'fr')}
                  </T>
                  <T muted size="small">
                    {new Date(item.createdAt).toLocaleString(lang === 'AR' ? 'ar-TN' : 'fr-FR', {
                      timeZone: 'Africa/Tunis',
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </T>
                </View>
              </View>
            </Card>
          </Pressable>
        );
      })}
    </Screen>
  );
}
