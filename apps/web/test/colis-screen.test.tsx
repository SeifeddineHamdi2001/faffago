import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PERMISSIONS_BY_ROLE } from '@faffago/shared';
import { ColisDetailScreen, ColisScreen } from '@/components/colis-screen';
import type { StaffParcelDetail, StaffParcelList } from '@/lib/types';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const filters = {
  zones: [{ id: 'z1', name: 'Tunis Nord' }],
  sellers: [{ id: 's1', shopName: 'Boutique Yasmine' }],
  livreurs: [{ id: 'u-ali', firstName: 'Ali', lastName: 'Ben Salah' }],
};

const list: StaffParcelList = {
  items: [
    {
      code: 'FG-AAAAAAAA',
      createdAt: '2026-09-25T08:00:00.000Z',
      sellerId: 's1',
      shopName: 'Boutique Yasmine',
      recipientName: 'Amira Trabelsi',
      recipientPhone: '22111333',
      delegationNameFr: 'La Marsa',
      localiteNameFr: 'Gammarth',
      zoneName: 'Tunis Nord',
      status: 'EN_LIVRAISON',
      location: 'AVEC_LE_LIVREUR',
      cashStatus: null,
      codAmountMillimes: '85000',
      courier: { firstName: 'Ali', lastName: 'Ben Salah' },
      labelReprintNeeded: false,
    },
  ],
  total: 60,
  page: 1,
  pageSize: 50,
};

describe('ColisScreen (Admin 4.3)', () => {
  it('keeps the filters in the form, the zone list with Sans zone', () => {
    render(
      <ColisScreen
        list={list}
        query={{ q: 'amira', status: 'EN_LIVRAISON', zoneId: 'SANS_ZONE' }}
        filters={filters}
      />,
    );
    expect(screen.getByLabelText('Recherche')).toHaveValue('amira');
    expect(screen.getByLabelText('Statut')).toHaveValue('EN_LIVRAISON');
    const zone = screen.getByLabelText('Zone');
    expect(zone).toHaveValue('SANS_ZONE');
    expect(
      within(zone)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Toutes', 'Tunis Nord', 'Sans zone']);
    expect(screen.getByLabelText('Vendeur')).toBeInTheDocument();
    expect(screen.getByLabelText('Livreur')).toBeInTheDocument();
    expect(screen.getByLabelText('Paiement')).toBeInTheDocument();
  });

  it('shows each parcel with its seller, customer, place, status, amount and livreur', () => {
    render(<ColisScreen list={list} query={{}} filters={filters} />);
    const row = screen.getByRole('row', { name: /FG-AAAAAAAA/ });
    expect(within(row).getByRole('link', { name: 'FG-AAAAAAAA' })).toHaveAttribute(
      'href',
      '/admin/colis/FG-AAAAAAAA',
    );
    for (const text of [
      'Boutique Yasmine',
      'Amira Trabelsi',
      '22111333',
      'Gammarth, La Marsa',
      'Tunis Nord',
      'En livraison',
      '85,000 DT',
      'Ali Ben Salah',
    ]) {
      expect(row).toHaveTextContent(text);
    }
  });

  it('pages through the results, filters kept, and exports them', () => {
    render(
      <ColisScreen list={list} query={{ q: 'amira', status: 'EN_LIVRAISON' }} filters={filters} />,
    );
    expect(screen.getByText('60 colis · page 1 sur 2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Page suivante' })).toHaveAttribute(
      'href',
      '/admin/colis?q=amira&status=EN_LIVRAISON&page=2',
    );
    expect(screen.queryByRole('link', { name: 'Page précédente' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Exporter' })).toHaveAttribute(
      'href',
      '/api/bff/colis/export?q=amira&status=EN_LIVRAISON',
    );
  });

  it('marks a parcel whose label must be reprinted (D-57)', () => {
    render(
      <ColisScreen
        list={{ ...list, items: [{ ...list.items[0]!, labelReprintNeeded: true }] }}
        query={{}}
        filters={filters}
      />,
    );
    expect(screen.getByRole('row', { name: /FG-AAAAAAAA/ })).toHaveTextContent(
      'Étiquette à réimprimer',
    );
  });

  it('says so when nothing matches', () => {
    render(
      <ColisScreen
        list={{ items: [], total: 0, page: 1, pageSize: 50 }}
        query={{}}
        filters={filters}
      />,
    );
    expect(screen.getByText('Aucun colis.')).toBeInTheDocument();
  });
});

const detail: StaffParcelDetail = {
  code: 'FG-AAAAAAAA',
  createdAt: '2026-09-24T08:00:00.000Z',
  seller: { id: 's1', shopName: 'Boutique Yasmine', contactPhone: '50990001' },
  recipientName: 'Amira Trabelsi',
  recipientPhone: '22111333',
  recipientPhone2: null,
  address: '12 rue de la Plage',
  landmark: 'Face à la mosquée',
  localiteNameFr: 'Gammarth',
  delegationNameFr: 'La Marsa',
  zoneName: 'Tunis Nord',
  productDescription: 'Robe',
  pieceCount: 1,
  isExchange: false,
  openingAllowed: true,
  courierNote: null,
  meetingPoint: null,
  addressMemory: null,
  status: 'A_VERIFIER',
  location: 'AVEC_LE_LIVREUR',
  labelReprintNeeded: false,
  attemptCount: 1,
  lastFailureReason: 'NE_REPOND_PAS',
  lastFailureNote: 'Sonné trois fois',
  verifyDeadlineAt: '2026-09-27T08:00:00.000Z',
  relaunchDate: null,
  relaunchSlot: null,
  currentLivreur: { id: 'u-ali', firstName: 'Ali', lastName: 'Ben Salah' },
  plannedLivreur: null,
  money: {
    codAmountMillimes: '85000',
    deliveryFeeMillimes: '7000',
    returnFeeMillimes: '5000',
    changeClientFeeMillimes: '1000',
    courierRateMillimes: null,
    cashStatus: null,
    bonNumber: null,
    charges: [{ type: 'LIVRAISON', amountMillimes: '7000', status: 'EN_ATTENTE' }],
  },
  changeRequests: [],
  events: [
    {
      type: 'ECHEC_LIVRAISON',
      at: '2026-09-25T08:01:00.000Z',
      deviceTime: '2026-09-25T08:00:00.000Z',
      actor: { name: 'Ali Ben Salah', role: 'LIVREUR' },
      source: 'SAISIE_MANUELLE',
      previousStatus: 'EN_LIVRAISON',
      newStatus: 'A_VERIFIER',
      previousLocation: 'AVEC_LE_LIVREUR',
      newLocation: 'AVEC_LE_LIVREUR',
      reasonCode: 'NE_REPOND_PAS',
      reasonText: 'Sonné trois fois',
      gps: { lat: 36.8765, lng: 10.3245, accuracyM: 12 },
      positionMissing: false,
      scan: {
        id: 's1',
        manualEntry: true,
        cancelled: true,
        clockSkewFlagged: true,
        adminCancellable: false,
      },
      plannedFor: null,
      cancelledAfterPickup: false,
    },
    {
      type: 'AFFECTATION_LIVREUR',
      at: '2026-09-25T09:00:00.000Z',
      deviceTime: null,
      actor: { name: 'Nadia Dépôt', role: 'DEPOT' },
      source: null,
      previousStatus: 'AU_DEPOT',
      newStatus: 'AU_DEPOT',
      previousLocation: 'AU_DEPOT',
      newLocation: 'AU_DEPOT',
      reasonCode: null,
      reasonText: null,
      gps: null,
      positionMissing: false,
      scan: null,
      plannedFor: 'Ali Ben Salah',
      cancelledAfterPickup: false,
    },
    {
      type: 'RETOUR_AUTO_48H',
      at: '2026-09-27T08:00:00.000Z',
      deviceTime: null,
      actor: null,
      source: null,
      previousStatus: 'A_VERIFIER',
      newStatus: 'RETOUR_AU_DEPOT',
      previousLocation: 'AU_DEPOT',
      newLocation: 'AU_DEPOT',
      reasonCode: null,
      reasonText: null,
      gps: null,
      positionMissing: false,
      scan: null,
      plannedFor: null,
      cancelledAfterPickup: false,
    },
  ],
};

describe('ColisDetailScreen (Admin 4.3)', () => {
  it('shows the customer, the seller, the place and the courier’s reason', () => {
    render(<ColisDetailScreen parcel={detail} permissions={[...PERMISSIONS_BY_ROLE.DEPOT]} />);
    const customer = screen.getByRole('region', { name: 'Destinataire' });
    expect(customer).toHaveTextContent('Amira Trabelsi');
    expect(customer).toHaveTextContent('22111333');
    expect(customer).toHaveTextContent('12 rue de la Plage');
    expect(customer).toHaveTextContent('Face à la mosquée');
    expect(customer).toHaveTextContent('Gammarth, La Marsa · Tunis Nord');
    expect(screen.getByRole('link', { name: 'Boutique Yasmine' })).toHaveAttribute(
      'href',
      '/admin/vendeurs/s1',
    );
    expect(
      screen.getByText('Tentative 1 · Ne répond pas · « Sonné trois fois »'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Avec : Ali Ben Salah/)).toBeInTheDocument();
  });

  it('shows the money: COD, frozen fees, charges, cash status and bon', () => {
    render(<ColisDetailScreen parcel={detail} permissions={[...PERMISSIONS_BY_ROLE.DEPOT]} />);
    const money = screen.getByRole('region', { name: 'Argent' });
    expect(money).toHaveTextContent('Montant COD85,000 DT');
    expect(money).toHaveTextContent('Frais de livraison7,000 DT');
    expect(money).toHaveTextContent('Frais de retour5,000 DT');
    expect(money).toHaveTextContent('Frais de livraison · 7,000 DT · En attente');
  });

  it('lists the whole event log: who, when, how, where, the flags', () => {
    render(<ColisDetailScreen parcel={detail} permissions={[...PERMISSIONS_BY_ROLE.DEPOT]} />);
    const log = screen.getByRole('list', { name: 'Journal du colis' });
    const [failure, move, auto] = within(log).getAllByRole('listitem');
    expect(failure).toHaveTextContent('Échec de livraison');
    expect(failure).toHaveTextContent('Ali Ben Salah (Livreur)');
    expect(failure).toHaveTextContent('Saisie manuelle');
    expect(failure).toHaveTextContent('En livraison → À vérifier');
    expect(failure).toHaveTextContent('GPS 36.8765, 10.3245 (± 12 m)');
    expect(failure).toHaveTextContent('Heure du téléphone');
    expect(failure).toHaveTextContent('Scan annulé');
    expect(failure).toHaveTextContent('Horloge décalée');
    expect(move).toHaveTextContent('Prévu pour Ali Ben Salah');
    expect(auto).toHaveTextContent('Règle automatique');
  });

  it('shows the address memory and a courier scan made without position (Coursier 4.3, D-63)', () => {
    const [failure, ...rest] = detail.events;
    render(
      <ColisDetailScreen
        parcel={{
          ...detail,
          meetingPoint: 'Café de la gare',
          addressMemory: {
            note: 'Immeuble bleu, 2e étage',
            meetingPoint: null,
            deliveredHere: true,
            updatedAt: '2026-09-20T10:00:00.000Z',
          },
          events: [{ ...failure!, gps: null, positionMissing: true }, ...rest],
        }}
        permissions={[...PERMISSIONS_BY_ROLE.SERVICE_CLIENT]}
      />,
    );
    const customer = screen.getByRole('region', { name: 'Destinataire' });
    expect(customer).toHaveTextContent('Point de rendez-vous : Café de la gare');
    expect(customer).toHaveTextContent('Mémoire d’adresse');
    expect(customer).toHaveTextContent('Déjà livré ici');
    expect(customer).toHaveTextContent('Immeuble bleu, 2e étage');
    const log = screen.getByRole('list', { name: 'Journal du colis' });
    expect(within(log).getAllByRole('listitem')[0]).toHaveTextContent('Sans position');
  });

  it('warns that the label must be reprinted, and lists the change requests (D-57)', () => {
    render(
      <ColisDetailScreen
        parcel={{
          ...detail,
          labelReprintNeeded: true,
          changeRequests: [
            {
              id: 'r1',
              status: 'APPLIQUEE',
              createdAt: '2026-09-25T08:00:00.000Z',
              editedAt: null,
              handledAt: '2026-09-25T09:00:00.000Z',
              sellerNote: null,
              refusalReason: null,
              parcel: {
                code: 'FG-AAAAAAAA',
                status: 'AU_DEPOT',
                location: 'AU_DEPOT',
                shopName: 'Boutique Yasmine',
              },
              fields: [{ field: 'address', before: null, after: '9 rue du Lac' }],
              applyRefusal: null,
              applyRefusalMessage: null,
            },
          ],
        }}
        permissions={[...PERMISSIONS_BY_ROLE.DEPOT]}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Étiquette à réimprimer');
    expect(screen.getByRole('heading', { name: 'Demandes de modification' })).toBeInTheDocument();
    expect(screen.getByText('Adresse : 9 rue du Lac')).toBeInTheDocument();
  });

  it('gives the admin Forcer un statut and Annuler ce scan, nobody else (D-56)', () => {
    const scanned: StaffParcelDetail = {
      ...detail,
      status: 'AU_DEPOT',
      location: 'AU_DEPOT',
      events: [
        {
          ...detail.events[0]!,
          type: 'ENTREE_DEPOT',
          scan: {
            id: 's9',
            manualEntry: false,
            cancelled: false,
            clockSkewFlagged: false,
            adminCancellable: true,
          },
        },
      ],
    };
    const { unmount } = render(
      <ColisDetailScreen parcel={scanned} permissions={[...PERMISSIONS_BY_ROLE.ADMIN]} />,
    );
    expect(screen.getByRole('button', { name: 'Forcer un statut' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Annuler ce scan' })).toBeInTheDocument();
    unmount();
    render(<ColisDetailScreen parcel={scanned} permissions={[...PERMISSIONS_BY_ROLE.DEPOT]} />);
    expect(screen.queryByRole('button', { name: 'Forcer un statut' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Annuler ce scan' })).toBeNull();
  });

  it('offers Réimprimer l’étiquette to the depot and the admin, not to the service client', () => {
    const { unmount } = render(
      <ColisDetailScreen parcel={detail} permissions={[...PERMISSIONS_BY_ROLE.DEPOT]} />,
    );
    const links = screen.getAllByRole('link', { name: /Thermique|A4/ });
    expect(links[0]).toHaveAttribute('href', '/api/bff/colis/FG-AAAAAAAA/label?format=THERMAL');
    unmount();
    render(
      <ColisDetailScreen parcel={detail} permissions={[...PERMISSIONS_BY_ROLE.SERVICE_CLIENT]} />,
    );
    expect(screen.queryByText(/Réimprimer l’étiquette/)).toBeNull();
  });
});
