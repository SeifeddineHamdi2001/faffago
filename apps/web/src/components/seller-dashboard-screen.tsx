import Link from 'next/link';
import {
  DASHBOARD_PERIODS,
  DASHBOARD_PERIOD_LABELS_FR,
  DASHBOARD_TILES,
  DASHBOARD_TILE_LABELS_FR,
  DashboardPeriod,
  dashboardQuerySchema,
  dashboardTitle,
  periodRange,
  type DayRange,
} from '@faffago/shared';
import type { SellerDashboard } from '@/lib/types';

const PRESETS = DASHBOARD_PERIODS.filter((period) => period !== DashboardPeriod.PERSONNALISE);

export interface ResolvedPeriod {
  period: DashboardPeriod;
  range: DayRange;
  /** Why the period asked for was refused; today is shown instead. */
  invalid: string | null;
}

/**
 * The period in the address (D-48): `periode`, and `du` / `au` for a custom
 * range. Anything refused falls back to today, with the reason.
 */
export function resolveDashboardPeriod(
  params: { periode?: string; du?: string; au?: string },
  today: string,
): ResolvedPeriod {
  const fallback = (invalid: string | null): ResolvedPeriod => ({
    period: DashboardPeriod.AUJOURD_HUI,
    range: periodRange(DashboardPeriod.AUJOURD_HUI, today),
    invalid,
  });
  const period = params.periode ?? DashboardPeriod.AUJOURD_HUI;
  if (period === DashboardPeriod.PERSONNALISE) {
    const parsed = dashboardQuerySchema.safeParse({ from: params.du, to: params.au });
    if (!parsed.success) return fallback(parsed.error.issues[0]?.message ?? 'Période inconnue');
    if (!parsed.data.from || !parsed.data.to) {
      return fallback('Indiquez la date de début et la date de fin');
    }
    return { period, range: { from: parsed.data.from, to: parsed.data.to }, invalid: null };
  }
  const preset = PRESETS.find((candidate) => candidate === period);
  if (!preset) return fallback('Période inconnue');
  return { period: preset, range: periodRange(preset, today), invalid: null };
}

function presetHref(period: DashboardPeriod): string {
  return period === DashboardPeriod.AUJOURD_HUI ? '/vendeur' : `/vendeur?periode=${period}`;
}

/**
 * Tableau de bord (Vendeur 4.1, D-39, D-48): what happened to the seller's
 * parcels over the period chosen, and the quick actions. À recevoir and
 * Taux de livraison join it in phase 8, À traiter with phases 7 and 8.
 */
export function SellerDashboardScreen({
  dashboard,
  period,
  invalid,
  canCreate,
  suspended,
}: {
  dashboard: SellerDashboard;
  period: DashboardPeriod;
  invalid: string | null;
  /** False when suspended (Vendeur 2.5) or under "Voir comme le vendeur" (D-5). */
  canCreate: boolean;
  suspended: boolean;
}) {
  const title = dashboardTitle(period, dashboard);
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-navy">Tableau de bord</h1>
        {canCreate && (
          <div className="flex flex-wrap gap-2">
            <Link href="/vendeur/colis/nouveau" className="btn-primary">
              Créer un colis
            </Link>
            <Link href="/vendeur/ramassages/nouveau" className="btn-primary">
              Demander un ramassage
            </Link>
          </div>
        )}
      </div>
      {suspended && (
        <p className="mb-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          Votre compte est suspendu : vous ne pouvez pas créer de colis ni demander de ramassage.
        </p>
      )}

      <nav aria-label="Période" className="mb-3 flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <Link
            key={preset}
            href={presetHref(preset)}
            aria-current={period === preset ? 'page' : undefined}
            className={`rounded-full px-3 py-1 text-sm font-semibold ${
              period === preset ? 'bg-orange text-navy' : 'bg-navy/5 text-navy'
            }`}
          >
            {DASHBOARD_PERIOD_LABELS_FR[preset]}
          </Link>
        ))}
      </nav>
      <form method="get" action="/vendeur" className="card mb-4 flex flex-wrap items-end gap-3">
        <input type="hidden" name="periode" value={DashboardPeriod.PERSONNALISE} />
        <p className="w-full text-sm font-semibold text-navy">
          {DASHBOARD_PERIOD_LABELS_FR.PERSONNALISE}
        </p>
        <div>
          <label htmlFor="du" className="field-label">
            Du
          </label>
          <input
            id="du"
            name="du"
            type="date"
            required
            className="field"
            defaultValue={dashboard.from}
          />
        </div>
        <div>
          <label htmlFor="au" className="field-label">
            Au
          </label>
          <input
            id="au"
            name="au"
            type="date"
            required
            className="field"
            defaultValue={dashboard.to}
          />
        </div>
        <button type="submit" className="btn-secondary">
          Afficher
        </button>
      </form>

      {invalid && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-900">
          Période invalide ({invalid}) : aujourd’hui est affiché.
        </p>
      )}

      <section aria-labelledby="periode-titre">
        <h2 id="periode-titre" className="mb-3 font-display text-xl font-bold text-navy">
          {title}
        </h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {DASHBOARD_TILES.map((tile) => (
            <div key={tile} className="card flex flex-col-reverse gap-1">
              <dt className="text-sm font-semibold text-navy/70">
                {DASHBOARD_TILE_LABELS_FR[tile]}
              </dt>
              <dd className="font-display text-3xl font-bold text-navy">
                {dashboard.counts[tile]}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </section>
  );
}
