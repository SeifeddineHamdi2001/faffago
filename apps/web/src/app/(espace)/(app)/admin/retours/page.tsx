import { notFound } from 'next/navigation';
import { Permission, tunisDayKey } from '@faffago/shared';
import { ReturnsScreen } from '@/components/returns-screen';
import { requireMe, serverGet } from '@/lib/server/session';
import type { DepartRamasseur, ReturnsBySeller } from '@/lib/types';

/** Retours (Admin 4.11, D-11): every staff reads; Admin and Dépôt print and assign. */
export default async function RetoursPage() {
  const me = await requireMe('admin');
  if (!me.permissions.includes(Permission.RETOURS_LECTURE)) notFound();
  const groups = await serverGet<ReturnsBySeller[]>('admin', '/bons-retour');
  const ramasseurs = me.permissions.includes(Permission.CAISSE)
    ? await serverGet<DepartRamasseur[]>('admin', '/caisse/depart')
    : [];
  return (
    <ReturnsScreen
      groups={groups}
      ramasseurs={ramasseurs}
      permissions={me.permissions}
      today={tunisDayKey(new Date())}
    />
  );
}
