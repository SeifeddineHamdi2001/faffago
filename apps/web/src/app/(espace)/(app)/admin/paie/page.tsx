import { notFound } from 'next/navigation';
import { Permission } from '@faffago/shared';
import { PayrollScreen } from '@/components/payroll-screen';
import { requireMe, serverGet } from '@/lib/server/session';
import type { PayrollRow, PayslipRow } from '@/lib/types';

/** Paie coursiers (Admin 4.12, D-82): the admin alone. */
export default async function PaiePage() {
  const me = await requireMe('admin');
  if (!me.permissions.includes(Permission.PAIE_COURSIERS)) notFound();
  const [rows, payslips] = await Promise.all([
    serverGet<PayrollRow[]>('admin', '/paie'),
    serverGet<PayslipRow[]>('admin', '/paie/fiches'),
  ]);
  return <PayrollScreen rows={rows} payslips={payslips} />;
}
