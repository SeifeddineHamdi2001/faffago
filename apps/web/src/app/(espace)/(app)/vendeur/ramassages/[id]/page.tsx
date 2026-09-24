import { notFound } from 'next/navigation';
import { PickupDetailScreen } from '@/components/pickups-screen';
import { requireMe, serverGetOrNull } from '@/lib/server/session';
import type { PickupDetail } from '@/lib/types';

/** One pickup request. Another seller's does not exist (D-26). */
export default async function RamassagePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireMe('vendeur');
  const { id } = await params;
  const pickup = await serverGetOrNull<PickupDetail>(
    'vendeur',
    `/pickups/${encodeURIComponent(id)}`,
  );
  if (!pickup) notFound();
  return <PickupDetailScreen pickup={pickup} readOnly={me.readOnly} />;
}
