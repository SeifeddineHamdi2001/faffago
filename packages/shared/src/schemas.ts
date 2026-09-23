import { z } from 'zod';
import { isValidTunisianPhone, normalizePhone } from './codes.js';
import { tryParseDT } from './money.js';
import { FailureReason } from './statuses.js';

/**
 * Validation shared by the seller form, the CSV importer and the API DTOs.
 *
 * The browser previews a CSV with exactly these rules, and the server runs
 * them again on every row (tech-stack 2, CSV import).
 */

export const tunisianPhone = z
  .string()
  .trim()
  .transform(normalizePhone)
  .refine(isValidTunisianPhone, { message: '8 chiffres, format tunisien' });

/**
 * A COD amount as typed: three decimals at most. Zero is allowed when the
 * customer has already paid (Vendeur 4.2).
 */
export const codAmount = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const parsed = tryParseDT(value);
    if (parsed === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Montant invalide. Format : 85,000',
      });
      return z.NEVER;
    }
    if (parsed < 0n) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Le montant COD ne peut pas être négatif',
      });
      return z.NEVER;
    }
    return parsed;
  });

/** Créer un colis (Vendeur 4.2). */
export const createParcelSchema = z.object({
  recipientName: z.string().trim().min(2, 'Nom du destinataire obligatoire').max(120),
  recipientPhone: tunisianPhone,
  recipientPhone2: tunisianPhone.optional().nullable(),
  delegationId: z.string().uuid('Délégation obligatoire'),
  address: z.string().trim().min(5, 'Adresse obligatoire').max(500),
  /** Kept separate from the address so the courier screen can show it large (A-21). */
  landmark: z.string().trim().max(200).optional().nullable(),
  productDescription: z.string().trim().min(2, 'Description du produit obligatoire').max(300),
  pieceCount: z.coerce.number().int().min(1, 'Au moins 1 pièce').max(999).default(1),
  codAmountMillimes: codAmount,
  isExchange: z.boolean().default(false),
  openingAllowed: z.boolean().default(false),
  courierNote: z.string().trim().max(300).optional().nullable(),
});
export type CreateParcelInput = z.input<typeof createParcelSchema>;
export type CreateParcelValues = z.output<typeof createParcelSchema>;

/**
 * One CSV row (Vendeur 4.3).
 *
 * The délégation may be given by code, by its French name or by its Arabic
 * name; names repeat across gouvernorats, so a name must come with its
 * gouvernorat (Q5, still open — this is the rule I proposed).
 */
export const csvParcelRowSchema = z.object({
  nom_destinataire: z.string().trim().min(2),
  telephone: tunisianPhone,
  telephone_2: z.string().trim().optional(),
  gouvernorat: z.string().trim().optional(),
  delegation: z.string().trim().min(1),
  adresse: z.string().trim().min(5),
  repere: z.string().trim().optional(),
  description_produit: z.string().trim().min(2),
  nombre_de_pieces: z.coerce.number().int().min(1).max(999).default(1),
  montant_cod: codAmount,
  colis_echange: z.string().trim().optional(),
  ouverture_autorisee: z.string().trim().optional(),
  note_coursier: z.string().trim().optional(),
});

export const CSV_TEMPLATE_COLUMNS = [
  'nom_destinataire',
  'telephone',
  'telephone_2',
  'gouvernorat',
  'delegation',
  'adresse',
  'repere',
  'description_produit',
  'nombre_de_pieces',
  'montant_cod',
  'colis_echange',
  'ouverture_autorisee',
  'note_coursier',
] as const;

/** The three outcomes the import preview shows for each row (Vendeur 4.3). */
export const CsvRowVerdict = {
  VALIDE: 'VALIDE',
  A_VERIFIER: 'A_VERIFIER',
  ERREUR: 'ERREUR',
} as const;
export type CsvRowVerdict = (typeof CsvRowVerdict)[keyof typeof CsvRowVerdict];

export const CSV_ROW_VERDICT_LABELS_FR: Record<CsvRowVerdict, string> = {
  VALIDE: 'Valide',
  A_VERIFIER: 'À vérifier',
  ERREUR: 'Erreur',
};

/** Échec scan: the reason is required and comes from the fixed list. */
export const failureScanSchema = z.object({
  failureReason: z.nativeEnum(FailureReason),
  note: z.string().trim().max(300).optional(),
});

/** Every scan carries a UUID generated on the device (tech-stack 2). */
export const scanEnvelopeSchema = z.object({
  clientScanId: z.string().uuid(),
  parcelCode: z.string().trim().min(1),
  deviceTime: z.coerce.date(),
  gpsLat: z.number().min(-90).max(90).optional().nullable(),
  gpsLng: z.number().min(-180).max(180).optional().nullable(),
  gpsAccuracyM: z.number().int().min(0).optional().nullable(),
  deviceId: z.string().max(120).optional().nullable(),
  appVersion: z.string().max(20),
  manualEntry: z.boolean().default(false),
});
