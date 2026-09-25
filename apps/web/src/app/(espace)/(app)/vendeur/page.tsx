import { tunisDayKey } from '@faffago/shared';
import {
  SellerDashboardScreen,
  resolveDashboardPeriod,
} from '@/components/seller-dashboard-screen';
import { VerifyBanner } from '@/components/verify-banner';
import { requireMe, serverGet } from '@/lib/server/session';
import type { SellerDashboard, SellerVerifySummary } from '@/lib/types';

/** Tableau de bord (Vendeur 4.1, D-48). The period lives in the address, like the filters of Mes colis. */
export default async function TableauDeBord({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const me = await requireMe('vendeur');
  const raw = await searchParams;
  const one = (key: string) => (typeof raw[key] === 'string' ? (raw[key] as string) : undefined);
  const { period, range, invalid } = resolveDashboardPeriod(
    { periode: one('periode'), du: one('du'), au: one('au') },
    tunisDayKey(new Date()),
  );
  const dashboard = await serverGet<SellerDashboard>(
    'vendeur',
    `/dashboard?${new URLSearchParams({ from: range.from, to: range.to }).toString()}`,
  );
  const suspended = me.seller?.accountState === 'SUSPENDU';
  const summary = await serverGet<SellerVerifySummary>('vendeur', '/a-verifier/resume');

  return (
    <>
      <VerifyBanner summary={summary} />
      <SellerDashboardScreen
        dashboard={dashboard}
        period={period}
        invalid={invalid}
        // Suspended: no parcel, no pickup (Vendeur 2.5); "Voir comme le vendeur" writes nothing (D-5).
        canCreate={!me.readOnly && !suspended}
        suspended={suspended}
      />
    </>
  );
}
