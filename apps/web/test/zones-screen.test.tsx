import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ZonesScreen } from '@/components/zones-screen';
import type { CourierRow, ZoneRow } from '@/lib/types';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const bff = vi.fn();
vi.mock('@/lib/client/call', () => ({ bff: (...args: unknown[]) => bff(...args) }));

function courier(
  id: string,
  role: CourierRow['role'],
  firstName: string,
  extra: Partial<CourierRow> = {},
): CourierRow {
  return {
    id,
    role,
    firstName,
    lastName: 'Nom',
    phone: '50990000',
    zones: [],
    absentToday: false,
    isActive: true,
    acceptsWork: true,
    accountState: 'ACTIF',
    ...extra,
  };
}

const ali = courier('u-ali', 'LIVREUR', 'Ali');
const sami = courier('u-sami', 'LIVREUR', 'Sami');
const stopped = courier('u-stop', 'LIVREUR', 'Walid', { acceptsWork: false });
const hedi = courier('u-hedi', 'RAMASSEUR', 'Hédi');

const empty = { TITULAIRE: null, BACKUP: null };
const nord: ZoneRow = {
  id: 'z-nord',
  name: 'Tunis Nord',
  isActive: true,
  delegations: [
    { id: 'd1', code: 'TUN-MARSA', nameFr: 'La Marsa' },
    { id: 'd2', code: 'TUN-KRAM', nameFr: 'Le Kram' },
  ],
  assignments: {
    LIVREUR: { TITULAIRE: { id: 'u-ali', firstName: 'Ali', lastName: 'Nom' }, BACKUP: null },
    RAMASSEUR: empty,
  },
};

beforeEach(() => {
  bff.mockReset();
  refresh.mockReset();
});

function show(zones: ZoneRow[] = [nord], couriers: CourierRow[] = [ali, sami, stopped, hedi]) {
  render(<ZonesScreen zones={zones} couriers={couriers} />);
}

describe('ZonesScreen (Admin 4.5, D-51)', () => {
  it('shows each zone with its délégations and its four assignments', () => {
    show();
    const card = screen.getByRole('region', { name: 'Tunis Nord' });
    expect(card).toHaveTextContent('La Marsa');
    expect(card).toHaveTextContent('Le Kram');
    expect(within(card).getByLabelText('Livreur titulaire')).toHaveValue('u-ali');
    expect(within(card).getByLabelText('Livreur backup')).toHaveValue('');
    expect(within(card).getByLabelText('Ramasseur titulaire')).toHaveValue('');
  });

  it('offers only couriers of the role who can take work', () => {
    show();
    const card = screen.getByRole('region', { name: 'Tunis Nord' });
    const options = within(within(card).getByLabelText('Livreur backup'))
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(options).toEqual(['Personne', 'Ali Nom', 'Sami Nom']);
    const ramasseurs = within(within(card).getByLabelText('Ramasseur titulaire'))
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(ramasseurs).toEqual(['Personne', 'Hédi Nom']);
  });

  it('keeps showing a courier already assigned who stopped taking work', () => {
    const zone: ZoneRow = {
      ...nord,
      assignments: {
        LIVREUR: { TITULAIRE: { id: 'u-stop', firstName: 'Walid', lastName: 'Nom' }, BACKUP: null },
        RAMASSEUR: empty,
      },
    };
    show([zone]);
    const select = screen.getByLabelText('Livreur titulaire');
    expect(select).toHaveValue('u-stop');
    expect(within(select).getByRole('option', { name: /Walid Nom/ })).toBeInTheDocument();
  });

  it('saves the four assignments together', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({ ok: true, data: nord });
    show();
    const card = screen.getByRole('region', { name: 'Tunis Nord' });

    await user.selectOptions(within(card).getByLabelText('Livreur backup'), 'u-sami');
    await user.selectOptions(within(card).getByLabelText('Ramasseur titulaire'), 'u-hedi');
    await user.click(within(card).getByRole('button', { name: 'Enregistrer les coursiers' }));

    expect(bff).toHaveBeenCalledWith('PUT', 'zones/z-nord/assignments', {
      LIVREUR: { titulaireId: 'u-ali', backupId: 'u-sami' },
      RAMASSEUR: { titulaireId: 'u-hedi', backupId: null },
    });
    expect(await within(card).findByText('Enregistré')).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it('refuses the same courier as titular and backup before calling the API', async () => {
    const user = userEvent.setup();
    show();
    const card = screen.getByRole('region', { name: 'Tunis Nord' });
    await user.selectOptions(within(card).getByLabelText('Livreur backup'), 'u-ali');
    await user.click(within(card).getByRole('button', { name: 'Enregistrer les coursiers' }));

    expect(
      await within(card).findByText(
        'Le titulaire et le backup doivent être deux personnes différentes',
      ),
    ).toBeInTheDocument();
    expect(bff).not.toHaveBeenCalled();
  });

  it('creates a zone', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({ ok: true, data: {} });
    show();
    await user.click(screen.getByRole('button', { name: 'Créer une zone' }));
    const dialog = screen.getByRole('dialog', { name: 'Créer une zone' });
    await user.type(within(dialog).getByLabelText('Nom de la zone'), 'Lac et Berges');
    await user.click(within(dialog).getByRole('button', { name: 'Créer' }));

    expect(bff).toHaveBeenCalledWith('POST', 'zones', { name: 'Lac et Berges' });
    expect(refresh).toHaveBeenCalled();
  });

  it('renames a zone', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({ ok: true, data: {} });
    show();
    const card = screen.getByRole('region', { name: 'Tunis Nord' });
    await user.click(within(card).getByRole('button', { name: 'Renommer' }));
    const dialog = screen.getByRole('dialog', { name: 'Renommer la zone' });
    const input = within(dialog).getByLabelText('Nom de la zone');
    await user.clear(input);
    await user.type(input, 'Banlieue Nord');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    expect(bff).toHaveBeenCalledWith('PATCH', 'zones/z-nord', { name: 'Banlieue Nord' });
  });

  it('shows why a zone with délégations cannot be deactivated', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({
      ok: false,
      status: 409,
      error: {
        code: 'ZONE_NON_VIDE',
        message: 'Cette zone contient encore 2 délégation(s) : déplacez-les d’abord.',
      },
    });
    show();
    const card = screen.getByRole('region', { name: 'Tunis Nord' });
    await user.click(within(card).getByRole('button', { name: 'Désactiver' }));

    expect(bff).toHaveBeenCalledWith('PATCH', 'zones/z-nord', { isActive: false });
    expect(await screen.findByRole('alert')).toHaveTextContent('contient encore 2 délégation(s)');
  });

  it('shows a deactivated zone with Réactiver and no assignment form', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({ ok: true, data: {} });
    show([{ ...nord, isActive: false, delegations: [] }]);
    const card = screen.getByRole('region', { name: 'Tunis Nord' });
    expect(card).toHaveTextContent('Désactivée');
    expect(within(card).queryByLabelText('Livreur titulaire')).toBeNull();
    await user.click(within(card).getByRole('button', { name: 'Réactiver' }));
    expect(bff).toHaveBeenCalledWith('PATCH', 'zones/z-nord', { isActive: true });
  });
});
