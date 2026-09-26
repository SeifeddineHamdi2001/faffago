import { notFound } from 'next/navigation';
import {
  MONTHLY_REPORTS,
  Permission,
  REPORT_SLUGS,
  ReportKind,
  reportMonthSchema,
  reportPeriodSchema,
  tunisDayKey,
  type ReportTable,
} from '@faffago/shared';
import { ReportsScreen } from '@/components/reports-screen';
import { requireMe, serverGetOrNull } from '@/lib/server/session';

/** Rapports (Admin 4.13, D-89): the admin alone. The choice lives in the address. */
export default async function RapportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const me = await requireMe('admin');
  if (!me.permissions.includes(Permission.RAPPORTS)) notFound();
  const params = await searchParams;
  const today = tunisDayKey(new Date());
  const kind =
    (Object.entries(REPORT_SLUGS) as [ReportKind, string][]).find(
      ([, slug]) => slug === params.rapport,
    )?.[0] ?? ReportKind.RETENUE;
  const monthly = MONTHLY_REPORTS.includes(kind);
  const month = reportMonthSchema.safeParse({ mois: params.mois }).success
    ? params.mois!
    : today.slice(0, 7);
  const asked = params.from !== undefined || params.to !== undefined;
  const period = reportPeriodSchema.safeParse({ from: params.from, to: params.to });
  const range = period.success ? period.data : { from: `${today.slice(0, 7)}-01`, to: today };
  const query = monthly ? `mois=${month}` : `from=${range.from}&to=${range.to}`;
  const table = await serverGetOrNull<ReportTable>(
    'admin',
    `/rapports/${REPORT_SLUGS[kind]}?${query}`,
  );
  return (
    <ReportsScreen
      kind={kind}
      month={month}
      range={range}
      query={query}
      table={table}
      periodError={!monthly && asked && !period.success}
      year={today.slice(0, 4)}
    />
  );
}
