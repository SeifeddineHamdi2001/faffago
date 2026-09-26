'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { bff } from '@/lib/client/call';

const POLL_MS = 30_000;

/**
 * The bell (Vendeur 3, Admin 3: always visible): a link to the list with the
 * unread count. The count comes with the page and is read again every 30
 * seconds while the tab is shown. Under "Voir comme le vendeur" it stays as
 * the page gave it: the browser's own session is the admin's, not the seller's.
 */
export function NotificationBell({
  initialCount,
  href,
  live = true,
}: {
  initialCount: number;
  href: string;
  live?: boolean;
}) {
  const [count, setCount] = useState(initialCount);

  useEffect(() => setCount(initialCount), [initialCount]);

  useEffect(() => {
    if (!live) return;
    let stopped = false;
    async function refresh() {
      if (document.visibilityState !== 'visible') return;
      const result = await bff<{ unreadCount: number }>('GET', 'notifications/unread-count');
      if (!stopped && result.ok) setCount(result.data.unreadCount);
    }
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [live]);

  return (
    <Link
      href={href}
      className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-white hover:bg-white/10"
      aria-label={
        count > 0 ? `Notifications, ${count} non lue${count > 1 ? 's' : ''}` : 'Notifications'
      }
    >
      <svg
        viewBox="0 0 24 24"
        width="24"
        height="24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {count > 0 && (
        <span
          data-testid="bell-count"
          className="absolute right-0 top-0 inline-flex min-w-5 items-center justify-center rounded-full bg-orange px-1 text-xs font-bold text-navy"
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}
