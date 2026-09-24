import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeoTreeView } from '@faffago/shared';
import { PickupRequestForm } from '@/components/pickup-request-form';
import { PickupDetailScreen, PickupsScreen } from '@/components/pickups-screen';
import { ProfileScreen } from '@/components/profile-screen';
import type {
  PickupAddress,
  PickupDetail,
  PickupView,
  ReadyParcel,
  SellerProfile,
} from '@/lib/types';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh, replace: vi.fn() }),
}));

const bff = vi.fn();
vi.mock('@/lib/client/call', () => ({ bff: (...args: unknown[]) => bff(...args) }));

beforeEach(() => {
  bff.mockReset();
  push.mockReset();
  refresh.mockReset();
});

const LOCALITE_ID = '5d0c2a8e-1f3b-4c6d-9e7f-0a1b2c3d4e5f';
const tree: GeoTreeView = {
  gouvernorats: [
    {
      code: 'ARI',
      nameFr: 'Ariana',
      nameAr: 'أريانة',
      delegations: [
        {
          id: 'd-ariana',
          code: 'ARI-VILLE',
          nameFr: 'Ariana Ville',
          nameAr: 'أريانة المدينة',
          localites: [
            {
              id: LOCALITE_ID,
              nameFr: 'Cité Ennasr 1',
              nameAr: null,
              postalCode: '2037',
              aliases: ['Ennasr'],
              isOther: false,
            },
          ],
        },
      ],
    },
  ],
};

const home: PickupAddress = {
  id: '11111111-1111-4111-8111-111111111111',
  label: null,
  localiteId: LOCALITE_ID,
  localiteNameFr: 'Cité Ennasr 1',
  delegationNameFr: 'Ariana Ville',
  gouvernoratNameFr: 'Ariana',
  address: '4 rue de Rome',
  landmark: 'En face de la pharmacie',
  isDefault: true,
};
const warehouse: PickupAddress = {
  ...home,
  id: '22222222-2222-4222-8222-222222222222',
  label: 'Entrepôt',
  address: '9 avenue Habib Bourguiba',
  landmark: null,
  isDefault: false,
};

const ready: ReadyParcel[] = [
  {
    code: 'FG-AAAA1111',
    recipientName: 'Amira Ben Salah',
    delegationNameFr: 'Ariana Ville',
    codAmountMillimes: '85000',
    createdAt: '2026-09-24T09:00:00.000Z',
  },
  {
    code: 'FG-BBBB2222',
    recipientName: 'Youssef Trabelsi',
    delegationNameFr: 'Le Bardo',
    codAmountMillimes: '42500',
    createdAt: '2026-09-24T09:05:00.000Z',
  },
];

const FEE_RULE = 'Moins de 5 colis : ramassage à 2,000 DT';

describe('Demander un ramassage', () => {
  it('asks for the pickup address at the first request and sends it with the request', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValue({ ok: true, data: { id: 'pk-1' } });
    render(
      <PickupRequestForm tree={tree} addresses={[]} readyParcels={ready} feeRule={FEE_RULE} />,
    );

    expect(screen.getByText(/enregistrée dans votre profil/)).toBeTruthy();
    await user.type(screen.getByLabelText('Rechercher une localité'), 'ennasr');
    await user.click(screen.getByRole('button', { name: /Cité Ennasr 1 — Ariana Ville, Ariana/ }));
    await user.type(screen.getByLabelText('Adresse'), '4 rue de Rome');
    await user.click(screen.getByLabelText('Matin'));
    await user.click(screen.getByRole('button', { name: 'Demander le ramassage' }));

    expect(bff).toHaveBeenCalledTimes(1);
    const [method, path, body] = bff.mock.calls[0]!;
    expect([method, path]).toEqual(['POST', 'pickups']);
    expect(body).toMatchObject({
      newAddress: {
        localiteId: LOCALITE_ID,
        address: '4 rue de Rome',
        label: null,
        landmark: null,
      },
      parcelCodes: ['FG-AAAA1111', 'FG-BBBB2222'],
      requestedSlot: 'MATIN',
      note: null,
    });
    expect(body.pickupAddressId).toBeUndefined();
    expect(body.clientRequestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(push).toHaveBeenCalledWith('/vendeur/ramassages/pk-1');
  });

  it('chooses the default address, and the parcels ready are all selected', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValue({ ok: true, data: { id: 'pk-2' } });
    render(
      <PickupRequestForm
        tree={tree}
        addresses={[warehouse, home]}
        readyParcels={ready}
        feeRule={FEE_RULE}
      />,
    );

    expect((screen.getByLabelText(/4 rue de Rome/) as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByLabelText('Adresse')).toBeNull();
    expect(screen.getByText('2 colis choisis')).toBeTruthy();

    await user.click(screen.getByLabelText(/FG-BBBB2222/));
    expect(screen.getByText('1 colis choisis')).toBeTruthy();
    await user.click(screen.getByLabelText('Après-midi'));
    await user.click(screen.getByRole('button', { name: 'Demander le ramassage' }));

    expect(bff.mock.calls[0]![2]).toMatchObject({
      pickupAddressId: home.id,
      parcelCodes: ['FG-AAAA1111'],
      requestedSlot: 'APRES_MIDI',
    });
  });

  it('sends only a count when the seller gives the number of parcels', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValue({ ok: true, data: { id: 'pk-3' } });
    render(
      <PickupRequestForm tree={tree} addresses={[home]} readyParcels={ready} feeRule={FEE_RULE} />,
    );

    await user.click(screen.getByLabelText('Indiquer seulement le nombre'));
    await user.type(screen.getByLabelText('Nombre de colis'), '12');
    await user.click(screen.getByLabelText('Matin'));
    await user.click(screen.getByRole('button', { name: 'Demander le ramassage' }));

    const body = bff.mock.calls[0]![2];
    expect(body).toMatchObject({ pickupAddressId: home.id, declaredCount: '12' });
    expect(body.parcelCodes).toBeUndefined();
  });

  it('only offers the count when no parcel is ready', () => {
    render(<PickupRequestForm tree={tree} addresses={[home]} readyParcels={[]} feeRule={null} />);
    expect((screen.getByLabelText('Choisir les colis prêts') as HTMLInputElement).disabled).toBe(
      true,
    );
    expect(screen.getByLabelText('Nombre de colis')).toBeTruthy();
    expect(screen.getByText('Aucun colis créé en attente de ramassage.')).toBeTruthy();
  });

  it('shows the fee rule before confirming, and nothing when pickups are free', () => {
    const { unmount } = render(
      <PickupRequestForm tree={tree} addresses={[home]} readyParcels={ready} feeRule={FEE_RULE} />,
    );
    expect(screen.getByRole('note').textContent).toBe(FEE_RULE);
    unmount();
    render(
      <PickupRequestForm tree={tree} addresses={[home]} readyParcels={ready} feeRule={null} />,
    );
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('refuses without a slot, then without parcels, before calling the API', async () => {
    const user = userEvent.setup();
    render(
      <PickupRequestForm tree={tree} addresses={[home]} readyParcels={ready} feeRule={FEE_RULE} />,
    );
    await user.click(screen.getByRole('button', { name: 'Demander le ramassage' }));
    expect(screen.getByText('Choisissez un créneau')).toBeTruthy();

    await user.click(screen.getByLabelText('Matin'));
    await user.click(screen.getByLabelText(/FG-AAAA1111/));
    await user.click(screen.getByLabelText(/FG-BBBB2222/));
    await user.click(screen.getByRole('button', { name: 'Demander le ramassage' }));
    expect(
      screen.getByText('Choisissez les colis à ramasser, ou indiquez leur nombre'),
    ).toBeTruthy();
    expect(bff).not.toHaveBeenCalled();
  });

  it('shows the reason the API refused the request', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValue({
      ok: false,
      error: {
        status: 409,
        code: 'RAMASSAGE_EN_COURS',
        message:
          'Un ramassage est déjà demandé à cette adresse : attendez qu’il soit effectué, ou annulez-le.',
      },
    });
    render(
      <PickupRequestForm tree={tree} addresses={[home]} readyParcels={ready} feeRule={FEE_RULE} />,
    );
    await user.click(screen.getByLabelText('Matin'));
    await user.click(screen.getByRole('button', { name: 'Demander le ramassage' }));

    expect(screen.getByRole('alert').textContent).toMatch(/déjà demandé à cette adresse/);
    expect(push).not.toHaveBeenCalled();
  });
});

const pickup: PickupDetail = {
  id: 'pk-1',
  status: 'PLANIFIE',
  requestedSlot: 'MATIN',
  note: 'Sonner deux fois',
  declaredCount: null,
  expectedCount: 2,
  scannedCount: 0,
  plannedDate: '2026-09-25',
  plannedSlot: 'MATIN',
  ramasseurFirstName: 'Karim',
  createdAt: '2026-09-24T09:00:00.000Z',
  completedAt: null,
  cancelledAt: null,
  address: home,
  parcels: [
    { code: 'FG-AAAA1111', recipientName: 'Amira Ben Salah', status: 'CREE', pickedUp: false },
    { code: 'FG-BBBB2222', recipientName: 'Youssef Trabelsi', status: 'CREE', pickedUp: false },
  ],
};

describe('Ramassages', () => {
  it('lists the requests with their status and planned day', () => {
    const view: PickupView = pickup;
    render(<PickupsScreen pickups={[view]} canRequest />);
    expect(screen.getByRole('link', { name: 'Demander un ramassage' })).toBeTruthy();
    expect(screen.getByText('Planifié')).toBeTruthy();
    expect(screen.getByText(/Prévu le 25\/09\/2026 · Matin · Karim/)).toBeTruthy();
  });

  it('offers no new request when the seller cannot make one', () => {
    render(<PickupsScreen pickups={[]} canRequest={false} />);
    expect(screen.queryByRole('link', { name: 'Demander un ramassage' })).toBeNull();
    expect(screen.getByText('Aucun ramassage demandé pour l’instant.')).toBeTruthy();
  });

  it('cancels a planned request after confirmation', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValue({ ok: true, data: {} });
    render(<PickupDetailScreen pickup={pickup} readOnly={false} />);

    await user.click(screen.getByRole('button', { name: 'Annuler le ramassage' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/sans frais/)).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Annuler le ramassage' }));

    expect(bff).toHaveBeenCalledWith('POST', 'pickups/pk-1/cancel');
    expect(refresh).toHaveBeenCalled();
  });

  it('keeps the request when the seller changes his mind', async () => {
    const user = userEvent.setup();
    render(<PickupDetailScreen pickup={pickup} readOnly={false} />);
    await user.click(screen.getByRole('button', { name: 'Annuler le ramassage' }));
    await user.click(screen.getByRole('button', { name: 'Garder le ramassage' }));
    expect(bff).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('cannot cancel when read-only or once done', () => {
    const { unmount } = render(<PickupDetailScreen pickup={pickup} readOnly />);
    expect(screen.queryByRole('button', { name: 'Annuler le ramassage' })).toBeNull();
    unmount();
    render(<PickupDetailScreen pickup={{ ...pickup, status: 'EFFECTUE' }} readOnly={false} />);
    expect(screen.queryByRole('button', { name: 'Annuler le ramassage' })).toBeNull();
  });

  it('shows which parcels were picked up once done', () => {
    render(
      <PickupDetailScreen
        pickup={{
          ...pickup,
          status: 'EFFECTUE',
          scannedCount: 1,
          parcels: [
            { ...pickup.parcels[0]!, status: 'RAMASSE', pickedUp: true },
            pickup.parcels[1]!,
          ],
        }}
        readOnly={false}
      />,
    );
    expect(screen.getByText('1 ramassés sur 2')).toBeTruthy();
    expect(screen.getByText('Ramassé')).toBeTruthy();
    expect(screen.getByText('Non ramassé')).toBeTruthy();
  });
});

const profile: SellerProfile = {
  shopName: 'Bijoux Yasmine',
  productCategory: 'ACCESSOIRES',
  storeLink: null,
  contactFullName: 'Yasmine Gharbi',
  contactPhone: '22123456',
  email: 'yasmine@example.tn',
  statut: 'CIN_UNIQUEMENT',
  accountState: 'ACTIF',
  rates: {
    deliveryFeeMillimes: '7000',
    returnFeeMillimes: '3000',
    changeClientFeeMillimes: '1000',
    pickupFeeMillimes: '2000',
    pickupFreeThreshold: 5,
    retenueRateBps: 300,
  },
};

describe('Profil', () => {
  it('shows the shop, the retenue note and the rates', () => {
    render(<ProfileScreen profile={profile} addresses={[home]} tree={tree} readOnly={false} />);
    expect(screen.getByText('Bijoux Yasmine')).toBeTruthy();
    expect(screen.getByText(/Retenue à la source de 3 % sur chaque paiement/)).toBeTruthy();
    expect(screen.getByText('7,000 DT')).toBeTruthy();
    expect(screen.getByText('1,000 DT')).toBeTruthy();
    expect(screen.getByText('2,000 DT en dessous de 5 colis, gratuit à partir de 5')).toBeTruthy();
    expect(screen.getByText(/contactez Faffa Go/)).toBeTruthy();
  });

  it('makes another address the default', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValue({ ok: true, data: {} });
    render(
      <ProfileScreen
        profile={profile}
        addresses={[home, warehouse]}
        tree={tree}
        readOnly={false}
      />,
    );
    expect(screen.getByText('Par défaut')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Choisir par défaut' }));
    expect(bff).toHaveBeenCalledWith('POST', `pickup-addresses/${warehouse.id}/default`);
    expect(refresh).toHaveBeenCalled();
  });

  it('corrects an address, warning that past requests keep the old one', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValue({ ok: true, data: {} });
    render(<ProfileScreen profile={profile} addresses={[home]} tree={tree} readOnly={false} />);

    await user.click(screen.getByRole('button', { name: 'Modifier' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/gardent l’ancienne adresse/)).toBeTruthy();
    const address = within(dialog).getByLabelText('Adresse');
    await user.clear(address);
    await user.type(address, '6 rue de Rome');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    expect(bff).toHaveBeenCalledWith('PATCH', `pickup-addresses/${home.id}`, {
      label: null,
      localiteId: LOCALITE_ID,
      address: '6 rue de Rome',
      landmark: 'En face de la pharmacie',
    });
    expect(refresh).toHaveBeenCalled();
  });

  it('adds an address, checking it first', async () => {
    const user = userEvent.setup();
    render(<ProfileScreen profile={profile} addresses={[]} tree={tree} readOnly={false} />);
    expect(screen.getByText(/demandée à votre premier ramassage/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Ajouter une adresse' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Enregistrer' }),
    );
    expect(bff).not.toHaveBeenCalled();
    expect(screen.getByText('Localité obligatoire')).toBeTruthy();
  });

  it('changes nothing when read-only', () => {
    render(<ProfileScreen profile={profile} addresses={[home, warehouse]} tree={tree} readOnly />);
    expect(screen.queryByRole('button', { name: 'Ajouter une adresse' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Modifier' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Choisir par défaut' })).toBeNull();
  });
});
