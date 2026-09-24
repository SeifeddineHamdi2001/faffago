import { z } from 'zod';
import { tunisianPhone } from './schemas.js';
import { SellerStatut } from './statuses.js';

/**
 * Seller accounts (Vendeur 2.2, Admin 4.14): what the admin enters, which
 * documents each statut needs, and what a document file may be (D-32, D-33).
 */

/** Fixed list (D-33). */
export const ProductCategory = {
  MODE_VETEMENTS: 'MODE_VETEMENTS',
  CHAUSSURES: 'CHAUSSURES',
  BIJOUX_ACCESSOIRES: 'BIJOUX_ACCESSOIRES',
  BEAUTE_COSMETIQUE: 'BEAUTE_COSMETIQUE',
  ELECTRONIQUE: 'ELECTRONIQUE',
  MAISON_DECO: 'MAISON_DECO',
  ENFANTS_BEBES: 'ENFANTS_BEBES',
  SPORT: 'SPORT',
  ALIMENTATION: 'ALIMENTATION',
  AUTRE: 'AUTRE',
} as const;
export type ProductCategory = (typeof ProductCategory)[keyof typeof ProductCategory];

export const PRODUCT_CATEGORY_LABELS_FR: Record<ProductCategory, string> = {
  MODE_VETEMENTS: 'Mode et vêtements',
  CHAUSSURES: 'Chaussures',
  BIJOUX_ACCESSOIRES: 'Bijoux et accessoires',
  BEAUTE_COSMETIQUE: 'Beauté et cosmétique',
  ELECTRONIQUE: 'Électronique',
  MAISON_DECO: 'Maison et déco',
  ENFANTS_BEBES: 'Enfants et bébés',
  SPORT: 'Sport',
  ALIMENTATION: 'Alimentation',
  AUTRE: 'Autre',
};

export const SellerDocumentType = {
  CIN_RECTO: 'CIN_RECTO',
  CIN_VERSO: 'CIN_VERSO',
  PATENTE: 'PATENTE',
  CARTE_AUTO_ENTREPRENEUR: 'CARTE_AUTO_ENTREPRENEUR',
} as const;
export type SellerDocumentType = (typeof SellerDocumentType)[keyof typeof SellerDocumentType];

export const SELLER_DOCUMENT_TYPE_LABELS_FR: Record<SellerDocumentType, string> = {
  CIN_RECTO: 'CIN (recto)',
  CIN_VERSO: 'CIN (verso)',
  PATENTE: 'Patente',
  CARTE_AUTO_ENTREPRENEUR: 'Carte auto-entrepreneur',
};

/**
 * The document a statut adds to the CIN (Vendeur 2.4). Switching to one of
 * these statuts uploads it in the same action (D-33).
 */
export const STATUT_DOCUMENT: Record<SellerStatut, SellerDocumentType | null> = {
  PATENTE: SellerDocumentType.PATENTE,
  AUTO_ENTREPRENEUR: SellerDocumentType.CARTE_AUTO_ENTREPRENEUR,
  CIN_UNIQUEMENT: null,
};

/** CIN front and back always, plus the statut's own document (D-33). */
export function requiredDocumentsFor(statut: SellerStatut): SellerDocumentType[] {
  const extra = STATUT_DOCUMENT[statut];
  return [SellerDocumentType.CIN_RECTO, SellerDocumentType.CIN_VERSO, ...(extra ? [extra] : [])];
}

export interface DocumentSetCheck {
  missing: SellerDocumentType[];
  /** A document the statut does not call for, e.g. a patente for CIN uniquement. */
  unexpected: SellerDocumentType[];
}

export function checkDocumentSet(
  statut: SellerStatut,
  provided: readonly SellerDocumentType[],
): DocumentSetCheck {
  const required = requiredDocumentsFor(statut);
  return {
    missing: required.filter((type) => !provided.includes(type)),
    unexpected: provided.filter((type) => !required.includes(type)),
  };
}

// ── Document files (D-32) ───────────────────────────────────

export const DocumentMimeType = {
  JPEG: 'image/jpeg',
  PNG: 'image/png',
  PDF: 'application/pdf',
} as const;
export type DocumentMimeType = (typeof DocumentMimeType)[keyof typeof DocumentMimeType];

export const SELLER_DOCUMENT_POLICY = {
  /** 10 MB, as sent by the admin (D-32). */
  maxBytes: 10 * 1024 * 1024,
  mimeTypes: [DocumentMimeType.JPEG, DocumentMimeType.PNG, DocumentMimeType.PDF],
  /** What the file picker offers; the server decides from the bytes. */
  accept: '.jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf',
} as const;

const startsWith = (bytes: Uint8Array, signature: readonly number[]): boolean =>
  bytes.length >= signature.length && signature.every((byte, i) => bytes[i] === byte);

/**
 * The file's real type, from its first bytes. The name and the type the
 * browser claims are never trusted. Null for anything else.
 */
export function detectDocumentMimeType(bytes: Uint8Array): DocumentMimeType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return DocumentMimeType.JPEG;
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return DocumentMimeType.PNG;
  }
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return DocumentMimeType.PDF; // %PDF-
  return null;
}

export const DOCUMENT_FILE_EXTENSIONS: Record<DocumentMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
};

// ── Forms ───────────────────────────────────────────────────

const personName = z.string().trim().min(1, 'Obligatoire').max(80, '80 caractères maximum');

/** Empty means "no link": the store link is optional (Vendeur 2.2). */
const storeLink = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z
    .string()
    .trim()
    .max(300, '300 caractères maximum')
    .url('Lien invalide. Exemple : https://www.facebook.com/maboutique')
    .refine((value) => /^https?:\/\//i.test(value), 'Le lien doit commencer par https://')
    .nullable()
    .optional(),
);

/** The seller's login identifier: required, unique, stored lowercase (Q13). */
export const sellerEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, '254 caractères maximum')
  .email('Email invalide');

const sellerFields = {
  shopName: z.string().trim().min(2, 'Nom de la boutique obligatoire').max(120),
  productCategory: z.nativeEnum(ProductCategory, {
    errorMap: () => ({ message: 'Catégorie obligatoire' }),
  }),
  storeLink,
  contactFirstName: personName,
  contactLastName: personName,
  contactPhone: tunisianPhone,
  email: sellerEmail,
};

/**
 * Créer un vendeur (Admin 4.14). Sent as multipart form fields beside the
 * document files, so every value arrives as a string.
 */
export const createSellerSchema = z.object({
  ...sellerFields,
  statut: z.nativeEnum(SellerStatut, { errorMap: () => ({ message: 'Statut obligatoire' }) }),
});
export type CreateSellerInput = z.input<typeof createSellerSchema>;
export type CreateSellerValues = z.output<typeof createSellerSchema>;

/** Shop and contact corrections. The statut has its own action (D-33, D-34). */
export const updateSellerSchema = z
  .object(sellerFields)
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Aucune modification');
export type UpdateSellerValues = z.output<typeof updateSellerSchema>;

export const changeSellerStatutSchema = z.object({
  statut: z.nativeEnum(SellerStatut, { errorMap: () => ({ message: 'Statut obligatoire' }) }),
});
export type ChangeSellerStatutValues = z.output<typeof changeSellerStatutSchema>;

export const addSellerDocumentSchema = z.object({
  type: z.nativeEnum(SellerDocumentType, {
    errorMap: () => ({ message: 'Type de document obligatoire' }),
  }),
});
export type AddSellerDocumentValues = z.output<typeof addSellerDocumentSchema>;

// ── Errors ──────────────────────────────────────────────────

export const SellerErrorCode = {
  VENDEUR_INTROUVABLE: 'VENDEUR_INTROUVABLE',
  DOCUMENT_INTROUVABLE: 'DOCUMENT_INTROUVABLE',
  DOCUMENT_MANQUANT: 'DOCUMENT_MANQUANT',
  DOCUMENT_INATTENDU: 'DOCUMENT_INATTENDU',
  DOCUMENT_FORMAT_REFUSE: 'DOCUMENT_FORMAT_REFUSE',
  DOCUMENT_TROP_VOLUMINEUX: 'DOCUMENT_TROP_VOLUMINEUX',
  DOCUMENT_ILLISIBLE: 'DOCUMENT_ILLISIBLE',
  STATUT_INCHANGE: 'STATUT_INCHANGE',
  COMPTE_DEJA_SUSPENDU: 'COMPTE_DEJA_SUSPENDU',
  COMPTE_DEJA_ACTIF: 'COMPTE_DEJA_ACTIF',
} as const;
export type SellerErrorCode = (typeof SellerErrorCode)[keyof typeof SellerErrorCode];

const list = (types: readonly SellerDocumentType[]) =>
  types.map((type) => SELLER_DOCUMENT_TYPE_LABELS_FR[type]).join(', ');

export const SELLER_MESSAGES = {
  vendeurIntrouvable: 'Vendeur introuvable',
  documentIntrouvable: 'Document introuvable',
  documentManquant: (types: readonly SellerDocumentType[]) =>
    `Document obligatoire : ${list(types)}`,
  documentInattendu: (types: readonly SellerDocumentType[]) =>
    `Document non demandé pour ce statut : ${list(types)}`,
  documentFormatRefuse: 'Format refusé. Envoyez une photo JPEG ou PNG, ou un PDF.',
  documentTropVolumineux: 'Fichier trop volumineux : 10 Mo maximum.',
  documentIllisible: 'Fichier illisible. Reprenez la photo ou envoyez un autre fichier.',
  fichierObligatoire: 'Fichier obligatoire.',
  statutInchange: 'Le vendeur a déjà ce statut.',
  compteDejaSuspendu: 'Ce compte est déjà suspendu.',
  compteDejaActif: 'Ce compte est déjà actif.',
} as const;
