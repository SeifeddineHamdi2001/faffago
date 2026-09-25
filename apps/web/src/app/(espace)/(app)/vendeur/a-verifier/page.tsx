import { SellerVerifyScreen } from '@/components/seller-verify-screen';
import { requireMe, serverGet } from '@/lib/server/session';
import type { SellerVerifyList } from '@/lib/types';

/** À vérifier (Vendeur 4.9): the parcels waiting on the seller, soonest return first. */
export default async function AVerifierPage() {
  await requireMe('vendeur');
  const list = await serverGet<SellerVerifyList>('vendeur', '/a-verifier');
  return <SellerVerifyScreen list={list} />;
}
