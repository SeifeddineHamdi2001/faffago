import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReportKind, formatDT, type ReportTable } from '@faffago/shared';
import { ReportsScreen } from '@/components/reports-screen';
import { SellerPaiementsScreen } from '@/components/seller-money-screens';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const retenue: ReportTable = {
  kind: ReportKind.RETENUE,
  title: 'Retenue à la source',
  period: 'Septembre 2026',
  sections: [
    {
      title: 'Par vendeur',
      columns: [
        { key: 'shop', label: 'Boutique', type: 'text' },
        { key: 'count', label: 'Bons', type: 'count' },
        { key: 'amount', label: 'Retenue', type: 'money' },
      ],
      rows: [{ sellerId: 's1', shop: 'Chic', count: 2, amount: '9060' }],
      totals: { shop: 'Total', count: 2, amount: '9060' },
    },
    {
      title: 'Certificats',
      columns: [
        { key: 'kind', label: 'Ligne', type: 'text' },
        { key: 'number', label: 'Certificat', type: 'text' },
        { key: 'amount', label: 'Retenue', type: 'money' },
      ],
      rows: [
        { certificateId: 'c1', kind: 'Régularisation', number: 'RS-2026-0001', amount: '-4530' },
      ],
    },
  ],
};

describe('Rapports (Admin 4.13, D-89)', () => {
  it('shows the report, its period, the exports and the certificate links', () => {
    render(
      <ReportsScreen
        kind={ReportKind.RETENUE}
        month="2026-09"
        range={{ from: '2026-09-01', to: '2026-09-26' }}
        query="mois=2026-09"
        table={retenue}
        periodError={false}
        year="2026"
      />,
    );
    expect(screen.getByText('Retenue à la source · Septembre 2026')).toBeInTheDocument();
    expect(screen.getByLabelText('Mois')).toHaveValue('2026-09');
    expect(screen.getByRole('link', { name: 'Exporter Excel' })).toHaveAttribute(
      'href',
      '/api/bff/rapports/retenue?mois=2026-09&format=xlsx',
    );
    const bySeller = screen.getByRole('region', { name: 'Par vendeur' });
    expect(within(bySeller).getAllByText(formatDT(9060n, { suffix: false }))).toHaveLength(2);
    expect(within(bySeller).getByRole('link', { name: 'Récapitulatif 2026' })).toHaveAttribute(
      'href',
      '/api/bff/rapports/retenue/vendeurs/s1/annuel/2026/pdf',
    );
    const lines = screen.getByRole('region', { name: 'Certificats' });
    expect(within(lines).getByText('-4,530')).toBeInTheDocument();
    expect(within(lines).getByRole('link', { name: 'Certificat' })).toHaveAttribute(
      'href',
      '/api/bff/rapports/retenue/certificats/c1/pdf',
    );
  });

  it('takes a range of days for the other reports, and says when it cannot be read', () => {
    render(
      <ReportsScreen
        kind={ReportKind.ARGENT}
        month="2026-09"
        range={{ from: '2026-09-01', to: '2026-09-26' }}
        query="from=2026-09-01&to=2026-09-26"
        table={null}
        periodError
        year="2026"
      />,
    );
    expect(screen.getByLabelText('Du')).toHaveValue('2026-09-01');
    expect(screen.getByRole('alert')).toHaveTextContent('Période invalide');
    expect(screen.getByRole('link', { name: 'Argent' })).toHaveAttribute('aria-current', 'page');
  });
});

describe('the seller’s certificates (Vendeur 4.11, D-89)', () => {
  it('lists each certificate and the yearly summary to download, a corrected one marked', () => {
    render(
      <SellerPaiementsScreen
        canPrint
        data={{
          aRecevoir: {
            parcelCount: 0,
            chezLesCoursiersMillimes: '0',
            auDepotMillimes: '0',
            totalMillimes: '0',
            fraisADeduireMillimes: '0',
            parcels: [],
          },
          bons: [],
        }}
        certificates={{
          parBon: true,
          annuel: true,
          years: ['2026'],
          certificates: [
            {
              id: 'c2',
              number: 'RS-2026-0007',
              bonNumber: 'BV-2026-0925-01',
              issuedAt: '2026-09-25T09:00:00.000Z',
              baseMillimes: '151000',
              rateBps: 300,
              amountMillimes: '4530',
              cancelled: false,
            },
            {
              id: 'c1',
              number: 'RS-2026-0001',
              bonNumber: 'BV-2026-0925-01',
              issuedAt: '2026-09-24T09:00:00.000Z',
              baseMillimes: '151000',
              rateBps: 300,
              amountMillimes: '4530',
              cancelled: true,
            },
          ],
        }}
      />,
    );
    const section = screen.getByRole('region', { name: 'Certificats de retenue à la source' });
    expect(within(section).getByRole('link', { name: 'Récapitulatif 2026' })).toHaveAttribute(
      'href',
      '/api/bff/paiements/certificats/annuel/2026/pdf',
    );
    expect(within(section).getAllByRole('link', { name: 'Télécharger' })[0]).toHaveAttribute(
      'href',
      '/api/bff/paiements/certificats/c2/pdf',
    );
    expect(within(section).getByText(/Annulé · Correction Faffa Go/)).toBeInTheDocument();
  });
});
