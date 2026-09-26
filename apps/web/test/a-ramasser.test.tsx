import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ARamasserScreen } from '@/components/a-ramasser-screen';
import type { AwaitingParcel } from '@/lib/types';

const parcels: AwaitingParcel[] = [
  {
    code: 'FG-AAAA1111',
    recipientName: 'Amira Ben Salah',
    recipientPhone: '22123456',
    delegationNameFr: 'Ariana Ville',
    codAmountMillimes: '85000',
    createdAt: '2026-09-24T09:00:00.000Z',
    pickup: { id: 'pk-1', status: 'DEMANDE' },
  },
  {
    code: 'FG-BBBB2222',
    recipientName: 'Youssef Trabelsi',
    recipientPhone: '98765432',
    delegationNameFr: 'Le Bardo',
    codAmountMillimes: '42500',
    createdAt: '2026-09-24T09:05:00.000Z',
    pickup: null,
  },
];

describe('À ramasser (D-98)', () => {
  it('lists the Créé parcels, all selected for the labels, with their request', async () => {
    const user = userEvent.setup();
    render(<ARamasserScreen parcels={parcels} readOnly={false} canRequest />);
    expect(screen.getByText(/2 colis · 127,500 DT à encaisser/)).toBeInTheDocument();
    expect(screen.getByText('Imprimer 2 étiquettes :')).toBeInTheDocument();
    const thermal = screen
      .getAllByRole('link')
      .find((a) => a.getAttribute('href')?.includes('codes='));
    expect(thermal).toHaveAttribute(
      'href',
      expect.stringContaining('codes=FG-AAAA1111,FG-BBBB2222'),
    );
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]!).getByRole('link', { name: 'Demandé' })).toHaveAttribute(
      'href',
      '/vendeur/ramassages/pk-1',
    );
    expect(within(rows[2]!).getByText('Pas encore demandé')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Demander un ramassage' })).toBeInTheDocument();

    await user.click(screen.getByLabelText('Sélectionner FG-AAAA1111'));
    expect(screen.getByText('Imprimer 1 étiquette :')).toBeInTheDocument();
  });

  it('says so when nothing waits for a pickup', () => {
    render(<ARamasserScreen parcels={[]} readOnly={false} canRequest />);
    expect(screen.getByText('Aucun colis en attente de ramassage.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Imprimer la liste' })).toBeNull();
  });
});
