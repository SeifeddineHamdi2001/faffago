import { notFound } from 'next/navigation';
import { Permission } from '@faffago/shared';
import { FollowUpScreen } from '@/components/follow-up-screen';
import { requireMe, serverGet } from '@/lib/server/session';
import type { FollowUpList } from '@/lib/types';

/** À vérifier (Admin 4.6): Admin and Service client follow up; the seller decides (D-4). */
export default async function AVerifierSuiviPage() {
  const me = await requireMe('admin');
  if (!me.permissions.includes(Permission.SUIVI_A_VERIFIER)) notFound();
  const list = await serverGet<FollowUpList>('admin', '/a-verifier/suivi');
  return <FollowUpScreen list={list} />;
}
