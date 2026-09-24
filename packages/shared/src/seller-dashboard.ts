import { z } from 'zod';
import { TUNISIA_UTC_OFFSET_MINUTES } from './fees.js';
import { ParcelEventType } from './parcel-state-machine.js';
import { FailureReason } from './statuses.js';

/**
 * Tableau de bord (Vendeur 4.1, D-39, D-48): what happened to the seller's
 * parcels over a period of Tunis calendar days, one tile per kind of event.
 */

// ── Tunis calendar days (D-46) ──────────────────────────────

const DAY = 24 * 60 * 60 * 1000;
const OFFSET = TUNISIA_UTC_OFFSET_MINUTES * 60_000;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** A day as `AAAA-MM-JJ`, read from a UTC-midnight date. */
function keyOfUtcMidnight(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function utcMidnightOf(key: string): Date {
  const [year, month, day] = key.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day));
}

/** The Tunis day an instant belongs to: 00:30 in Tunis is still 23:30 UTC the day before. */
export function tunisDayKey(instant: Date): string {
  return keyOfUtcMidnight(new Date(instant.getTime() + OFFSET));
}

/** The UTC instant a Tunis day starts at (local midnight). */
export function tunisDayStart(key: string): Date {
  return new Date(utcMidnightOf(key).getTime() - OFFSET);
}

export function addTunisDays(key: string, days: number): string {
  return keyOfUtcMidnight(new Date(utcMidnightOf(key).getTime() + days * DAY));
}

/** How many days a range covers, both ends included. */
export function tunisDaysInRange(from: string, to: string): number {
  return Math.round((utcMidnightOf(to).getTime() - utcMidnightOf(from).getTime()) / DAY) + 1;
}

/** `JJ/MM/AAAA`, as the seller reads a day. */
export function formatTunisDay(key: string): string {
  const [year, month, day] = key.split('-');
  return `${day}/${month}/${year}`;
}

function isRealDay(key: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(key) && keyOfUtcMidnight(utcMidnightOf(key)) === key;
}

// ── The period (D-48) ───────────────────────────────────────

/** Added beyond Vendeur 4.1 (D-48). Taux de livraison (phase 8) uses it too. */
export const DashboardPeriod = {
  AUJOURD_HUI: 'AUJOURD_HUI',
  HIER: 'HIER',
  SEPT_JOURS: 'SEPT_JOURS',
  CE_MOIS: 'CE_MOIS',
  PERSONNALISE: 'PERSONNALISE',
} as const;
export type DashboardPeriod = (typeof DashboardPeriod)[keyof typeof DashboardPeriod];

export const DASHBOARD_PERIODS: readonly DashboardPeriod[] = [
  DashboardPeriod.AUJOURD_HUI,
  DashboardPeriod.HIER,
  DashboardPeriod.SEPT_JOURS,
  DashboardPeriod.CE_MOIS,
  DashboardPeriod.PERSONNALISE,
];

export const DASHBOARD_PERIOD_LABELS_FR: Record<DashboardPeriod, string> = {
  AUJOURD_HUI: 'Aujourd’hui',
  HIER: 'Hier',
  SEPT_JOURS: '7 derniers jours',
  CE_MOIS: 'Ce mois',
  PERSONNALISE: 'Période personnalisée',
};

/** A custom range covers a year at most, a leap year included. */
export const MAX_DASHBOARD_RANGE_DAYS = 366;

export interface DayRange {
  from: string;
  to: string;
}

/** The days of a preset, counted back from today (a Tunis day). */
export function periodRange(
  period: Exclude<DashboardPeriod, 'PERSONNALISE'>,
  today: string,
): DayRange {
  switch (period) {
    case DashboardPeriod.AUJOURD_HUI:
      return { from: today, to: today };
    case DashboardPeriod.HIER: {
      const yesterday = addTunisDays(today, -1);
      return { from: yesterday, to: yesterday };
    }
    case DashboardPeriod.SEPT_JOURS:
      return { from: addTunisDays(today, -6), to: today };
    case DashboardPeriod.CE_MOIS:
      return { from: `${today.slice(0, 8)}01`, to: today };
  }
}

/** The block's title follows the choice; a custom range names its days. */
export function dashboardTitle(period: DashboardPeriod, range: DayRange): string {
  if (period !== DashboardPeriod.PERSONNALISE) return DASHBOARD_PERIOD_LABELS_FR[period];
  return range.from === range.to
    ? `Le ${formatTunisDay(range.from)}`
    : `Du ${formatTunisDay(range.from)} au ${formatTunisDay(range.to)}`;
}

const dayKey = z.string().refine(isRealDay, 'Date invalide');

/** GET /dashboard: both days or neither (then today), 366 days at most. */
export const dashboardQuerySchema = z
  .object({ from: dayKey.optional(), to: dayKey.optional() })
  .refine((value) => !value.from === !value.to, {
    message: 'Indiquez la date de début et la date de fin',
    path: ['to'],
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'La date de début doit précéder la date de fin',
    path: ['to'],
  })
  .refine(
    (value) =>
      !value.from ||
      !value.to ||
      value.from > value.to ||
      tunisDaysInRange(value.from, value.to) <= MAX_DASHBOARD_RANGE_DAYS,
    { message: `${MAX_DASHBOARD_RANGE_DAYS} jours au plus`, path: ['to'] },
  );
export type DashboardQuery = z.output<typeof dashboardQuerySchema>;

// ── The tiles (Vendeur 4.1, D-9, D-48) ──────────────────────

export const DashboardTile = {
  CREES: 'CREES',
  RAMASSES: 'RAMASSES',
  EN_LIVRAISON: 'EN_LIVRAISON',
  LIVRES: 'LIVRES',
  ECHECS: 'ECHECS',
  REPORTES: 'REPORTES',
} as const;
export type DashboardTile = (typeof DashboardTile)[keyof typeof DashboardTile];

export const DASHBOARD_TILES: readonly DashboardTile[] = [
  DashboardTile.CREES,
  DashboardTile.RAMASSES,
  DashboardTile.EN_LIVRAISON,
  DashboardTile.LIVRES,
  DashboardTile.ECHECS,
  DashboardTile.REPORTES,
];

export const DASHBOARD_TILE_LABELS_FR: Record<DashboardTile, string> = {
  CREES: 'Créés',
  RAMASSES: 'Ramassés',
  EN_LIVRAISON: 'En livraison',
  LIVRES: 'Livrés',
  ECHECS: 'Échecs',
  REPORTES: 'Reportés',
};

/**
 * The event each tile counts. A failure the customer postponed (D-9) is a
 * Reporté, never an Échec. A status correction (FORCAGE_STATUT) counts nowhere.
 */
const TILE_EVENTS: Record<DashboardTile, ParcelEventType> = {
  CREES: ParcelEventType.CREATION,
  RAMASSES: ParcelEventType.RAMASSAGE,
  EN_LIVRAISON: ParcelEventType.SORTIE_COURSIER,
  LIVRES: ParcelEventType.LIVRAISON,
  ECHECS: ParcelEventType.ECHEC_LIVRAISON,
  REPORTES: ParcelEventType.ECHEC_LIVRAISON,
};

/** The event types any tile counts, for the query's filter. */
export function countedEventTypes(): ParcelEventType[] {
  return [...new Set(DASHBOARD_TILES.map((tile) => TILE_EVENTS[tile]))];
}

export function dashboardTileOf(event: {
  type: ParcelEventType;
  reasonCode: FailureReason | null;
}): DashboardTile | null {
  if (event.type === ParcelEventType.ECHEC_LIVRAISON) {
    return event.reasonCode === FailureReason.REPORTE_PAR_LE_CLIENT
      ? DashboardTile.REPORTES
      : DashboardTile.ECHECS;
  }
  return DASHBOARD_TILES.find((tile) => TILE_EVENTS[tile] === event.type) ?? null;
}
