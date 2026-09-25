import { notFound } from 'next/navigation';
import { Permission, caisseDaySchema } from '@faffago/shared';
import { CaisseSessionScreen } from '@/components/caisse-session-screen';
import { requireMe, serverGetOrNull } from '@/lib/server/session';
import type { CaisseSession } from '@/lib/types';

/** One courier's caisse of one day (Admin 4.9, D-79). */
export default async function CaisseSessionPage({
  params,
}: {
  params: Promise<{ userId: string; date: string }>;
}) {
  const me = await requireMe('admin');
  if (!me.permissions.includes(Permission.CAISSE)) notFound();
  const { userId, date } = await params;
  if (!caisseDaySchema.safeParse(date).success) notFound();
  const session = await serverGetOrNull<CaisseSession>('admin', `/caisse/${userId}/${date}`);
  if (!session) notFound();
  return <CaisseSessionScreen session={session} />;
}
