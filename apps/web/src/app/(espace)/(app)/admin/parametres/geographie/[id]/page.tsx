import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Permission } from '@faffago/shared';
import { LocalitesScreen } from '@/components/localites-screen';
import { ParametresTabs } from '@/components/parametres-tabs';
import { requireMe, serverGet, serverGetOrNull } from '@/lib/server/session';
import type { GeographyRow, LocaliteAdminRow } from '@/lib/types';

/** One délégation's localités (D-17), deactivated ones included. */
export default async function LocalitesPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireMe('admin');
  if (!me.permissions.includes(Permission.PARAMETRES)) notFound();
  const { id } = await params;

  const gouvernorats = await serverGet<GeographyRow[]>('admin', '/geo/admin');
  const gouvernorat = gouvernorats.find((g) => g.delegations.some((d) => d.id === id));
  const delegation = gouvernorat?.delegations.find((d) => d.id === id);
  if (!gouvernorat || !delegation) notFound();
  const localites = await serverGetOrNull<LocaliteAdminRow[]>(
    'admin',
    `/localites?delegationId=${encodeURIComponent(id)}`,
  );
  if (!localites) notFound();

  return (
    <section>
      <h1 className="mb-4 font-display text-2xl font-bold text-navy">Paramètres</h1>
      <ParametresTabs />
      <p className="mb-4 text-sm">
        <Link
          href="/admin/parametres/geographie"
          className="font-semibold text-orange-dark underline"
        >
          ← Géographie
        </Link>
      </p>
      <LocalitesScreen
        delegation={{
          id: delegation.id,
          code: delegation.code,
          nameFr: delegation.nameFr,
          gouvernoratNameFr: gouvernorat.nameFr,
        }}
        localites={localites}
      />
    </section>
  );
}
