import { NotificationsScreen } from '@/components/notifications-screen';
import { requireMe, serverGet } from '@/lib/server/session';
import type { NotificationList } from '@/lib/types';

/** The bell's list (Vendeur 4.13). Read-only while an admin looks as the seller (D-5). */
export default async function NotificationsPage() {
  const me = await requireMe('vendeur');
  const list = await serverGet<NotificationList>('vendeur', '/notifications');
  return <NotificationsScreen initial={list} area="vendeur" readOnly={me.readOnly} />;
}
