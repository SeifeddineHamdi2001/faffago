import { SellerRetoursScreen } from '@/components/seller-money-screens';
import { requireMe, serverGet } from '@/lib/server/session';
import type { SellerRetours } from '@/lib/types';

/** Retours (Vendeur 4.12): his returns on their way back and his bons de retour. */
export default async function RetoursPage() {
  const me = await requireMe('vendeur');
  const data = await serverGet<SellerRetours>('vendeur', '/retours');
  return <SellerRetoursScreen data={data} canPrint={!me.readOnly} />;
}
