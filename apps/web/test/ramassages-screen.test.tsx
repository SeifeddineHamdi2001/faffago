import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RamassageDetailScreen, RamassagesScreen } from '@/components/ramassages-screen';
import type { CourierRow, RamassageDetail, RamassageRow } from '@/lib/types';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const bff = vi.fn();
vi.mock('@/lib/client/call', () => ({ bff: (...args: unknown[]) => bff(...args) }));

const hedi = { id: 'u-hedi', firstName: 'Hédi', lastName: 'Test' };

const demande: RamassageRow = {
  id: 'p1',
  status: 'DEMANDE',
  shopName: 'Boutique Yasmine',
  contactPhone: '50990001',
  address: {
    address: '12 rue de la Plage',
    landmark: 'Face à la pharmacie',
    localiteNameFr: 'Gammarth',
    delegationNameFr: 'La Marsa',
    zone: { id: 'z1', name: 'Tunis Nord' },
  },
  requestedSlot: 'APRES_MIDI',
  note: 'Sonner deux fois',
  expectedCount: 4,
  scannedCount: 0,
  plannedDate: null,
  plannedSlot: null,
  ramasseur: null,
  createdAt: '2026-09-25T07:00:00.000Z',
  suggestion: { ramasseur: hedi, kind: 'TITULAIRE' },
};

const planned: RamassageRow = {
  ...demande,
  id: 'p2',
  status: 'PLANIFIE',
  plannedDate: '2026-09-26',
  plannedSlot: 'MATIN',
  ramasseur: hedi,
  suggestion: null,
};

function courier(id: string, firstName: string, extra: Partial<CourierRow> = {}): CourierRow {
  return {
    id,
    role: 'RAMASSEUR',
    firstName,
    lastName: 'Test',
    phone: '50990000',
    zones: [],
    absentToday: false,
    ...extra,
  };
}
const couriers = [
  courier('u-hedi', 'Hédi'),
  courier('u-karim', 'Karim'),
  courier('u-stop', 'Nizar', { acceptsWork: false }),
  courier('u-ali', 'Ali', { role: 'LIVREUR' }),
];

beforeEach(() => {
  bff.mockReset();
  refresh.mockReset();
});

describe('RamassagesScreen (Admin 4.4, D-58)', () => {
  it('has a tab per status, the current one marked', () => {
    render(<RamassagesScreen rows={[demande]} status="DEMANDE" couriers={couriers} />);
    const tabs = screen.getByRole('navigation', { name: 'Statut des ramassages' });
    expect(
      within(tabs)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Demandés', 'Planifiés', 'Effectués', 'Annulés']);
    expect(within(tabs).getByRole('link', { name: 'Demandés' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(tabs).getByRole('link', { name: 'Planifiés' })).toHaveAttribute(
      'href',
      '/admin/ramassages?statut=PLANIFIE',
    );
  });

  it('shows a request with its shop, place, zone, window, parcels and note', () => {
    render(<RamassagesScreen rows={[demande]} status="DEMANDE" couriers={couriers} />);
    const card = screen.getByRole('article', { name: 'Boutique Yasmine' });
    expect(card).toHaveTextContent('12 rue de la Plage');
    expect(card).toHaveTextContent('Face à la pharmacie');
    expect(card).toHaveTextContent('Gammarth, La Marsa · Tunis Nord');
    expect(card).toHaveTextContent('Après-midi');
    expect(card).toHaveTextContent('4 colis');
    expect(card).toHaveTextContent('Sonner deux fois');
    expect(card).toHaveTextContent('50990001');
    expect(within(card).getByRole('link', { name: 'Détail' })).toHaveAttribute(
      'href',
      '/admin/ramassages/p1',
    );
  });

  it('plans a request with the ramasseur of the zone pre-filled', async () => {
    const user = userEvent.setup();
    bff
      // The day typed asks who covers the zone then…
      .mockResolvedValueOnce({ ok: true, data: { ramasseur: hedi, kind: 'TITULAIRE' } })
      // … then the plan is sent.
      .mockResolvedValueOnce({ ok: true, data: { ...planned, id: 'p1' } });
    render(<RamassagesScreen rows={[demande]} status="DEMANDE" couriers={couriers} />);

    await user.click(screen.getByRole('button', { name: 'Planifier' }));
    const dialog = screen.getByRole('dialog', { name: 'Planifier le ramassage' });
    expect(within(dialog).getByLabelText('Créneau')).toHaveValue('APRES_MIDI');
    const select = within(dialog).getByLabelText('Ramasseur');
    expect(select).toHaveValue('u-hedi');
    // Ramasseurs who take work only.
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Choisir…', 'Hédi Test', 'Karim Test']);
    await user.clear(within(dialog).getByLabelText('Jour'));
    await user.type(within(dialog).getByLabelText('Jour'), '2026-09-26');
    await user.click(within(dialog).getByRole('button', { name: 'Planifier' }));

    expect(bff).toHaveBeenLastCalledWith('POST', 'ramassages/p1/plan', {
      date: '2026-09-26',
      slot: 'APRES_MIDI',
      ramasseurId: 'u-hedi',
    });
    expect(refresh).toHaveBeenCalled();
  });

  it('pre-fills again the ramasseur covering the zone on the day chosen', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValue({
      ok: true,
      data: { ramasseur: { id: 'u-karim', firstName: 'Karim', lastName: 'Test' }, kind: 'BACKUP' },
    });
    render(<RamassagesScreen rows={[demande]} status="DEMANDE" couriers={couriers} />);
    await user.click(screen.getByRole('button', { name: 'Planifier' }));
    const dialog = screen.getByRole('dialog', { name: 'Planifier le ramassage' });
    await user.clear(within(dialog).getByLabelText('Jour'));
    await user.type(within(dialog).getByLabelText('Jour'), '2026-09-27');

    expect(bff).toHaveBeenCalledWith('GET', 'ramassages/p1/suggestion?date=2026-09-27');
    expect(
      await within(dialog).findByText('Backup de la zone ce jour-là : Karim Test'),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Ramasseur')).toHaveValue('u-karim');
  });

  it('shows the refusal of the API in the dialog', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({
      ok: false,
      status: 409,
      error: {
        code: 'COURSIER_INDISPONIBLE',
        message: 'Coursier indisponible : absent, inactif ou ne reçoit plus de travail',
      },
    });
    render(<RamassagesScreen rows={[demande]} status="DEMANDE" couriers={couriers} />);
    await user.click(screen.getByRole('button', { name: 'Planifier' }));
    const dialog = screen.getByRole('dialog', { name: 'Planifier le ramassage' });
    await user.click(within(dialog).getByRole('button', { name: 'Planifier' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Coursier indisponible');
  });

  it('shows a planned pickup with its day, window and ramasseur, and Replanifier', () => {
    render(<RamassagesScreen rows={[planned]} status="PLANIFIE" couriers={couriers} />);
    const card = screen.getByRole('article', { name: 'Boutique Yasmine' });
    expect(card).toHaveTextContent('Planifié le 26/09/2026 · Matin · Hédi Test');
    expect(within(card).getByRole('button', { name: 'Replanifier' })).toBeInTheDocument();
  });

  it('offers no planning on a done or cancelled pickup, and never a cancel button', () => {
    render(
      <RamassagesScreen
        rows={[{ ...planned, status: 'EFFECTUE' }]}
        status="EFFECTUE"
        couriers={couriers}
      />,
    );
    expect(screen.queryByRole('button', { name: /planifier/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /annuler/i })).toBeNull();
  });

  it('says when a tab is empty', () => {
    render(<RamassagesScreen rows={[]} status="DEMANDE" couriers={couriers} />);
    expect(screen.getByText('Aucun ramassage.')).toBeInTheDocument();
  });
});

describe('RamassageDetailScreen', () => {
  const detail: RamassageDetail = {
    ...planned,
    parcels: [
      { code: 'FG-AAAAAAAA', recipientName: 'Amira', status: 'CREE', pickedUp: false },
      { code: 'FG-BBBBBBBB', recipientName: 'Sami', status: 'RAMASSE', pickedUp: true },
    ],
    aEmporter: {
      bonsVersement: [{ number: 'BV-2026-0926-01', netMillimes: '78000' }],
      bonsRetour: [{ number: 'BR-2026-0926-01', parcelCount: 2 }],
    },
  };

  it('lists the parcels announced, picked up or not, and À emporter', () => {
    render(<RamassageDetailScreen detail={detail} />);
    const parcels = screen.getByRole('list', { name: 'Colis annoncés' });
    expect(
      within(parcels)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['FG-AAAAAAAA · Amira · À ramasser', 'FG-BBBBBBBB · Sami · Ramassé']);
    const emporter = screen.getByRole('region', { name: 'À emporter' });
    expect(emporter).toHaveTextContent('BV-2026-0926-01 · 78,000 DT');
    expect(emporter).toHaveTextContent('BR-2026-0926-01 · 2 colis');
  });

  it('says so when the seller only gave a number, and when nothing is to take', () => {
    render(
      <RamassageDetailScreen
        detail={{ ...detail, parcels: [], aEmporter: { bonsVersement: [], bonsRetour: [] } }}
      />,
    );
    expect(screen.getByText('Le vendeur a indiqué 4 colis, sans les lister.')).toBeInTheDocument();
    expect(screen.getByText('Rien à emporter pour ce vendeur.')).toBeInTheDocument();
  });
});
