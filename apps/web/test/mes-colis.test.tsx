import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { GeoTreeView } from '@faffago/shared';
import { MesColisScreen, mesColisHref, type ParcelFilters } from '@/components/mes-colis-screen';
import { ParcelScreen } from '@/components/parcel-screen';
import type { ParcelList, SellerParcelDetail } from '@/lib/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/lib/client/call', () => ({ bff: vi.fn() }));

const filters: ParcelFilters = { group: 'TOUS', q: '', from: '', to: '', page: 1 };

const list: ParcelList = {
  items: [
    {
      code: 'FG-AAAAAAAA',
      recipientName: 'Amira Ben Salah',
      recipientPhone: '29876543',
      delegationNameFr: 'Ariana Ville',
      localiteNameFr: 'Cité Ennasr 1',
      status: 'LIVRE',
      cashStatus: 'AU_DEPOT',
      codAmountMillimes: '85000',
      // 23:30 UTC is 00:30 the next day in Tunis.
      createdAt: '2026-09-24T23:30:00.000Z',
    },
    {
      code: 'FG-BBBBBBBB',
      recipientName: 'أمينة بن صالح',
      recipientPhone: '98765432',
      delegationNameFr: 'La Marsa',
      localiteNameFr: 'Sidi Bou Saïd',
      status: 'A_VERIFIER',
      cashStatus: null,
      codAmountMillimes: '40000',
      createdAt: '2026-09-24T10:00:00.000Z',
    },
  ],
  total: 120,
  page: 1,
  pageSize: 50,
  counts: {
    TOUS: 120,
    EN_COURS: 60,
    LIVRES: 40,
    A_VERIFIER: 5,
    PAYES: 30,
    NON_PAYES: 10,
    RETOURS: 15,
  },
};

describe('Mes colis (Vendeur 4.7)', () => {
  it('shows Tous, À vérifier, En cours, Livrés, Retours, with the seller’s own counts (D-46)', () => {
    render(<MesColisScreen list={list} filters={filters} readOnly={false} invalidFilter={false} />);
    const tabs = within(screen.getByRole('navigation', { name: 'Filtrer par statut' }));
    expect(tabs.getAllByRole('link').map((a) => a.textContent)).toEqual([
      'Tous (120)',
      'À vérifier (5)',
      'En cours (60)',
      'Livrés (40)',
      'Retours (15)',
    ]);
    expect(tabs.getByRole('link', { name: 'Tous (120)' }).getAttribute('aria-current')).toBe(
      'page',
    );
    // Payés and Non payés appear under Livrés only.
    expect(screen.queryByRole('navigation', { name: 'Livrés : paiement' })).toBeNull();
  });

  it('highlights À vérifier while a parcel waits for a decision, not when none does', () => {
    const { unmount } = render(
      <MesColisScreen list={list} filters={filters} readOnly={false} invalidFilter={false} />,
    );
    expect(
      screen.getByRole('link', { name: 'À vérifier (5)' }).getAttribute('data-attention'),
    ).toBe('true');
    expect(
      screen.getByRole('link', { name: 'En cours (60)' }).getAttribute('data-attention'),
    ).toBeNull();
    unmount();
    render(
      <MesColisScreen
        list={{ ...list, counts: { ...list.counts, A_VERIFIER: 0 } }}
        filters={filters}
        readOnly={false}
        invalidFilter={false}
      />,
    );
    expect(
      screen.getByRole('link', { name: 'À vérifier (0)' }).getAttribute('data-attention'),
    ).toBeNull();
  });

  it('shows Payés and Non payés as the two halves of Livrés', () => {
    render(
      <MesColisScreen
        list={list}
        filters={{ ...filters, group: 'NON_PAYES' }}
        readOnly={false}
        invalidFilter={false}
      />,
    );
    const sub = within(screen.getByRole('navigation', { name: 'Livrés : paiement' }));
    expect(sub.getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Payés (30)', '/vendeur/colis?groupe=PAYES'],
      ['Non payés (10)', '/vendeur/colis?groupe=NON_PAYES'],
    ]);
    expect(sub.getByRole('link', { name: 'Non payés (10)' }).getAttribute('aria-current')).toBe(
      'page',
    );
    // Livrés stays marked in the first row while one of its halves is shown.
    expect(screen.getByRole('link', { name: 'Livrés (40)' }).className).toContain('bg-orange');
  });

  it('shows a row per parcel: code, status, cash status, COD, and the date in Tunis time', () => {
    render(<MesColisScreen list={list} filters={filters} readOnly={false} invalidFilter={false} />);
    const [first] = screen.getAllByRole('row').slice(1);
    const row = within(first!);
    expect(row.getByRole('link', { name: 'FG-AAAAAAAA' }).getAttribute('href')).toBe(
      '/vendeur/colis/FG-AAAAAAAA',
    );
    expect(row.getByText('Livré')).toBeTruthy();
    expect(row.getByText('Au dépôt')).toBeTruthy();
    expect(row.getByText('85,000 DT')).toBeTruthy();
    expect(row.getByText(/25\/09\/2026/)).toBeTruthy();
  });

  it('keeps the filters in the address, and Exporter takes exactly them', () => {
    const current: ParcelFilters = {
      group: 'RETOURS',
      q: 'amira',
      from: '2026-09-01',
      to: '',
      page: 1,
    };
    render(<MesColisScreen list={list} filters={current} readOnly={false} invalidFilter={false} />);
    expect(screen.getByRole('link', { name: 'Exporter' }).getAttribute('href')).toBe(
      '/api/bff/parcels/export?group=RETOURS&q=amira&from=2026-09-01',
    );
    expect(mesColisHref(current, { page: 2 })).toBe(
      '/vendeur/colis?groupe=RETOURS&q=amira&du=2026-09-01&page=2',
    );
    expect(screen.getByRole('link', { name: 'Suivant' }).getAttribute('href')).toBe(
      '/vendeur/colis?groupe=RETOURS&q=amira&du=2026-09-01&page=2',
    );
  });

  it('prints the labels of the selected parcels in one batch (Vendeur 4.4)', async () => {
    const user = userEvent.setup();
    render(<MesColisScreen list={list} filters={filters} readOnly={false} invalidFilter={false} />);
    await user.click(screen.getByLabelText('Tout sélectionner sur cette page'));
    expect(screen.getByRole('link', { name: 'A4 (4 par page)' }).getAttribute('href')).toBe(
      '/api/bff/parcels/labels?codes=FG-AAAAAAAA,FG-BBBBBBBB&format=A4',
    );
    await user.click(screen.getByLabelText('Sélectionner FG-AAAAAAAA'));
    expect(screen.getByText('Imprimer 1 étiquette :')).toBeTruthy();
  });

  it('offers neither Exporter nor printing in "Voir comme le vendeur" (D-5)', () => {
    render(<MesColisScreen list={list} filters={filters} readOnly invalidFilter={false} />);
    expect(screen.queryByRole('link', { name: 'Exporter' })).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});

const tree: GeoTreeView = { gouvernorats: [] };

const detail: SellerParcelDetail = {
  id: 'p1',
  code: 'FG-8K2QX7AB',
  status: 'A_VERIFIER',
  location: 'AU_DEPOT',
  cashStatus: null,
  recipientName: 'Amira Ben Salah',
  recipientPhone: '29876543',
  recipientPhone2: null,
  localite: { id: 'l1', nameFr: 'Cité Ennasr 1' },
  delegation: { id: 'd1', nameFr: 'Ariana Ville', gouvernoratNameFr: 'Ariana' },
  address: '12 rue de Marseille',
  landmark: null,
  productDescription: '2 bracelets',
  pieceCount: 2,
  codAmountMillimes: '85000',
  isExchange: false,
  openingAllowed: false,
  courierNote: null,
  deliveryFeeMillimes: '5500',
  returnFeeMillimes: '2000',
  createdAt: '2026-09-24T09:00:00.000Z',
  cancelledAt: null,
  changeRequests: [],
  attemptCount: 1,
  maxAttempts: 3,
  lastFailureReason: 'NE_REPOND_PAS',
  bonNumber: null,
  timeline: [
    {
      type: 'CREATION',
      at: '2026-09-24T09:00:00.000Z',
      actor: { kind: 'VOUS' },
      location: 'CHEZ_LE_VENDEUR',
      failureReason: null,
      cancelledAfterPickup: false,
    },
    {
      type: 'RAMASSAGE',
      at: '2026-09-24T11:00:00.000Z',
      actor: { kind: 'COURSIER', firstName: 'Hamza' },
      location: 'AVEC_LE_RAMASSEUR',
      failureReason: null,
      cancelledAfterPickup: false,
    },
    {
      type: 'ECHEC_LIVRAISON',
      at: '2026-09-24T15:00:00.000Z',
      actor: { kind: 'COURSIER', firstName: 'Oussama' },
      location: 'AVEC_LE_LIVREUR',
      failureReason: 'NE_REPOND_PAS',
      cancelledAfterPickup: false,
    },
  ],
};

describe('Détail du colis (Vendeur 4.8)', () => {
  it('shows the track line and the attempt', () => {
    render(<ParcelScreen parcel={detail} tree={tree} readOnly={false} />);
    expect(screen.getByText(/Tentative 1 sur 3/)).toBeTruthy();
    const line = screen.getByRole('list', { name: 'Livraison : étape 4 sur 5' });
    expect(
      within(line)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Créé', 'Ramassé', 'Au dépôt', 'En livraison', 'Livré']);
  });

  it('shows the net as an estimate before retenue (D-40)', () => {
    render(<ParcelScreen parcel={detail} tree={tree} readOnly={false} />);
    const money = within(screen.getByRole('region', { name: 'Argent' }));
    expect(money.getByText('85,000 DT')).toBeTruthy();
    expect(money.getByText('− 5,500 DT')).toBeTruthy();
    expect(money.getByText('79,500 DT')).toBeTruthy();
    expect(money.getByText(/Estimation avant retenue à la source/)).toBeTruthy();
  });

  it('shows the return fee instead for a return, and the bon once paid', () => {
    const { unmount } = render(
      <ParcelScreen
        parcel={{ ...detail, status: 'RETOUR_AU_DEPOT' }}
        tree={tree}
        readOnly={false}
      />,
    );
    const money = within(screen.getByRole('region', { name: 'Argent' }));
    expect(money.getByText('− 2,000 DT')).toBeTruthy();
    expect(money.queryByText(/Net estimé/)).toBeNull();
    unmount();
    render(
      <ParcelScreen
        parcel={{ ...detail, status: 'LIVRE', cashStatus: 'PAYE', bonNumber: 'BV-2026-0921-01' }}
        tree={tree}
        readOnly={false}
      />,
    );
    expect(screen.getByText('Payé · BV-2026-0921-01')).toBeTruthy();
  });

  it('tells the history newest first: what, when, who by first name, where (D-38)', () => {
    render(<ParcelScreen parcel={detail} tree={tree} readOnly={false} />);
    const history = within(screen.getByRole('region', { name: 'Historique' }));
    const items = history.getAllByRole('listitem').map((li) => li.textContent);
    expect(items[0]).toContain('Échec de livraison · Ne répond pas');
    expect(items[0]).toContain('Oussama · Avec le livreur');
    expect(items[1]).toContain('Ramassé');
    expect(items[1]).toContain('Hamza');
    expect(items[2]).toContain('Colis créé');
    expect(items[2]).toContain('Vous · Chez le vendeur');
  });
});
