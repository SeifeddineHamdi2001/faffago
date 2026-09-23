import { notFound } from 'next/navigation';
import { Permission } from '@faffago/shared';
import { StaffScreen } from '@/components/staff-screen';
import { requireMe, serverGet } from '@/lib/server/session';
import type { StaffRow } from '@/lib/types';

export default async function UtilisateursPage() {
  const me = await requireMe('admin');
  if (!me.permissions.includes(Permission.COMPTES_STAFF)) notFound();
  const rows = await serverGet<StaffRow[]>('admin', '/accounts/staff');
  return <StaffScreen rows={rows} />;
}
