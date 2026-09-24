import { notFound } from 'next/navigation';
import type { GeoTreeView } from '@faffago/shared';
import { ParcelScreen } from '@/components/parcel-screen';
import { requireMe, serverGet, serverGetOrNull } from '@/lib/server/session';
import type { SellerParcelDetail } from '@/lib/types';

/** One of the seller's parcels. Another seller's code is simply not found (D-26). */
export default async function ColisPage({ params }: { params: Promise<{ code: string }> }) {
  const me = await requireMe('vendeur');
  const { code } = await params;
  const parcel = await serverGetOrNull<SellerParcelDetail>(
    'vendeur',
    `/parcels/${encodeURIComponent(code)}`,
  );
  if (!parcel) notFound();
  const tree = await serverGet<GeoTreeView>('vendeur', '/geo');
  return <ParcelScreen parcel={parcel} tree={tree} readOnly={me.readOnly} />;
}
