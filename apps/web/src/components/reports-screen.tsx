import Link from 'next/link';
import {
  MONTHLY_REPORTS,
  REPORT_LABELS_FR,
  REPORT_SLUGS,
  ReportKind,
  reportCellText,
  type ReportCell,
  type ReportColumn,
  type ReportSection,
  type ReportTable,
} from '@faffago/shared';

const KINDS = Object.values(ReportKind);

function Cell({ column, value }: { column: ReportColumn; value: ReportCell }) {
  const numeric = column.type !== 'text' && column.type !== 'day';
  return (
    <td className={`px-2 py-1 ${numeric ? 'text-right tabular-nums' : ''}`}>
      {reportCellText(column.type, value)}
    </td>
  );
}

/** The Retenue report's rows lead to the certificate, or to the seller's yearly summary. */
function RetenueLinks({ row, year }: { row: Record<string, ReportCell>; year: string }) {
  if (row.certificateId) {
    return (
      <a
        className="text-orange-dark underline"
        href={`/api/bff/rapports/retenue/certificats/${String(row.certificateId)}/pdf`}
        target="_blank"
        rel="noreferrer"
      >
        Certificat
      </a>
    );
  }
  if (row.sellerId) {
    return (
      <a
        className="text-orange-dark underline"
        href={`/api/bff/rapports/retenue/vendeurs/${String(row.sellerId)}/annuel/${year}/pdf`}
        target="_blank"
        rel="noreferrer"
      >
        Récapitulatif {year}
      </a>
    );
  }
  return null;
}

function Section({
  section,
  links,
  year,
}: {
  section: ReportSection;
  links: boolean;
  year: string;
}) {
  return (
    <section className="card mb-4 overflow-x-auto" aria-label={section.title}>
      <h2 className="mb-1 font-display text-lg font-bold text-navy">{section.title}</h2>
      {section.note && <p className="mb-2 text-sm text-navy/70">{section.note}</p>}
      {section.rows.length === 0 ? (
        <p className="text-sm text-navy/70">Rien sur la période.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-navy/20 text-left text-navy/70">
              {section.columns.map((column) => (
                <th key={column.key} scope="col" className="px-2 py-1 font-semibold">
                  {column.label}
                  {column.type === 'money' ? ' (DT)' : ''}
                </th>
              ))}
              {links && <th scope="col" className="px-2 py-1" />}
            </tr>
          </thead>
          <tbody>
            {section.rows.map((row, index) => (
              <tr key={index} className="border-b border-navy/10">
                {section.columns.map((column) => (
                  <Cell key={column.key} column={column} value={row[column.key] ?? null} />
                ))}
                {links && (
                  <td className="px-2 py-1 text-right">
                    <RetenueLinks row={row} year={year} />
                  </td>
                )}
              </tr>
            ))}
            {section.totals && (
              <tr className="font-bold">
                {section.columns.map((column) => (
                  <Cell
                    key={column.key}
                    column={column}
                    value={section.totals![column.key] ?? null}
                  />
                ))}
                {links && <td />}
              </tr>
            )}
          </tbody>
        </table>
      )}
    </section>
  );
}

/**
 * Rapports (Admin 4.13, D-89): one report at a time, its period in the
 * address, exported as CSV or Excel. The retenue and the ramasseurs' écarts
 * are monthly; the others take a range of days.
 */
export function ReportsScreen({
  kind,
  month,
  range,
  query,
  table,
  periodError,
  year,
}: {
  kind: ReportKind;
  month: string;
  range: { from: string; to: string };
  query: string;
  table: ReportTable | null;
  periodError: boolean;
  year: string;
}) {
  const slug = REPORT_SLUGS[kind];
  const monthly = MONTHLY_REPORTS.includes(kind);
  return (
    <section>
      <h1 className="mb-4 font-display text-2xl font-bold text-navy">Rapports</h1>
      <nav aria-label="Choix du rapport" className="mb-4 flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <Link
            key={k}
            href={`/admin/rapports?rapport=${REPORT_SLUGS[k]}`}
            aria-current={k === kind ? 'page' : undefined}
            className={k === kind ? 'btn-primary' : 'btn-secondary'}
          >
            {REPORT_LABELS_FR[k]}
          </Link>
        ))}
      </nav>
      <form method="get" className="card mb-4 flex flex-wrap items-end gap-3">
        <input type="hidden" name="rapport" value={slug} />
        {monthly ? (
          <label className="field-label">
            Mois
            <input type="month" name="mois" defaultValue={month} className="field" required />
          </label>
        ) : (
          <>
            <label className="field-label">
              Du
              <input type="date" name="from" defaultValue={range.from} className="field" required />
            </label>
            <label className="field-label">
              Au
              <input type="date" name="to" defaultValue={range.to} className="field" required />
            </label>
          </>
        )}
        <button type="submit" className="btn-primary">
          Afficher
        </button>
        <a className="btn-secondary" href={`/api/bff/rapports/${slug}?${query}&format=csv`}>
          Exporter CSV
        </a>
        <a className="btn-secondary" href={`/api/bff/rapports/${slug}?${query}&format=xlsx`}>
          Exporter Excel
        </a>
      </form>
      {periodError && (
        <p role="alert" className="mb-4 text-sm text-red-700">
          Période invalide : la date de début doit précéder la date de fin, sur 366 jours au plus.
        </p>
      )}
      {table ? (
        <>
          <p className="mb-2 text-sm text-navy/70">
            {table.title} · {table.period}
          </p>
          {table.sections.map((section) => (
            <Section
              key={section.title}
              section={section}
              links={kind === ReportKind.RETENUE}
              year={year}
            />
          ))}
        </>
      ) : (
        <p className="card text-sm text-navy/70">Rapport indisponible pour cette période.</p>
      )}
    </section>
  );
}
