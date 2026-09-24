import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CSV_TEMPLATE_COLUMNS, type GeoTreeView } from '@faffago/shared';
import { CsvImportScreen } from '@/components/csv-import-screen';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

const bff = vi.fn();
vi.mock('@/lib/client/call', () => ({ bff: (...args: unknown[]) => bff(...args) }));

beforeEach(() => bff.mockReset());

const ENNASR = '5d0c2a8e-1f3b-4c6d-9e7f-0a1b2c3d4e5f';
const GHAZELA_ARIANA = '6e1d3b9f-2a4c-4d7e-8f90-1b2c3d4e5f60';
const GHAZELA_MARSA = '7f2e4c0a-3b5d-4e8f-9a01-2c3d4e5f6071';

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
              id: ENNASR,
              nameFr: 'Cité Ennasr 1',
              nameAr: null,
              postalCode: '2037',
              aliases: ['Ennasr'],
              isOther: false,
            },
            {
              id: GHAZELA_ARIANA,
              nameFr: 'Cité El Ghazela',
              nameAr: null,
              postalCode: null,
              aliases: [],
              isOther: false,
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
              id: GHAZELA_MARSA,
              nameFr: 'Cité El Ghazela',
              nameAr: null,
              postalCode: null,
              aliases: [],
              isOther: false,
            },
          ],
        },
      ],
    },
  ],
};

const HEADER = CSV_TEMPLATE_COLUMNS.join(';');
const line = (name: string, phone: string, localite: string) =>
  `${name};${phone};;;;${localite};12 rue de Marseille;;2 bracelets;1;85,000;non;oui;`;

function csvFile(lines: string[], name = 'commandes.csv'): File {
  return new File([[HEADER, ...lines].join('\r\n')], name, { type: 'text/csv' });
}

async function load(user: ReturnType<typeof userEvent.setup>, file: File) {
  render(<CsvImportScreen tree={tree} readOnly={false} suspended={false} />);
  await user.upload(screen.getByLabelText('Fichier CSV'), file);
  // The file is read asynchronously: wait for its preview, or its refusal.
  await waitFor(() =>
    expect(screen.queryByRole('table') ?? screen.queryByRole('alert')).not.toBeNull(),
  );
}

describe('Import CSV (Vendeur 4.3, D-37)', () => {
  it('previews every row as Valide, À vérifier or Erreur, with the reason', async () => {
    const user = userEvent.setup();
    await load(
      user,
      csvFile([
        line('Amira', '29876543', 'Ennasr'),
        line('Karim', '1234', 'Ennasr'),
        line('Sonia', '98765432', 'Cité El Ghazela'),
      ]),
    );
    expect(screen.getByText(/1 valide · 1 à vérifier · 1 erreur/)).toBeTruthy();
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]!).getByText('Valide')).toBeTruthy();
    expect(within(rows[0]!).getByText('Cité Ennasr 1 — Ariana Ville, Ariana')).toBeTruthy();
    expect(within(rows[1]!).getByText('Erreur')).toBeTruthy();
    expect(within(rows[1]!).getByText('telephone : 8 chiffres, format tunisien')).toBeTruthy();
    expect(within(rows[2]!).getByText('À vérifier')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Importer 1 colis' })).toBeTruthy();
  });

  it('turns an ambiguous row Valide once the seller picks its localité (D-17)', async () => {
    const user = userEvent.setup();
    await load(user, csvFile([line('Sonia', '98765432', 'Cité El Ghazela')]));
    await user.selectOptions(screen.getByLabelText('Localité de la ligne 2'), GHAZELA_MARSA);
    expect(screen.getByText(/1 valide · 0 à vérifier · 0 erreur/)).toBeTruthy();
  });

  it('sends only the Valide rows, with the seller’s choice, and shows the codes', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({
      ok: true,
      data: {
        id: 'i1',
        fileName: 'commandes.csv',
        parcelCount: 2,
        createdAt: '2026-09-24T10:00:00.000Z',
        parcels: [
          { line: 2, code: 'FG-AAAAAAAA', recipientName: 'Amira', codAmountMillimes: '85000' },
          { line: 4, code: 'FG-BBBBBBBB', recipientName: 'Sonia', codAmountMillimes: '85000' },
        ],
      },
    });
    await load(
      user,
      csvFile([
        line('Amira', '29876543', 'Ennasr'),
        line('Karim', '1234', 'Ennasr'),
        line('Sonia', '98765432', 'Cité El Ghazela'),
      ]),
    );
    await user.selectOptions(screen.getByLabelText('Localité de la ligne 4'), GHAZELA_MARSA);
    await user.click(screen.getByRole('button', { name: 'Importer 2 colis' }));

    const [method, path, body] = bff.mock.calls[0]!;
    expect([method, path]).toEqual(['POST', 'parcels/imports']);
    expect(body.fileName).toBe('commandes.csv');
    expect(body.importId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.rows.map((r: { line: number }) => r.line)).toEqual([2, 4]);
    expect(body.rows[1].localiteId).toBe(GHAZELA_MARSA);
    expect(body.rows[0].cells).toMatchObject({ nom_destinataire: 'Amira', montant_cod: '85,000' });

    expect(screen.getByRole('status').textContent).toContain('2 colis importés');
    expect(screen.getByRole('link', { name: 'FG-BBBBBBBB' }).getAttribute('href')).toBe(
      '/vendeur/colis/FG-BBBBBBBB',
    );
    // Imprimer toutes les étiquettes: every parcel of the file, in one PDF.
    expect(screen.getByRole('link', { name: 'A4 (4 par page)' }).getAttribute('href')).toBe(
      '/api/bff/parcels/imports/i1/labels?format=A4',
    );
  });

  it('shows the rows the server refused, and imported nothing', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({
      ok: false,
      status: 422,
      error: {
        code: 'LIGNES_REFUSEES',
        message: '1 ligne refusée : aucun colis n’a été importé. Corrigez-les dans l’aperçu.',
        rows: [{ line: 2, verdict: 'A_VERIFIER', problems: [] }],
      },
    });
    await load(user, csvFile([line('Amira', '29876543', 'Ennasr')]));
    await user.click(screen.getByRole('button', { name: 'Importer 1 colis' }));
    expect(screen.getByRole('alert').textContent).toContain('aucun colis n’a été importé');
    const [row] = screen.getAllByRole('row').slice(1);
    expect(within(row!).getByText('À vérifier')).toBeTruthy();
    expect(within(row!).getByText(/rechargez la page/)).toBeTruthy();
  });

  it('refuses a file that is not the template, before any row', async () => {
    const user = userEvent.setup();
    await load(user, new File(['nom;tel\nAmira;2987'], 'autre.csv'));
    expect(screen.getByRole('alert').textContent).toContain('Colonne inconnue');
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('reads a French Excel file saved in Windows-1252', async () => {
    const user = userEvent.setup();
    const text = [HEADER, line('Amira Béji', '29876543', 'Ennasr')].join('\r\n');
    const bytes = Uint8Array.from(text, (char) => (char === 'é' ? 0xe9 : char.charCodeAt(0)));
    await load(user, new File([bytes], 'excel.csv'));
    expect(screen.getByText('Amira Béji')).toBeTruthy();
  });

  it('offers no file input to a suspended seller or in "Voir comme le vendeur"', () => {
    const { unmount } = render(<CsvImportScreen tree={tree} readOnly={false} suspended />);
    expect(screen.queryByLabelText('Fichier CSV')).toBeNull();
    unmount();
    render(<CsvImportScreen tree={tree} readOnly suspended={false} />);
    expect(screen.queryByLabelText('Fichier CSV')).toBeNull();
    expect(screen.getByRole('button', { name: 'Télécharger le modèle' })).toBeTruthy();
  });
});
