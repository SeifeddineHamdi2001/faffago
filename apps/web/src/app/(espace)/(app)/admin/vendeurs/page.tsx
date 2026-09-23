import { notFound } from 'next/navigation';
import { Permission } from '@faffago/shared';
import { SellersScreen } from '@/components/sellers-screen';
import { requireMe, serverGet } from '@/lib/server/session';
import type { SellerRow } from '@/lib/types';

export default async function VendeursPage() {
  const me = await requireMe('admin');
  if (!me.permissions.includes(Permission.VENDEURS_LECTURE)) notFound();
  const rows = await serverGet<SellerRow[]>('admin', '/sellers');
  return <SellersScreen rows={rows} permissions={me.permissions} />;
}
