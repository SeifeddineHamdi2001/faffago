import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSIONS_BY_ROLE } from '@faffago/shared';
import { AdminScanCancel, ForcerStatut } from '@/components/forcage';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const bff = vi.fn();
vi.mock('@/lib/client/call', () => ({ bff: (...args: unknown[]) => bff(...args) }));

const livreurs = [
  { id: 'u-ali', firstName: 'Ali', lastName: 'Ben Salah' },
  { id: 'u-sami', firstName: 'Sami', lastName: 'Trabelsi' },
];

beforeEach(() => {
  bff.mockReset();
  refresh.mockReset();
});

describe('Forcer un statut (Admin 4.3, D-56)', () => {
  it('offers the moves phase 5 allows, asks the livreur and the reason, then sends them', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({ ok: true, data: {} });
    render(
      <ForcerStatut
        code="FG-AAAAAAAA"
        current={{ status: 'AU_DEPOT', location: 'AU_DEPOT' }}
        livreurs={livreurs}
        permissions={[...PERMISSIONS_BY_ROLE.ADMIN]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Forcer un statut' }));
    const dialog = screen.getByRole('dialog', { name: 'Forcer un statut' });
    expect(dialog).toHaveTextContent('Seulement pour corriger une erreur de scan.');
    const target = within(dialog).getByLabelText('Nouvel état');
    expect(
      within(target)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Choisir…', 'Ramassé · Avec le ramasseur', 'En livraison · Avec le livreur']);
    expect(within(dialog).queryByLabelText('Livreur')).toBeNull();

    await user.selectOptions(target, 'EN_LIVRAISON|AVEC_LE_LIVREUR');
    await user.selectOptions(within(dialog).getByLabelText('Livreur'), 'u-ali');
    await user.type(within(dialog).getByLabelText('Raison'), 'Sorti sans être scanné');
    await user.click(within(dialog).getByRole('button', { name: 'Corriger' }));

    expect(bff).toHaveBeenCalledWith('POST', 'colis/FG-AAAAAAAA/forcer-statut', {
      status: 'EN_LIVRAISON',
      location: 'AVEC_LE_LIVREUR',
      livreurId: 'u-ali',
      reason: 'Sorti sans être scanné',
    });
    expect(refresh).toHaveBeenCalled();
  });

  it('offers only the place for an À vérifier parcel', async () => {
    const user = userEvent.setup();
    render(
      <ForcerStatut
        code="FG-AAAAAAAA"
        current={{ status: 'A_VERIFIER', location: 'AVEC_LE_LIVREUR' }}
        livreurs={livreurs}
        permissions={[...PERMISSIONS_BY_ROLE.ADMIN]}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Forcer un statut' }));
    const target = screen.getByLabelText('Nouvel état');
    expect(
      within(target)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Choisir…', 'À vérifier · Au dépôt']);
  });

  it('says nothing can be corrected here for a delivered parcel', () => {
    render(
      <ForcerStatut
        code="FG-AAAAAAAA"
        current={{ status: 'LIVRE', location: 'CHEZ_LE_CLIENT' }}
        livreurs={livreurs}
        permissions={[...PERMISSIONS_BY_ROLE.ADMIN]}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Forcer un statut' })).toBeNull();
    expect(
      screen.getByText('Aucune correction de statut possible pour ce colis.'),
    ).toBeInTheDocument();
  });

  it('shows the refusal of the API', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({
      ok: false,
      status: 400,
      error: {
        message: 'Données invalides',
        issues: [{ path: ['reason'], message: 'Indiquez la raison de la correction' }],
      },
    });
    render(
      <ForcerStatut
        code="FG-AAAAAAAA"
        current={{ status: 'AU_DEPOT', location: 'AU_DEPOT' }}
        livreurs={livreurs}
        permissions={[...PERMISSIONS_BY_ROLE.ADMIN]}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Forcer un statut' }));
    const dialog = screen.getByRole('dialog', { name: 'Forcer un statut' });
    await user.selectOptions(
      within(dialog).getByLabelText('Nouvel état'),
      'RAMASSE|AVEC_LE_RAMASSEUR',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Corriger' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Indiquez la raison de la correction',
    );
  });

  it('is the admin’s alone', () => {
    const { container } = render(
      <ForcerStatut
        code="FG-AAAAAAAA"
        current={{ status: 'AU_DEPOT', location: 'AU_DEPOT' }}
        livreurs={livreurs}
        permissions={[...PERMISSIONS_BY_ROLE.DEPOT]}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('Annuler ce scan, after its window (A-11, D-56)', () => {
  it('asks the reason, then cancels the scan', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({ ok: true, data: {} });
    render(<AdminScanCancel scanId="s1" permissions={[...PERMISSIONS_BY_ROLE.ADMIN]} />);
    await user.click(screen.getByRole('button', { name: 'Annuler ce scan' }));
    const dialog = screen.getByRole('dialog', { name: 'Annuler ce scan' });
    await user.type(within(dialog).getByLabelText('Raison'), 'Scanné sur le mauvais colis');
    await user.click(within(dialog).getByRole('button', { name: 'Annuler le scan' }));
    expect(bff).toHaveBeenCalledWith('POST', 'scans/depot/s1/cancel-admin', {
      reason: 'Scanné sur le mauvais colis',
    });
    expect(refresh).toHaveBeenCalled();
  });

  it('is the admin’s alone', () => {
    const { container } = render(
      <AdminScanCancel scanId="s1" permissions={[...PERMISSIONS_BY_ROLE.DEPOT]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
