import { describe, expect, it } from 'vitest';
import {
  PRODUCT_CATEGORY_LABELS_FR,
  ProductCategory,
  SELLER_DOCUMENT_POLICY,
  SellerDocumentType,
  checkDocumentSet,
  createSellerSchema,
  detectDocumentMimeType,
  requiredDocumentsFor,
  updateSellerSchema,
} from '../sellers.js';
import { SellerStatut } from '../statuses.js';

const { CIN_RECTO, CIN_VERSO, PATENTE, CARTE_AUTO_ENTREPRENEUR } = SellerDocumentType;

describe('product categories (D-33)', () => {
  it('is exactly the approved list, in order', () => {
    expect(Object.values(ProductCategory).map((c) => PRODUCT_CATEGORY_LABELS_FR[c])).toEqual([
      'Mode et vêtements',
      'Chaussures',
      'Bijoux et accessoires',
      'Beauté et cosmétique',
      'Électronique',
      'Maison et déco',
      'Enfants et bébés',
      'Sport',
      'Alimentation',
      'Autre',
    ]);
  });
});

describe('documents required per statut (Vendeur 2.4, D-33)', () => {
  it('CIN front and back always', () => {
    expect(requiredDocumentsFor(SellerStatut.CIN_UNIQUEMENT)).toEqual([CIN_RECTO, CIN_VERSO]);
  });

  it('adds the patente for Patente and the card for Auto-entrepreneur', () => {
    expect(requiredDocumentsFor(SellerStatut.PATENTE)).toEqual([CIN_RECTO, CIN_VERSO, PATENTE]);
    expect(requiredDocumentsFor(SellerStatut.AUTO_ENTREPRENEUR)).toEqual([
      CIN_RECTO,
      CIN_VERSO,
      CARTE_AUTO_ENTREPRENEUR,
    ]);
  });

  it('reports what is missing', () => {
    expect(checkDocumentSet(SellerStatut.PATENTE, [CIN_RECTO])).toEqual({
      missing: [CIN_VERSO, PATENTE],
      unexpected: [],
    });
  });

  it('reports a document the statut does not call for', () => {
    expect(checkDocumentSet(SellerStatut.CIN_UNIQUEMENT, [CIN_RECTO, CIN_VERSO, PATENTE])).toEqual({
      missing: [],
      unexpected: [PATENTE],
    });
    expect(
      checkDocumentSet(SellerStatut.PATENTE, [
        CIN_RECTO,
        CIN_VERSO,
        PATENTE,
        CARTE_AUTO_ENTREPRENEUR,
      ]).unexpected,
    ).toEqual([CARTE_AUTO_ENTREPRENEUR]);
  });
});

describe('document type from the bytes (D-32)', () => {
  const bytes = (...values: number[]) => new Uint8Array(values);

  it('recognises JPEG, PNG and PDF', () => {
    expect(detectDocumentMimeType(bytes(0xff, 0xd8, 0xff, 0xe0, 0))).toBe('image/jpeg');
    expect(detectDocumentMimeType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe(
      'image/png',
    );
    expect(detectDocumentMimeType(new TextEncoder().encode('%PDF-1.7\n'))).toBe('application/pdf');
  });

  it('refuses anything else, whatever the file is called', () => {
    expect(detectDocumentMimeType(new TextEncoder().encode('<html>'))).toBeNull();
    expect(detectDocumentMimeType(bytes(0x47, 0x49, 0x46, 0x38))).toBeNull(); // GIF
    expect(detectDocumentMimeType(bytes(0x50, 0x4b, 0x03, 0x04))).toBeNull(); // zip / docx
    expect(detectDocumentMimeType(bytes(0xff, 0xd8))).toBeNull(); // truncated
    expect(detectDocumentMimeType(bytes())).toBeNull();
  });

  it('caps a file at 10 MB', () => {
    expect(SELLER_DOCUMENT_POLICY.maxBytes).toBe(10_485_760);
  });
});

describe('Créer un vendeur', () => {
  const valid = {
    shopName: 'Bijoux Yasmine',
    productCategory: 'BIJOUX_ACCESSOIRES',
    storeLink: 'https://www.instagram.com/bijoux.yasmine',
    contactFirstName: 'Yasmine',
    contactLastName: 'Trabelsi',
    contactPhone: '22 123 456',
    email: ' Yasmine@Example.TN ',
    statut: 'CIN_UNIQUEMENT',
    cinNumber: '01234567',
  };

  it('normalises the phone and lowercases the email (Q13)', () => {
    const parsed = createSellerSchema.parse(valid);
    expect(parsed.contactPhone).toBe('22123456');
    expect(parsed.email).toBe('yasmine@example.tn');
  });

  it('treats an empty store link as none', () => {
    expect(createSellerSchema.parse({ ...valid, storeLink: '' }).storeLink).toBeNull();
    expect(createSellerSchema.parse({ ...valid, storeLink: undefined }).storeLink).toBeUndefined();
  });

  it('refuses a link that is not http(s)', () => {
    expect(
      createSellerSchema.safeParse({ ...valid, storeLink: 'javascript:alert(1)' }).success,
    ).toBe(false);
  });

  it('refuses a category outside the list, a bad email or a bad phone', () => {
    expect(createSellerSchema.safeParse({ ...valid, productCategory: 'Mode' }).success).toBe(false);
    expect(createSellerSchema.safeParse({ ...valid, email: 'yasmine' }).success).toBe(false);
    expect(createSellerSchema.safeParse({ ...valid, contactPhone: '1234' }).success).toBe(false);
  });

  it('never changes the statut through the edit form', () => {
    expect(updateSellerSchema.safeParse({ statut: 'PATENTE' }).success).toBe(false);
    expect(updateSellerSchema.safeParse({}).success).toBe(false);
    expect(updateSellerSchema.safeParse({ shopName: 'Nouveau nom' }).success).toBe(true);
  });
});
