import { LABEL_FORMAT_LABELS_FR, LabelFormat } from '@faffago/shared';

/**
 * Imprimer (Vendeur 4.4): the PDF opens in a new tab, thermal 10 × 15 cm or
 * A4 with four per page. Plain links through the BFF with the seller's own
 * session; the API builds the PDF.
 */
export function PrintLabels({
  path,
  title,
  query = '',
}: {
  /** The API path under /api/bff, e.g. `parcels/FG-…/label`. */
  path: string;
  title: string;
  /** Extra query, e.g. `codes=FG-…,FG-…`. */
  query?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold text-navy">{title} :</span>
      {Object.values(LabelFormat).map((format) => (
        <a
          key={format}
          className="btn-secondary"
          href={`/api/bff/${path}?${query ? `${query}&` : ''}format=${format}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {LABEL_FORMAT_LABELS_FR[format]}
        </a>
      ))}
    </div>
  );
}
