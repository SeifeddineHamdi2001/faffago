import { notFound } from 'next/navigation';
import { Permission } from '@faffago/shared';
import { TourneesScreen } from '@/components/tournees-screen';
import { requireMe, serverGet } from '@/lib/server/session';
import type { CourierRow, TourneesView } from '@/lib/types';

/** Tournées (Admin 4.5, D-55): Admin and Dépôt. */
export default async function TourneesPage() {
  const me = await requireMe('admin');
  if (!me.permissions.includes(Permission.PLANIFIER_RAMASSAGES_TOURNEES)) notFound();
  const [plan, couriers] = await Promise.all([
    serverGet<TourneesView>('admin', '/tournees'),
    serverGet<CourierRow[]>('admin', '/accounts/couriers'),
  ]);
  return <TourneesScreen plan={plan} couriers={couriers} />;
}
