import { describe, expect, it } from 'vitest';
import {
  BYTE_ORDER_MARK,
  CSV_MAX_ROWS,
  csvImportRequestSchema,
  csvTemplate,
  decodeCsvBytes,
  delegationListCsv,
  detectDelimiter,
  evaluateCsvRow,
  normalizeHeader,
  parseCsvRecords,
  parseYesNo,
  readCsvFile,
  type CsvDataRow,
} from '../csv-import.js';
import { localitesOfTree, type GeoTreeView } from '../localites.js';
import { CSV_TEMPLATE_COLUMNS } from '../schemas.js';

const tree: GeoTreeView = {
  gouvernorats: [
    {
      code: 'ARI',
      nameFr: 'Ariana',
      nameAr: 'أريانة',
      delegations: [
        {
          id: 'd-ariana',
          code: 'ARI-VILLE',
          nameFr: 'Ariana Ville',
          nameAr: 'أريانة المدينة',
          localites: [
            {
              id: 'l-ennasr',
              nameFr: 'Cité Ennasr 1',
              nameAr: null,
              postalCode: '2037',
              aliases: ['Ennasr'],
              isOther: false,
            },
            {
              id: 'l-ghazela',
              nameFr: 'Cité El Ghazela',
              nameAr: null,
              postalCode: '2083',
              aliases: [],
              isOther: false,
            },
            {
              id: 'l-ari-autre',
              nameFr: 'Autre',
              nameAr: 'أخرى',
              postalCode: null,
              aliases: [],
              isOther: true,
            },
          ],
        },
      ],
    },
    {
      code: 'TUN',
      nameFr: 'Tunis',
      nameAr: 'تونس',
      delegations: [
        {
          id: 'd-marsa',
          code: 'TUN-MARSA',
          nameFr: 'La Marsa',
          nameAr: 'المرسى',
          localites: [
            {
              id: 'l-marsa-ghazela',
              nameFr: 'Cité El Ghazela',
              nameAr: null,
              postalCode: '2078',
              aliases: [],
              isOther: false,
            },
            {
              id: 'l-sidi-bou',
              nameFr: 'Sidi Bou Saïd',
              nameAr: null,
              postalCode: '2026',
              aliases: [],
              isOther: false,
            },
            {
              id: 'l-marsa-autre',
              nameFr: 'Autre',
              nameAr: 'أخرى',
              postalCode: null,
              aliases: [],
              isOther: true,
            },
          ],
        },
      ],
    },
  ],
};
const localites = localitesOfTree(tree);

function row(cells: Partial<Record<string, string>>, line = 2): CsvDataRow {
  return {
    line,
    cells: {
      nom_destinataire: 'Amira Ben Salah',
      telephone: '29876543',
      localite: 'Ennasr',
      adresse: '12 rue de Marseille',
      description_produit: '2 bracelets',
      montant_cod: '85,000',
      ...cells,
    },
  };
}

describe('reading the file', () => {
  it('reads UTF-8, drops the byte-order mark, and falls back to Windows-1252', () => {
    const utf8 = new TextEncoder().encode(`${BYTE_ORDER_MARK}nom_destinataire\nAmira Béji`);
    expect(decodeCsvBytes(utf8)).toBe('nom_destinataire\nAmira Béji');
    // "Béji" as a French Excel saves it: é is the single byte 0xE9.
    const cp1252 = new Uint8Array([0x42, 0xe9, 0x6a, 0x69]);
    expect(decodeCsvBytes(cp1252)).toBe('Béji');
  });

  it('finds the separator: semicolon, comma or tab', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',');
    expect(detectDelimiter('a\tb\n1\t2')).toBe('\t');
    // A comma inside quotes is not a separator.
    expect(detectDelimiter('"a,b";c\n')).toBe(';');
  });

  it('reads quoted cells with separators, doubled quotes and line breaks', () => {
    const records = parseCsvRecords(
      'nom;adresse;cod\r\n"Ben Salah; Amira";"Rue ""Ibn Khaldoun""\nbloc B";"85,000"\r\n\r\nX;Y;Z\r\n',
    );
    expect(records).toEqual([
      { line: 1, cells: ['nom', 'adresse', 'cod'] },
      { line: 2, cells: ['Ben Salah; Amira', 'Rue "Ibn Khaldoun"\nbloc B', '85,000'] },
      { line: 5, cells: ['X', 'Y', 'Z'] },
    ]);
  });

  it('names the columns whatever their case or accents', () => {
    expect(normalizeHeader(' Téléphone 2 ')).toBe('telephone_2');
    expect(normalizeHeader('MONTANT_COD')).toBe('montant_cod');
    expect(normalizeHeader('Nom-Destinataire')).toBe('nom_destinataire');
  });
});

describe('the file as a whole', () => {
  const header = CSV_TEMPLATE_COLUMNS.join(';');

  it('reads the template columns into named rows', () => {
    const read = readCsvFile(`${header}\nAmira;29876543;;;;Ennasr;12 rue;;Bracelets;1;85,000;;;`);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.rows[0]).toEqual({
      line: 2,
      cells: expect.objectContaining({
        nom_destinataire: 'Amira',
        localite: 'Ennasr',
        montant_cod: '85,000',
      }),
    });
  });

  it('accepts a file without the optional columns', () => {
    const read = readCsvFile(
      'nom_destinataire;telephone;localite;adresse;description_produit;montant_cod\nA;29876543;Ennasr;12 rue;x;1',
    );
    expect(read.ok).toBe(true);
  });

  it.each([
    ['', 'FICHIER_VIDE'],
    [`${header}\n`, 'FICHIER_VIDE'],
    ['nom_destinataire;telephone', 'COLONNES_MANQUANTES'],
    [`${header};telephone2`, 'COLONNES_INCONNUES'],
    [`${header};Téléphone`, 'COLONNE_EN_DOUBLE'],
  ])('refuses %j: %s', (text, code) => {
    const read = readCsvFile(text);
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.error.code).toBe(code);
  });

  it(`refuses more than ${CSV_MAX_ROWS} parcels (D-37)`, () => {
    const line = 'A;29876543;;;;Ennasr;12 rue;;x;1;85;;;';
    expect(readCsvFile([header, ...Array(CSV_MAX_ROWS).fill(line)].join('\n')).ok).toBe(true);
    const read = readCsvFile([header, ...Array(CSV_MAX_ROWS + 1).fill(line)].join('\n'));
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.error.code).toBe('TROP_DE_LIGNES');
  });

  it('flags a line split by an unquoted comma amount', () => {
    const read = readCsvFile(
      'nom_destinataire,telephone,localite,adresse,description_produit,montant_cod\nA,29876543,Ennasr,12 rue,x,85,000',
    );
    if (!read.ok) throw new Error('unexpected');
    expect(read.rows[0]!.cellCountMismatch).toEqual({ expected: 6, found: 7 });
    const evaluation = evaluateCsvRow(read.rows[0]!, localites);
    expect(evaluation.verdict).toBe('ERREUR');
    expect(evaluation.problems[0]!.message).toMatch(/entre guillemets/);
  });
});

describe('one row (D-37)', () => {
  it('is Valide with exactly what Créer un colis receives', () => {
    const evaluation = evaluateCsvRow(
      row({ colis_echange: 'OUI', ouverture_autorisee: '0', nombre_de_pieces: '' }),
      localites,
    );
    expect(evaluation.verdict).toBe('VALIDE');
    expect(evaluation.values).toMatchObject({
      recipientName: 'Amira Ben Salah',
      recipientPhone: '29876543',
      localiteId: 'l-ennasr',
      codAmountMillimes: 85000n,
      pieceCount: 1,
      isExchange: true,
      openingAllowed: false,
    });
  });

  it('reads oui, non, 1, 0 in any case; empty is non', () => {
    expect(['oui', 'Oui', '1', 'non', 'NON', '0', '', '  '].map(parseYesNo)).toEqual([
      true,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(parseYesNo('peut-être')).toBeNull();
  });

  it('is Erreur for a field the form refuses, with the same message', () => {
    const evaluation = evaluateCsvRow(
      row({ telephone: '1234', montant_cod: '85,0001' }),
      localites,
    );
    expect(evaluation.verdict).toBe('ERREUR');
    expect(evaluation.problems).toEqual([
      { column: 'telephone', message: '8 chiffres, format tunisien' },
      { column: 'montant_cod', message: 'Montant invalide. Format : 85,000' },
    ]);
    expect(evaluation.values).toBeNull();
  });

  it('is Erreur for a cell too long, never cut short', () => {
    const evaluation = evaluateCsvRow(row({ repere: 'x'.repeat(501) }), localites);
    expect(evaluation.verdict).toBe('ERREUR');
    expect(evaluation.problems[0]).toEqual({
      column: 'repere',
      message: 'Texte trop long : 500 caractères maximum',
    });
  });

  it('is Erreur for an échange that is neither oui nor non', () => {
    const evaluation = evaluateCsvRow(row({ colis_echange: 'peut-être' }), localites);
    expect(evaluation.problems).toEqual([
      { column: 'colis_echange', message: 'Indiquez oui ou non' },
    ]);
  });

  it('is À vérifier for an ambiguous name, offering the candidates (D-17)', () => {
    const evaluation = evaluateCsvRow(row({ localite: 'Cité El Ghazela' }), localites);
    expect(evaluation.verdict).toBe('A_VERIFIER');
    expect(evaluation.localiteIssue!.options.map((l) => l.id).sort()).toEqual(
      ['l-ghazela', 'l-marsa-ghazela'].sort(),
    );
  });

  it('is À vérifier for an unknown name in a known délégation, offering its localités, Autre last', () => {
    const evaluation = evaluateCsvRow(
      row({ localite: 'Quartier inconnu', delegation: 'TUN-MARSA' }),
      localites,
    );
    expect(evaluation.verdict).toBe('A_VERIFIER');
    expect(evaluation.localiteIssue!.options.map((l) => l.nameFr)).toEqual([
      'Cité El Ghazela',
      'Sidi Bou Saïd',
      'Autre',
    ]);
  });

  it('is À vérifier for a délégation with no localité', () => {
    const evaluation = evaluateCsvRow(row({ localite: '', delegation: 'La Marsa' }), localites);
    expect(evaluation.verdict).toBe('A_VERIFIER');
  });

  it('is Erreur for an unknown name with nothing to choose from', () => {
    const evaluation = evaluateCsvRow(row({ localite: 'Quartier inconnu' }), localites);
    expect(evaluation.verdict).toBe('ERREUR');
    expect(evaluation.problems).toEqual([
      { column: 'localite', message: evaluation.localiteIssue!.message },
    ]);
  });

  it("becomes Valide with the seller's choice among the options, never another", () => {
    const ambiguous = row({ localite: 'Cité El Ghazela' });
    const fixed = evaluateCsvRow(ambiguous, localites, 'l-marsa-ghazela');
    expect(fixed.verdict).toBe('VALIDE');
    expect(fixed.values!.localiteId).toBe('l-marsa-ghazela');
    // Sidi Bou Saïd was not among the candidates: the choice is ignored.
    expect(evaluateCsvRow(ambiguous, localites, 'l-sidi-bou').verdict).toBe('A_VERIFIER');
  });

  it('stays Erreur when a field is wrong, whatever the localité', () => {
    const evaluation = evaluateCsvRow(
      row({ localite: 'Cité El Ghazela', telephone: '12' }),
      localites,
      'l-ghazela',
    );
    expect(evaluation.verdict).toBe('ERREUR');
  });
});

describe('the downloads', () => {
  it('the template: the columns, semicolons, and a byte-order mark for Excel', () => {
    expect(csvTemplate()).toBe(`${BYTE_ORDER_MARK}${CSV_TEMPLATE_COLUMNS.join(';')}\r\n`);
    const read = readCsvFile(decodeCsvBytes(new TextEncoder().encode(csvTemplate())));
    expect(read.ok).toBe(false); // the template has no parcel yet
    if (!read.ok) expect(read.error.message).toBe('Le fichier ne contient aucun colis.');
  });

  it('the délégation list with codes (Q5)', () => {
    expect(delegationListCsv(tree).split('\r\n')).toEqual([
      `${BYTE_ORDER_MARK}code;delegation;gouvernorat`,
      'ARI-VILLE;Ariana Ville;Ariana',
      'TUN-MARSA;La Marsa;Tunis',
      '',
    ]);
  });
});

describe('the import request', () => {
  const id = '0b5f4c3e-8a2d-4f1e-9c7b-6a5d4e3f2a1b';
  it(`takes 1 to ${CSV_MAX_ROWS} rows`, () => {
    const one = { line: 2, cells: { telephone: '29876543' } };
    expect(
      csvImportRequestSchema.safeParse({ importId: id, fileName: 'a.csv', rows: [one] }).success,
    ).toBe(true);
    expect(
      csvImportRequestSchema.safeParse({ importId: id, fileName: 'a.csv', rows: [] }).success,
    ).toBe(false);
    expect(
      csvImportRequestSchema.safeParse({
        importId: id,
        fileName: 'a.csv',
        rows: Array(CSV_MAX_ROWS + 1).fill(one),
      }).success,
    ).toBe(false);
  });
});
