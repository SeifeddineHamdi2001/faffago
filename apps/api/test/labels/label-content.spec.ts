import { renderLabels } from '../../src/labels/label-renderer';
import {
  LABEL_FLAG_ECHANGE,
  LABEL_FLAG_OUVERTURE,
  labelContent,
  pdfSafe,
  siteUrlFrom,
  type LabelParcel,
} from '../../src/labels/label-content';

/** What a label says (Vendeur 4.4, D-36, Q6). */

const parcel: LabelParcel = {
  code: 'FG-8K2QX7AB',
  shopName: 'Bijoux Yasmine',
  recipientName: 'Amira Ben Salah',
  recipientPhone: '29876543',
  recipientPhone2: '98765432',
  localiteNameFr: 'Cité Ennasr 1',
  delegationNameFr: 'Ariana Ville',
  gouvernoratNameFr: 'Ariana',
  address: '12 rue de Marseille, 2e étage',
  codAmountMillimes: 85000n,
  isExchange: false,
  openingAllowed: true,
};

describe('labelContent', () => {
  it('prints the code in the Code128 and the tracking URL in the QR (D-36)', () => {
    const content = labelContent(parcel, 'https://www.mirely.store');
    expect(content.barcodeText).toBe('FG-8K2QX7AB');
    expect(content.qrText).toBe('https://www.mirely.store/suivi/FG-8K2QX7AB');
  });

  it('prints what Vendeur 4.4 lists, in French (Q6)', () => {
    expect(labelContent(parcel, 'https://www.mirely.store')).toMatchObject({
      code: 'FG-8K2QX7AB',
      shop: 'Bijoux Yasmine',
      cod: '85,000 DT',
      recipientName: 'Amira Ben Salah',
      phones: '29 876 543 · 98 765 432',
      place: 'Cité Ennasr 1 — Ariana Ville, Ariana',
      address: '12 rue de Marseille, 2e étage',
      flags: [LABEL_FLAG_OUVERTURE],
    });
  });

  it('shows both flags when both apply, none when neither', () => {
    const both = labelContent({ ...parcel, isExchange: true }, 'https://x.tn');
    expect(both.flags).toEqual([LABEL_FLAG_ECHANGE, LABEL_FLAG_OUVERTURE]);
    const none = labelContent({ ...parcel, openingAllowed: false }, 'https://x.tn');
    expect(none.flags).toEqual([]);
  });

  it('prints a COD of zero as it is (already paid)', () => {
    expect(labelContent({ ...parcel, codAmountMillimes: 0n }, 'https://x.tn').cod).toBe('0,000 DT');
  });
});

describe('what the PDF fonts can draw', () => {
  it('keeps French, and replaces what the fonts cannot draw with "?"', () => {
    expect(pdfSafe('Béji — l’Aouina « 2e »')).toBe('Béji — l’Aouina « 2e »');
    expect(pdfSafe('أمينة')).toBe('?????');
    expect(pdfSafe('Rue X\nbloc B')).toBe('Rue X bloc B');
  });
});

describe('the site address (D-43)', () => {
  it('takes an http(s) address and keeps its origin only', () => {
    expect(siteUrlFrom('https://www.mirely.store')).toBe('https://www.mirely.store');
    expect(siteUrlFrom('https://www.mirely.store/fr/')).toBe('https://www.mirely.store');
  });

  it('refuses a missing or malformed one', () => {
    expect(siteUrlFrom(undefined)).toBeNull();
    expect(siteUrlFrom('')).toBeNull();
    expect(siteUrlFrom('www.mirely.store')).toBeNull();
    expect(siteUrlFrom('ftp://mirely.store')).toBeNull();
  });
});

describe('renderLabels', () => {
  const content = labelContent(parcel, 'https://www.mirely.store');

  it('draws even a label with every field at its longest', async () => {
    const long = labelContent(
      {
        ...parcel,
        recipientName: 'Nom '.repeat(30),
        address: 'Adresse très longue '.repeat(25),
        isExchange: true,
      },
      'https://www.mirely.store',
    );
    const pdf = await renderLabels([long], 'THERMAL');
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('embeds the Code128 and the QR of every label', async () => {
    // pdfkit stores a PNG's transparency as an image of its own, so count
    // one label, then check two labels carry exactly twice as many.
    const images = async (count: number) =>
      (await renderLabels(Array(count).fill(content), 'THERMAL'))
        .toString('latin1')
        .match(/\/Subtype \/Image/g)?.length ?? 0;
    const one = await images(1);
    expect(one).toBeGreaterThanOrEqual(2);
    expect(await images(2)).toBe(2 * one);
  });
});
