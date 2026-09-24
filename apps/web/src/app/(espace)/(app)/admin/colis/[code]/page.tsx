import { notFound } from 'next/navigation';
import { Permission } from '@faffago/shared';
import { ColisDetailScreen } from '@/components/colis-screen';
import { requireMe, serverGetOrNull } from '@/lib/server/session';
import type { StaffParcelDetail } from '@/lib/types';

/** One parcel for the team (Admin 4.3). */
export default async function ColisDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const me = await requireMe('admin');
  if (!me.permissions.includes(Permission.COLIS_LECTURE)) notFound();
  const { code } = await params;
  const parcel = await serverGetOrNull<StaffParcelDetail>(
    'admin',
    `/colis/${encodeURIComponent(code)}`,
  );
  if (!parcel) notFound();
  return <ColisDetailScreen parcel={parcel} permissions={me.permissions} />;
}
