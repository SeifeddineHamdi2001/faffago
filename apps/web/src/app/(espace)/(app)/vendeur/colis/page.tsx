import { ParcelGroup, parcelListQuerySchema } from '@faffago/shared';
import { MesColisScreen, type ParcelFilters } from '@/components/mes-colis-screen';
import { requireMe, serverGet } from '@/lib/server/session';
import type { ParcelList } from '@/lib/types';

/** Mes colis (Vendeur 4.7). The filters live in the address, so a page can be shared or reloaded. */
export default async function MesColisPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const me = await requireMe('vendeur');
  const raw = await searchParams;
  const one = (key: string) => (typeof raw[key] === 'string' ? (raw[key] as string) : undefined);
  const parsed = parcelListQuerySchema.safeParse({
    group: one('groupe'),
    q: one('q') || undefined,
    from: one('du') || undefined,
    to: one('au') || undefined,
    page: one('page'),
  });
  const query = parsed.success ? parsed.data : { group: ParcelGroup.TOUS, page: 1 };
  const filters: ParcelFilters = {
    group: query.group,
    q: ('q' in query && query.q) || '',
    from: ('from' in query && query.from) || '',
    to: ('to' in query && query.to) || '',
    page: query.page,
  };

  const api = new URLSearchParams({ group: filters.group, page: String(filters.page) });
  if (filters.q) api.set('q', filters.q);
  if (filters.from) api.set('from', filters.from);
  if (filters.to) api.set('to', filters.to);
  const list = await serverGet<ParcelList>('vendeur', `/parcels?${api.toString()}`);

  return (
    <MesColisScreen
      list={list}
      filters={filters}
      readOnly={me.readOnly}
      invalidFilter={!parsed.success}
    />
  );
}
