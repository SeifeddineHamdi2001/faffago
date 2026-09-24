import type { GeoTreeView } from '@faffago/shared';
import { ProfileScreen } from '@/components/profile-screen';
import { requireMe, serverGet } from '@/lib/server/session';
import type { PickupAddress, SellerProfile } from '@/lib/types';

/** Profil (Vendeur 4.14). */
export default async function ProfilPage() {
  const me = await requireMe('vendeur');
  const [profile, addresses, tree] = await Promise.all([
    serverGet<SellerProfile>('vendeur', '/profile'),
    serverGet<PickupAddress[]>('vendeur', '/pickup-addresses'),
    serverGet<GeoTreeView>('vendeur', '/geo'),
  ]);
  return (
    <ProfileScreen profile={profile} addresses={addresses} tree={tree} readOnly={me.readOnly} />
  );
}
