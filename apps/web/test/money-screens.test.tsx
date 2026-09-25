import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CaisseScreen } from '@/components/caisse-screen';
import { CaisseSessionScreen } from '@/components/caisse-session-screen';
import { DepartScreen } from '@/components/depart-screen';
import { PayrollScreen } from '@/components/payroll-screen';
import { PayoutsScreen, SellerPayoutScreen } from '@/components/payouts-screen';
import { ReturnsScreen } from '@/components/returns-screen';
import { SellerPaiementsScreen, SellerRetoursScreen } from '@/components/seller-money-screens';
import type {
  CaisseSession,
  CaisseSummary,
  PayrollRow,
  SellerPayoutDetail,
  ReturnsBySeller,
} from '@/lib/types';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const bff = vi.fn();
vi.mock('@/lib/client/call', () => ({ bff: (...args: unknown[]) => bff(...args) }));

const ali = { userId: 'u-ali', firstName: 'Ali', lastName: 'Ben Salah' };

beforeEach(() => {
  bff.mockReset();
  refresh.mockReset();
});

describe('Caisse (Admin 4.9, D-79)', () => {
  const summary: CaisseSummary = {
    day: '2026-09-25',
    rows: [
      {
        courier: { ...ali, role: 'LIVREUR' },
        sessionId: null,
        status: 'OUVERTE',
        expectedMillimes: '170000',
        countedMillimes: null,
        ecartMillimes: null,
        parcelCount: 2,
        lateCount: 1,
        bonCount: 0,
        ecartFlagged: false,
        ecartChecked: false,
      },
    ],
    totals: {
      expectedMillimes: '170000',
      countedMillimes: '0',
      ecartMillimes: '0',
      byStatus: { OUVERTE: 1, COMPTEE: 0, CLOTUREE: 0 },
    },
  };

  it('lists each courier of the day with his state, and lets the admin check a surplus', async () => {
    bff.mockResolvedValue({ ok: true, data: {} });
    render(
      <CaisseScreen
        summary={summary}
        today="2026-09-25"
        ecarts={{
          aVerifier: [
            {
              sessionId: 's1',
              day: '2026-09-24',
              courier: { ...ali, role: 'LIVREUR' },
              expectedMillimes: '85000',
              countedMillimes: '86500',
              ecartMillimes: '1500',
            },
          ],
          ramasseurs: [],
          bonsCorriges: [
            {
              correctionId: 'c1',
              day: '2026-09-24',
              courier: { userId: 'u-sami', firstName: 'Sami', lastName: 'Trabelsi' },
              bonNumber: 'BV-2026-0924-02',
              shortfallMillimes: '78000',
              reason: 'Le vendeur n’a jamais reçu le bon',
              correctedAt: '2026-09-25T09:00:00.000Z',
            },
          ],
        }}
      />,
    );
    // A bon corrected after closing, not covered by a surplus: for HR (D-88).
    expect(screen.getByText(/BV-2026-0924-02 · manque/)).toBeInTheDocument();
    expect(screen.getByText('Le vendeur n’a jamais reçu le bon')).toBeInTheDocument();
    const row = screen.getByRole('link', { name: 'Ali Ben Salah' }).closest('tr')!;
    expect(within(row).getByText('Ouverte')).toBeInTheDocument();
    expect(within(row).getByText('1 tardif')).toBeInTheDocument();
    expect(within(row).getByText('170,000 DT')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Vérifier' }));
    await userEvent.type(screen.getByLabelText('Note'), 'Monnaie rendue le lendemain');
    await userEvent.click(screen.getByRole('button', { name: 'Marquer comme vérifié' }));
    expect(bff).toHaveBeenCalledWith('POST', 'caisse/sessions/s1/verifier-ecart', {
      note: 'Monnaie rendue le lendemain',
    });
  });

  it('counts then closes a session', async () => {
    const session: CaisseSession = {
      sessionId: 'sess',
      day: '2026-09-25',
      courier: { ...ali, role: 'LIVREUR' },
      status: 'COMPTEE',
      expected: { deliveryMillimes: '170000', bonCashMillimes: '0', totalMillimes: '170000' },
      countedMillimes: '165000',
      ecartMillimes: '-5000',
      ecartFlagged: false,
      ecartCheckedAt: null,
      ecartNote: null,
      countedAt: '2026-09-25T17:00:00.000Z',
      closedAt: null,
      lines: [
        {
          parcelId: 'p1',
          code: 'FG-AAAAAAAA',
          shopName: 'Chic',
          codMillimes: '85000',
          origin: 'TARDIF',
          scanDay: '2026-09-24',
        },
      ],
      bons: [],
      bonsRetourEnRoute: [],
      debt: null,
    };
    bff.mockResolvedValue({ ok: true, data: {} });
    render(<CaisseSessionScreen session={session} />);
    expect(screen.getByLabelText('Montant compté (DT)')).toHaveValue('165,000');
    expect(screen.getByText('-5,000 DT')).toBeInTheDocument();
    expect(screen.getByText(/Scan tardif · livré le 24\/09\/2026/)).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('Montant compté (DT)'));
    await userEvent.type(screen.getByLabelText('Montant compté (DT)'), '170,000');
    await userEvent.click(screen.getByRole('button', { name: 'Recompter' }));
    expect(bff).toHaveBeenCalledWith('POST', 'caisse/u-ali/2026-09-25/compter', {
      counted: '170,000',
    });
    await userEvent.click(screen.getByRole('button', { name: 'Clôturer' }));
    expect(bff).toHaveBeenCalledWith('POST', 'caisse/u-ali/2026-09-25/cloturer');
  });

  it('hands a ramasseur the bons planned for him, with their cash', async () => {
    bff.mockResolvedValue({ ok: true, data: {} });
    render(
      <DepartScreen
        ramasseurs={[{ ...ali, bonsPrevus: 1 }]}
        departure={{
          ramasseur: ali,
          prevus: [
            {
              id: 'bv1',
              kind: 'BON_VERSEMENT',
              number: 'BV-2026-0925-01',
              shopName: 'Chic',
              netMillimes: '78000',
              lineCount: 1,
              plannedDate: '2026-09-25',
            },
          ],
          autres: [
            {
              id: 'br1',
              kind: 'BON_RETOUR',
              number: 'BR-2026-0925-01',
              shopName: 'Mode',
              netMillimes: null,
              lineCount: 2,
              plannedDate: null,
            },
          ],
        }}
      />,
    );
    expect(screen.getByText('78,000 DT', { selector: 'strong' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: /BR-2026-0925-01/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Remettre au ramasseur' }));
    expect(bff).toHaveBeenCalledWith('POST', 'caisse/depart', {
      ramasseurId: 'u-ali',
      bonsVersement: ['bv1'],
      bonsRetour: ['br1'],
    });
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('2 bon(s) remis à Ali.'),
    );
  });
});

describe('Paiements vendeurs (Admin 4.10)', () => {
  it('lists the sellers to pay', () => {
    render(
      <PayoutsScreen
        rows={[
          {
            seller: { id: 's1', shopName: 'Chic', statut: 'CIN_UNIQUEMENT' },
            payableMillimes: '170000',
            payableCount: 2,
            withCouriersMillimes: '0',
            pendingChargesMillimes: '19000',
            bonsEnCours: 0,
          },
        ]}
      />,
    );
    expect(screen.getByRole('link', { name: 'Chic' })).toHaveAttribute(
      'href',
      '/admin/paiements/s1',
    );
    expect(screen.getByText('170,000 DT (2)')).toBeInTheDocument();
  });

  it('previews the bon exactly as the server computes it, and prepares it', async () => {
    const detail: SellerPayoutDetail = {
      seller: {
        id: 's1',
        shopName: 'Chic',
        statut: 'CIN_UNIQUEMENT',
        contactFullName: 'Amel',
        contactPhone: '22000000',
      },
      retenueRateBps: 300,
      parcels: [
        {
          id: 'p1',
          code: 'FG-AAAAAAAA',
          recipientName: 'Client',
          deliveredAt: null,
          codMillimes: '85000',
        },
        {
          id: 'p2',
          code: 'FG-BBBBBBBB',
          recipientName: 'Client',
          deliveredAt: null,
          codMillimes: '85000',
        },
      ],
      charges: [
        {
          id: 'c0',
          type: 'RETOUR',
          label: 'Frais de retour',
          amountMillimes: '5000',
          createdAt: '2026-09-20T10:00:00.000Z',
          parcelCode: null,
        },
        {
          id: 'c1',
          type: 'LIVRAISON',
          label: 'Frais de livraison',
          amountMillimes: '7000',
          createdAt: '2026-09-25T07:00:00.000Z',
          parcelCode: 'FG-AAAAAAAA',
        },
        {
          id: 'c2',
          type: 'LIVRAISON',
          label: 'Frais de livraison',
          amountMillimes: '7000',
          createdAt: '2026-09-25T07:01:00.000Z',
          parcelCode: 'FG-BBBBBBBB',
        },
      ],
      soldeDebiteurMillimes: '19000',
      bons: [],
    };
    bff.mockResolvedValue({
      ok: true,
      data: { id: 'bv1', number: 'BV-2026-0925-01', netMillimes: '146470' },
    });
    render(<SellerPayoutScreen detail={detail} ramasseurs={[]} today="2026-09-25" />);
    const calc = screen.getByRole('region', { name: 'Calcul du bon' });
    expect(calc).toHaveTextContent('= Base après frais151,000 DT');
    expect(calc).toHaveTextContent('− Retenue à la source 3 %− 4,530 DT');
    expect(calc).toHaveTextContent('Net payé en espèces146,470 DT');

    await userEvent.click(screen.getByRole('button', { name: 'Préparer le bon' }));
    expect(bff).toHaveBeenCalledWith('POST', 'bons-versement', {
      sellerId: 's1',
      parcelIds: ['p1', 'p2'],
    });
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Imprimer (2 exemplaires)' })).toHaveAttribute(
        'href',
        '/api/bff/bons-versement/bv1/pdf',
      ),
    );
  });
});

describe('Retours (Admin 4.11)', () => {
  it('shows the returns by seller with their bon, printable by Dépôt', () => {
    const groups: ReturnsBySeller[] = [
      {
        seller: { id: 's1', shopName: 'Chic' },
        returns: [
          {
            code: 'FG-AAAAAAAA',
            recipientName: 'Client',
            itemType: 'COLIS',
            status: 'RETOUR_AU_DEPOT',
            atDepot: true,
            bonNumber: 'BR-2026-0925-01',
          },
          {
            code: 'FG-CCCCCCCC',
            recipientName: 'Client',
            itemType: 'ARTICLE_RECUPERE',
            status: 'RETOUR_AU_DEPOT',
            atDepot: false,
            bonNumber: null,
          },
        ],
        bons: [],
      },
    ];
    render(
      <ReturnsScreen
        groups={groups}
        remis={[]}
        ramasseurs={[]}
        permissions={['BONS_RETOUR']}
        today="2026-09-25"
      />,
    );
    expect(screen.getByText(/Ancien article \(échange\)/)).toBeInTheDocument();
    expect(screen.getByText(/BR-2026-0925-01/)).toBeInTheDocument();
  });
});

describe('Corriger une ligne de bon de retour (D-88)', () => {
  it('lets the admin correct a line of a bon remis, with a reason', async () => {
    bff.mockResolvedValue({ ok: true, data: {} });
    render(
      <ReturnsScreen
        groups={[]}
        remis={[
          {
            id: 'br1',
            number: 'BR-2026-0925-03',
            status: 'REMIS',
            seller: {
              id: 's1',
              shopName: 'Chic',
              contactFullName: 'Amel',
              contactPhone: '22000000',
            },
            preparedAt: '2026-09-25T07:00:00.000Z',
            enRouteAt: '2026-09-25T07:30:00.000Z',
            remisAt: '2026-09-25T09:00:00.000Z',
            archivedAt: null,
            correctedAt: null,
            visit: null,
            lines: [
              {
                code: 'FG-DDDDDDDD',
                recipientName: 'Client',
                productDescription: 'Robe',
                itemType: 'COLIS',
                received: true,
                receivedAt: '2026-09-25T09:00:00.000Z',
              },
            ],
            pendingCount: 0,
          },
        ]}
        ramasseurs={[]}
        permissions={['BONS_RETOUR', 'CORRIGER_BON']}
        today="2026-09-25"
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Corriger' }));
    await userEvent.type(screen.getByLabelText('Raison'), 'Scanné chez le mauvais vendeur');
    await userEvent.click(screen.getByRole('button', { name: 'Corriger le retour' }));
    expect(bff).toHaveBeenCalledWith('POST', 'bons-retour/br1/corriger', {
      parcelCode: 'FG-DDDDDDDD',
      itemType: 'COLIS',
      reason: 'Scanné chez le mauvais vendeur',
    });
  });

  it('shows no correction without the permission', () => {
    render(
      <ReturnsScreen
        groups={[]}
        remis={[]}
        ramasseurs={[]}
        permissions={['BONS_RETOUR']}
        today="2026-09-25"
      />,
    );
    expect(screen.queryByRole('button', { name: 'Corriger' })).toBeNull();
  });
});

describe('Paie coursiers (Admin 4.12)', () => {
  it('prepares the fiche of a livreur whose period is due', async () => {
    const row: PayrollRow = {
      livreur: { ...ali, isActive: true },
      payPlan: 'HEBDOMADAIRE',
      pendingPayPlan: null,
      pendingPayPlanFrom: null,
      currentPeriod: { start: '2026-09-28', end: '2026-10-04' },
      duePeriod: { start: '2026-09-21', end: '2026-09-27' },
      due: true,
      parcelCount: 2,
      cashWithCourierCount: 0,
      grossMillimes: '7000',
      deductionsMillimes: '5000',
      netMillimes: '2000',
      debtsMillimes: '5000',
      payslipsAPayer: 0,
    };
    bff.mockResolvedValue({ ok: true, data: {} });
    render(<PayrollScreen rows={[row]} payslips={[]} />);
    expect(screen.getByText(/brut 7,000 DT − dettes 5,000 DT =/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Préparer la fiche' }));
    expect(bff).toHaveBeenCalledWith('POST', 'paie/fiches', { livreurId: 'u-ali' });
  });
});

describe('the seller’s money (Vendeur 4.11, 4.12)', () => {
  it('shows À recevoir parcel by parcel and his bons to print', () => {
    render(
      <SellerPaiementsScreen
        canPrint
        data={{
          aRecevoir: {
            parcelCount: 1,
            chezLesCoursiersMillimes: '0',
            auDepotMillimes: '78000',
            totalMillimes: '78000',
            fraisADeduireMillimes: '0',
            parcels: [
              {
                code: 'FG-AAAAAAAA',
                recipientName: 'Client',
                deliveredAt: '2026-09-25T08:00:00.000Z',
                cashStatus: 'AU_DEPOT',
                codMillimes: '85000',
                deliveryFeeMillimes: '7000',
                netMillimes: '78000',
                bon: null,
              },
            ],
          },
          bons: [
            {
              id: 'bv1',
              number: 'BV-2026-0921-01',
              status: 'REMIS',
              seller: {
                id: 's1',
                shopName: 'Chic',
                contactFullName: 'Amel',
                contactPhone: '22000000',
              },
              preparedAt: '2026-09-21T08:00:00.000Z',
              parcelCount: 12,
              totalCodMillimes: '1000000',
              totalFeesMillimes: '84000',
              baseAfterFeesMillimes: '916000',
              sellerStatutSnapshot: 'CIN_UNIQUEMENT',
              retenueRateBps: 300,
              retenueMillimes: '27480',
              netMillimes: '888520',
              visit: null,
              enRouteAt: null,
              remisAt: null,
              archivedAt: null,
              cancelledAt: null,
              cancelReason: null,
              correctedAt: '2026-09-22T10:00:00.000Z',
            },
          ],
        }}
      />,
    );
    expect(
      within(screen.getByRole('region', { name: 'À recevoir' })).getByText('78,000 DT'),
    ).toBeInTheDocument();
    // Corrected by the team: the label only, never the reason (D-88).
    expect(screen.getByText(/Correction Faffa Go/)).toBeInTheDocument();
    // The worked example of Vendeur 2.4.
    expect(screen.getByText(/retenue à la source 3 % 27,480 DT/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Imprimer' })).toHaveAttribute(
      'href',
      '/api/bff/paiements/bons/bv1/pdf',
    );
  });

  it('shows his returns on their way back, the old item of an échange included', () => {
    render(
      <SellerRetoursScreen
        canPrint={false}
        data={{
          returns: [
            {
              code: 'FG-CCCCCCCC',
              recipientName: 'Client',
              itemType: 'ARTICLE_RECUPERE',
              status: 'RETOUR_EN_ROUTE',
              atDepot: true,
              bonNumber: 'BR-2026-0925-01',
            },
          ],
          bons: [],
          receivedCount: 4,
        }}
      />,
    );
    expect(screen.getByText(/Ancien article \(échange\)/)).toBeInTheDocument();
    expect(screen.getByText(/Retour en route · BR-2026-0925-01/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Imprimer' })).toBeNull();
  });
});
