import { SellerPaiementsScreen } from '@/components/seller-money-screens';
import { requireMe, serverGet } from '@/lib/server/session';
import type { SellerCertificates, SellerPaiements } from '@/lib/types';

/** Paiements (Vendeur 4.11): À recevoir and his bons de versement. */
export default async function PaiementsPage() {
  const me = await requireMe('vendeur');
  const [data, certificates] = await Promise.all([
    serverGet<SellerPaiements>('vendeur', '/paiements'),
    serverGet<SellerCertificates>('vendeur', '/paiements/certificats'),
  ]);
  // Under "Voir comme le vendeur" the admin reads; printing goes through the seller's own session.
  return <SellerPaiementsScreen data={data} certificates={certificates} canPrint={!me.readOnly} />;
}
