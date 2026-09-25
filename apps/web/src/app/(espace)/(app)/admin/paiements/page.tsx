import { notFound } from 'next/navigation';
import { Permission } from '@faffago/shared';
import { PayoutsScreen } from '@/components/payouts-screen';
import { requireMe, serverGet } from '@/lib/server/session';
import type { SellerPayoutSummary } from '@/lib/types';

/** Paiements vendeurs (Admin 4.10): the admin alone. */
export default async function PaiementsPage() {
  const me = await requireMe('admin');
  if (!me.permissions.includes(Permission.BONS_VERSEMENT)) notFound();
  const rows = await serverGet<SellerPayoutSummary[]>('admin', '/paiements-vendeurs');
  return <PayoutsScreen rows={rows} />;
}
