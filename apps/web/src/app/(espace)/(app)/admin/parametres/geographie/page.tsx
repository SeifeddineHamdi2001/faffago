import { notFound } from 'next/navigation';
import { Permission } from '@faffago/shared';
import { GeographyScreen } from '@/components/geography-screen';
import { ParametresTabs } from '@/components/parametres-tabs';
import { requireMe, serverGet } from '@/lib/server/session';
import type { GeographyRow, ZoneRow } from '@/lib/types';

/** Paramètres › Géographie (Admin 4.16, D-17, D-51). */
export default async function GeographiePage() {
  const me = await requireMe('admin');
  if (!me.permissions.includes(Permission.PARAMETRES)) notFound();
  const [gouvernorats, zones] = await Promise.all([
    serverGet<GeographyRow[]>('admin', '/geo/admin'),
    serverGet<ZoneRow[]>('admin', '/zones'),
  ]);
  return (
    <section>
      <h1 className="mb-4 font-display text-2xl font-bold text-navy">Paramètres</h1>
      <ParametresTabs />
      <GeographyScreen
        gouvernorats={gouvernorats}
        zones={zones.map(({ id, name, isActive }) => ({ id, name, isActive }))}
      />
    </section>
  );
}
