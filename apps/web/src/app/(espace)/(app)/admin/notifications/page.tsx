import { NotificationsScreen } from '@/components/notifications-screen';
import { requireMe, serverGet } from '@/lib/server/session';
import type { NotificationList } from '@/lib/types';

/** The bell's list for the team (Admin 4.18): each role sees what it can act on. */
export default async function NotificationsPage() {
  await requireMe('admin');
  const list = await serverGet<NotificationList>('admin', '/notifications');
  return <NotificationsScreen initial={list} area="admin" />;
}
