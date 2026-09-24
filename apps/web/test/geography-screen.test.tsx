import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GeographyScreen } from '@/components/geography-screen';
import { LocalitesScreen } from '@/components/localites-screen';
import type { GeographyRow, LocaliteAdminRow } from '@/lib/types';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const bff = vi.fn();
vi.mock('@/lib/client/call', () => ({ bff: (...args: unknown[]) => bff(...args) }));

beforeEach(() => {
  bff.mockReset();
  refresh.mockReset();
});

const geography: GeographyRow[] = [
  {
    id: 'g-tun',
    code: 'TUN',
    nameFr: 'Tunis',
    nameAr: 'تونس',
    delegations: [
      {
        id: 'd-marsa',
        code: 'TUN-MARSA',
        nameFr: 'La Marsa',
        nameAr: 'المرسى',
        isActive: true,
        zone: { id: 'z-nord', name: 'Tunis Nord' },
        localiteCount: 24,
      },
      {
        id: 'd-kram',
        code: 'TUN-KRAM',
        nameFr: 'Le Kram',
        nameAr: 'الكرم',
        isActive: true,
        zone: null,
        localiteCount: 9,
      },
    ],
  },
];
const zones = [
  { id: 'z-nord', name: 'Tunis Nord', isActive: true },
  { id: 'z-sud', name: 'Tunis Sud', isActive: true },
  { id: 'z-off', name: 'Ancienne zone', isActive: false },
];

describe('GeographyScreen (Admin 4.16, D-51)', () => {
  it('lists each délégation with its Arabic name, its zone and its localités', () => {
    render(<GeographyScreen gouvernorats={geography} zones={zones} />);
    const marsa = screen.getByRole('row', { name: /La Marsa/ });
    expect(marsa).toHaveTextContent('المرسى');
    expect(within(marsa).getByLabelText('Zone de La Marsa')).toHaveValue('z-nord');
    expect(within(marsa).getByRole('link', { name: 'Localités (24)' })).toHaveAttribute(
      'href',
      '/admin/parametres/geographie/d-marsa',
    );
    expect(screen.getByRole('link', { name: 'Colis classés sous Autre' })).toHaveAttribute(
      'href',
      '/admin/parametres/geographie/autre',
    );
  });

  it('highlights a délégation with no zone', () => {
    render(<GeographyScreen gouvernorats={geography} zones={zones} />);
    const kram = screen.getByRole('row', { name: /Le Kram/ });
    expect(within(kram).getByLabelText('Zone de Le Kram')).toHaveValue('');
    expect(kram).toHaveTextContent('Sans zone');
  });

  it('offers only the active zones', () => {
    render(<GeographyScreen gouvernorats={geography} zones={zones} />);
    const options = within(screen.getByLabelText('Zone de La Marsa'))
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(options).toEqual(['Sans zone', 'Tunis Nord', 'Tunis Sud']);
  });

  it('moves a délégation to another zone, or out of every zone', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValue({ ok: true, data: {} });
    render(<GeographyScreen gouvernorats={geography} zones={zones} />);

    await user.selectOptions(screen.getByLabelText('Zone de La Marsa'), 'z-sud');
    expect(bff).toHaveBeenLastCalledWith('PATCH', 'delegations/d-marsa', { zoneId: 'z-sud' });

    await user.selectOptions(screen.getByLabelText('Zone de La Marsa'), '');
    expect(bff).toHaveBeenLastCalledWith('PATCH', 'delegations/d-marsa', { zoneId: null });
    expect(refresh).toHaveBeenCalled();
  });

  it('renames a délégation in French and Arabic', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({ ok: true, data: {} });
    render(<GeographyScreen gouvernorats={geography} zones={zones} />);

    const marsa = screen.getByRole('row', { name: /La Marsa/ });
    await user.click(within(marsa).getByRole('button', { name: 'Modifier' }));
    const dialog = screen.getByRole('dialog', { name: 'Modifier La Marsa' });
    const arabic = within(dialog).getByLabelText('Nom en arabe');
    await user.clear(arabic);
    await user.type(arabic, 'المرسى المدينة');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    expect(bff).toHaveBeenCalledWith('PATCH', 'delegations/d-marsa', {
      nameFr: 'La Marsa',
      nameAr: 'المرسى المدينة',
    });
  });

  it('renames a gouvernorat', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({ ok: true, data: {} });
    render(<GeographyScreen gouvernorats={geography} zones={zones} />);

    await user.click(screen.getByRole('button', { name: 'Modifier le gouvernorat Tunis' }));
    const dialog = screen.getByRole('dialog', { name: 'Modifier Tunis' });
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(bff).toHaveBeenCalledWith('PATCH', 'gouvernorats/g-tun', {
      nameFr: 'Tunis',
      nameAr: 'تونس',
    });
  });

  it('shows the API refusal of a name already taken', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({
      ok: false,
      status: 409,
      error: {
        code: 'DELEGATION_EXISTE',
        message: 'Ce gouvernorat a déjà une délégation « Le Kram ».',
      },
    });
    render(<GeographyScreen gouvernorats={geography} zones={zones} />);
    const marsa = screen.getByRole('row', { name: /La Marsa/ });
    await user.click(within(marsa).getByRole('button', { name: 'Modifier' }));
    const dialog = screen.getByRole('dialog', { name: 'Modifier La Marsa' });
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('déjà une délégation');
  });
});

const delegation = {
  id: 'd-marsa',
  code: 'TUN-MARSA',
  nameFr: 'La Marsa',
  gouvernoratNameFr: 'Tunis',
};
const localites: LocaliteAdminRow[] = [
  {
    id: 'l-gam',
    delegationId: 'd-marsa',
    nameFr: 'Gammarth',
    nameAr: null,
    postalCode: '1057',
    aliases: ['Gammart'],
    isOther: false,
    isActive: true,
  },
  {
    id: 'l-old',
    delegationId: 'd-marsa',
    nameFr: 'Cité Aziza',
    nameAr: null,
    postalCode: null,
    aliases: [],
    isOther: false,
    isActive: false,
  },
  {
    id: 'l-autre',
    delegationId: 'd-marsa',
    nameFr: 'Autre',
    nameAr: 'أخرى',
    postalCode: null,
    aliases: [],
    isOther: true,
    isActive: true,
  },
];

describe('LocalitesScreen (D-17)', () => {
  it('lists the localités, deactivated ones marked, Autre with no rename nor deactivation', () => {
    render(<LocalitesScreen delegation={delegation} localites={localites} />);
    expect(screen.getByRole('row', { name: /Cité Aziza/ })).toHaveTextContent('Désactivée');
    const autre = screen.getByRole('row', { name: 'Autre' });
    expect(within(autre).queryByRole('button', { name: 'Désactiver' })).toBeNull();
    expect(screen.getByRole('row', { name: /Gammarth/ })).toHaveTextContent('Gammart');
  });

  it('adds a localité, with its aliases one per comma', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({ ok: true, data: {} });
    render(<LocalitesScreen delegation={delegation} localites={localites} />);

    await user.click(screen.getByRole('button', { name: 'Ajouter une localité' }));
    const dialog = screen.getByRole('dialog', { name: 'Ajouter une localité' });
    await user.type(within(dialog).getByLabelText('Nom en français'), 'Les Jardins de Gammarth');
    await user.type(within(dialog).getByLabelText('Code postal'), '1057');
    await user.type(within(dialog).getByLabelText(/Autres noms/), 'Jardins Gammarth, Gammarth 2');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    expect(bff).toHaveBeenCalledWith('POST', 'localites', {
      delegationId: 'd-marsa',
      nameFr: 'Les Jardins de Gammarth',
      nameAr: null,
      postalCode: '1057',
      aliases: ['Jardins Gammarth', 'Gammarth 2'],
    });
    expect(refresh).toHaveBeenCalled();
  });

  it('fills the Arabic name of a localité', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({ ok: true, data: {} });
    render(<LocalitesScreen delegation={delegation} localites={localites} />);

    const gammarth = screen.getByRole('row', { name: /Gammarth/ });
    await user.click(within(gammarth).getByRole('button', { name: 'Modifier' }));
    const dialog = screen.getByRole('dialog', { name: 'Modifier Gammarth' });
    await user.type(within(dialog).getByLabelText('Nom en arabe'), 'قمرت');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    expect(bff).toHaveBeenCalledWith('PATCH', 'localites/l-gam', {
      nameFr: 'Gammarth',
      nameAr: 'قمرت',
      postalCode: '1057',
      aliases: ['Gammart'],
    });
  });

  it('never sends a new French name for Autre', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({ ok: true, data: {} });
    render(<LocalitesScreen delegation={delegation} localites={localites} />);

    const autre = screen.getByRole('row', { name: 'Autre' });
    await user.click(within(autre).getByRole('button', { name: 'Modifier' }));
    const dialog = screen.getByRole('dialog', { name: 'Modifier Autre' });
    expect(within(dialog).getByLabelText('Nom en français')).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(bff).toHaveBeenCalledWith('PATCH', 'localites/l-autre', {
      nameAr: 'أخرى',
      postalCode: null,
      aliases: [],
    });
  });

  it('deactivates and reactivates', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValue({ ok: true, data: {} });
    render(<LocalitesScreen delegation={delegation} localites={localites} />);

    await user.click(
      within(screen.getByRole('row', { name: /Gammarth/ })).getByRole('button', {
        name: 'Désactiver',
      }),
    );
    expect(bff).toHaveBeenLastCalledWith('PATCH', 'localites/l-gam', { isActive: false });

    await user.click(
      within(screen.getByRole('row', { name: /Cité Aziza/ })).getByRole('button', {
        name: 'Réactiver',
      }),
    );
    expect(bff).toHaveBeenLastCalledWith('PATCH', 'localites/l-old', { isActive: true });
  });
});
