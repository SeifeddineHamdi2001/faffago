import { requireMe } from '@/lib/server/session';

/** Until Aujourd'hui is built (phase 5), the back office opens here. */
export default async function AdminHome() {
  const me = await requireMe('admin');
  return (
    <section>
      <h1 className="font-display text-2xl font-bold">Bonjour {me.firstName}</h1>
      <p className="mt-2 text-navy/70">Choisissez un écran dans le menu.</p>
    </section>
  );
}
