import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TourneesScreen } from '@/components/tournees-screen';
import type { CourierRow, TourParcelRow, TourneesView } from '@/lib/types';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const bff = vi.fn();
vi.mock('@/lib/client/call', () => ({ bff: (...args: unknown[]) => bff(...args) }));

const ali = { id: 'u-ali', firstName: 'Ali', lastName: 'Test' };
const karim = { id: 'u-karim', firstName: 'Karim', lastName: 'Test' };

function row(code: string, extra: Partial<TourParcelRow> = {}): TourParcelRow {
  return {
    id: `id-${code}`,
    code,
    status: 'AU_DEPOT',
    relaunchDate: null,
    relaunchSlot: null,
    attemptCount: 0,
    localiteNameFr: 'Gammarth',
    delegationNameFr: 'La Marsa',
    shopName: 'Boutique Yasmine',
    plannedLivreur: ali,
    moved: false,
    labelReprintNeeded: false,
    ...extra,
  };
}

const plan: TourneesView = {
  date: '2026-09-25',
  zones: [
    {
      id: 'z-nord',
      name: 'Tunis Nord',
      livreur: ali,
      livreurKind: 'TITULAIRE',
      parcels: [
        row('FG-AAAAAAAA'),
        row('FG-BBBBBBBB', {
          status: 'RELANCE',
          relaunchDate: '2026-09-25',
          relaunchSlot: 'APRES_MIDI',
          attemptCount: 1,
        }),
        row('FG-CCCCCCCC', { plannedLivreur: karim, moved: true }),
      ],
    },
    {
      id: 'z-sud',
      name: 'Ben Arous Côte',
      livreur: null,
      livreurKind: null,
      parcels: [row('FG-DDDDDDDD', { plannedLivreur: null, delegationNameFr: 'Ezzahra' })],
    },
  ],
  sansZone: [row('FG-EEEEEEEE', { plannedLivreur: null, delegationNameFr: 'Le Kram' })],
  loads: [
    { courier: ali, count: 2 },
    { courier: karim, count: 1 },
  ],
  withoutCourier: 2,
};

function courier(id: string, firstName: string, extra: Partial<CourierRow> = {}): CourierRow {
  return {
    id,
    role: 'LIVREUR',
    firstName,
    lastName: 'Test',
    phone: '50990000',
    zones: [],
    absentToday: false,
    ...extra,
  };
}
const couriers = [
  courier('u-ali', 'Ali'),
  courier('u-karim', 'Karim'),
  courier('u-walid', 'Walid', { absentToday: true }),
  courier('u-hedi', 'Hédi', { role: 'RAMASSEUR' }),
];

beforeEach(() => {
  bff.mockReset();
  refresh.mockReset();
});

function show(view: TourneesView = plan) {
  render(<TourneesScreen plan={view} couriers={couriers} />);
}

describe('TourneesScreen (Admin 4.5, D-55)', () => {
  it('shows each zone with the livreur covering it today, and its parcels', () => {
    show();
    expect(screen.getByRole('heading', { name: 'Tournées du 25/09/2026' })).toBeInTheDocument();
    const nord = screen.getByRole('region', { name: 'Tunis Nord' });
    expect(nord).toHaveTextContent('Ali Test · titulaire');
    expect(within(nord).getAllByRole('checkbox', { name: /^FG-/ })).toHaveLength(3);
    expect(nord).toHaveTextContent('Gammarth, La Marsa');
    expect(nord).toHaveTextContent('Relancé · Après-midi · tentative 2');
    expect(nord).toHaveTextContent('→ Karim Test');
  });

  it('highlights a zone nobody covers and the parcels in no zone', () => {
    show();
    const sud = screen.getByRole('region', { name: 'Ben Arous Côte' });
    expect(within(sud).getByText('Sans coursier')).toHaveClass('badge-warn');
    const sansZone = screen.getByRole('region', { name: 'Sans zone' });
    expect(sansZone).toHaveTextContent('FG-EEEEEEEE');
  });

  it('marks a parcel whose label must be reprinted before it goes out (D-57)', () => {
    show({
      ...plan,
      zones: [
        {
          ...plan.zones[0]!,
          parcels: [row('FG-FFFFFFFF', { labelReprintNeeded: true })],
        },
      ],
    });
    expect(screen.getByRole('region', { name: 'Tunis Nord' })).toHaveTextContent(
      'Étiquette à réimprimer',
    );
  });

  it('gives each courier’s load, and how many have nobody', () => {
    show();
    const loads = screen.getByRole('list', { name: 'Charge par livreur' });
    expect(
      within(loads)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Ali Test : 2', 'Karim Test : 1', 'Sans coursier : 2']);
  });

  it('says so when no parcel waits for a tour', () => {
    show({ date: '2026-09-25', zones: [], sansZone: [], loads: [], withoutCourier: 0 });
    expect(screen.getByText('Aucun colis à sortir aujourd’hui.')).toBeInTheDocument();
  });

  it('moves the selected parcels to a livreur who can go out today', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({ ok: true, data: { moved: 2 } });
    show();

    await user.click(screen.getByRole('checkbox', { name: 'FG-AAAAAAAA' }));
    await user.click(screen.getByRole('checkbox', { name: 'FG-DDDDDDDD' }));
    expect(screen.getByText('2 colis sélectionnés')).toBeInTheDocument();
    const select = screen.getByLabelText('Livreur');
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Choisir…', 'Ali Test', 'Karim Test']);
    await user.selectOptions(select, 'u-karim');
    await user.click(screen.getByRole('button', { name: 'Déplacer' }));

    expect(bff).toHaveBeenCalledWith('POST', 'tournees/moves', {
      parcelIds: ['id-FG-AAAAAAAA', 'id-FG-DDDDDDDD'],
      courierId: 'u-karim',
    });
    expect(await screen.findByRole('status')).toHaveTextContent('2 colis déplacés');
    expect(refresh).toHaveBeenCalled();
  });

  it('puts parcels back under their zone’s livreur', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({ ok: true, data: { moved: 1 } });
    show();
    await user.click(screen.getByRole('checkbox', { name: 'FG-CCCCCCCC' }));
    await user.click(screen.getByRole('button', { name: 'Remettre selon la zone' }));
    expect(bff).toHaveBeenCalledWith('POST', 'tournees/moves', {
      parcelIds: ['id-FG-CCCCCCCC'],
      courierId: null,
    });
  });

  it('shows the refusal of the API', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({
      ok: false,
      status: 409,
      error: {
        code: 'COLIS_HORS_TOURNEE',
        message: 'Colis pas au dépôt en attente d’une tournée : FG-AAAAAAAA.',
      },
    });
    show();
    await user.click(screen.getByRole('checkbox', { name: 'FG-AAAAAAAA' }));
    await user.selectOptions(screen.getByLabelText('Livreur'), 'u-karim');
    await user.click(screen.getByRole('button', { name: 'Déplacer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Colis pas au dépôt');
  });

  it('selects a whole zone at once', async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('checkbox', { name: 'Tout Tunis Nord' }));
    expect(screen.getByText('3 colis sélectionnés')).toBeInTheDocument();
  });
});
