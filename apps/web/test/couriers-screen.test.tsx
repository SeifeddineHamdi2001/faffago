import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSIONS_BY_ROLE } from '@faffago/shared';
import { CouriersScreen } from '@/components/couriers-screen';
import type { CourierRow } from '@/lib/types';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, replace: vi.fn() }) }));

const bff = vi.fn();
vi.mock('@/lib/client/call', () => ({ bff: (...args: unknown[]) => bff(...args) }));

const livreur: CourierRow = {
  id: 'u1',
  role: 'LIVREUR',
  firstName: 'Karim',
  lastName: 'Ben Ali',
  phone: '50990004',
  zones: [{ name: 'Tunis Nord', role: 'LIVREUR', kind: 'TITULAIRE' }],
  absentToday: false,
  isActive: true,
  acceptsWork: true,
  accountState: 'ACTIF',
  cin: '01234567',
  vehicle: 'Moto',
  payPlan: 'HEBDOMADAIRE',
};

beforeEach(() => {
  bff.mockReset();
  refresh.mockReset();
});

function asAdmin(rows: CourierRow[] = [livreur]) {
  render(<CouriersScreen rows={rows} permissions={[...PERMISSIONS_BY_ROLE.ADMIN]} />);
}

describe('CouriersScreen — what each role sees', () => {
  it('shows Dépôt the list with the absences, and no account action', () => {
    const { id, role, firstName, lastName, phone, zones, absentToday } = livreur;
    render(
      <CouriersScreen
        rows={[{ id, role, firstName, lastName, phone, zones, absentToday }]}
        permissions={[...PERMISSIONS_BY_ROLE.DEPOT]}
      />,
    );
    expect(screen.getByText('Karim Ben Ali')).toBeInTheDocument();
    expect(screen.getByText(/Tunis Nord/)).toBeInTheDocument();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Absences']);
  });

  it('shows Service client the list with no button at all', () => {
    const { id, role, firstName, lastName, phone, zones, absentToday } = livreur;
    render(
      <CouriersScreen
        rows={[{ id, role, firstName, lastName, phone, zones, absentToday }]}
        permissions={[...PERMISSIONS_BY_ROLE.SERVICE_CLIENT]}
      />,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('gives a livreur’s parcels today: in hand and planned (D-11, D-55)', () => {
    asAdmin([{ ...livreur, parcelsToday: { withHim: 3, planned: 12 } }]);
    expect(screen.getByText('Aujourd’hui : 3 en main · 12 prévus en tournée')).toBeInTheDocument();
  });

  it('says who is absent today', () => {
    asAdmin([{ ...livreur, absentToday: true }]);
    expect(screen.getByText('Absent aujourd’hui')).toBeInTheDocument();
  });

  it('gives the admin creation, regeneration and deactivation', () => {
    asAdmin();
    expect(screen.getByRole('button', { name: 'Créer un coursier' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Régénérer le mot de passe' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Désactiver' })).toBeInTheDocument();
  });
});

describe('Créer un coursier', () => {
  it('asks the pay plan for a livreur only, then shows the identifiers once', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({
      ok: true,
      data: {
        user: { id: 'u9', role: 'RAMASSEUR', phone: '50990009' },
        password: 'Pqrstuvwxyz234',
      },
    });
    asAdmin();

    await user.click(screen.getByRole('button', { name: 'Créer un coursier' }));
    const form = screen.getByRole('dialog', { name: 'Créer un coursier' });
    expect(within(form).getByLabelText('Plan de paie')).toBeInTheDocument();

    await user.click(within(form).getByLabelText('Ramasseur'));
    expect(within(form).queryByLabelText('Plan de paie')).toBeNull();

    await user.type(within(form).getByLabelText('Prénom'), 'Sami');
    await user.type(within(form).getByLabelText('Nom'), 'Trabelsi');
    await user.type(within(form).getByLabelText('Téléphone'), '50 990 009');
    await user.type(within(form).getByLabelText('CIN'), '09876543');
    await user.click(within(form).getByRole('button', { name: 'Créer' }));

    expect(bff).toHaveBeenCalledWith(
      'POST',
      'accounts/couriers',
      expect.objectContaining({
        role: 'RAMASSEUR',
        phone: '50 990 009',
        firstName: 'Sami',
        lastName: 'Trabelsi',
        cin: '09876543',
      }),
    );
    const credentials = await screen.findByRole('dialog', { name: 'Mot de passe généré' });
    expect(within(credentials).getByText('Pqrstuvwxyz234')).toBeInTheDocument();
    expect(within(credentials).getByText(/Rôle : Ramasseur/)).toBeInTheDocument();
  });

  it('shows the validation message before calling the API', async () => {
    const user = userEvent.setup();
    asAdmin();
    await user.click(screen.getByRole('button', { name: 'Créer un coursier' }));
    const form = screen.getByRole('dialog', { name: 'Créer un coursier' });
    await user.type(within(form).getByLabelText('Téléphone'), '123');
    await user.click(within(form).getByRole('button', { name: 'Créer' }));

    expect(await within(form).findByText('8 chiffres, format tunisien')).toBeInTheDocument();
    expect(bff).not.toHaveBeenCalled();
  });
});

describe('Régénérer le mot de passe', () => {
  it('asks for confirmation, then shows the new password once', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({ ok: true, data: { password: 'Newpassword234' } });
    asAdmin();

    await user.click(screen.getByRole('button', { name: 'Régénérer le mot de passe' }));
    const confirm = screen.getByRole('dialog', { name: 'Régénérer le mot de passe' });
    expect(confirm).toHaveTextContent(/sessions/);
    await user.click(within(confirm).getByRole('button', { name: 'Régénérer' }));

    expect(bff).toHaveBeenCalledWith('POST', 'accounts/u1/regenerate-password');
    expect(await screen.findByText('Newpassword234')).toBeInTheDocument();
  });
});

describe('Désactiver (D-12)', () => {
  it('lists what blocks the deactivation and says new work has stopped', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({
      ok: false,
      status: 409,
      error: {
        code: 'COURSIER_ENGAGEMENTS_OUVERTS',
        message:
          "Désactivation impossible tant que ce coursier a du travail ou de l'argent en cours.",
        blockers: [
          { type: 'COLIS_EN_MAIN', count: 2, label: '2 colis en main' },
          { type: 'BON_RETOUR_EN_ROUTE', count: 1, label: '1 bon de retour en route' },
        ],
      },
    });
    asAdmin();

    await user.click(screen.getByRole('button', { name: 'Désactiver' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Désactiver le coursier' })).getByRole('button', {
        name: 'Désactiver',
      }),
    );

    expect(bff).toHaveBeenCalledWith('POST', 'accounts/couriers/u1/deactivate');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Désactivation impossible');
    expect(
      within(alert)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['2 colis en main', '1 bon de retour en route']);
    expect(alert).toHaveTextContent('ne reçoit plus de nouveau travail');
    expect(refresh).toHaveBeenCalled();
  });

  it('offers Réactiver on a deactivated courier', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({ ok: true, data: {} });
    asAdmin([{ ...livreur, isActive: false, acceptsWork: false, accountState: 'INACTIF' }]);
    expect(screen.getByText('Inactif')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Réactiver' }));
    expect(bff).toHaveBeenCalledWith('POST', 'accounts/couriers/u1/activate');
  });
});

describe('Absences (D-52)', () => {
  it('lists the absences to come, and marks a courier absent for a day', async () => {
    const user = userEvent.setup();
    bff
      .mockResolvedValueOnce({ ok: true, data: [{ date: '2026-09-30', reason: null }] })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          absence: { date: '2026-09-28', reason: 'Malade' },
          pickupsMoved: [
            { id: 'p1', shopName: 'Boutique Yasmine', ramasseur: { id: 'u2', firstName: 'Hédi' } },
          ],
          pickupsNotMoved: [{ id: 'p2', shopName: 'Chic Tunis' }],
        },
      })
      .mockResolvedValueOnce({ ok: true, data: [] });
    asAdmin();

    await user.click(screen.getByRole('button', { name: 'Absences' }));
    expect(bff).toHaveBeenCalledWith('GET', 'couriers/u1/absences');
    const dialog = screen.getByRole('dialog', { name: 'Absences de Karim Ben Ali' });
    expect(await within(dialog).findByText('30/09/2026')).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText('Jour'), { target: { value: '2026-09-28' } });
    await user.type(within(dialog).getByLabelText(/Motif/), 'Malade');
    await user.click(within(dialog).getByRole('button', { name: 'Marquer absent' }));

    expect(bff).toHaveBeenCalledWith('POST', 'couriers/u1/absences', {
      date: '2026-09-28',
      reason: 'Malade',
    });
    expect(
      await within(dialog).findByText('Boutique Yasmine : ramassage confié à Hédi'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText('Chic Tunis : aucun backup disponible, à replanifier'),
    ).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it('removes an absence', async () => {
    const user = userEvent.setup();
    bff
      .mockResolvedValueOnce({ ok: true, data: [{ date: '2026-09-30', reason: 'Congé' }] })
      .mockResolvedValueOnce({ ok: true, data: null })
      .mockResolvedValueOnce({ ok: true, data: [] });
    asAdmin();

    await user.click(screen.getByRole('button', { name: 'Absences' }));
    const dialog = screen.getByRole('dialog', { name: 'Absences de Karim Ben Ali' });
    await user.click(await within(dialog).findByRole('button', { name: 'Retirer le 30/09/2026' }));

    expect(bff).toHaveBeenCalledWith('DELETE', 'couriers/u1/absences/2026-09-30');
    expect(await within(dialog).findByText('Aucune absence prévue.')).toBeInTheDocument();
  });

  it('shows the refusal of a day already marked', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({ ok: true, data: [] }).mockResolvedValueOnce({
      ok: false,
      status: 409,
      error: { code: 'ABSENCE_EXISTE', message: 'Ce coursier est déjà marqué absent ce jour-là.' },
    });
    asAdmin();

    await user.click(screen.getByRole('button', { name: 'Absences' }));
    const dialog = screen.getByRole('dialog', { name: 'Absences de Karim Ben Ali' });
    await user.click(within(dialog).getByRole('button', { name: 'Marquer absent' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('déjà marqué absent');
  });
});
