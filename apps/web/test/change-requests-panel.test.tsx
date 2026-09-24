import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSIONS_BY_ROLE } from '@faffago/shared';
import { ChangeRequestsPanel } from '@/components/change-requests-panel';
import type { ChangeRequestRow } from '@/lib/types';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const bff = vi.fn();
vi.mock('@/lib/client/call', () => ({ bff: (...args: unknown[]) => bff(...args) }));

const waiting: ChangeRequestRow = {
  id: 'r1',
  status: 'EN_ATTENTE',
  createdAt: '2026-09-25T08:00:00.000Z',
  editedAt: null,
  handledAt: null,
  sellerNote: 'Le client a déménagé',
  refusalReason: null,
  parcel: { code: 'FG-AAAAAAAA', status: 'AU_DEPOT', location: 'AU_DEPOT', shopName: 'Boutique' },
  fields: [
    { field: 'recipientPhone', before: '29876543', after: '98765432' },
    { field: 'localiteId', before: 'Gammart — La Marsa', after: 'Khaznadar — Le Bardo' },
  ],
  applyRefusal: null,
  applyRefusalMessage: null,
};

beforeEach(() => {
  bff.mockReset();
  refresh.mockReset();
});

describe('ChangeRequestsPanel (Vendeur 4.6, D-57)', () => {
  it('shows each field asked, before and after, and the seller’s note', () => {
    render(
      <ChangeRequestsPanel
        requests={[waiting]}
        permissions={[...PERMISSIONS_BY_ROLE.SERVICE_CLIENT]}
      />,
    );
    const item = screen.getAllByRole('listitem')[0]!;
    expect(item).toHaveTextContent('En attente');
    expect(item).toHaveTextContent('Téléphone : 29876543 → 98765432');
    expect(item).toHaveTextContent('Localité : Gammart — La Marsa → Khaznadar — Le Bardo');
    expect(item).toHaveTextContent('« Le client a déménagé »');
  });

  it('applies a request', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({ ok: true, data: { ...waiting, status: 'APPLIQUEE' } });
    render(
      <ChangeRequestsPanel
        requests={[waiting]}
        permissions={[...PERMISSIONS_BY_ROLE.SERVICE_CLIENT]}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Appliquer' }));
    expect(bff).toHaveBeenCalledWith('POST', 'demandes-modification/r1/apply');
    expect(refresh).toHaveBeenCalled();
  });

  it('says why a request cannot be applied yet, button off', () => {
    render(
      <ChangeRequestsPanel
        requests={[
          {
            ...waiting,
            applyRefusal: 'LOCALITE_HORS_DEPOT',
            applyRefusalMessage:
              'Nouvelle localité : la demande s’applique quand le colis est au dépôt.',
          },
        ]}
        permissions={[...PERMISSIONS_BY_ROLE.SERVICE_CLIENT]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Appliquer' })).toBeDisabled();
    expect(screen.getByText(/s’applique quand le colis est au dépôt/)).toBeInTheDocument();
  });

  it('refuses with a reason the seller will read', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({ ok: true, data: { ...waiting, status: 'REFUSEE' } });
    render(
      <ChangeRequestsPanel
        requests={[waiting]}
        permissions={[...PERMISSIONS_BY_ROLE.SERVICE_CLIENT]}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Refuser' }));
    const dialog = screen.getByRole('dialog', { name: 'Refuser la demande' });
    expect(dialog).toHaveTextContent('Le vendeur lira cette raison.');
    await user.type(within(dialog).getByLabelText('Raison'), 'Numéro déjà vérifié');
    await user.click(within(dialog).getByRole('button', { name: 'Refuser' }));
    expect(bff).toHaveBeenCalledWith('POST', 'demandes-modification/r1/refuse', {
      reason: 'Numéro déjà vérifié',
    });
  });

  it('shows the API refusal of an apply', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({
      ok: false,
      status: 409,
      error: { code: 'DEMANDE_TRAITEE', message: 'Cette demande a déjà été traitée.' },
    });
    render(
      <ChangeRequestsPanel
        requests={[waiting]}
        permissions={[...PERMISSIONS_BY_ROLE.SERVICE_CLIENT]}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Appliquer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('déjà été traitée');
  });

  it('is read-only for the depot (Admin 2)', () => {
    render(
      <ChangeRequestsPanel requests={[waiting]} permissions={[...PERMISSIONS_BY_ROLE.DEPOT]} />,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows a refused request with its reason', () => {
    render(
      <ChangeRequestsPanel
        requests={[
          {
            ...waiting,
            status: 'REFUSEE',
            refusalReason: 'Numéro déjà vérifié',
            fields: [{ field: 'recipientPhone', before: null, after: '98765432' }],
          },
        ]}
        permissions={[...PERMISSIONS_BY_ROLE.SERVICE_CLIENT]}
      />,
    );
    const item = screen.getAllByRole('listitem')[0]!;
    expect(item).toHaveTextContent('Refusée');
    expect(item).toHaveTextContent('Téléphone : 98765432');
    expect(item).toHaveTextContent('Raison : Numéro déjà vérifié');
    expect(screen.queryByRole('button')).toBeNull();
  });
});
