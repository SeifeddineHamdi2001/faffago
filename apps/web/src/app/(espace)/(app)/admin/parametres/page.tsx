import { notFound } from 'next/navigation';
import { Permission, type SettingJsonValue, type SettingKey } from '@faffago/shared';
import { ParametresTabs } from '@/components/parametres-tabs';
import { SettingsScreen } from '@/components/settings-screen';
import { requireMe, serverGet } from '@/lib/server/session';

/** Paramètres › Tarifs et règles (Admin 4.16, D-20). */
export default async function ParametresPage() {
  const me = await requireMe('admin');
  if (!me.permissions.includes(Permission.PARAMETRES)) notFound();
  const { values, failureReasons } = await serverGet<{
    values: Record<SettingKey, SettingJsonValue>;
    failureReasons: Array<{ code: string; label: string }>;
  }>('admin', '/settings');
  return (
    <section>
      <h1 className="mb-4 font-display text-2xl font-bold text-navy">Paramètres</h1>
      <ParametresTabs />
      <SettingsScreen values={values} failureReasons={failureReasons} />
    </section>
  );
}
