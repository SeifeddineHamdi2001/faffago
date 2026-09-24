import { PickupsScreen } from '@/components/pickups-screen';
import { requireMe, serverGet } from '@/lib/server/session';
import type { PickupView } from '@/lib/types';

/** Ramassages (Vendeur 4.5). */
export default async function RamassagesPage() {
  const me = await requireMe('vendeur');
  const pickups = await serverGet<PickupView[]>('vendeur', '/pickups');
  // Suspended: no new request (D-25); "Voir comme le vendeur" writes nothing (D-5).
  const canRequest = !me.readOnly && me.seller?.accountState !== 'SUSPENDU';
  return <PickupsScreen pickups={pickups} canRequest={canRequest} />;
}
