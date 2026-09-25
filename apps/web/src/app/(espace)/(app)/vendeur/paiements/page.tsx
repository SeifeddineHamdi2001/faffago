import { SellerPaiementsScreen } from '@/components/seller-money-screens';
import { requireMe, serverGet } from '@/lib/server/session';
import type { SellerPaiements } from '@/lib/types';

/** Paiements (Vendeur 4.11): À recevoir and his bons de versement. */
export default async function PaiementsPage() {
  const me = await requireMe('vendeur');
  const data = await serverGet<SellerPaiements>('vendeur', '/paiements');
  // Under "Voir comme le vendeur" the admin reads; printing goes through the seller's own session.
  return <SellerPaiementsScreen data={data} canPrint={!me.readOnly} />;
}
