import { z } from 'zod';
import { BYTE_ORDER_MARK, csvLine } from './csv-import.js';
import { formatDT, formatRatePercent } from './money.js';
import { formatTunisDay, isTunisDayKey, tunisDaysInRange } from './seller-dashboard.js';

/**
 * Rapports (Admin 4.13, D-89): the admin's reports, each a set of tables the
 * screen shows and the export writes as CSV or Excel. Money travels as
 * millimes in digit strings, rates in basis points, durations in minutes: no
 * float ever touches a figure.
 */

export const ReportKind = {
  RETENUE: 'RETENUE',
  CHIFFRE_AFFAIRES: 'CHIFFRE_AFFAIRES',
  ACTIVITE: 'ACTIVITE',
  ARGENT: 'ARGENT',
  PAIE: 'PAIE',
  ECARTS_RAMASSEURS: 'ECARTS_RAMASSEURS',
} as const;
export type ReportKind = (typeof ReportKind)[keyof typeof ReportKind];

export const REPORT_LABELS_FR: Record<ReportKind, string> = {
  RETENUE: 'Retenue à la source',
  CHIFFRE_AFFAIRES: 'Chiffre d’affaires (rapport de gestion)',
  ACTIVITE: 'Activité',
  ARGENT: 'Argent',
  PAIE: 'Paie coursiers',
  ECARTS_RAMASSEURS: 'Écarts ramasseurs',
};

/** The address of each report: `/rapports/{slug}`. */
export const REPORT_SLUGS: Record<ReportKind, string> = {
  RETENUE: 'retenue',
  CHIFFRE_AFFAIRES: 'chiffre-affaires',
  ACTIVITE: 'activite',
  ARGENT: 'argent',
  PAIE: 'paie',
  ECARTS_RAMASSEURS: 'ecarts-ramasseurs',
};

/** The retenue and the ramasseurs' écarts are monthly (Admin 4.13); the others take a range. */
export const MONTHLY_REPORTS: readonly ReportKind[] = [
  ReportKind.RETENUE,
  ReportKind.ECARTS_RAMASSEURS,
];

export type ReportColumnType = 'text' | 'money' | 'count' | 'rate' | 'day' | 'duration';

export interface ReportColumn {
  key: string;
  label: string;
  type: ReportColumnType;
}

/** Money: millimes as a digit string. Rate: basis points. Duration: minutes. Day: `AAAA-MM-JJ`. */
export type ReportCell = string | number | null;

export interface ReportSection {
  title: string;
  columns: ReportColumn[];
  rows: Record<string, ReportCell>[];
  totals?: Record<string, ReportCell>;
  note?: string;
}

export interface ReportTable {
  kind: ReportKind;
  title: string;
  /** As read: "Septembre 2026", "du 01/09/2026 au 30/09/2026". */
  period: string;
  sections: ReportSection[];
}

// ── Periods ─────────────────────────────────────────────────

/** A range longer than a year is a typing slip, not a report (D-89). */
export const REPORT_MAX_DAYS = 366;

const dayKey = z.string().refine(isTunisDayKey, 'Date au format AAAA-MM-JJ');

export const reportPeriodSchema = z
  .object({ from: dayKey, to: dayKey })
  .refine((value) => value.from <= value.to, 'La date de début précède la date de fin')
  .refine(
    (value) => value.from > value.to || tunisDaysInRange(value.from, value.to) <= REPORT_MAX_DAYS,
    `Période de ${REPORT_MAX_DAYS} jours au plus`,
  );
export type ReportPeriod = z.output<typeof reportPeriodSchema>;

export const reportMonthSchema = z.object({
  mois: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mois au format AAAA-MM'),
});

/** The first and last Tunis days of `AAAA-MM`. */
export function monthRange(month: string): ReportPeriod {
  const [year, m] = month.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

const MONTHS_FR = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

/** "Septembre 2026". */
export function monthLabel(month: string): string {
  const [year, m] = month.split('-');
  const name = MONTHS_FR[Number.parseInt(m!, 10) - 1] ?? m!;
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

export function periodLabel(period: ReportPeriod): string {
  return period.from === period.to
    ? `le ${formatTunisDay(period.from)}`
    : `du ${formatTunisDay(period.from)} au ${formatTunisDay(period.to)}`;
}

// ── Cells ───────────────────────────────────────────────────

export function reportCellText(type: ReportColumnType, cell: ReportCell): string {
  if (cell === null || cell === undefined) {
    return type === 'rate' || type === 'duration' ? '—' : '';
  }
  switch (type) {
    case 'money':
      return formatDT(BigInt(cell), { suffix: false });
    case 'rate':
      return `${formatRatePercent(typeof cell === 'number' ? cell : Number.parseInt(cell, 10))} %`;
    case 'day':
      return formatTunisDay(String(cell));
    case 'duration': {
      const minutes = typeof cell === 'number' ? cell : Number.parseInt(cell, 10);
      return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
    }
    default:
      return String(cell);
  }
}

/** The column's header in an export: money columns say their unit. */
export function reportColumnHeader(column: ReportColumn): string {
  return column.type === 'money' ? `${column.label} (DT)` : column.label;
}

/** Whole minutes, rounded; null when nothing to average. */
export function averageMinutes(durations: readonly number[]): number | null {
  if (durations.length === 0) return null;
  const total = durations.reduce((sum, value) => sum + value, 0);
  return Math.round(total / durations.length);
}

// ── CSV ─────────────────────────────────────────────────────

/**
 * The report as CSV: its title and period, then each section with its
 * header, rows and totals, `;`-separated with a byte-order mark so a French
 * Excel opens it as it opens the parcel exports.
 */
export function reportCsv(table: ReportTable): string {
  const lines = [csvLine([table.title, table.period])];
  for (const section of table.sections) {
    lines.push('', csvLine([section.title]));
    lines.push(csvLine(section.columns.map(reportColumnHeader)));
    for (const row of section.rows) {
      lines.push(csvLine(section.columns.map((c) => reportCellText(c.type, row[c.key] ?? null))));
    }
    if (section.totals) {
      lines.push(
        csvLine(section.columns.map((c) => reportCellText(c.type, section.totals![c.key] ?? null))),
      );
    }
  }
  return `${BYTE_ORDER_MARK}${lines.join('\r\n')}\r\n`;
}
