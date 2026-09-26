import type { ReactNode } from 'react';
import { Permission, ROLE_LABELS_FR } from '@faffago/shared';
import { AdminNav } from '@/components/admin-nav';
import { AppShell } from '@/components/app-shell';
import { LogoutButton } from '@/components/logout-button';
import { NotificationBell } from '@/components/notification-bell';
import { requireMe, serverGetOrNull } from '@/lib/server/session';

/**
 * The back office (Admin 3): sidebar on a computer, burger menu on a phone (D-94).
 * Only Admin, Dépôt and Service client get past requireMe.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const me = await requireMe('admin');
  // The bell and the Chats badge (Admin 3). A failed count never blocks the page.
  const bell = await serverGetOrNull<{ unreadCount: number }>(
    'admin',
    '/notifications/unread-count',
  );
  const chats = me.permissions.includes(Permission.CHATS_STAFF)
    ? await serverGetOrNull<{ unreadCount: number }>('admin', '/chat/staff/unread')
    : null;

  return (
    <AppShell
      brand={
        <p className="font-display text-xl font-bold">
          Faffa <span className="text-orange">Go</span>
        </p>
      }
      sidebarHeader={
        <div className="text-sm">
          <p className="font-semibold">
            {me.firstName} {me.lastName}
          </p>
          <p className="text-white/70">{ROLE_LABELS_FR[me.role]}</p>
        </div>
      }
      nav={<AdminNav permissions={me.permissions} chatsUnread={chats?.unreadCount ?? 0} />}
      sidebarFooter={
        <LogoutButton loginPath="/admin/connexion" className="text-sm text-white/80 underline" />
      }
      topBar={
        <NotificationBell initialCount={bell?.unreadCount ?? 0} href="/admin/notifications" />
      }
    >
      {children}
    </AppShell>
  );
}
