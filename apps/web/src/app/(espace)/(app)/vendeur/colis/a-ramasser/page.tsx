import { ARamasserScreen } from '@/components/a-ramasser-screen';
import { requireMe, serverGet } from '@/lib/server/session';
import type { AwaitingParcel } from '@/lib/types';

/** À ramasser (D-98): the Créé parcels, to print before the pickup. */
export default async function ARamasserPage() {
  const me = await requireMe('vendeur');
  const parcels = await serverGet<AwaitingParcel[]>('vendeur', '/pickups/a-ramasser');
  // Suspended: no new request (D-25); "Voir comme le vendeur" writes nothing (D-5).
  const canRequest = !me.readOnly && me.seller?.accountState !== 'SUSPENDU';
  return <ARamasserScreen parcels={parcels} readOnly={me.readOnly} canRequest={canRequest} />;
}
