import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSIONS_BY_ROLE } from '@faffago/shared';
import { SellersScreen } from '@/components/sellers-screen';
import { StaffScreen } from '@/components/staff-screen';
import type { SellerRow, StaffRow } from '@/lib/types';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh, replace: vi.fn() }) }));

const bff = vi.fn();
vi.mock('@/lib/client/call', () => ({ bff: (...args: unknown[]) => bff(...args) }));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  bff.mockReset();
  push.mockReset();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const contact: SellerRow = {
  id: 's1',
  shopName: 'Boutique Démo',
  contactFullName: 'Vendeur Démo',
  contactPhone: '50990003',
};
const adminRow: SellerRow = {
  ...contact,
  userId: 'u3',
  email: 'vendeur@boutique-demo.test',
  statut: 'CIN_UNIQUEMENT',
  accountState: 'ACTIF',
};

describe('SellersScreen (D-11)', () => {
  it('shows Dépôt the shop and the contact, no email, no action', () => {
    render(<SellersScreen rows={[contact]} permissions={[...PERMISSIONS_BY_ROLE.DEPOT]} />);
    expect(screen.getByText('Boutique Démo')).toBeInTheDocument();
    expect(screen.getByText(/Vendeur Démo/)).toBeInTheDocument();
    expect(screen.queryByText(/@/)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('gives the admin the email, the statut, and both actions', () => {
    render(<SellersScreen rows={[adminRow]} permissions={[...PERMISSIONS_BY_ROLE.ADMIN]} />);
    expect(screen.getByText('vendeur@boutique-demo.test')).toBeInTheDocument();
    expect(screen.getByText(/CIN uniquement/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Régénérer le mot de passe' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Voir comme le vendeur' })).toBeInTheDocument();
  });

  it('opens the seller space in read-only mode', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 201 }));
    render(<SellersScreen rows={[adminRow]} permissions={[...PERMISSIONS_BY_ROLE.ADMIN]} />);

    await user.click(screen.getByRole('button', { name: 'Voir comme le vendeur' }));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/impersonation',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ sellerId: 's1' }) }),
    );
    expect(push).toHaveBeenCalledWith('/vendeur');
  });

  it('regenerates on the login account and shows the email as identifier', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({ ok: true, data: { password: 'Newpassword234' } });
    render(<SellersScreen rows={[adminRow]} permissions={[...PERMISSIONS_BY_ROLE.ADMIN]} />);

    await user.click(screen.getByRole('button', { name: 'Régénérer le mot de passe' }));
    await user.click(screen.getByRole('button', { name: 'Régénérer' }));
    expect(bff).toHaveBeenCalledWith('POST', 'accounts/u3/regenerate-password');
    const box = await screen.findByRole('dialog', { name: 'Mot de passe généré' });
    expect(within(box).getByText('vendeur@boutique-demo.test')).toBeInTheDocument();
  });
});

const admin: StaffRow = {
  id: 'a1',
  role: 'ADMIN',
  username: 'admin',
  firstName: 'Admin',
  lastName: 'Faffa Go',
  phone: '20000000',
  isActive: true,
  lastLoginAt: null,
};

describe('StaffScreen — Paramètres › Utilisateurs', () => {
  it('creates a staff account and shows the username and password once', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({
      ok: true,
      data: {
        user: { id: 'd1', role: 'DEPOT', username: 'amine.k', phone: '50990010' },
        password: 'Pqrstuvwxyz234',
      },
    });
    render(<StaffScreen rows={[admin]} />);

    await user.click(screen.getByRole('button', { name: 'Créer un utilisateur' }));
    const form = screen.getByRole('dialog', { name: 'Créer un utilisateur' });
    await user.selectOptions(within(form).getByLabelText('Rôle'), 'DEPOT');
    await user.type(within(form).getByLabelText('Identifiant'), 'Amine.K');
    await user.type(within(form).getByLabelText('Prénom'), 'Amine');
    await user.type(within(form).getByLabelText('Nom'), 'K');
    await user.type(within(form).getByLabelText('Téléphone'), '50990010');
    await user.click(within(form).getByRole('button', { name: 'Créer' }));

    expect(bff).toHaveBeenCalledWith(
      'POST',
      'accounts/staff',
      expect.objectContaining({ role: 'DEPOT', username: 'Amine.K' }),
    );
    const box = await screen.findByRole('dialog', { name: 'Mot de passe généré' });
    expect(within(box).getByText('amine.k')).toBeInTheDocument();
    expect(within(box).getByText('Pqrstuvwxyz234')).toBeInTheDocument();
  });

  it('refuses a malformed username before calling the API (Q13)', async () => {
    const user = userEvent.setup();
    render(<StaffScreen rows={[admin]} />);
    await user.click(screen.getByRole('button', { name: 'Créer un utilisateur' }));
    const form = screen.getByRole('dialog', { name: 'Créer un utilisateur' });
    await user.type(within(form).getByLabelText('Identifiant'), 'ab');
    await user.click(within(form).getByRole('button', { name: 'Créer' }));
    expect(await within(form).findByText(/4 caractères minimum/)).toBeInTheDocument();
    expect(bff).not.toHaveBeenCalled();
  });

  it('shows the last-admin refusal with its way out (Q9)', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({
      ok: false,
      status: 409,
      error: {
        code: 'DERNIER_ADMIN',
        message:
          "Impossible : c'est le dernier admin actif. Utilisez la commande admin:reset sur le serveur.",
      },
    });
    render(<StaffScreen rows={[admin]} />);
    await user.click(screen.getByRole('button', { name: 'Désactiver' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Désactiver le compte' })).getByRole('button', {
        name: 'Désactiver',
      }),
    );

    expect(bff).toHaveBeenCalledWith('POST', 'accounts/staff/a1/deactivate');
    expect(await screen.findByRole('alert')).toHaveTextContent('admin:reset');
  });

  it('offers Réactiver on a deactivated account', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({ ok: true, data: {} });
    render(<StaffScreen rows={[{ ...admin, id: 'd2', role: 'DEPOT', isActive: false }]} />);
    await user.click(screen.getByRole('button', { name: 'Réactiver' }));
    expect(bff).toHaveBeenCalledWith('POST', 'accounts/staff/d2/activate');
  });
});
