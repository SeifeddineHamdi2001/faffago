import { notFound } from 'next/navigation';
import { Permission } from '@faffago/shared';
import { ParametresTabs } from '@/components/parametres-tabs';
import { ZonesScreen } from '@/components/zones-screen';
import { requireMe, serverGet } from '@/lib/server/session';
import type { CourierRow, ZoneRow } from '@/lib/types';

/** Paramètres › Zones (Admin 4.5, 4.16, D-51). */
export default async function ZonesPage() {
  const me = await requireMe('admin');
  if (!me.permissions.includes(Permission.PARAMETRES)) notFound();
  const [zones, couriers] = await Promise.all([
    serverGet<ZoneRow[]>('admin', '/zones'),
    serverGet<CourierRow[]>('admin', '/accounts/couriers'),
  ]);
  return (
    <section>
      <h1 className="mb-4 font-display text-2xl font-bold text-navy">Paramètres</h1>
      <ParametresTabs />
      <ZonesScreen zones={zones} couriers={couriers} />
    </section>
  );
}
