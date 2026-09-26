'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { notificationTarget, notificationText } from '@faffago/shared';
import { bff } from '@/lib/client/call';
import { notificationHref, type NotificationArea } from '@/lib/notification-links';
import type { ApiError, NotificationItem, NotificationList } from '@/lib/types';
import { ErrorAlert } from './account-actions';

const dateTime = new Intl.DateTimeFormat('fr-TN', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Africa/Tunis',
});

/**
 * The list behind the bell (Vendeur 4.13, Admin 4.18): every notification of
 * the signed-in person, unread first in weight, each leading to what it is
 * about. Marking one read happens on the click; Tout marquer comme lu clears
 * the lot. Read-only under "Voir comme le vendeur" (D-5).
 */
export function NotificationsScreen({
  initial,
  area,
  readOnly = false,
}: {
  initial: NotificationList;
  area: NotificationArea;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>(initial.items);
  const [unreadCount, setUnreadCount] = useState(initial.unreadCount);
  const [next, setNext] = useState<string | null>(initial.next);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function markRead(item: NotificationItem) {
    if (readOnly || item.readAt) return;
    const result = await bff<{ unreadCount: number }>('POST', `notifications/${item.id}/read`);
    if (!result.ok) return;
    setItems((current) =>
      current.map((row) =>
        row.id === item.id ? { ...row, readAt: new Date().toISOString() } : row,
      ),
    );
    setUnreadCount(result.data.unreadCount);
    router.refresh();
  }

  async function markAll() {
    setBusy(true);
    setError(null);
    const result = await bff<{ unreadCount: number }>('POST', 'notifications/read-all');
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const now = new Date().toISOString();
    setItems((current) => current.map((row) => ({ ...row, readAt: row.readAt ?? now })));
    setUnreadCount(0);
    router.refresh();
  }

  async function more() {
    if (!next) return;
    setBusy(true);
    setError(null);
    const result = await bff<NotificationList>(
      'GET',
      `notifications?before=${encodeURIComponent(next)}`,
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setItems((current) => [...current, ...result.data.items]);
    setNext(result.data.next);
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-navy">Notifications</h1>
          <p className="text-sm text-navy/70" data-testid="unread-summary">
            {unreadCount === 0
              ? 'Tout est lu.'
              : `${unreadCount} non lue${unreadCount > 1 ? 's' : ''}`}
          </p>
        </div>
        {!readOnly && (
          <button
            type="button"
            className="btn-secondary"
            disabled={busy || unreadCount === 0}
            onClick={() => void markAll()}
          >
            Tout marquer comme lu
          </button>
        )}
      </div>
      {error && <ErrorAlert error={error} />}
      {items.length === 0 ? (
        <p className="card text-navy">Aucune notification.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const params = item.params as never;
            const text = notificationText(item.type, params, 'fr');
            const href = notificationHref(area, notificationTarget(item.type, params));
            const unread = item.readAt === null;
            const body = (
              <>
                <span
                  className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${unread ? 'bg-orange-dark' : 'bg-transparent'}`}
                  aria-hidden="true"
                />
                <span className="flex-1">
                  <span className={`block ${unread ? 'font-bold' : 'font-normal'} text-navy`}>
                    {text}
                    {unread && <span className="sr-only"> (non lue)</span>}
                  </span>
                  <span className="block text-xs text-navy/60">
                    {dateTime.format(new Date(item.createdAt))}
                  </span>
                </span>
              </>
            );
            const className = `card flex items-start gap-3 text-left ${unread ? '' : 'bg-white/60'}`;
            return (
              <li key={item.id}>
                {href ? (
                  <Link href={href} className={className} onClick={() => void markRead(item)}>
                    {body}
                  </Link>
                ) : (
                  <button
                    type="button"
                    className={`${className} w-full`}
                    onClick={() => void markRead(item)}
                  >
                    {body}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {next && (
        <div className="mt-4">
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={() => void more()}
          >
            Voir les plus anciennes
          </button>
        </div>
      )}
    </section>
  );
}
