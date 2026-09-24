import { notFound } from 'next/navigation';
import { Permission } from '@faffago/shared';
import { ColisScreen } from '@/components/colis-screen';
import { requireMe, serverGet, serverGetOrNull } from '@/lib/server/session';
import type { ColisFilters, ColisQuery, StaffParcelList } from '@/lib/types';

const KEYS = ['q', 'status', 'cashStatus', 'sellerId', 'courierId', 'zoneId', 'from', 'to', 'page'];

/** Colis (Admin 4.3, D-11): Admin, Dépôt and Service client. */
export default async function ColisPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const me = await requireMe('admin');
  if (!me.permissions.includes(Permission.COLIS_LECTURE)) notFound();
  const raw = await searchParams;
  const query: ColisQuery = {};
  const params = new URLSearchParams();
  for (const key of KEYS) {
    const value = raw[key];
    if (typeof value === 'string' && value !== '') {
      query[key as keyof ColisQuery] = value;
      params.set(key, value);
    }
  }
  const [list, filters] = await Promise.all([
    // A filter the API refuses (a hand-edited address) shows the list without it.
    serverGetOrNull<StaffParcelList>('admin', `/colis?${params.toString()}`),
    serverGet<ColisFilters>('admin', '/colis/filters'),
  ]);
  return (
    <ColisScreen
      list={list ?? (await serverGet<StaffParcelList>('admin', '/colis'))}
      query={list ? query : {}}
      filters={filters}
    />
  );
}
