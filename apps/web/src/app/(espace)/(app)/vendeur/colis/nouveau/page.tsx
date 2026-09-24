import type { GeoTreeView } from '@faffago/shared';
import { CreateParcelScreen } from '@/components/create-parcel-screen';
import { requireMe, serverGet } from '@/lib/server/session';

/** Créer un colis (Vendeur 4.2). */
export default async function CreerUnColisPage() {
  const me = await requireMe('vendeur');
  const tree = await serverGet<GeoTreeView>('vendeur', '/geo');
  return (
    <CreateParcelScreen
      tree={tree}
      readOnly={me.readOnly}
      suspended={me.seller?.accountState === 'SUSPENDU'}
    />
  );
}
