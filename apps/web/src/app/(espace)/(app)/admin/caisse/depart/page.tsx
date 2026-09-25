import { notFound } from 'next/navigation';
import { Permission } from '@faffago/shared';
import { DepartScreen } from '@/components/depart-screen';
import { requireMe, serverGet, serverGetOrNull } from '@/lib/server/session';
import type { DepartRamasseur, Departure } from '@/lib/types';

/** Départ ramasseur (D-80, answer 5): Admin and Dépôt hand out the bons and their cash. */
export default async function DepartPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const me = await requireMe('admin');
  if (!me.permissions.includes(Permission.CAISSE)) notFound();
  const chosen = (await searchParams).ramasseur;
  const ramasseurs = await serverGet<DepartRamasseur[]>('admin', '/caisse/depart');
  const departure =
    typeof chosen === 'string' && /^[0-9a-f-]{36}$/i.test(chosen)
      ? await serverGetOrNull<Departure>('admin', `/caisse/depart/${chosen}`)
      : null;
  // A new key when the ramasseur changes: the ticks start from his planned bons.
  return (
    <DepartScreen
      key={departure?.ramasseur.userId ?? 'none'}
      ramasseurs={ramasseurs}
      departure={departure}
    />
  );
}
