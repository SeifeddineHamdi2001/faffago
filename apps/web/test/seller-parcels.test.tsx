import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeoTreeView } from '@faffago/shared';
import { ParcelForm } from '@/components/parcel-form';
import { ParcelScreen, REPRINT_WARNING } from '@/components/parcel-screen';
import type { SellerParcel } from '@/lib/types';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh, replace: vi.fn() }),
}));

const bff = vi.fn();
vi.mock('@/lib/client/call', () => ({ bff: (...args: unknown[]) => bff(...args) }));

beforeEach(() => {
  bff.mockReset();
  refresh.mockReset();
});

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
              id: '5d0c2a8e-1f3b-4c6d-9e7f-0a1b2c3d4e5f',
              nameFr: 'Cité Ennasr 1',
              nameAr: null,
              postalCode: '2037',
              aliases: ['Ennasr'],
              isOther: false,
            },
            {
              id: '6e1d3b9f-2a4c-4d7e-8f90-1b2c3d4e5f60',
              nameFr: 'Autre',
              nameAr: 'أخرى',
              postalCode: null,
              aliases: [],
              isOther: true,
            },
          ],
        },
      ],
    },
  ],
};

const parcel: SellerParcel = {
  id: 'p1',
  code: 'FG-8K2QX7AB',
  status: 'CREE',
  location: 'CHEZ_LE_VENDEUR',
  cashStatus: null,
  recipientName: 'Amira Ben Salah',
  recipientPhone: '29876543',
  recipientPhone2: null,
  localite: { id: '5d0c2a8e-1f3b-4c6d-9e7f-0a1b2c3d4e5f', nameFr: 'Cité Ennasr 1' },
  delegation: { id: 'd-ariana', nameFr: 'Ariana Ville', gouvernoratNameFr: 'Ariana' },
  address: '12 rue de Marseille',
  landmark: null,
  productDescription: '2 bracelets',
  pieceCount: 2,
  codAmountMillimes: '85000',
  isExchange: false,
  openingAllowed: true,
  courierNote: null,
  deliveryFeeMillimes: '5500',
  returnFeeMillimes: '2000',
  createdAt: '2026-09-24T09:00:00.000Z',
  cancelledAt: null,
  changeRequests: [],
};

async function fillNewParcel(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Nom du destinataire'), 'Amira Ben Salah');
  await user.type(screen.getByLabelText('Téléphone'), '29876543');
  await user.type(screen.getByLabelText('Rechercher une localité'), 'ennasr');
  await user.click(screen.getByRole('button', { name: /Cité Ennasr 1 — Ariana Ville, Ariana/ }));
  await user.type(screen.getByLabelText('Adresse'), '12 rue de Marseille');
  await user.type(screen.getByLabelText('Description du produit'), '2 bracelets');
  await user.type(screen.getByLabelText('Montant COD (DT)'), '85,000');
}

describe('Créer un colis (Vendeur 4.2)', () => {
  it('finds the localité by its other name and fills gouvernorat and délégation', async () => {
    const user = userEvent.setup();
    render(<ParcelForm tree={tree} />);
    await user.type(screen.getByLabelText('Rechercher une localité'), 'ennasr');
    await user.click(screen.getByRole('button', { name: /Cité Ennasr 1/ }));
    expect((screen.getByLabelText('Gouvernorat') as HTMLSelectElement).value).toBe('ARI');
    expect((screen.getByLabelText('Délégation') as HTMLSelectElement).value).toBe('d-ariana');
    expect((screen.getByLabelText('Localité') as HTMLSelectElement).value).toBe(
      '5d0c2a8e-1f3b-4c6d-9e7f-0a1b2c3d4e5f',
    );
  });

  it('keeps Autre out of the search and last in its délégation (D-17)', async () => {
    const user = userEvent.setup();
    render(<ParcelForm tree={tree} />);
    await user.type(screen.getByLabelText('Rechercher une localité'), 'autre');
    expect(screen.queryByRole('button', { name: /Autre/ })).toBeNull();
    await user.selectOptions(screen.getByLabelText('Gouvernorat'), 'ARI');
    await user.selectOptions(screen.getByLabelText('Délégation'), 'd-ariana');
    const options = within(screen.getByLabelText('Localité')).getAllByRole('option');
    expect(options.at(-1)!.textContent).toBe('Autre');
  });

  it('refuses a malformed form before calling the API', async () => {
    const user = userEvent.setup();
    render(<ParcelForm tree={tree} />);
    await user.type(screen.getByLabelText('Téléphone'), '1234');
    await user.click(screen.getByRole('button', { name: 'Créer le colis' }));
    expect(screen.getByText('8 chiffres, format tunisien')).toBeTruthy();
    expect(screen.getByText('Localité obligatoire')).toBeTruthy();
    expect(bff).not.toHaveBeenCalled();
  });

  it('sends the same request id on a retry, so the parcel is created once', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({ ok: false, status: 503, error: { message: 'Réessayez.' } });
    bff.mockResolvedValueOnce({ ok: true, data: parcel });
    const onCreated = vi.fn();
    render(<ParcelForm tree={tree} onCreated={onCreated} />);
    await fillNewParcel(user);
    await user.click(screen.getByRole('button', { name: 'Créer le colis' }));
    await user.click(screen.getByRole('button', { name: 'Créer le colis' }));

    expect(bff).toHaveBeenCalledTimes(2);
    const [first, second] = bff.mock.calls.map((call) => call[2] as Record<string, unknown>);
    expect(first!.clientRequestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(second!.clientRequestId).toBe(first!.clientRequestId);
    expect(first).toMatchObject({
      localiteId: '5d0c2a8e-1f3b-4c6d-9e7f-0a1b2c3d4e5f',
      codAmountMillimes: '85,000',
      recipientPhone2: null,
      landmark: null,
    });
    expect(onCreated).toHaveBeenCalledWith(parcel);
  });
});

describe('Modifier (Vendeur 4.6, D-41)', () => {
  it('sends only what changed, the COD compared as an amount', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({
      ok: true,
      data: { parcel, changedFields: ['address'], reprintLabel: true },
    });
    render(<ParcelForm tree={tree} parcel={parcel} onEdited={vi.fn()} />);
    const cod = screen.getByLabelText('Montant COD (DT)');
    expect((cod as HTMLInputElement).value).toBe('85,000');
    await user.clear(cod);
    await user.type(cod, '85');
    const address = screen.getByLabelText('Adresse');
    await user.clear(address);
    await user.type(address, '14 rue de Rome');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(bff).toHaveBeenCalledWith('PATCH', 'parcels/FG-8K2QX7AB', { address: '14 rue de Rome' });
  });

  it('asks for a reprint when a printed field changed', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({
      ok: true,
      data: { parcel, changedFields: ['codAmountMillimes'], reprintLabel: true },
    });
    render(<ParcelScreen parcel={parcel} tree={tree} readOnly={false} />);
    await user.click(screen.getByRole('button', { name: 'Modifier' }));
    const cod = screen.getByLabelText('Montant COD (DT)');
    await user.clear(cod);
    await user.type(cod, '90,000');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByRole('status').textContent).toBe(REPRINT_WARNING);
  });
});

describe('the parcel page', () => {
  it('before pickup: Modifier and Annuler, no change request', () => {
    render(<ParcelScreen parcel={parcel} tree={tree} readOnly={false} />);
    expect(screen.getByRole('button', { name: 'Modifier' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Annuler le colis' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Demander une modification' })).toBeNull();
  });

  it('after pickup: the cancellation says it becomes a return and what it costs (D-28)', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({ ok: true, data: parcel });
    render(
      <ParcelScreen parcel={{ ...parcel, status: 'AU_DEPOT' }} tree={tree} readOnly={false} />,
    );
    expect(screen.queryByRole('button', { name: 'Modifier' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Annuler le colis' }));
    const dialog = screen.getByRole('dialog', { name: 'Annuler le colis' });
    expect(dialog.textContent).toContain('il devient un retour');
    expect(dialog.textContent).toContain('2,000 DT');
    await user.click(within(dialog).getByRole('button', { name: 'Annuler le colis' }));
    expect(bff).toHaveBeenCalledWith('POST', 'parcels/FG-8K2QX7AB/cancel');
  });

  it('files a change request with only the fields filled in', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({ ok: true, data: {} });
    render(
      <ParcelScreen parcel={{ ...parcel, status: 'AU_DEPOT' }} tree={tree} readOnly={false} />,
    );
    await user.click(screen.getByRole('button', { name: 'Demander une modification' }));
    const dialog = screen.getByRole('dialog', { name: 'Demander une modification' });
    await user.click(within(dialog).getByRole('button', { name: 'Envoyer la demande' }));
    expect(within(dialog).getByText('Indiquez au moins une modification')).toBeTruthy();
    expect(bff).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText('Nouveau téléphone'), '98765432');
    await user.click(within(dialog).getByRole('button', { name: 'Envoyer la demande' }));
    expect(bff).toHaveBeenCalledWith('POST', 'parcels/FG-8K2QX7AB/change-requests', {
      recipientPhone: '98765432',
    });
  });

  it('offers nothing once delivered, or in "Voir comme le vendeur" (D-5)', () => {
    const { unmount } = render(
      <ParcelScreen parcel={{ ...parcel, status: 'LIVRE' }} tree={tree} readOnly={false} />,
    );
    expect(screen.queryByRole('button')).toBeNull();
    unmount();
    render(<ParcelScreen parcel={parcel} tree={tree} readOnly />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('one waiting request, edited or withdrawn (D-44)', () => {
  const waiting = {
    id: 'r1',
    requestedFields: {
      localiteId: '5d0c2a8e-1f3b-4c6d-9e7f-0a1b2c3d4e5f',
      address: '3 rue de Carthage',
    },
    requestedLocalite: {
      id: '5d0c2a8e-1f3b-4c6d-9e7f-0a1b2c3d4e5f',
      nameFr: 'Cité Ennasr 1',
      delegationNameFr: 'Ariana Ville',
    },
    sellerNote: 'Déménagé',
    status: 'EN_ATTENTE' as const,
    createdAt: '2026-09-24T10:00:00.000Z',
    editedAt: null,
    handledAt: null,
  };
  const atDepot = { ...parcel, status: 'AU_DEPOT' as const, changeRequests: [waiting] };

  it('shows the localité asked for by name, and no second request button', () => {
    render(<ParcelScreen parcel={atDepot} tree={tree} readOnly={false} />);
    expect(screen.getByText('Localité : Cité Ennasr 1 — Ariana Ville')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Demander une modification' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Modifier la demande' })).toBeTruthy();
  });

  it('edits the waiting request, prefilled, with PATCH', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({ ok: true, data: waiting });
    render(<ParcelScreen parcel={atDepot} tree={tree} readOnly={false} />);
    await user.click(screen.getByRole('button', { name: 'Modifier la demande' }));
    const dialog = screen.getByRole('dialog', { name: 'Modifier la demande' });
    expect((within(dialog).getByLabelText('Nouvelle adresse') as HTMLInputElement).value).toBe(
      '3 rue de Carthage',
    );
    expect((within(dialog).getByLabelText('Localité') as HTMLSelectElement).value).toBe(
      waiting.requestedFields.localiteId,
    );
    await user.type(within(dialog).getByLabelText('Nouveau téléphone'), '98765432');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer la demande' }));
    expect(bff).toHaveBeenCalledWith('PATCH', 'parcels/FG-8K2QX7AB/change-requests/r1', {
      recipientPhone: '98765432',
      localiteId: waiting.requestedFields.localiteId,
      address: '3 rue de Carthage',
      note: 'Déménagé',
    });
  });

  it('withdraws it after a confirmation', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({ ok: true, data: {} });
    render(<ParcelScreen parcel={atDepot} tree={tree} readOnly={false} />);
    await user.click(screen.getByRole('button', { name: 'Retirer la demande' }));
    const dialog = screen.getByRole('dialog', { name: 'Retirer la demande' });
    await user.click(within(dialog).getByRole('button', { name: 'Retirer la demande' }));
    expect(bff).toHaveBeenCalledWith('POST', 'parcels/FG-8K2QX7AB/change-requests/r1/withdraw');
    expect(refresh).toHaveBeenCalled();
  });

  it('offers a new request once the waiting one is withdrawn', () => {
    render(
      <ParcelScreen
        parcel={{ ...atDepot, changeRequests: [{ ...waiting, status: 'RETIREE' }] }}
        tree={tree}
        readOnly={false}
      />,
    );
    expect(screen.getByText(/Retirée/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Demander une modification' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retirer la demande' })).toBeNull();
  });
});
