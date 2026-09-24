import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PARCEL_STATUS_LABELS_FR, Permission, type ParcelStatus } from '@faffago/shared';
import { ParametresTabs } from '@/components/parametres-tabs';
import { requireMe, serverGet } from '@/lib/server/session';
import type { AutreParcelRow } from '@/lib/types';

const dateFormat = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Africa/Tunis',
  dateStyle: 'short',
});

/**
 * The parcels filed under Autre (D-17): the addresses sellers typed where no
 * localité of the list fitted, read to decide which localités to add.
 */
export default async function AutrePage() {
  const me = await requireMe('admin');
  if (!me.permissions.includes(Permission.PARAMETRES)) notFound();
  const rows = await serverGet<AutreParcelRow[]>('admin', '/localites/autre/parcels');

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
      <h2 className="mb-2 font-display text-lg font-bold text-navy">Colis classés sous Autre</h2>
      <p className="mb-4 text-sm text-navy/70">
        Les 200 plus récents. Ajoutez les localités qui manquent dans la délégation concernée.
      </p>
      {rows.length === 0 ? (
        <p className="card text-sm text-navy/70">Aucun colis classé sous Autre.</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-navy/70">
              <tr>
                <th className="py-2 pr-3 font-semibold">Colis</th>
                <th className="py-2 pr-3 font-semibold">Délégation</th>
                <th className="py-2 pr-3 font-semibold">Adresse</th>
                <th className="py-2 pr-3 font-semibold">Vendeur</th>
                <th className="py-2 pr-3 font-semibold">Statut</th>
                <th className="py-2 font-semibold">Créé le</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-navy/10 align-top">
                  <td className="py-2 pr-3 font-mono">{row.code}</td>
                  <td className="py-2 pr-3">{row.delegation.nameFr}</td>
                  <td className="py-2 pr-3">
                    {row.address}
                    {row.landmark && <span className="block text-navy/70">{row.landmark}</span>}
                  </td>
                  <td className="py-2 pr-3">{row.shopName}</td>
                  <td className="py-2 pr-3">
                    {PARCEL_STATUS_LABELS_FR[row.status as ParcelStatus] ?? row.status}
                  </td>
                  <td className="py-2">{dateFormat.format(new Date(row.createdAt))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
