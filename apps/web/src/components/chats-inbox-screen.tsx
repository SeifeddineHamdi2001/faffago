import Link from 'next/link';
import { CHAT_THREAD_STATE_LABELS_FR } from '@faffago/shared';
import type { ChatInbox, ColisFilters } from '@/lib/types';

const dateTime = new Intl.DateTimeFormat('fr-TN', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Africa/Tunis',
});

export interface ChatsQuery {
  unread?: boolean;
  courierUserId?: string;
  sellerId?: string;
  q?: string;
}

/**
 * Chats (Admin 4.8): one inbox with every parcel chat between sellers and
 * livreurs, latest first, with filters by unread, seller and courier. The
 * filters go in the address, like Colis. Unread is counted per person: what
 * a colleague has read is still new for you.
 */
export function ChatsInboxScreen({
  inbox,
  filters,
  query,
}: {
  inbox: ChatInbox;
  filters: ColisFilters;
  query: ChatsQuery;
}) {
  return (
    <section>
      <div className="mb-4">
        <h1 className="font-display text-2xl font-bold text-navy">Chats</h1>
        <p className="text-sm text-navy/70">
          {inbox.unreadCount === 0
            ? 'Rien de nouveau.'
            : `${inbox.unreadCount} conversation${inbox.unreadCount > 1 ? 's' : ''} avec du nouveau`}
        </p>
      </div>

      <form method="get" className="card mb-4 grid gap-3 md:grid-cols-4">
        <div>
          <label className="field-label" htmlFor="chats-q">
            Code ou boutique
          </label>
          <input id="chats-q" name="q" className="field" defaultValue={query.q ?? ''} />
        </div>
        <div>
          <label className="field-label" htmlFor="chats-seller">
            Vendeur
          </label>
          <select
            id="chats-seller"
            name="sellerId"
            className="field"
            defaultValue={query.sellerId ?? ''}
          >
            <option value="">Tous</option>
            {filters.sellers.map((seller) => (
              <option key={seller.id} value={seller.id}>
                {seller.shopName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="chats-courier">
            Livreur
          </label>
          <select
            id="chats-courier"
            name="courierUserId"
            className="field"
            defaultValue={query.courierUserId ?? ''}
          >
            <option value="">Tous</option>
            {filters.livreurs.map((livreur) => (
              <option key={livreur.id} value={livreur.id}>
                {livreur.firstName} {livreur.lastName}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-3">
          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-navy">
            <input type="checkbox" name="unread" value="true" defaultChecked={query.unread} />
            Non lus
          </label>
          <button type="submit" className="btn-primary">
            Filtrer
          </button>
        </div>
      </form>

      {inbox.threads.length === 0 ? (
        <p className="card text-navy">Aucun chat.</p>
      ) : (
        <ul className="space-y-2">
          {inbox.threads.map((row) => (
            <li key={row.parcelCode}>
              <Link
                href={`/admin/chats/${row.parcelCode}`}
                className="card flex flex-wrap items-start justify-between gap-3 hover:bg-navy/5"
              >
                <div>
                  <p className="font-mono font-bold text-navy">
                    {row.parcelCode}
                    {row.unread > 0 && (
                      <span
                        className="ml-2 inline-flex min-w-6 items-center justify-center rounded-full bg-orange px-1.5 text-xs font-bold text-navy"
                        aria-label={`${row.unread} message${row.unread > 1 ? 's' : ''} non lu${row.unread > 1 ? 's' : ''}`}
                      >
                        {row.unread}
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-navy">
                    {row.shopName} · {row.courier?.name ?? 'aucun livreur'}
                  </p>
                  {row.lastMessage && (
                    <p className={`mt-1 text-sm ${row.unread > 0 ? 'font-bold' : ''} text-navy/80`}>
                      {row.lastMessage.length > 120
                        ? `${row.lastMessage.slice(0, 120)}…`
                        : row.lastMessage}
                    </p>
                  )}
                </div>
                <div className="text-right text-xs text-navy/70">
                  <p>{CHAT_THREAD_STATE_LABELS_FR[row.state]}</p>
                  {row.lastMessageAt && <p>{dateTime.format(new Date(row.lastMessageAt))}</p>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
