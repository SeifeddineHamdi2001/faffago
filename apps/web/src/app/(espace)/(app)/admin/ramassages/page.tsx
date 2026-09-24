import { notFound } from 'next/navigation';
import { Permission, PickupStatus } from '@faffago/shared';
import { RamassagesScreen } from '@/components/ramassages-screen';
import { requireMe, serverGet } from '@/lib/server/session';
import type { CourierRow, RamassageRow } from '@/lib/types';

/** Ramassages (Admin 4.4, D-58): Admin and Dépôt. The tab lives in the address. */
export default async function RamassagesPage({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string }>;
}) {
  const me = await requireMe('admin');
  if (!me.permissions.includes(Permission.PLANIFIER_RAMASSAGES_TOURNEES)) notFound();
  const { statut } = await searchParams;
  const status = Object.values(PickupStatus).includes(statut as PickupStatus)
    ? (statut as PickupStatus)
    : PickupStatus.DEMANDE;
  const [rows, couriers] = await Promise.all([
    serverGet<RamassageRow[]>('admin', `/ramassages?status=${status}`),
    serverGet<CourierRow[]>('admin', '/accounts/couriers'),
  ]);
  return <RamassagesScreen rows={rows} status={status} couriers={couriers} />;
}
