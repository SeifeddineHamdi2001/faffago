import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSIONS_BY_ROLE } from '@faffago/shared';
import { ExceptionsScreen } from '@/components/exceptions-screen';
import type { ExceptionsQueue } from '@/lib/types';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const bff = vi.fn();
vi.mock('@/lib/client/call', () => ({ bff: (...args: unknown[]) => bff(...args) }));

const EMPTY_REST = {
  verifyNearLimit: [],
  cashNotHandedOver: [],
  bonsEnRoute: [],
  bonsNotArchived: [],
  sellersMissingCin: [],
};

const queue: ExceptionsQueue = {
  ...EMPTY_REST,
  depotWaiting: [
    {
      code: 'FG-AAAAAAAA',
      status: 'AU_DEPOT',
      shopName: 'Boutique Yasmine',
      delegationNameFr: 'La Marsa',
      zoneName: 'Tunis Nord',
      since: '2026-09-22T08:00:00.000Z',
    },
  ],
  pickupsLate: [
    {
      id: 'p1',
      shopName: 'Chic Tunis',
      plannedDate: '2026-09-24',
      plannedSlot: 'MATIN',
      ramasseur: { id: 'u-hedi', firstName: 'Hédi', lastName: 'Test' },
    },
  ],
  changeRequests: [
    {
      id: 'r1',
      status: 'EN_ATTENTE',
      createdAt: '2026-09-25T07:00:00.000Z',
      editedAt: null,
      handledAt: null,
      sellerNote: null,
      refusalReason: null,
      parcel: {
        code: 'FG-BBBBBBBB',
        status: 'EN_LIVRAISON',
        location: 'AVEC_LE_LIVREUR',
        shopName: 'Boutique Yasmine',
      },
      fields: [{ field: 'address', before: 'Rue de Test', after: '9 rue du Lac' }],
      applyRefusal: null,
      applyRefusalMessage: null,
    },
  ],
  manualEntries: [
    {
      scanId: 's1',
      at: '2026-09-25T06:00:00.000Z',
      action: 'ENTREE_DEPOT',
      accepted: true,
      rawCode: 'fg-cccccccc',
      parcelCode: 'FG-CCCCCCCC',
      actor: { name: 'Nadia Dépôt', role: 'DEPOT' },
    },
  ],
};

function section(name: string) {
  return screen.getByRole('region', { name: new RegExp(name) });
}

describe('ExceptionsScreen (Admin 4.7, D-50)', () => {
  beforeEach(() => {
    refresh.mockReset();
    bff.mockReset();
  });

  it('shows each row with its count, in the spec’s words', () => {
    render(<ExceptionsScreen queue={queue} permissions={[...PERMISSIONS_BY_ROLE.ADMIN]} />);
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Colis au dépôt depuis plus de 48 h sans tournée (1)',
      'Colis proche de la limite À vérifier (0)',
      'Coursier n’ayant pas remis son argent (0)',
      'Bon en route non remis après 24 h (0)',
      'Bon signé non archivé après 48 h (0)',
      'Ramassage planifié non effectué (1)',
      'Demande de modification du vendeur en attente (1)',
      'Saisie manuelle du code (1)',
      'Vendeur CIN uniquement sans numéro de CIN (0)',
    ]);
  });

  it('leads each row to where it is dealt with, for the admin', () => {
    render(<ExceptionsScreen queue={queue} permissions={[...PERMISSIONS_BY_ROLE.ADMIN]} />);
    const depot = section('sans tournée');
    expect(depot).toHaveTextContent('Boutique Yasmine · La Marsa · Tunis Nord');
    expect(within(depot).getByRole('link', { name: 'Assigner' })).toHaveAttribute(
      'href',
      '/admin/tournees',
    );
    const pickups = section('non effectué');
    expect(pickups).toHaveTextContent('Chic Tunis · prévu le 24/09/2026 · Matin · Hédi Test');
    expect(within(pickups).getByRole('link', { name: 'Replanifier' })).toHaveAttribute(
      'href',
      '/admin/ramassages/p1',
    );
    const requests = section('Demande de modification');
    expect(within(requests).getByRole('link', { name: 'Appliquer / refuser' })).toHaveAttribute(
      'href',
      '/admin/colis/FG-BBBBBBBB',
    );
    const manual = section('Saisie manuelle');
    expect(manual).toHaveTextContent('fg-cccccccc · Entrée dépôt · Nadia Dépôt (Dépôt)');
    expect(within(manual).getByRole('link', { name: 'FG-CCCCCCCC' })).toHaveAttribute(
      'href',
      '/admin/colis/FG-CCCCCCCC',
    );
  });

  it('lets each role act with its own rights only (D-11)', () => {
    render(
      <ExceptionsScreen queue={queue} permissions={[...PERMISSIONS_BY_ROLE.SERVICE_CLIENT]} />,
    );
    expect(screen.queryByRole('link', { name: 'Assigner' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Replanifier' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Appliquer / refuser' })).toBeInTheDocument();
  });

  it('shows the depot the requests to read, not to apply', () => {
    render(<ExceptionsScreen queue={queue} permissions={[...PERMISSIONS_BY_ROLE.DEPOT]} />);
    expect(screen.getByRole('link', { name: 'Assigner' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Appliquer / refuser' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Voir la demande' })).toBeInTheDocument();
  });

  it('lets Admin and Dépôt mark a manual entry as treated, but not Service client', async () => {
    const user = userEvent.setup();
    render(
      <ExceptionsScreen queue={queue} permissions={[...PERMISSIONS_BY_ROLE.SERVICE_CLIENT]} />,
    );
    expect(screen.queryByRole('button', { name: 'Marquer comme traité' })).toBeNull();

    bff.mockResolvedValueOnce({ ok: true, data: { scanId: 's1', treated: true } });
    render(<ExceptionsScreen queue={queue} permissions={[...PERMISSIONS_BY_ROLE.DEPOT]} />);
    await user.click(screen.getByRole('button', { name: 'Marquer comme traité' }));
    expect(bff).toHaveBeenCalledWith('POST', 'exceptions/manual-entries/s1/treat');
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('says so when a row has nothing', () => {
    render(
      <ExceptionsScreen
        queue={{
          ...EMPTY_REST,
          depotWaiting: [],
          pickupsLate: [],
          changeRequests: [],
          manualEntries: [],
        }}
        permissions={[...PERMISSIONS_BY_ROLE.ADMIN]}
      />,
    );
    expect(screen.getAllByText('Rien à signaler.')).toHaveLength(9);
  });

  it('shows the rest of the queue (D-89): cash of a past day, bons late, a CIN missing', () => {
    render(
      <ExceptionsScreen
        queue={{
          ...queue,
          cashNotHandedOver: [
            {
              courier: {
                userId: 'u-ali',
                firstName: 'Ali',
                lastName: 'Ben Salah',
                role: 'LIVREUR',
              },
              day: '2026-09-24',
              amountMillimes: '85000',
            },
          ],
          bonsNotArchived: [
            {
              id: 'b1',
              number: 'BV-2026-0922-01',
              kind: 'BON_VERSEMENT',
              shopName: 'Chic Tunis',
              ramasseur: null,
              since: '2026-09-22T08:00:00.000Z',
            },
          ],
          sellersMissingCin: [{ sellerId: 's9', shopName: 'Sans CIN', contactFullName: 'Amel B' }],
        }}
        permissions={[...PERMISSIONS_BY_ROLE.ADMIN]}
      />,
    );
    expect(
      screen.getByText(/Ali Ben Salah \(Livreur\) · 24\/09\/2026 · 85,000 DT/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ouvrir la caisse' })).toHaveAttribute(
      'href',
      '/admin/caisse/u-ali/2026-09-24',
    );
    expect(screen.getByText('BV-2026-0922-01')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ajouter le numéro de CIN' })).toHaveAttribute(
      'href',
      '/admin/vendeurs/s9',
    );
  });

  it('hides the CIN row from the roles that do not see it', () => {
    render(
      <ExceptionsScreen
        queue={{ ...queue, sellersMissingCin: null }}
        permissions={[...PERMISSIONS_BY_ROLE.DEPOT]}
      />,
    );
    expect(screen.queryByText(/sans numéro de CIN/)).toBeNull();
  });
});
