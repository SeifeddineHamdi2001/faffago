import { notFound } from 'next/navigation';
import { Permission, tunisDayKey } from '@faffago/shared';
import { SellerPayoutScreen } from '@/components/payouts-screen';
import { requireMe, serverGet, serverGetOrNull } from '@/lib/server/session';
import type { DepartRamasseur, SellerPayoutDetail } from '@/lib/types';

/** One seller's payment (Admin 4.10): prepare, print, assign, cancel. */
export default async function SellerPaiementPage({
  params,
}: {
  params: Promise<{ sellerId: string }>;
}) {
  const me = await requireMe('admin');
  if (!me.permissions.includes(Permission.BONS_VERSEMENT)) notFound();
  const { sellerId } = await params;
  const detail = await serverGetOrNull<SellerPayoutDetail>(
    'admin',
    `/paiements-vendeurs/${sellerId}`,
  );
  if (!detail) notFound();
  const ramasseurs = me.permissions.includes(Permission.CAISSE)
    ? await serverGet<DepartRamasseur[]>('admin', '/caisse/depart')
    : [];
  return (
    <SellerPayoutScreen detail={detail} ramasseurs={ramasseurs} today={tunisDayKey(new Date())} />
  );
}
