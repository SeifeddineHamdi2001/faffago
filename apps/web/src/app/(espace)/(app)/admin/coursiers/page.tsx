import { notFound } from 'next/navigation';
import { Permission } from '@faffago/shared';
import { CouriersScreen } from '@/components/couriers-screen';
import { requireMe, serverGet } from '@/lib/server/session';
import type { CourierRow } from '@/lib/types';

export default async function CoursiersPage() {
  const me = await requireMe('admin');
  if (!me.permissions.includes(Permission.COURSIERS_LECTURE)) notFound();
  const rows = await serverGet<CourierRow[]>('admin', '/accounts/couriers');
  return <CouriersScreen rows={rows} permissions={me.permissions} />;
}
