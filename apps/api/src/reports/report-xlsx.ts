import ExcelJS from 'exceljs';
import {
  reportCellText,
  reportColumnHeader,
  type ReportCell,
  type ReportColumn,
  type ReportTable,
} from '@faffago/shared';

/**
 * A report as an Excel file (.xlsx, D-89): the sections one under the other,
 * as the CSV. Amounts stay whole millimes — exact, never a float — shown as
 * dinars by the cell's format (85000 reads "85,000"), so Excel still sums
 * them; rates stay basis points shown as a percentage.
 */
const FORMAT: Partial<Record<ReportColumn['type'], string>> = {
  money: String.raw`0\,000`,
  rate: String.raw`0\,00" %"`,
  count: '0',
};

function cellValue(column: ReportColumn, cell: ReportCell): string | number | null {
  if (cell === null || cell === undefined) return null;
  if (column.type === 'money' || column.type === 'rate' || column.type === 'count') {
    return typeof cell === 'number' ? cell : Number.parseInt(cell, 10);
  }
  return reportCellText(column.type, cell);
}

export async function reportXlsx(table: ReportTable): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Faffa Go';
  const sheet = workbook.addWorksheet(table.title.slice(0, 31));
  sheet.addRow([table.title, table.period]).font = { bold: true, size: 13 };
  for (const section of table.sections) {
    sheet.addRow([]);
    sheet.addRow([section.title]).font = { bold: true };
    if (section.note) sheet.addRow([section.note]).font = { italic: true };
    sheet.addRow(section.columns.map(reportColumnHeader)).font = { bold: true };
    const write = (row: Record<string, ReportCell>, bold = false) => {
      const added = sheet.addRow(section.columns.map((c) => cellValue(c, row[c.key] ?? null)));
      section.columns.forEach((column, index) => {
        const format = FORMAT[column.type];
        if (format) added.getCell(index + 1).numFmt = format;
      });
      if (bold) added.font = { bold: true };
    };
    for (const row of section.rows) write(row);
    if (section.totals) write(section.totals, true);
  }
  sheet.columns.forEach((column) => {
    column.width = 20;
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
