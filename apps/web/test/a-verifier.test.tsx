import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeoTreeView } from '@faffago/shared';
import { FollowUpScreen } from '@/components/follow-up-screen';
import { ParcelScreen } from '@/components/parcel-screen';
import { SellerNav } from '@/components/seller-nav';
import { SellerVerifyScreen } from '@/components/seller-verify-screen';
import { VerifyBanner } from '@/components/verify-banner';
import type { FollowUpList, SellerParcelDetail, SellerVerifyList } from '@/lib/types';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh, replace: vi.fn() }),
  usePathname: () => '/vendeur',
}));

const bff = vi.fn();
vi.mock('@/lib/client/call', () => ({ bff: (...args: unknown[]) => bff(...args) }));

beforeEach(() => {
  bff.mockReset();
  refresh.mockReset();
});

const NOW = '2026-09-25T08:00:00.000Z';
const inHours = (h: number) => new Date(Date.parse(NOW) + h * 3_600_000).toISOString();

const tree: GeoTreeView = { gouvernorats: [] };

const parcel: SellerParcelDetail = {
  id: 'p1',
  code: 'FG-8K2QX7AB',
  status: 'A_VERIFIER',
  location: 'AVEC_LE_LIVREUR',
  cashStatus: null,
  recipientName: 'Amira Ben Salah',
  recipientPhone: '29876543',
  recipientPhone2: null,
  localite: { id: 'l1', nameFr: 'Cité Ennasr 1' },
  delegation: { id: 'd1', nameFr: 'Ariana Ville', gouvernoratNameFr: 'Ariana' },
  address: '12 rue de Marseille',
  landmark: null,
  productDescription: '2 bracelets',
  pieceCount: 2,
  codAmountMillimes: '85000',
  isExchange: false,
  openingAllowed: false,
  courierNote: null,
  deliveryFeeMillimes: '5500',
  returnFeeMillimes: '2000',
  changeClientFeeMillimes: '1000',
  createdAt: '2026-09-24T09:00:00.000Z',
  cancelledAt: null,
  changeRequests: [],
  attemptCount: 1,
  maxAttempts: 3,
  lastFailureReason: 'NE_REPOND_PAS',
  lastFailureNote: 'Client dit rappeler après 17 h',
  verifyDeadlineAt: inHours(31.5),
  relaunchDate: null,
  relaunchSlot: null,
  relaunchOrigin: null,
  decisions: {
    relancer: true,
    retourner: true,
    changerDate: false,
    changerClient: 'AU_RETOUR_DEPOT',
  },
  calls: [{ calledAt: '2026-09-25T07:30:00.000Z', answered: false, note: 'Messagerie' }],
  now: NOW,
  bonNumber: null,
  timeline: [],
};

describe('Détail du colis, À vérifier (Vendeur 4.9, D-71)', () => {
  it('shows the reason, the courier note, the time left and Appels Faffa Go', () => {
    render(<ParcelScreen parcel={parcel} tree={tree} readOnly={false} />);
    expect(screen.getByText('À vérifier · Ne répond pas')).toBeInTheDocument();
    expect(
      screen.getAllByText('Note du livreur : « Client dit rappeler après 17 h »').length,
    ).toBeGreaterThan(0);
    expect(screen.getByText('Retour automatique dans 31 h 30 min')).toBeInTheDocument();
    const calls = screen.getByRole('region', { name: 'Appels Faffa Go' });
    expect(within(calls).getByText(/Pas de réponse/)).toBeInTheDocument();
    expect(within(calls).getByText('Messagerie')).toBeInTheDocument();
  });

  it('keeps Changer de client disabled while the courier has it', () => {
    render(<ParcelScreen parcel={parcel} tree={tree} readOnly={false} />);
    expect(
      screen.getByRole('button', { name: /Changer de client · Disponible au retour au dépôt/ }),
    ).toBeDisabled();
  });

  it('Relancer sends the date and only the corrections the seller made', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({ ok: true, data: { parcel, reprintLabel: true } });
    render(<ParcelScreen parcel={parcel} tree={tree} readOnly={false} />);

    await user.click(screen.getByRole('button', { name: 'Relancer' }));
    const dialog = screen.getByRole('dialog', { name: 'Relancer le colis' });
    const date = within(dialog).getByLabelText('Jour de livraison');
    expect(date).toHaveAttribute('min', '2026-09-26');
    expect(date).toHaveAttribute('max', '2026-10-02');

    // Without a date: the seller's wording (D-29), nothing sent.
    await user.click(within(dialog).getByRole('button', { name: 'Relancer' }));
    expect(
      within(dialog).getByText('Choisissez le jour de la nouvelle tentative de livraison'),
    ).toBeInTheDocument();
    expect(bff).not.toHaveBeenCalled();

    await user.type(date, '2026-09-27');
    await user.selectOptions(within(dialog).getByLabelText('Créneau (facultatif)'), 'SOIR');
    const phone = within(dialog).getByLabelText('Téléphone');
    await user.clear(phone);
    await user.type(phone, '98765432');
    await user.click(within(dialog).getByRole('button', { name: 'Relancer' }));

    expect(bff).toHaveBeenCalledWith('POST', 'parcels/FG-8K2QX7AB/relancer', {
      date: '2026-09-27',
      slot: 'SOIR',
      recipientPhone: '98765432',
    });
    expect(refresh).toHaveBeenCalled();
    expect(
      screen.getByText(
        'Informations mises à jour. Faffa Go réimprime l’étiquette au dépôt, avec le même code.',
      ),
    ).toBeInTheDocument();
  });

  it('Retourner states the return fee before confirming', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({ ok: true, data: { parcel, reprintLabel: false } });
    render(<ParcelScreen parcel={parcel} tree={tree} readOnly={false} />);
    await user.click(screen.getByRole('button', { name: 'Retourner' }));
    expect(screen.getByText(/Frais de retour : 2,000 DT/)).toBeInTheDocument();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Retourner' }));
    expect(bff).toHaveBeenCalledWith('POST', 'parcels/FG-8K2QX7AB/retourner');
  });

  it('Changer de client at the depot states its fee', async () => {
    const user = userEvent.setup();
    render(
      <ParcelScreen
        parcel={{
          ...parcel,
          location: 'AU_DEPOT',
          decisions: { ...parcel.decisions, changerClient: 'OUI' },
        }}
        tree={tree}
        readOnly={false}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Changer de client' }));
    expect(
      screen.getByText(/Frais de changement de client : 1,000 DT, déduits de votre prochain/),
    ).toBeInTheDocument();
  });

  it('shows a customer postponement with its day, and no decision under impersonation', () => {
    render(
      <ParcelScreen
        parcel={{
          ...parcel,
          status: 'RELANCE',
          relaunchDate: '2026-09-26',
          relaunchSlot: 'MATIN',
          relaunchOrigin: 'CLIENT',
          verifyDeadlineAt: null,
          decisions: { relancer: false, retourner: true, changerDate: true, changerClient: 'NON' },
        }}
        tree={tree}
        readOnly
      />,
    );
    expect(
      screen.getByText('Reporté au samedi 26/09 (Matin), à la demande du client'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Changer la date' })).not.toBeInTheDocument();
  });
});

describe('À vérifier list, badge and banner', () => {
  const list: SellerVerifyList = {
    now: NOW,
    items: [
      {
        code: 'FG-8K2QX7AB',
        recipientName: 'Amira Ben Salah',
        recipientPhone: '29876543',
        localiteNameFr: 'Cité Ennasr 1',
        delegationNameFr: 'Ariana Ville',
        codAmountMillimes: '85000',
        failureReason: 'INJOIGNABLE',
        courierFailureNote: 'Téléphone éteint',
        attemptCount: 2,
        maxAttempts: 3,
        location: 'AU_DEPOT',
        verifyDeadlineAt: inHours(5),
        decisions: { relancer: true, retourner: true, changerDate: false, changerClient: 'OUI' },
        callCount: 1,
      },
    ],
  };

  it('lists each parcel with its reason, note, attempt and a way to decide', () => {
    render(<SellerVerifyScreen list={list} />);
    expect(screen.getByText('À vérifier · Injoignable')).toBeInTheDocument();
    expect(screen.getByText('Note du livreur : « Téléphone éteint »')).toBeInTheDocument();
    expect(screen.getByText(/Tentative 2 sur 3 · Au dépôt · 1 appel Faffa Go/)).toBeInTheDocument();
    expect(screen.getByText('Retour automatique dans 5 h')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Décider' })).toHaveAttribute(
      'href',
      '/vendeur/colis/FG-8K2QX7AB#decision',
    );
  });

  it('says so when nothing waits', () => {
    render(<SellerVerifyScreen list={{ now: NOW, items: [] }} />);
    expect(screen.getByText('Aucun colis à vérifier.')).toBeInTheDocument();
  });

  it('puts the count on the menu', () => {
    render(<SellerNav aVerifierCount={3} />);
    expect(screen.getByRole('link', { name: /À vérifier/ })).toHaveTextContent('3');
    expect(screen.getByLabelText('3 colis à vérifier')).toBeInTheDocument();
  });

  it('the banner lists the parcels under 24 hours, and is absent otherwise', () => {
    const { rerender } = render(
      <VerifyBanner
        summary={{
          now: NOW,
          count: 2,
          urgent: [{ code: 'FG-8K2QX7AB', recipientName: 'Amira', verifyDeadlineAt: inHours(3) }],
        }}
      />,
    );
    const banner = screen.getByRole('alert');
    expect(within(banner).getByText('Moins de 24 h pour décider sur 1 colis')).toBeInTheDocument();
    expect(within(banner).getByText('Retour automatique dans 3 h')).toBeInTheDocument();
    rerender(<VerifyBanner summary={{ now: NOW, count: 2, urgent: [] }} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('Service client follow-up (Admin 4.6)', () => {
  const list: FollowUpList = {
    now: NOW,
    items: [
      {
        code: 'FG-8K2QX7AB',
        shopName: 'Boutique Démo',
        sellerContactName: 'Sami Ben Ali',
        sellerContactPhone: '22111333',
        recipientName: 'Amira Ben Salah',
        recipientPhone: '29876543',
        recipientPhone2: null,
        delegationNameFr: 'Ariana Ville',
        failureReason: 'NE_REPOND_PAS',
        courierFailureNote: 'Personne',
        attemptCount: 1,
        maxAttempts: 3,
        location: 'AVEC_LE_LIVREUR',
        verifyDeadlineAt: inHours(10),
        lastCall: null,
        callCount: 0,
      },
    ],
  };

  it('shows who to call, and logs a call', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({ ok: true, data: {} });
    render(<FollowUpScreen list={list} />);
    expect(
      screen.getByText(/Vendeur : Boutique Démo · Sami Ben Ali · 22111333/),
    ).toBeInTheDocument();
    expect(screen.getByText('Retour dans 10 h')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Noter un appel' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer l’appel' }));
    expect(within(dialog).getByText('Indiquez si le client a répondu.')).toBeInTheDocument();

    await user.click(within(dialog).getByLabelText('Pas de réponse'));
    await user.type(within(dialog).getByLabelText('Note (visible par le vendeur)'), 'Messagerie');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer l’appel' }));
    expect(bff).toHaveBeenCalledWith('POST', 'colis/FG-8K2QX7AB/appels', {
      answered: false,
      note: 'Messagerie',
    });
    expect(refresh).toHaveBeenCalled();
  });
});
