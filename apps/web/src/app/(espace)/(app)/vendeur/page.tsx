import { requireMe } from '@/lib/server/session';

/** Tableau de bord (Vendeur 4.1): filled in phase 3 with parcels and money. */
export default async function TableauDeBord() {
  const me = await requireMe('vendeur');
  return (
    <section>
      <h1 className="font-display text-2xl font-bold">Tableau de bord</h1>
      <p className="mt-2 text-navy/70">Bienvenue, {me.seller?.shopName}.</p>
    </section>
  );
}
