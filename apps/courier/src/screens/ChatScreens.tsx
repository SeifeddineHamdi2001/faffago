import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import {
  CHAT_MESSAGES_FR,
  CHAT_MESSAGE_MAX_LENGTH,
  CHAT_QUICK_REPLIES_COURIER,
  CourierOperationKind,
  telLink,
} from '@faffago/shared';
import type { ChatList, ChatThread } from '../api/types';
import { Badge, BigButton, Card, Field, Screen, T, useDir } from '../components/ui';
import { useI18n } from '../i18n';
import type { RootScreenProps, RootStackParams } from '../navigation/types';
import { QueueStatus } from '../queue/queue';
import { useApp } from '../state/app';
import { useData } from '../state/useData';
import { colors } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParams>;

const POLL_MS = 10_000;

/** The livreur's chats (Coursier 3, 4.8): the parcels he holds or held, latest first. */
export function ChatListScreen() {
  const navigation = useNavigation<Nav>();
  const { t, time } = useI18n();
  const { data } = useData<ChatList>('/chat/courier');
  const threads = data?.threads ?? [];
  return (
    <Screen>
      {threads.length === 0 ? <T muted>{t('chatListEmpty')}</T> : null}
      {threads.map((thread) => (
        <Pressable
          key={thread.parcelCode}
          testID={`chat-${thread.parcelCode}`}
          accessibilityRole="button"
          onPress={() => navigation.navigate('Chat', { code: thread.parcelCode })}
        >
          <Card>
            <T bold>
              {thread.parcelCode}
              {thread.unread > 0 ? `  ·  ${t('chatUnread', { count: thread.unread })}` : ''}
            </T>
            <T>{thread.shopName}</T>
            {thread.lastMessage ? <T muted>{thread.lastMessage}</T> : null}
            {thread.lastMessageAt ? (
              <T muted size="small">
                {time(thread.lastMessageAt)}
              </T>
            ) : null}
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}

/**
 * The chat of a parcel with its seller (Coursier 4.8): the seller's phone
 * beside it, four quick replies, and a box. A message is written to the
 * queue first, like a scan, under its own id: with no signal it waits and is
 * sent once when the network returns, and one refused (the chat closed
 * meanwhile) shows why and is not tried again. The thread is read from the
 * API when there is signal and kept on the phone for when there is not.
 */
export function ChatScreen({ route }: RootScreenProps<'Chat'>) {
  const { code } = route.params;
  const { recordOperation, recent, refreshUnread } = useApp();
  const i18n = useI18n();
  const { t } = i18n;
  const dir = useDir();
  const { data, reload } = useData<{ thread: ChatThread | null }>(`/chat/courier/${code}`);
  const [draft, setDraft] = useState('');
  const thread = data?.thread ?? null;

  useEffect(() => {
    const timer = setInterval(() => void reload(), POLL_MS);
    return () => clearInterval(timer);
  }, [reload]);

  // Reading a thread marks it read on the server: the counts follow.
  useEffect(() => {
    if (data) void refreshUnread();
    // Only when the thread is read again, not on every count change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // What he wrote that the thread does not hold yet: waiting, refused, or sent a moment ago.
  const outbox = recent.filter(
    (row) =>
      row.kind === CourierOperationKind.MESSAGE_CHAT &&
      row.parcelCode === code &&
      !thread?.messages.some((message) => message.id === row.id),
  );

  async function send(body: string) {
    const text = body.trim();
    if (!text) return;
    await recordOperation({
      kind: CourierOperationKind.MESSAGE_CHAT,
      parcelCode: code,
      body: text,
    });
  }

  if (!thread) {
    return (
      <Screen title={code}>
        <T muted>{t('chatNotOpen')}</T>
        {outbox.length > 0 ? <T muted>{t('chatWaiting')}</T> : null}
      </Screen>
    );
  }

  const stateLabel = {
    OUVERT: t('chatStateOuvert'),
    VERROUILLE: t('chatStateVerrouille'),
    CLOS: t('chatStateClos'),
  }[thread.state];

  return (
    <Screen
      title={`${thread.parcelCode} · ${thread.shopName}`}
      footer={
        thread.canPost ? (
          <>
            {CHAT_QUICK_REPLIES_COURIER.map((reply) => (
              <BigButton
                key={reply.fr}
                testID={`quick-${reply.fr}`}
                variant="secondary"
                label={i18n.lang === 'AR' ? reply.ar : reply.fr}
                onPress={() => void send(reply.fr)}
              />
            ))}
            <Field
              label={t('chatYourMessage')}
              value={draft}
              maxLength={CHAT_MESSAGE_MAX_LENGTH}
              onChangeText={setDraft}
              multiline
            />
            <BigButton
              testID="chat-send"
              label={t('chatSend')}
              disabled={draft.trim() === ''}
              onPress={() => {
                void send(draft);
                setDraft('');
              }}
            />
          </>
        ) : undefined
      }
    >
      <View style={{ flexDirection: dir.row, gap: 10, alignItems: 'center' }}>
        <Badge label={stateLabel} tone={thread.state === 'OUVERT' ? 'info' : 'warn'} />
      </View>
      {thread.sellerPhone ? (
        <BigButton
          variant="secondary"
          label={`${t('callSeller')} · ${thread.sellerPhone}`}
          onPress={() => void Linking.openURL(telLink(thread.sellerPhone!))}
        />
      ) : null}
      {!thread.canPost && thread.refusal ? (
        <T testID="chat-refusal" muted>
          {i18n.refusal(thread.refusal, CHAT_MESSAGES_FR[thread.refusal])}
        </T>
      ) : null}
      {thread.messages.length === 0 && outbox.length === 0 ? (
        <T muted>{t('chatNoMessage')}</T>
      ) : null}
      {thread.messages.map((message) => (
        <View key={message.id} style={{ alignItems: message.mine ? 'flex-end' : 'flex-start' }}>
          <Card
            style={{
              maxWidth: '90%',
              backgroundColor: message.mine ? colors.orange : colors.white,
            }}
          >
            <T bold size="small">
              {message.mine ? t('you') : message.label}
            </T>
            <T>{message.body}</T>
            <T muted size="small">
              {i18n.time(message.createdAt)}
            </T>
          </Card>
        </View>
      ))}
      {outbox.map((row) => {
        const body = (row.operation as { body?: string }).body ?? '';
        return (
          <View key={row.id} style={{ alignItems: 'flex-end' }} testID={`outbox-${row.id}`}>
            <Card style={{ maxWidth: '90%', backgroundColor: colors.orange, opacity: 0.85 }}>
              <T bold size="small">
                {t('you')}
              </T>
              <T>{body}</T>
              <T size="small" testID={`outbox-status-${row.id}`}>
                {row.status === QueueStatus.REFUSE
                  ? t('chatNotSent', { reason: i18n.refusal(row.code, row.message ?? '') })
                  : row.status === QueueStatus.ACCEPTE
                    ? t('chatSent')
                    : t('chatWaiting')}
              </T>
            </Card>
          </View>
        );
      })}
    </Screen>
  );
}
