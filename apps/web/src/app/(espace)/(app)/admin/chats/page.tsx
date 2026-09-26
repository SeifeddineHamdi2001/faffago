import { notFound } from 'next/navigation';
import { Permission } from '@faffago/shared';
import { ChatsInboxScreen } from '@/components/chats-inbox-screen';
import { requireMe, serverGet } from '@/lib/server/session';
import type { ChatInbox, ColisFilters } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function one(value: string | string[] | undefined): string | undefined {
  const text = Array.isArray(value) ? value[0] : value;
  return text && text.trim() !== '' ? text.trim() : undefined;
}

/** Chats (Admin 4.8): every parcel chat, filters in the address. */
export default async function ChatsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const me = await requireMe('admin');
  if (!me.permissions.includes(Permission.CHATS_STAFF)) notFound();
  const raw = await searchParams;
  const sellerId = one(raw.sellerId);
  const courierUserId = one(raw.courierUserId);
  const query = {
    unread: one(raw.unread) === 'true',
    sellerId: sellerId && UUID.test(sellerId) ? sellerId : undefined,
    courierUserId: courierUserId && UUID.test(courierUserId) ? courierUserId : undefined,
    q: one(raw.q)?.slice(0, 100),
  };
  const params = new URLSearchParams();
  if (query.unread) params.set('unread', 'true');
  if (query.sellerId) params.set('sellerId', query.sellerId);
  if (query.courierUserId) params.set('courierUserId', query.courierUserId);
  if (query.q) params.set('q', query.q);
  const search = params.toString();
  const [inbox, filters] = await Promise.all([
    serverGet<ChatInbox>('admin', `/chat/staff${search ? `?${search}` : ''}`),
    serverGet<ColisFilters>('admin', '/colis/filters'),
  ]);
  return <ChatsInboxScreen inbox={inbox} filters={filters} query={query} />;
}
