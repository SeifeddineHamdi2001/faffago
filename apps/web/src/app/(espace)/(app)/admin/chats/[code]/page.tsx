import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Permission } from '@faffago/shared';
import { ChatPanel } from '@/components/chat-panel';
import { requireMe, serverGetOrNull } from '@/lib/server/session';
import type { ChatThreadView } from '@/lib/types';

/** One parcel's chat for the team (Admin 4.8): read it, join it, as Faffa Go. */
export default async function ChatPage({ params }: { params: Promise<{ code: string }> }) {
  const me = await requireMe('admin');
  if (!me.permissions.includes(Permission.CHATS_STAFF)) notFound();
  const { code } = await params;
  const result = await serverGetOrNull<{ thread: ChatThreadView | null }>(
    'admin',
    `/chat/staff/${encodeURIComponent(code)}`,
  );
  if (!result) notFound();
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-navy">
          Chat <span className="font-mono">{code}</span>
        </h1>
        <div className="flex gap-2">
          <Link href="/admin/chats" className="btn-secondary">
            Tous les chats
          </Link>
          {me.permissions.includes(Permission.COLIS_LECTURE) && (
            <Link href={`/admin/colis/${code}`} className="btn-secondary">
              Voir le colis
            </Link>
          )}
        </div>
      </div>
      <ChatPanel side="staff" code={code} initial={result.thread} />
    </section>
  );
}
