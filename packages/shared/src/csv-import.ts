import { z } from 'zod';
import { normalizeForMatch } from './geo.js';
import {
  resolveLocalite,
  type GeoTreeView,
  type LocaliteLookupError,
  type LocaliteRecord,
} from './localites.js';
import {
  CSV_TEMPLATE_COLUMNS,
  CsvRowVerdict,
  createParcelSchema,
  type CreateParcelValues,
} from './schemas.js';

/**
 * Import CSV (Vendeur 4.3, D-17, D-37). The browser builds the preview with
 * these functions and the server runs them again on every row it imports, so
 * the two never disagree about a row.
 */

/** At most this many parcels per file (D-37). */
export const CSV_MAX_ROWS = 500;

/** Longest cell accepted: an address or a note, with room to spare. A longer one is an Erreur. */
export const CSV_MAX_CELL_LENGTH = 500;

export type CsvColumn = (typeof CSV_TEMPLATE_COLUMNS)[number];

/** A row cannot be imported without these; every other column may be left out. */
export const CSV_REQUIRED_COLUMNS: readonly CsvColumn[] = [
  'nom_destinataire',
  'telephone',
  'localite',
  'adresse',
  'description_produit',
  'montant_cod',
];

// ── Reading the file ────────────────────────────────────────

/**
 * The file's bytes as text. A CSV saved as "CSV UTF-8" is read as UTF-8; the
 * plain "CSV (séparateur : point-virgule)" of a French Excel is Windows-1252,
 * which is the fallback. A byte-order mark is dropped.
 */
export function decodeCsvBytes(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder('windows-1252').decode(bytes);
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

const DELIMITERS = [';', ',', '\t'] as const;

/** The delimiter found most often in the first line, outside quotes. */
export function detectDelimiter(text: string): string {
  const counts = new Map<string, number>(DELIMITERS.map((d) => [d, 0]));
  let quoted = false;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === '\n' || char === '\r')) break;
    else if (!quoted && counts.has(char)) counts.set(char, counts.get(char)! + 1);
  }
  let best: string = ';';
  for (const delimiter of DELIMITERS) {
    if (counts.get(delimiter)! > counts.get(best)!) best = delimiter;
  }
  return best;
}

/**
 * RFC 4180 records: quoted cells may hold the delimiter, line breaks and
 * doubled quotes. Each record keeps the line it starts on, for the preview.
 */
export function parseCsvRecords(
  text: string,
  delimiter = detectDelimiter(text),
): { line: number; cells: string[] }[] {
  const records: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let recordLine = 1;

  const endCell = () => {
    cells.push(cell);
    cell = '';
  };
  const endRecord = () => {
    endCell();
    records.push({ line: recordLine, cells });
    cells = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        if (char === '\n') line += 1;
        cell += char;
      }
      continue;
    }
    if (char === '"' && cell === '') quoted = true;
    else if (char === delimiter) endCell();
    else if (char === '\r' || char === '\n') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      endRecord();
      line += 1;
      recordLine = line;
    } else cell += char;
  }
  if (cell !== '' || cells.length > 0) endRecord();

  // Blank lines, which spreadsheets like to leave at the end, are not rows.
  return records.filter((record) => record.cells.some((value) => value.trim() !== ''));
}

// ── The header ──────────────────────────────────────────────

/** "Téléphone 2", "TELEPHONE_2" and " telephone 2 " all name `telephone_2`. */
export function normalizeHeader(header: string): string {
  return normalizeForMatch(header).replace(/[\s-]+/g, '_');
}

export const CsvFileErrorCode = {
  FICHIER_VIDE: 'FICHIER_VIDE',
  COLONNES_MANQUANTES: 'COLONNES_MANQUANTES',
  COLONNES_INCONNUES: 'COLONNES_INCONNUES',
  COLONNE_EN_DOUBLE: 'COLONNE_EN_DOUBLE',
  TROP_DE_LIGNES: 'TROP_DE_LIGNES',
} as const;
export type CsvFileErrorCode = (typeof CsvFileErrorCode)[keyof typeof CsvFileErrorCode];

export interface CsvFileError {
  code: CsvFileErrorCode;
  message: string;
}

/** One data line of the file, its cells named by column. */
export interface CsvDataRow {
  line: number;
  cells: Partial<Record<CsvColumn, string>>;
  /** Set when the line has a different number of cells than the header. */
  cellCountMismatch?: { expected: number; found: number };
}

export type CsvFileRead =
  { ok: true; columns: CsvColumn[]; rows: CsvDataRow[] } | { ok: false; error: CsvFileError };

/** The text of a file, read into named rows, or the reason the file cannot be read. */
export function readCsvFile(text: string): CsvFileRead {
  const [header, ...data] = parseCsvRecords(text);
  if (!header) {
    return {
      ok: false,
      error: { code: CsvFileErrorCode.FICHIER_VIDE, message: 'Le fichier est vide.' },
    };
  }
  const known = new Set<string>(CSV_TEMPLATE_COLUMNS);
  const columns = header.cells.map(normalizeHeader);

  const unknown = header.cells.filter((_, i) => !known.has(columns[i]!));
  if (unknown.length > 0) {
    return {
      ok: false,
      error: {
        code: CsvFileErrorCode.COLONNES_INCONNUES,
        message: `Colonne inconnue : ${unknown.join(', ')}. Utilisez les colonnes du modèle.`,
      },
    };
  }
  const duplicate = columns.find((column, i) => columns.indexOf(column) !== i);
  if (duplicate) {
    return {
      ok: false,
      error: {
        code: CsvFileErrorCode.COLONNE_EN_DOUBLE,
        message: `La colonne ${duplicate} apparaît deux fois.`,
      },
    };
  }
  const missing = CSV_REQUIRED_COLUMNS.filter((column) => !columns.includes(column));
  if (missing.length > 0) {
    return {
      ok: false,
      error: {
        code: CsvFileErrorCode.COLONNES_MANQUANTES,
        message: `Colonne obligatoire absente : ${missing.join(', ')}.`,
      },
    };
  }
  if (data.length === 0) {
    return {
      ok: false,
      error: {
        code: CsvFileErrorCode.FICHIER_VIDE,
        message: 'Le fichier ne contient aucun colis.',
      },
    };
  }
  if (data.length > CSV_MAX_ROWS) {
    return {
      ok: false,
      error: {
        code: CsvFileErrorCode.TROP_DE_LIGNES,
        message: `${data.length} colis dans le fichier : ${CSV_MAX_ROWS} au maximum par import.`,
      },
    };
  }

  const rows = data.map((record): CsvDataRow => {
    const cells: Partial<Record<CsvColumn, string>> = {};
    columns.forEach((column, i) => {
      cells[column as CsvColumn] = (record.cells[i] ?? '').trim();
    });
    const row: CsvDataRow = { line: record.line, cells };
    if (record.cells.length !== columns.length) {
      row.cellCountMismatch = { expected: columns.length, found: record.cells.length };
    }
    return row;
  });
  return { ok: true, columns: columns as CsvColumn[], rows };
}

// ── One row ─────────────────────────────────────────────────

/** Échange and Ouverture autorisée: oui, non, 1, 0, any case; empty is non (D-37). */
export function parseYesNo(value: string | undefined): boolean | null {
  const text = (value ?? '').trim().toLowerCase();
  if (text === '' || text === 'non' || text === '0') return false;
  if (text === 'oui' || text === '1') return true;
  return null;
}

/** Which CSV column each field of the parcel form comes from. */
const FIELD_COLUMNS: Record<string, CsvColumn> = {
  recipientName: 'nom_destinataire',
  recipientPhone: 'telephone',
  recipientPhone2: 'telephone_2',
  address: 'adresse',
  landmark: 'repere',
  productDescription: 'description_produit',
  pieceCount: 'nombre_de_pieces',
  codAmountMillimes: 'montant_cod',
  courierNote: 'note_coursier',
};

/** Every field the form checks, except the localité, which the CSV resolves by name. */
const rowFieldsSchema = createParcelSchema.omit({ localiteId: true });

export interface CsvRowProblem {
  column: CsvColumn | null;
  message: string;
}

export interface CsvRowEvaluation {
  line: number;
  verdict: CsvRowVerdict;
  problems: CsvRowProblem[];
  /** The localité the row settled on, by name or by the seller's choice. */
  localite: LocaliteRecord | null;
  /** When the localité is not settled: why, and what the dropdown offers (D-17). */
  localiteIssue: { error: LocaliteLookupError; message: string; options: LocaliteRecord[] } | null;
  /** Set only for a Valide row: exactly what Créer un colis receives. */
  values: CreateParcelValues | null;
}

/**
 * The verdict of one row (D-37). A localité problem the seller can settle in
 * the preview's dropdown is À vérifier; any other problem is Erreur; a row
 * with nothing wrong is Valide. `chosenLocaliteId` is the seller's pick in
 * that dropdown, accepted only among the options it offered.
 */
export function evaluateCsvRow(
  row: CsvDataRow,
  localites: readonly LocaliteRecord[],
  chosenLocaliteId?: string | null,
): CsvRowEvaluation {
  const problems: CsvRowProblem[] = [];
  const { cells } = row;

  if (row.cellCountMismatch) {
    const { expected, found } = row.cellCountMismatch;
    problems.push({
      column: null,
      message:
        `${found} cellules au lieu de ${expected}. Un montant avec une virgule doit être ` +
        'entre guillemets, ou enregistrez le fichier avec le point-virgule comme séparateur.',
    });
  }

  for (const [column, value] of Object.entries(cells) as [CsvColumn, string][]) {
    if (value.length > CSV_MAX_CELL_LENGTH) {
      problems.push({
        column,
        message: `Texte trop long : ${CSV_MAX_CELL_LENGTH} caractères maximum`,
      });
    }
  }

  const input: Record<string, unknown> = {};
  for (const [field, column] of Object.entries(FIELD_COLUMNS)) {
    const value = cells[column];
    if (value !== undefined && value !== '') input[field] = value;
  }
  // The form sends empty optional texts as null; required ones stay missing.
  input.recipientName ??= '';
  input.recipientPhone ??= '';
  input.address ??= '';
  input.productDescription ??= '';
  input.codAmountMillimes ??= '';

  for (const [field, column] of [
    ['isExchange', 'colis_echange'],
    ['openingAllowed', 'ouverture_autorisee'],
  ] as const) {
    const parsed = parseYesNo(cells[column]);
    if (parsed === null) problems.push({ column, message: 'Indiquez oui ou non' });
    else input[field] = parsed;
  }

  const parsed = rowFieldsSchema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const column = FIELD_COLUMNS[String(issue.path[0])] ?? null;
      if (!problems.some((p) => p.column === column && column !== null)) {
        problems.push({ column, message: issue.message });
      }
    }
  }

  let localite: LocaliteRecord | null = null;
  let localiteIssue: CsvRowEvaluation['localiteIssue'] = null;
  const lookup = resolveLocalite(
    { localite: cells.localite, delegation: cells.delegation, gouvernorat: cells.gouvernorat },
    localites,
  );
  if (lookup.ok) {
    localite = lookup.localite;
  } else {
    const chosen = chosenLocaliteId
      ? lookup.options.find((option) => option.id === chosenLocaliteId)
      : undefined;
    if (chosen) localite = chosen;
    else localiteIssue = { error: lookup.error, message: lookup.message, options: lookup.options };
  }

  const fieldsOk = problems.length === 0 && parsed.success;
  let verdict: CsvRowVerdict;
  if (!fieldsOk) verdict = CsvRowVerdict.ERREUR;
  else if (localite) verdict = CsvRowVerdict.VALIDE;
  // Nothing to choose from: the seller must fix the file.
  else
    verdict = localiteIssue!.options.length > 0 ? CsvRowVerdict.A_VERIFIER : CsvRowVerdict.ERREUR;

  if (localiteIssue && verdict === CsvRowVerdict.ERREUR) {
    problems.push({ column: 'localite', message: localiteIssue.message });
  }

  return {
    line: row.line,
    verdict,
    problems,
    localite,
    localiteIssue,
    values:
      verdict === CsvRowVerdict.VALIDE && parsed.success
        ? { ...parsed.data, localiteId: localite!.id }
        : null,
  };
}

// ── The downloads of the template page ──────────────────────

/** U+FEFF at the start of a file: Excel reads the rest as UTF-8. */
export const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

function csvLine(cells: readonly string[]): string {
  return cells
    .map((cell) => (/[";\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell))
    .join(';');
}

/**
 * Télécharger le modèle: the columns only, separated by semicolons, with a
 * byte-order mark so a French Excel opens it with its accents intact.
 */
export function csvTemplate(): string {
  return `${BYTE_ORDER_MARK}${csvLine(CSV_TEMPLATE_COLUMNS)}\r\n`;
}

/** The délégation list with codes offered beside the template (Q5). */
export function delegationListCsv(tree: GeoTreeView): string {
  const lines = [csvLine(['code', 'delegation', 'gouvernorat'])];
  for (const gouvernorat of tree.gouvernorats) {
    for (const delegation of gouvernorat.delegations) {
      lines.push(csvLine([delegation.code, delegation.nameFr, gouvernorat.nameFr]));
    }
  }
  return `${BYTE_ORDER_MARK}${lines.join('\r\n')}\r\n`;
}

// ── What the screen sends ───────────────────────────────────

/**
 * POST /parcels/imports: the rows the seller imports, as read from his file,
 * with his dropdown choices. The server evaluates each row again.
 */
export const csvImportRequestSchema = z.object({
  /** Drawn by the screen for this file: a retried import creates nothing twice. */
  importId: z.string().uuid(),
  fileName: z.string().trim().min(1).max(200),
  rows: z
    .array(
      z.object({
        line: z.number().int().min(2),
        cells: z.record(z.string().max(CSV_MAX_CELL_LENGTH)),
        localiteId: z.string().uuid().optional().nullable(),
      }),
    )
    .min(1, 'Aucun colis à importer')
    .max(CSV_MAX_ROWS, `${CSV_MAX_ROWS} colis au maximum par import`),
});
export type CsvImportRequest = z.output<typeof csvImportRequestSchema>;
