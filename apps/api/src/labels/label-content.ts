import { formatDT, trackingUrl } from '@faffago/shared';

/** What a label needs of its parcel. Place names are always French (Q6). */
export interface LabelParcel {
  code: string;
  shopName: string;
  recipientName: string;
  recipientPhone: string;
  recipientPhone2: string | null;
  localiteNameFr: string;
  delegationNameFr: string;
  gouvernoratNameFr: string;
  address: string;
  landmark: string | null;
  codAmountMillimes: bigint;
  isExchange: boolean;
  openingAllowed: boolean;
}

/** Exactly what is printed, already worded (Vendeur 4.4). */
export interface LabelContent {
  /** The Code128: the parcel code alone, for barcode guns (D-36). */
  barcodeText: string;
  /** The QR: the public tracking URL (D-36, D-43). */
  qrText: string;
  code: string;
  shop: string;
  cod: string;
  flags: string[];
  recipientName: string;
  phones: string;
  place: string;
  address: string;
  /** Printed under the address when there is one (D-45). */
  landmark: string | null;
}

export const LABEL_FLAG_ECHANGE = 'ÉCHANGE';
export const LABEL_FLAG_OUVERTURE = 'OUVERTURE AUTORISÉE';

/**
 * Text is printed as typed, Arabic included: the fonts and the layout take
 * care of it (D-45). "29876543" → "29 876 543", as a courier reads a number.
 */
function spacedPhone(phone: string): string {
  return phone.replace(/^(\d{2})(\d{3})(\d{3})$/, '$1 $2 $3');
}

export function labelContent(parcel: LabelParcel, siteUrl: string): LabelContent {
  const flags: string[] = [];
  if (parcel.isExchange) flags.push(LABEL_FLAG_ECHANGE);
  if (parcel.openingAllowed) flags.push(LABEL_FLAG_OUVERTURE);
  return {
    barcodeText: parcel.code,
    qrText: trackingUrl(siteUrl, parcel.code),
    code: parcel.code,
    shop: parcel.shopName,
    cod: formatDT(parcel.codAmountMillimes),
    flags,
    recipientName: parcel.recipientName,
    phones: [parcel.recipientPhone, parcel.recipientPhone2]
      .filter((phone): phone is string => Boolean(phone))
      .map(spacedPhone)
      .join(' · '),
    place: `${parcel.localiteNameFr} — ${parcel.delegationNameFr}, ${parcel.gouvernoratNameFr}`,
    address: parcel.address,
    landmark: parcel.landmark?.trim() || null,
  };
}

/**
 * NEXT_PUBLIC_SITE_URL, checked: it is printed on every label and can never
 * change afterwards (D-43), so a missing or malformed one refuses to print
 * rather than printing a QR code that leads nowhere.
 */
export function siteUrlFrom(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin;
  } catch {
    return null;
  }
}
