import { notFound } from 'next/navigation';
import { Permission } from '@faffago/shared';
import { ExceptionsScreen } from '@/components/exceptions-screen';
import { requireMe, serverGet } from '@/lib/server/session';
import type { ExceptionsQueue } from '@/lib/types';

/** Exceptions (Admin 4.7, D-50): every staff role. */
export default async function ExceptionsPage() {
  const me = await requireMe('admin');
  if (!me.permissions.includes(Permission.EXCEPTIONS_LECTURE)) notFound();
  const queue = await serverGet<ExceptionsQueue>('admin', '/exceptions');
  return <ExceptionsScreen queue={queue} permissions={me.permissions} />;
}
