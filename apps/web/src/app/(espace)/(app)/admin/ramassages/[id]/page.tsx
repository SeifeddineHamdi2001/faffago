import { notFound } from 'next/navigation';
import { Permission } from '@faffago/shared';
import { RamassageDetailScreen } from '@/components/ramassages-screen';
import { requireMe, serverGetOrNull } from '@/lib/server/session';
import type { RamassageDetail } from '@/lib/types';

/** One pickup: its parcels and À emporter (Admin 4.4). */
export default async function RamassagePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireMe('admin');
  if (!me.permissions.includes(Permission.PLANIFIER_RAMASSAGES_TOURNEES)) notFound();
  const { id } = await params;
  const detail = await serverGetOrNull<RamassageDetail>(
    'admin',
    `/ramassages/${encodeURIComponent(id)}`,
  );
  if (!detail) notFound();
  return <RamassageDetailScreen detail={detail} />;
}
