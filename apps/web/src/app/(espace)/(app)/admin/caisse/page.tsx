import { notFound } from 'next/navigation';
import { Permission, caisseDaySchema, tunisDayKey } from '@faffago/shared';
import { CaisseScreen } from '@/components/caisse-screen';
import { requireMe, serverGet } from '@/lib/server/session';
import type { CaisseEcarts, CaisseSummary } from '@/lib/types';

/** Caisse (Admin 4.9, D-79): Admin and Dépôt; the écarts to check, the admin. */
export default async function CaissePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const me = await requireMe('admin');
  if (!me.permissions.includes(Permission.CAISSE)) notFound();
  const today = tunisDayKey(new Date());
  const raw = (await searchParams).date;
  const asked = typeof raw === 'string' && caisseDaySchema.safeParse(raw).success ? raw : today;
  const summary = await serverGet<CaisseSummary>('admin', `/caisse?date=${asked}`);
  const ecarts = me.permissions.includes(Permission.CAISSE_ECARTS)
    ? await serverGet<CaisseEcarts>('admin', '/caisse/ecarts')
    : null;
  return <CaisseScreen summary={summary} today={today} ecarts={ecarts} />;
}
