import { notFound } from 'next/navigation';
import { Permission } from '@faffago/shared';
import { SellerDetailScreen } from '@/components/seller-detail-screen';
import { requireMe, serverGetOrNull } from '@/lib/server/session';
import type { SellerDetail } from '@/lib/types';

/** The seller page (Admin 4.14). What it shows is narrowed by the API (D-11). */
export default async function VendeurPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireMe('admin');
  if (!me.permissions.includes(Permission.VENDEURS_LECTURE)) notFound();
  const { id } = await params;
  const seller = await serverGetOrNull<SellerDetail>('admin', `/sellers/${encodeURIComponent(id)}`);
  if (!seller) notFound();
  return <SellerDetailScreen seller={seller} permissions={me.permissions} />;
}
