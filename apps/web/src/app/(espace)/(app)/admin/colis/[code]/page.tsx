import { notFound } from 'next/navigation';
import { Permission } from '@faffago/shared';
import { ChatPanel } from '@/components/chat-panel';
import { ColisDetailScreen } from '@/components/colis-screen';
import { requireMe, serverGet, serverGetOrNull } from '@/lib/server/session';
import type { ChatThreadView, ColisFilters, StaffParcelDetail } from '@/lib/types';

/** One parcel for the team (Admin 4.3). */
export default async function ColisDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const me = await requireMe('admin');
  if (!me.permissions.includes(Permission.COLIS_LECTURE)) notFound();
  const { code } = await params;
  const parcel = await serverGetOrNull<StaffParcelDetail>(
    'admin',
    `/colis/${encodeURIComponent(code)}`,
  );
  if (!parcel) notFound();
  // The livreurs are only needed by Forcer un statut, the admin's.
  const livreurs = me.permissions.includes(Permission.FORCER_STATUT)
    ? (await serverGet<ColisFilters>('admin', '/colis/filters')).livreurs
    : [];
  // The parcel's chat, for the roles that read chats (Admin 4.3, 4.8).
  const chat = me.permissions.includes(Permission.CHATS_STAFF)
    ? await serverGetOrNull<{ thread: ChatThreadView | null }>(
        'admin',
        `/chat/staff/${encodeURIComponent(code)}`,
      )
    : null;
  return (
    <>
      <ColisDetailScreen parcel={parcel} permissions={me.permissions} livreurs={livreurs} />
      {chat && (
        <div className="mt-6">
          <ChatPanel side="staff" code={parcel.code} initial={chat.thread} />
        </div>
      )}
    </>
  );
}
