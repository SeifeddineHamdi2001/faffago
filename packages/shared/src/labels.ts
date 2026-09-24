import { isValidParcelCode, normalizeParcelCode } from './codes.js';

/**
 * Étiquettes (Vendeur 4.4, D-36, D-43): the two formats, what the QR code
 * carries, and how any scanner reads a code back from a label.
 */

export const LabelFormat = {
  /** One label per page, 100 × 150 mm, for thermal printers. */
  THERMAL: 'THERMAL',
  /** Four labels per A4 sheet, for sellers without a thermal printer. */
  A4: 'A4',
} as const;
export type LabelFormat = (typeof LabelFormat)[keyof typeof LabelFormat];

export const LABEL_FORMAT_LABELS_FR: Record<LabelFormat, string> = {
  THERMAL: 'Thermique 10 × 15 cm',
  A4: 'A4 (4 par page)',
};

/** At most this many labels in one PDF: an Import CSV at most (D-37). */
export const MAX_LABELS_PER_PDF = 500;

/**
 * The public tracking address printed in the QR code (D-36). The site's
 * domain is `NEXT_PUBLIC_SITE_URL`, never a setting: once printed, a label
 * cannot change (D-43).
 */
export function trackingUrl(siteUrl: string, code: string): string {
  return `${siteUrl.replace(/\/+$/, '')}/suivi/${normalizeParcelCode(code)}`;
}

/**
 * The parcel code a scanner read, from the Code128 (the bare code) or the QR
 * (the tracking URL), or null when it is neither. Any domain is accepted: a
 * label printed before a change of domain must still scan (D-43).
 */
export function parcelCodeFromScan(scanned: string): string | null {
  const text = scanned.trim();
  const fromUrl = /\/suivi\/([^/?#\s]+)/i.exec(text);
  const candidate = normalizeParcelCode(fromUrl ? decodeURIComponent(fromUrl[1]!) : text);
  return isValidParcelCode(candidate) ? candidate : null;
}
