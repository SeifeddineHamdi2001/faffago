import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  SellerDashboardScreen,
  resolveDashboardPeriod,
} from '@/components/seller-dashboard-screen';
import type { SellerDashboard } from '@/lib/types';

const TODAY = '2026-09-25';

describe('the period in the address (D-48)', () => {
  it('is today by default', () => {
    expect(resolveDashboardPeriod({}, TODAY)).toEqual({
      period: 'AUJOURD_HUI',
      range: { from: TODAY, to: TODAY },
      invalid: null,
    });
  });

  it('reads a preset', () => {
    expect(resolveDashboardPeriod({ periode: 'SEPT_JOURS' }, TODAY)).toMatchObject({
      period: 'SEPT_JOURS',
      range: { from: '2026-09-19', to: TODAY },
    });
    expect(resolveDashboardPeriod({ periode: 'CE_MOIS' }, TODAY).range).toEqual({
      from: '2026-09-01',
      to: TODAY,
    });
  });

  it('reads a custom range', () => {
    expect(
      resolveDashboardPeriod(
        { periode: 'PERSONNALISE', du: '2026-08-03', au: '2026-09-05' },
        TODAY,
      ),
    ).toEqual({
      period: 'PERSONNALISE',
      range: { from: '2026-08-03', to: '2026-09-05' },
      invalid: null,
    });
  });

  it('falls back to today, and says why, when the range is refused', () => {
    const tooLong = resolveDashboardPeriod(
      { periode: 'PERSONNALISE', du: '2025-01-01', au: TODAY },
      TODAY,
    );
    expect(tooLong).toEqual({
      period: 'AUJOURD_HUI',
      range: { from: TODAY, to: TODAY },
      invalid: '366 jours au plus',
    });
    expect(resolveDashboardPeriod({ periode: 'PERSONNALISE', du: TODAY }, TODAY).invalid).toBe(
      'Indiquez la date de début et la date de fin',
    );
    expect(resolveDashboardPeriod({ periode: 'DEMAIN' }, TODAY).invalid).toBe('Période inconnue');
  });
});

const dashboard: SellerDashboard = {
  from: '2026-09-19',
  to: TODAY,
  counts: { CREES: 12, RAMASSES: 10, EN_LIVRAISON: 9, LIVRES: 7, ECHECS: 2, REPORTES: 1 },
  aRecevoir: {
    parcelCount: 3,
    chezLesCoursiersMillimes: '78000',
    auDepotMillimes: '156000',
    totalMillimes: '234000',
    fraisADeduireMillimes: '2000',
  },
  aTraiter: { bonsVersementEnRoute: 1, bonsRetourEnRoute: 0, retoursAuDepot: 2 },
  deliveryRate: {
    delivered: 7,
    returned: 1,
    rateBps: 8750,
    days: [
      { day: '2026-09-19', delivered: 0, returned: 0 },
      { day: '2026-09-20', delivered: 1, returned: 0 },
      { day: '2026-09-21', delivered: 2, returned: 1 },
      { day: '2026-09-22', delivered: 1, returned: 0 },
      { day: '2026-09-23', delivered: 1, returned: 0 },
      { day: '2026-09-24', delivered: 1, returned: 0 },
      { day: TODAY, delivered: 1, returned: 0 },
    ],
  },
};

function renderScreen(overrides: Partial<Parameters<typeof SellerDashboardScreen>[0]> = {}) {
  return render(
    <SellerDashboardScreen
      dashboard={dashboard}
      period="SEPT_JOURS"
      invalid={null}
      canCreate
      suspended={false}
      {...overrides}
    />,
  );
}

describe('Tableau de bord (Vendeur 4.1, D-48)', () => {
  it('titles the counts after the period and shows the six tiles in order', () => {
    renderScreen();
    const counts = screen.getByRole('region', { name: '7 derniers jours' });
    const tiles = within(counts)
      .getAllByRole('term')
      .map((term) => term.textContent);
    expect(tiles).toEqual(['Créés', 'Ramassés', 'En livraison', 'Livrés', 'Échecs', 'Reportés']);
    const values = within(counts)
      .getAllByRole('definition')
      .map((value) => value.textContent);
    expect(values).toEqual(['12', '10', '9', '7', '2', '1']);
  });

  it('marks the period chosen, and keeps a custom range in its fields', () => {
    renderScreen();
    expect(screen.getByRole('link', { name: '7 derniers jours' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Hier' })).toHaveAttribute(
      'href',
      '/vendeur?periode=HIER',
    );
    expect(screen.getByRole('link', { name: 'Aujourd’hui' })).toHaveAttribute('href', '/vendeur');
    expect(screen.getByLabelText('Du')).toHaveValue('2026-09-19');
    expect(screen.getByLabelText('Au')).toHaveValue(TODAY);
  });

  it('names the days of a custom range', () => {
    renderScreen({
      period: 'PERSONNALISE',
      dashboard: { ...dashboard, from: '2026-08-03', to: '2026-09-05' },
    });
    expect(screen.getByRole('region', { name: 'Du 03/08/2026 au 05/09/2026' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { current: 'page' })).toBeNull();
  });

  it('says a refused range was replaced by today', () => {
    renderScreen({ invalid: '366 jours au plus' });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Période invalide (366 jours au plus) : aujourd’hui est affiché.',
    );
  });

  it('offers the two quick actions', () => {
    renderScreen();
    expect(screen.getByRole('link', { name: 'Créer un colis' })).toHaveAttribute(
      'href',
      '/vendeur/colis/nouveau',
    );
    expect(screen.getByRole('link', { name: 'Demander un ramassage' })).toHaveAttribute(
      'href',
      '/vendeur/ramassages/nouveau',
    );
  });

  it('hides them from a suspended seller, and says why (Vendeur 2.5)', () => {
    renderScreen({ canCreate: false, suspended: true });
    expect(screen.queryByRole('link', { name: 'Créer un colis' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Demander un ramassage' })).toBeNull();
    expect(
      screen.getByText(
        'Votre compte est suspendu : vous ne pouvez pas créer de colis ni demander de ramassage.',
      ),
    ).toBeInTheDocument();
  });

  it('hides them under "Voir comme le vendeur", where the banner says enough (D-5)', () => {
    renderScreen({ canCreate: false, suspended: false });
    expect(screen.queryByRole('link', { name: 'Créer un colis' })).toBeNull();
    expect(screen.queryByText(/suspendu/)).toBeNull();
    expect(screen.getAllByRole('definition')).toHaveLength(6);
  });
});

describe('the money part (Vendeur 4.1, D-83)', () => {
  it('shows À recevoir split by where the cash is, what to deal with, and the delivery rate', () => {
    renderScreen();
    const hero = screen.getByRole('region', { name: 'À recevoir' });
    expect(within(hero).getByText('234,000 DT')).toBeInTheDocument();
    expect(hero).toHaveTextContent(
      'Chez les coursiers : 78,000 DT · Au dépôt, prêt à payer : 156,000 DT',
    );
    expect(hero).toHaveTextContent('Frais à déduire : 2,000 DT');
    const todo = screen.getByRole('region', { name: 'À traiter' });
    expect(
      within(todo).getByRole('link', { name: '1 bon(s) de versement en route' }),
    ).toHaveAttribute('href', '/vendeur/paiements');
    expect(within(todo).getByRole('link', { name: '2 retour(s) au dépôt' })).toBeInTheDocument();
    const rate = screen.getByRole('region', { name: 'Taux de livraison' });
    expect(within(rate).getByText('87,5 %')).toBeInTheDocument();
    expect(within(rate).getAllByRole('listitem')).toHaveLength(7);
  });
});
