import { notFound } from 'next/navigation';
import { Permission } from '@faffago/shared';
import { ScanStation } from '@/components/scan-station';
import { requireMe, serverGet } from '@/lib/server/session';
import type { CourierRow } from '@/lib/types';

/** Scan (Admin 4.2, D-50): Admin and Dépôt. */
export default async function ScanPage() {
  const me = await requireMe('admin');
  if (!me.permissions.includes(Permission.SCAN_DEPOT)) notFound();
  const couriers = await serverGet<CourierRow[]>('admin', '/accounts/couriers');
  return <ScanStation couriers={couriers} />;
}
