import { describe, expect, it } from 'vitest';
import {
  REPORT_LABELS_FR,
  ReportKind,
  averageMinutes,
  monthRange,
  reportCellText,
  reportCsv,
  reportMonthSchema,
  reportPeriodSchema,
  type ReportTable,
} from '../reports.js';
import { formatDT } from '../money.js';

describe('report periods', () => {
  it('takes a range of Tunis days, at most 366, in order', () => {
    expect(reportPeriodSchema.parse({ from: '2026-09-01', to: '2026-09-30' })).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(reportPeriodSchema.safeParse({ from: '2026-09-30', to: '2026-09-01' }).success).toBe(
      false,
    );
    expect(reportPeriodSchema.safeParse({ from: '2025-01-01', to: '2026-09-01' }).success).toBe(
      false,
    );
    expect(reportPeriodSchema.safeParse({ from: '2026-02-30', to: '2026-03-01' }).success).toBe(
      false,
    );
  });

  it('takes a month for the retenue and the ramasseurs’ écarts', () => {
    expect(reportMonthSchema.parse({ mois: '2026-09' })).toEqual({ mois: '2026-09' });
    expect(reportMonthSchema.safeParse({ mois: '2026-13' }).success).toBe(false);
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('labels Chiffre d’affaires as a management report (D-89)', () => {
    expect(REPORT_LABELS_FR[ReportKind.CHIFFRE_AFFAIRES]).toBe(
      'Chiffre d’affaires (rapport de gestion)',
    );
  });
});

describe('cells', () => {
  it('writes money in DT without floats, rates in %, days and durations', () => {
    expect(reportCellText('money', '1000000')).toBe(formatDT(1000000n, { suffix: false }));
    expect(reportCellText('money', '-4530')).toBe('-4,530');
    expect(reportCellText('rate', 9250)).toBe('92,5 %');
    expect(reportCellText('rate', null)).toBe('—');
    expect(reportCellText('day', '2026-09-25')).toBe('25/09/2026');
    expect(reportCellText('duration', 1505)).toBe('25 h 05');
    expect(reportCellText('duration', null)).toBe('—');
    expect(reportCellText('count', 12)).toBe('12');
  });

  it('averages durations in whole minutes, none when empty', () => {
    expect(averageMinutes([60, 90, 91])).toBe(80);
    expect(averageMinutes([])).toBeNull();
  });
});

describe('CSV export', () => {
  it('writes each section with its header, rows and totals, ;-separated with a BOM', () => {
    const table: ReportTable = {
      kind: ReportKind.RETENUE,
      title: 'Retenue à la source',
      period: 'Septembre 2026',
      sections: [
        {
          title: 'Par vendeur',
          columns: [
            { key: 'shop', label: 'Vendeur', type: 'text' },
            { key: 'amount', label: 'Retenue', type: 'money' },
          ],
          rows: [{ shop: 'Chic; Boutique', amount: '4530' }],
          totals: { shop: 'Total', amount: '4530' },
        },
      ],
    };
    const csv = reportCsv(table);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).split('\r\n')).toEqual([
      'Retenue à la source;Septembre 2026',
      '',
      'Par vendeur',
      'Vendeur;Retenue (DT)',
      '"Chic; Boutique";4,530',
      'Total;4,530',
      '',
    ]);
  });
});
