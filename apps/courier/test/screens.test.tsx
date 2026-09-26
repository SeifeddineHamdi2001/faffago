import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type {
  Cash,
  ChatList,
  ChatThread,
  Gains,
  NotificationList,
  PickupDay,
  PickupView,
  Profile,
} from '../src/api/types';
import { CaisseScreen } from '../src/screens/CaisseScreen';
import { ChatListScreen, ChatScreen } from '../src/screens/ChatScreens';
import { NotificationsScreen } from '../src/screens/NotificationsScreen';
import { UpdateScreen } from '../src/screens/GateScreens';
import { JourneeScreen } from '../src/screens/JourneeScreen';
import { LoginScreen } from '../src/screens/LoginScreen';
import { MenuScreen } from '../src/screens/MenuScreen';
import { PinScreen } from '../src/screens/PinScreen';
import { ScannerScreen } from '../src/screens/ScannerScreen';
import { DeliverScreen } from '../src/screens/livreur/DeliverScreen';
import { RetourDepotScreen } from '../src/screens/livreur/RetourDepotScreen';
import { StopScreen } from '../src/screens/livreur/StopScreen';
import { TourneeScreen } from '../src/screens/livreur/TourneeScreen';
import { GainsScreen } from '../src/screens/livreur/GainsScreen';
import { PickupScreen } from '../src/screens/ramasseur/PickupScreen';
import { VisitScreen } from '../src/screens/ramasseur/VisitScreen';
import type { RootScreenProps, RootStackParams } from '../src/navigation/types';
import { QueueStatus, type QueueRow } from '../src/queue/queue';
import { appValue, goBack, navigate, renderScreen, stop, tour } from './harness';

jest.mock('../src/queue/sqlite', () => ({
  cacheGet: jest.fn(async () => null),
  cacheSet: jest.fn(async () => undefined),
}));

/** What a stack screen receives, reduced to what the screens use. */
function routeProps<K extends keyof RootStackParams>(params: RootStackParams[K]) {
  return {
    route: { params } as unknown as RootScreenProps<K>['route'],
    navigation: { navigate, goBack } as unknown as RootScreenProps<K>['navigation'],
  };
}

beforeEach(() => {
  navigate.mockClear();
  goBack.mockClear();
});

const pickup = (overrides: Partial<PickupView> = {}): PickupView => ({
  id: 'p1',
  status: 'PLANIFIE',
  plannedDate: '2026-09-25',
  plannedSlot: 'MATIN',
  shopName: 'Boutique Yasmine',
  contactName: 'Yasmine Trabelsi',
  sellerPhone: '50990001',
  address: 'Entrepôt, rue 5',
  landmark: null,
  localiteNameFr: 'Khaznadar',
  localiteNameAr: null,
  delegationNameFr: 'Le Bardo',
  delegationNameAr: 'باردو',
  note: null,
  declaredCount: null,
  scannedCount: 1,
  parcels: [
    { code: 'FG-AAAAAAAA', status: 'RAMASSE', expected: true, scanned: true },
    { code: 'FG-BBBBBBBB', status: 'CREE', expected: true, scanned: false },
  ],
  aEmporter: { bonsVersement: [], bonsRetour: [] },
  ...overrides,
});

describe('LoginScreen (Coursier 2)', () => {
  it('asks the role first, then logs in with phone and password', async () => {
    const value = appValue({}, { session: null });
    await renderScreen(<LoginScreen />, value);
    await fireEvent.press(screen.getByTestId('login'));
    expect(await screen.findByText('Choisissez Livreur ou Ramasseur')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('role-RAMASSEUR'));
    await fireEvent.changeText(screen.getByLabelText('Téléphone'), ' 98111222 ');
    await fireEvent.changeText(screen.getByLabelText('Mot de passe'), 'secret');
    await fireEvent.press(screen.getByTestId('login'));
    await waitFor(() =>
      expect(value.login).toHaveBeenCalledWith('RAMASSEUR', '98111222', 'secret'),
    );
  });
});

describe('PinScreen (Coursier 2, D-7)', () => {
  it('asks the PIN twice, then keeps it on the phone', async () => {
    const value = appValue();
    await renderScreen(<PinScreen mode="create" />, value);
    for (const key of '1234') await fireEvent.press(screen.getByTestId(`pin-${key}`));
    expect(await screen.findByText('Confirmez le code PIN')).toBeTruthy();
    for (const key of '1234') await fireEvent.press(screen.getByTestId(`pin-${key}`));
    await waitFor(() => expect(value.setPin).toHaveBeenCalledWith('1234'));
  });

  it('says so when the PIN is wrong', async () => {
    const value = appValue({}, { unlock: jest.fn(async () => false) });
    await renderScreen(<PinScreen mode="unlock" />, value);
    for (const key of '9999') await fireEvent.press(screen.getByTestId(`pin-${key}`));
    expect(await screen.findByTestId('pin-error')).toHaveTextContent('Code PIN incorrect');
  });
});

describe('TourneeScreen (Coursier 4.2)', () => {
  it('shows each stop with what finds the customer; a scanned one leaves the list', async () => {
    const scanned: QueueRow = {
      id: 's1',
      seq: 1,
      userId: 'u-ali',
      kind: 'SCAN',
      action: 'LIVRE',
      parcelCode: 'FG-DONE0000',
      operation: {} as never,
      deviceTime: new Date().toISOString(),
      status: QueueStatus.EN_ATTENTE,
      code: null,
      message: null,
    };
    const value = appValue(
      {
        '/coursier/tournee': tour({
          toDeliver: [
            stop({
              isExchange: true,
              attemptNumber: 2,
              memory: {
                note: 'Immeuble bleu',
                meetingPoint: null,
                deliveredHere: true,
                updatedAt: null,
              },
            }),
            stop({ code: 'FG-DONE0000', recipientName: 'Déjà scanné' }),
          ],
          toBringBack: [stop({ code: 'FG-FAIL0000', status: 'A_VERIFIER' })],
        }),
      },
      { recent: [scanned] },
    );
    await renderScreen(<TourneeScreen />, value);
    expect(await screen.findByText('Amira Ben Salah')).toBeTruthy();
    expect(screen.getByText('85,000 DT')).toBeTruthy();
    expect(screen.getByText('Tentative 2/3')).toBeTruthy();
    expect(screen.getByText('Échange')).toBeTruthy();
    expect(screen.getByText('Déjà livré ici')).toBeTruthy();
    expect(screen.getByText('Immeuble bleu')).toBeTruthy();
    expect(screen.queryByText('Déjà scanné')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Retour au dépôt · 1'));
    expect(navigate).toHaveBeenCalledWith('RetourDepot');
  });
});

describe('StopScreen (Coursier 4.3)', () => {
  it('records a meeting point for the address memory', async () => {
    const value = appValue({ '/coursier/tournee': tour() });
    await renderScreen(<StopScreen {...routeProps<'Stop'>({ code: 'FG-AB12CD34' })} />, value);
    expect(await screen.findByText('Repère : Près de la mosquée')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Point de rendez-vous'), 'Café de la gare');
    await fireEvent.press(screen.getByLabelText('Enregistrer le point de rendez-vous'));
    await waitFor(() =>
      expect(value.recordOperation).toHaveBeenCalledWith({
        kind: 'NOTE_ADRESSE',
        parcelCode: 'FG-AB12CD34',
        meetingPoint: 'Café de la gare',
      }),
    );
  });
});

describe('DeliverScreen (Coursier 4.4)', () => {
  it('delivers once the COD and the old item are confirmed (A-24, A-10)', async () => {
    const value = appValue({
      '/coursier/tournee': tour({ toDeliver: [stop({ isExchange: true })] }),
    });
    await renderScreen(
      <DeliverScreen {...routeProps<'Deliver'>({ code: 'FG-AB12CD34', manual: false })} />,
      value,
    );
    await fireEvent.press(await screen.findByTestId('choose-livre'));
    expect(screen.getByTestId('cod')).toHaveTextContent('85,000 DT');
    await fireEvent.press(screen.getByTestId('confirm-amount'));
    await fireEvent.press(screen.getByTestId('confirm-delivery'));
    expect(value.recordScan).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('confirm-exchange'));
    await fireEvent.press(screen.getByTestId('confirm-delivery'));
    await waitFor(() =>
      expect(value.recordScan).toHaveBeenCalledWith({
        action: 'LIVRE',
        rawCode: 'FG-AB12CD34',
        manual: false,
        collectedMillimes: '85000',
        exchangeItemCollected: true,
      }),
    );
    expect(await screen.findByTestId('done-message')).toHaveTextContent('Livré · Scan enregistré');
    await fireEvent.press(screen.getByTestId('cancel-scan'));
    await waitFor(() => expect(value.cancelLastScan).toHaveBeenCalled());
  });

  it('records a customer postponement with its day (D-9)', async () => {
    const value = appValue({ '/coursier/tournee': tour() });
    await renderScreen(
      <DeliverScreen {...routeProps<'Deliver'>({ code: 'FG-AB12CD34', manual: true })} />,
      value,
    );
    await fireEvent.press(await screen.findByTestId('choose-echec'));
    await fireEvent.press(screen.getByTestId('reason-REPORTE_PAR_LE_CLIENT'));
    // The seller reads the note (D-71): the courier is told so.
    expect(screen.getByTestId('note-visible-to-seller')).toHaveTextContent(
      'Visible par le vendeur',
    );
    const days = screen.getAllByTestId(/^day-/);
    expect(days).toHaveLength(7);
    await fireEvent.press(days[2]!);
    await fireEvent.press(screen.getByLabelText('Soir'));
    await fireEvent.press(screen.getByTestId('confirm-failure'));
    await waitFor(() =>
      expect(value.recordScan).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ECHEC',
          manual: true,
          failureReason: 'REPORTE_PAR_LE_CLIENT',
          postponedTo: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          relaunchSlot: 'SOIR',
        }),
      ),
    );
  });
});

describe('ScannerScreen (Coursier 4.4, 4.6, 4.9)', () => {
  it('opens Livré / Échec for a code typed from a damaged label, flagged as manual', async () => {
    const value = appValue({ '/coursier/tournee': tour() });
    await renderScreen(<ScannerScreen />, value);
    await waitFor(() => expect(value.load).toHaveBeenCalled());
    await fireEvent.changeText(screen.getByLabelText('Code du colis'), 'fg-ab12cd34');
    await fireEvent.press(screen.getByTestId('validate-code'));
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('Deliver', { code: 'FG-AB12CD34', manual: true }),
    );
  });

  it('refuses a parcel outside his tour, and a second scan of the same parcel', async () => {
    const value = appValue(
      { '/coursier/tournee': tour() },
      {
        recent: [
          {
            id: 's1',
            seq: 1,
            userId: 'u-ali',
            kind: 'SCAN',
            action: 'LIVRE',
            parcelCode: 'FG-AB12CD34',
            operation: {} as never,
            deviceTime: '2026-09-25T13:32:00.000Z',
            status: QueueStatus.ACCEPTE,
            code: null,
            message: null,
          },
        ],
      },
    );
    await renderScreen(<ScannerScreen />, value);
    await waitFor(() => expect(value.load).toHaveBeenCalled());
    await fireEvent(screen.getByTestId('camera'), 'onBarcodeScanned', { data: 'FG-AB12CD34' });
    expect(await screen.findByTestId('scan-feedback')).toHaveTextContent(
      'Déjà scanné — Livré à 14:32',
    );
    await fireEvent(screen.getByTestId('camera'), 'onBarcodeScanned', {
      data: 'https://www.mirely.store/suivi/FG-ZZZZZZZZ',
    });
    await waitFor(() =>
      expect(screen.getByTestId('scan-feedback')).toHaveTextContent(
        'Ce colis n’est pas dans votre tournée.',
      ),
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it('records a pickup scan for the ramasseur and keeps scanning (D-47)', async () => {
    const value = appValue({});
    value.session!.user.role = 'RAMASSEUR';
    await renderScreen(<ScannerScreen pickupId="p1" />, value);
    await fireEvent(screen.getByTestId('camera'), 'onBarcodeScanned', { data: 'FG-CCCCCCCC' });
    await waitFor(() =>
      expect(value.recordScan).toHaveBeenCalledWith({
        action: 'RAMASSAGE',
        rawCode: 'FG-CCCCCCCC',
        pickupId: 'p1',
        manual: false,
      }),
    );
    expect(await screen.findByTestId('scan-feedback')).toHaveTextContent(
      'Scan enregistré · FG-CCCCCCCC',
    );
  });
});

describe('PickupScreen (Coursier 4.6, A-13)', () => {
  it('shows the contact, the missing parcels, and closes the pickup', async () => {
    const value = appValue({
      '/coursier/ramassages': { open: [pickup()], done: [], visits: [] } satisfies PickupDay,
    });
    value.session!.user.role = 'RAMASSEUR';
    await renderScreen(<PickupScreen {...routeProps<'Pickup'>({ id: 'p1' })} />, value);
    expect(await screen.findByText('Contact : Yasmine Trabelsi')).toBeTruthy();
    expect(screen.getByTestId('pickup-counts')).toHaveTextContent('Scannés 1 · Attendus 2');
    expect(screen.getByText('FG-BBBBBBBB')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('finish'));
    expect(screen.getByText('Moins de 5 colis : frais de ramassage pour le vendeur.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('finish-confirm'));
    await waitFor(() =>
      expect(value.recordOperation).toHaveBeenCalledWith({
        kind: 'TERMINER_RAMASSAGE',
        pickupId: 'p1',
      }),
    );
  });
});

describe('CaisseScreen (Coursier 4.7, 4.9)', () => {
  it('adds the Livré scans still on the phone to the cash to hand in', async () => {
    const cash: Cash = {
      parcels: [
        {
          code: 'FG-AAAAAAAA',
          recipientName: 'Amira',
          codAmountMillimes: '85000',
          deliveredAt: null,
        },
      ],
      totalMillimes: '85000',
      bons: [],
      bonCashMillimes: '0',
      aRemettreMillimes: '85000',
      sessions: [],
    };
    const value = appValue(
      { '/coursier/caisse': cash },
      {
        recent: [
          {
            id: 's2',
            seq: 2,
            userId: 'u-ali',
            kind: 'SCAN',
            action: 'LIVRE',
            parcelCode: 'FG-BBBBBBBB',
            operation: { kind: 'SCAN', collectedMillimes: '40000' } as never,
            deviceTime: new Date().toISOString(),
            status: QueueStatus.EN_ATTENTE,
            code: null,
            message: null,
          },
        ],
      },
    );
    await renderScreen(<CaisseScreen />, value);
    await waitFor(() => expect(screen.getByTestId('cash-total')).toHaveTextContent('125,000 DT'));
    expect(screen.getByText('dont 40,000 DT en attente d’envoi')).toBeTruthy();
  });
});

describe('JourneeScreen (Coursier 4.1)', () => {
  it('gives today in numbers and what is still open before going home', async () => {
    const value = appValue({
      '/coursier/tournee': tour({ toBringBack: [stop({ code: 'FG-FAIL0000' })], doneToday: 3 }),
      '/coursier/caisse': {
        parcels: [],
        totalMillimes: '0',
        bons: [],
        bonCashMillimes: '0',
        aRemettreMillimes: '0',
        sessions: [],
      } satisfies Cash,
    });
    await renderScreen(<JourneeScreen />, value);
    expect(await screen.findByText('3 faits sur 4')).toBeTruthy();
    expect(screen.getByText('1 colis à rapporter au dépôt')).toBeTruthy();
  });
});

describe('RetourDepotScreen (Coursier 4.5)', () => {
  it('lists the failed parcels to bring back', async () => {
    const value = appValue({
      '/coursier/tournee': tour({
        toBringBack: [
          stop({ code: 'FG-FAIL0000', status: 'A_VERIFIER', lastFailureReason: 'NE_REPOND_PAS' }),
        ],
      }),
    });
    await renderScreen(<RetourDepotScreen />, value);
    expect(await screen.findByText('1 colis à rapporter au dépôt')).toBeTruthy();
    expect(screen.getByText('Ne répond pas')).toBeTruthy();
  });
});

describe('MenuScreen (Coursier 4.12)', () => {
  it('shows the profile read-only and switches the language to Arabic', async () => {
    const profile: Profile = {
      firstName: 'Ali',
      lastName: 'Ben Salah',
      phone: '98111222',
      role: 'LIVREUR',
      langue: 'FR',
      payPlan: 'HEBDOMADAIRE',
      zones: [{ name: 'Tunis Nord', kind: 'TITULAIRE' }],
      rules: { scanCancelWindowSeconds: 60, maxDeliveryAttempts: 3 },
    };
    const value = appValue({ '/coursier/moi': profile }, { pendingCount: 2 });
    await renderScreen(<MenuScreen />, value);
    expect(await screen.findByText('Tunis Nord · Titulaire')).toBeTruthy();
    expect(screen.getByText('Plan de paie : Hebdomadaire')).toBeTruthy();
    expect(screen.getByText(/Il reste 2 scan/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('lang-AR'));
    expect(value.setLang).toHaveBeenCalledWith('AR');
  });

  it('reads in Arabic', async () => {
    const value = appValue({});
    await renderScreen(<MenuScreen />, value, 'AR');
    expect(await screen.findByText('الملف الشخصي')).toBeTruthy();
  });
});

describe('UpdateScreen (tech-stack 5)', () => {
  it('sends the queue before blocking', async () => {
    await renderScreen(<UpdateScreen />, appValue({}, { pendingCount: 3 }));
    expect(screen.getByTestId('update-message')).toHaveTextContent(
      'Envoi des scans en attente avant la mise à jour : 3 restant(s).',
    );
  });
});

describe('the ramasseur’s bons (Coursier 4.6, D-84)', () => {
  const aEmporter = {
    bonsVersement: [
      { id: 'bv1', number: 'BV-2026-0925-01', netMillimes: '78000', enMain: true, remis: false },
    ],
    bonsRetour: [
      {
        id: 'br1',
        number: 'BR-2026-0925-01',
        enMain: true,
        remis: false,
        lines: [
          { code: 'FG-RRRRRRRR', itemType: 'COLIS' as const, received: false },
          { code: 'FG-EEEEEEEE', itemType: 'ARTICLE_RECUPERE' as const, received: true },
        ],
      },
    ],
  };

  it('shows À emporter on the pickup, and opens the Bon de versement step', async () => {
    const value = appValue({
      '/coursier/ramassages': {
        open: [pickup({ aEmporter })],
        done: [],
        visits: [],
      } satisfies PickupDay,
    });
    value.session!.user.role = 'RAMASSEUR';
    await renderScreen(<PickupScreen {...routeProps<'Pickup'>({ id: 'p1' })} />, value);
    expect(await screen.findByTestId('bon-BV-2026-0925-01')).toHaveTextContent(
      'Bon de versement BV-2026-0925-01 · 78,000 DT · En main',
    );
    expect(screen.getByText('FG-EEEEEEEE · ancien article · Reçu')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('scan-bon'));
    expect(navigate).toHaveBeenCalledWith('Scanner', { pickupId: 'p1', step: 'BON' });
    await fireEvent.press(screen.getByTestId('scan-retours'));
    expect(navigate).toHaveBeenCalledWith('Scanner', { pickupId: 'p1', step: 'RETOURS' });
  });

  it('records the bon’s QR as Remis, and a return as Retour reçu', async () => {
    const value = appValue({ '/coursier/ramassages': { open: [], done: [], visits: [] } });
    value.session!.user.role = 'RAMASSEUR';
    await renderScreen(<ScannerScreen step="BON" />, value);
    await fireEvent.changeText(screen.getByLabelText('Numéro du bon'), 'FG-AAAAAAAA');
    await fireEvent.press(screen.getByTestId('validate-code'));
    expect(await screen.findByTestId('scan-feedback')).toHaveTextContent('QR du bon illisible');
    await fireEvent.changeText(screen.getByLabelText('Numéro du bon'), 'BV-2026-0925-01');
    await fireEvent.press(screen.getByTestId('validate-code'));
    await waitFor(() =>
      expect(value.recordScan).toHaveBeenCalledWith({
        action: 'BON_VERSEMENT_REMIS',
        rawCode: 'BV-2026-0925-01',
        manual: true,
      }),
    );
    expect(await screen.findByTestId('scan-feedback')).toHaveTextContent(
      'Bon de versement enregistré',
    );

    await renderScreen(<ScannerScreen step="RETOURS" />, value);
    await fireEvent.changeText(screen.getByLabelText('Code du colis'), 'FG-RRRRRRRR');
    await fireEvent.press(screen.getByTestId('validate-code'));
    await waitFor(() =>
      expect(value.recordScan).toHaveBeenCalledWith({
        action: 'RETOUR_RECU',
        rawCode: 'FG-RRRRRRRR',
        manual: true,
      }),
    );
  });

  it('shows a visit with only bons to hand over', async () => {
    const value = appValue({
      '/coursier/ramassages': {
        open: [],
        done: [],
        visits: [
          {
            sellerId: 's1',
            shopName: 'Chic Tunis',
            contactName: 'Amel',
            sellerPhone: '22000000',
            address: 'Boutique, rue 3',
            landmark: null,
            localiteNameFr: 'Khaznadar',
            localiteNameAr: null,
            delegationNameFr: 'Le Bardo',
            delegationNameAr: 'باردو',
            aEmporter,
          },
        ],
      } satisfies PickupDay,
    });
    value.session!.user.role = 'RAMASSEUR';
    await renderScreen(<VisitScreen {...routeProps<'Visit'>({ sellerId: 's1' })} />, value);
    expect(await screen.findByText('Contact : Amel')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('scan-bon'));
    expect(navigate).toHaveBeenCalledWith('Scanner', { step: 'BON' });
  });
});

describe('Ma caisse, the depot’s count (Coursier 4.7, D-84)', () => {
  it('adds the bon cash, and shows conforme or the écart with its debt', async () => {
    const cash: Cash = {
      parcels: [],
      totalMillimes: '0',
      bons: [{ number: 'BV-2026-0925-01', shopName: 'Chic', netMillimes: '78000' }],
      bonCashMillimes: '78000',
      aRemettreMillimes: '78000',
      sessions: [
        {
          day: '2026-09-24',
          status: 'CLOTUREE',
          expectedMillimes: '170000',
          countedMillimes: '165000',
          ecartMillimes: '-5000',
          conforme: false,
          debtMillimes: '5000',
        },
        {
          day: '2026-09-23',
          status: 'CLOTUREE',
          expectedMillimes: '85000',
          countedMillimes: '85000',
          ecartMillimes: '0',
          conforme: true,
          debtMillimes: null,
        },
      ],
    };
    const value = appValue({ '/coursier/caisse': cash });
    await renderScreen(<CaisseScreen />, value);
    await waitFor(() => expect(screen.getByTestId('cash-total')).toHaveTextContent('78,000 DT'));
    expect(screen.getByTestId('caisse-2026-09-24')).toHaveTextContent(
      '24/09 · écart -5,000 DT · Dette de 5,000 DT, déduite de votre paie',
    );
    expect(screen.getByTestId('caisse-2026-09-23')).toHaveTextContent('23/09 · conforme');
  });
});

describe('Mes gains (Coursier 4.10, D-82)', () => {
  it('shows the amount due, the period and the next payment', async () => {
    const gains: Gains = {
      payPlan: 'HEBDOMADAIRE',
      pendingPayPlan: null,
      pendingPayPlanFrom: null,
      period: { start: '2026-09-21', end: '2026-09-27' },
      nextPaymentDate: '2026-09-28',
      parcelCount: 2,
      grossMillimes: '7000',
      debtsMillimes: '2000',
      dueMillimes: '5000',
      carriedDebtMillimes: '0',
      debtsOpenMillimes: '2000',
      fiches: [],
    };
    const value = appValue({ '/coursier/gains': gains });
    await renderScreen(<GainsScreen />, value);
    await waitFor(() => expect(screen.getByTestId('gains-due')).toHaveTextContent('5,000 DT'));
    expect(screen.getByText('2 colis livrés · 7,000 DT')).toBeTruthy();
    expect(screen.getByText('Prochain paiement le 28/09')).toBeTruthy();
  });
});

describe('NotificationsScreen (Coursier 4.11, A-24)', () => {
  const list: NotificationList = {
    unreadCount: 2,
    next: null,
    items: [
      {
        id: 'n1',
        type: 'NOUVEAUX_COLIS_ASSIGNES',
        params: { count: 3 },
        readAt: null,
        createdAt: '2026-09-26T07:00:00.000Z',
      },
      {
        id: 'n2',
        type: 'NOUVEAU_MESSAGE',
        params: { code: 'FG-AB12CD34', from: 'Boutique Yasmine' },
        readAt: null,
        createdAt: '2026-09-26T08:00:00.000Z',
      },
      {
        id: 'n3',
        type: 'RAPPEL_FIN_DE_JOURNEE',
        params: { parcels: 1, bons: 0, cash: true, day: '2026-09-25' },
        readAt: '2026-09-25T17:00:00.000Z',
        createdAt: '2026-09-25T17:00:00.000Z',
      },
    ],
  };

  it('words each notification from its parameters, in French', async () => {
    await renderScreen(<NotificationsScreen />, appValue({ '/notifications': list }));

    expect(await screen.findByText('3 nouveaux colis assignés')).toBeTruthy();
    expect(screen.getByText('Nouveau message de Boutique Yasmine sur FG-AB12CD34')).toBeTruthy();
    expect(
      screen.getByText('Avant de rentrer : 1 colis à rendre au dépôt, argent à remettre'),
    ).toBeTruthy();
  });

  it('words them in Arabic when the courier reads Arabic', async () => {
    await renderScreen(<NotificationsScreen />, appValue({ '/notifications': list }), 'AR');

    expect(await screen.findByText('طرود جديدة: 3')).toBeTruthy();
    expect(screen.getByText('رسالة جديدة من Boutique Yasmine بخصوص FG-AB12CD34')).toBeTruthy();
  });

  it('marks one read and opens the chat it is about', async () => {
    const request = jest.fn(async () => ({ unreadCount: 1 }));
    const refreshUnread = jest.fn(async () => undefined);
    await renderScreen(
      <NotificationsScreen />,
      appValue({ '/notifications': list }, { api: { request } as never, refreshUnread }),
    );

    await fireEvent.press(await screen.findByTestId('notification-n2'));

    await waitFor(() => expect(request).toHaveBeenCalledWith('POST', '/notifications/n2/read'));
    expect(navigate).toHaveBeenCalledWith('Chat', { code: 'FG-AB12CD34' });
    await waitFor(() => expect(refreshUnread).toHaveBeenCalled());
  });

  it('marks everything read', async () => {
    const request = jest.fn(async () => ({ unreadCount: 0 }));
    await renderScreen(
      <NotificationsScreen />,
      appValue({ '/notifications': list }, { api: { request } as never }),
    );

    await fireEvent.press(await screen.findByTestId('mark-all-read'));

    await waitFor(() => expect(request).toHaveBeenCalledWith('POST', '/notifications/read-all'));
  });

  it('says so when there is nothing', async () => {
    await renderScreen(
      <NotificationsScreen />,
      appValue({ '/notifications': { items: [], unreadCount: 0, next: null } }),
    );
    expect(await screen.findByText('Aucune notification.')).toBeTruthy();
    expect(screen.queryByTestId('mark-all-read')).toBeNull();
  });
});

describe('the chat (Coursier 4.8)', () => {
  const thread = (overrides: Partial<ChatThread> = {}): { thread: ChatThread } => ({
    thread: {
      parcelCode: 'FG-AB12CD34',
      state: 'OUVERT',
      canPost: true,
      refusal: null,
      shopName: 'Boutique Yasmine',
      sellerPhone: '50990001',
      messages: [
        {
          id: 'm1',
          kind: 'VENDEUR',
          label: 'Boutique Yasmine',
          mine: false,
          body: 'Le client est disponible après 17 h',
          createdAt: '2026-09-26T09:00:00.000Z',
        },
        {
          id: 'm2',
          kind: 'COURSIER',
          label: 'Vous',
          mine: true,
          body: 'Je passe dans 10 min',
          createdAt: '2026-09-26T09:05:00.000Z',
        },
      ],
      ...overrides,
    },
  });
  const route = routeProps<'Chat'>({ code: 'FG-AB12CD34' });
  const path = '/chat/courier/FG-AB12CD34';

  it('shows the seller by shop and his phone, and my messages as mine', async () => {
    await renderScreen(<ChatScreen {...route} />, appValue({ [path]: thread() }));

    expect(await screen.findByText('Le client est disponible après 17 h')).toBeTruthy();
    // The shop heads the screen and signs its messages.
    expect(screen.getAllByText('Boutique Yasmine', { exact: false }).length).toBeGreaterThan(0);
    expect(screen.getByText('Appeler le vendeur · 50990001', { exact: false })).toBeTruthy();
    expect(screen.getByText('Vous')).toBeTruthy();
    expect(screen.getByText('Ouvert')).toBeTruthy();
  });

  it('sends a quick reply at one tap: through the queue, in French, whatever the language', async () => {
    const value = appValue({ [path]: thread() });
    await renderScreen(<ChatScreen {...route} />, value, 'AR');

    // The button reads Arabic; what goes out is the French text the seller reads.
    await fireEvent.press(await screen.findByTestId('quick-Client ne répond pas'));

    expect(value.recordOperation).toHaveBeenCalledWith({
      kind: 'MESSAGE_CHAT',
      parcelCode: 'FG-AB12CD34',
      body: 'Client ne répond pas',
    });
  });

  it('sends what he typed, and empties the box', async () => {
    const value = appValue({ [path]: thread() });
    await renderScreen(<ChatScreen {...route} />, value);

    await fireEvent.changeText(await screen.findByLabelText('Votre message'), '  Je suis devant  ');
    await fireEvent.press(screen.getByTestId('chat-send'));

    expect(value.recordOperation).toHaveBeenCalledWith({
      kind: 'MESSAGE_CHAT',
      parcelCode: 'FG-AB12CD34',
      body: 'Je suis devant',
    });
    await waitFor(() => expect(screen.getByLabelText('Votre message').props.value).toBe(''));
  });

  it('shows a message written offline as waiting, and one refused with why', async () => {
    const row = (
      id: string,
      status: QueueRow['status'],
      code: string | null,
      message: string | null,
    ) =>
      ({
        id,
        seq: 1,
        userId: 'u-ali',
        kind: 'MESSAGE_CHAT',
        action: null,
        parcelCode: 'FG-AB12CD34',
        operation: {
          kind: 'MESSAGE_CHAT',
          operationId: id,
          parcelCode: 'FG-AB12CD34',
          body: `texte ${id}`,
          deviceTime: '2026-09-26T09:10:00.000Z',
        },
        deviceTime: '2026-09-26T09:10:00.000Z',
        status,
        code,
        message,
      }) as unknown as QueueRow;
    const recent = [
      row('w1', QueueStatus.EN_ATTENTE, null, null),
      row(
        'r1',
        QueueStatus.REFUSE,
        'CHAT_LECTURE_SEULE',
        'Le colis est au dépôt : le chat est en lecture seule',
      ),
      // Already in the thread: shown once, by the thread.
      row('m2', QueueStatus.ACCEPTE, null, null),
    ];
    await renderScreen(<ChatScreen {...route} />, appValue({ [path]: thread() }, { recent }));

    expect(await screen.findByText('texte w1')).toBeTruthy();
    expect(screen.getByTestId('outbox-status-w1')).toHaveTextContent('En attente d’envoi');
    expect(screen.getByTestId('outbox-status-r1')).toHaveTextContent(
      'Pas envoyé : Le colis est au dépôt : le chat est en lecture seule',
    );
    expect(screen.queryByTestId('outbox-m2')).toBeNull();
  });

  it('gives no box while the parcel is at the depot, and says why', async () => {
    await renderScreen(
      <ChatScreen {...route} />,
      appValue({
        [path]: thread({ state: 'VERROUILLE', canPost: false, refusal: 'CHAT_LECTURE_SEULE' }),
      }),
    );

    expect(await screen.findByTestId('chat-refusal')).toHaveTextContent(
      'Le colis est au dépôt : le chat est en lecture seule',
    );
    expect(screen.queryByTestId('chat-send')).toBeNull();
    expect(screen.getByText('Lecture seule')).toBeTruthy();
  });

  it('says the refusal in Arabic for an Arabic reader', async () => {
    await renderScreen(
      <ChatScreen {...route} />,
      appValue({ [path]: thread({ state: 'CLOS', canPost: false, refusal: 'CHAT_CLOS' }) }),
      'AR',
    );
    expect(await screen.findByTestId('chat-refusal')).toHaveTextContent(
      'الدردشة مغلقة: الطرد سُلّم وخُلِّص أو تم استلام إرجاعه',
    );
  });

  it('is not open before the parcel is taken out', async () => {
    await renderScreen(<ChatScreen {...route} />, appValue({ [path]: { thread: null } }));
    expect(
      await screen.findByText('Le chat s’ouvre quand vous prenez le colis en charge.'),
    ).toBeTruthy();
  });

  it('lists the chats with what is new, each leading to its thread', async () => {
    const list: ChatList = {
      unreadCount: 2,
      threads: [
        {
          parcelCode: 'FG-AB12CD34',
          shopName: 'Boutique Yasmine',
          state: 'OUVERT',
          lastMessage: 'Le client est disponible après 17 h',
          lastMessageAt: '2026-09-26T09:00:00.000Z',
          unread: 2,
        },
      ],
    };
    await renderScreen(<ChatListScreen />, appValue({ '/chat/courier': list }));

    expect(await screen.findByText('FG-AB12CD34  ·  2 nouveau(x)')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('chat-FG-AB12CD34'));
    expect(navigate).toHaveBeenCalledWith('Chat', { code: 'FG-AB12CD34' });
  });

  it('is reached from the stop, next to the call to the seller', async () => {
    await renderScreen(
      <StopScreen {...routeProps<'Stop'>({ code: 'FG-AB12CD34' })} />,
      appValue({ '/coursier/tournee': tour() }),
    );
    await fireEvent.press(await screen.findByTestId('open-stop-chat'));
    expect(navigate).toHaveBeenCalledWith('Chat', { code: 'FG-AB12CD34' });
  });

  it('is reached from the menu with the count of what is new', async () => {
    const value = appValue(
      {
        '/coursier/moi': {
          role: 'LIVREUR',
          zones: [],
          firstName: 'Ali',
          lastName: 'B',
          phone: '1',
          payPlan: null,
        },
      },
      { unread: { notifications: 2, chats: 1 } },
    );
    await renderScreen(<MenuScreen />, value);
    expect(await screen.findByText('Chat · 1 nouveau(x)')).toBeTruthy();
    expect(screen.getByText('Notifications · 2 nouveau(x)')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('open-chat'));
    expect(navigate).toHaveBeenCalledWith('ChatList');
    await fireEvent.press(screen.getByTestId('open-notifications'));
    expect(navigate).toHaveBeenCalledWith('Notifications');
  });

  it('gives the ramasseur Notifications and no chat (A-23)', async () => {
    await renderScreen(
      <MenuScreen />,
      appValue({
        '/coursier/moi': {
          role: 'RAMASSEUR',
          zones: [],
          firstName: 'Hédi',
          lastName: 'B',
          phone: '2',
          payPlan: null,
        },
      }),
    );
    expect(await screen.findByText('Rôle : Ramasseur')).toBeTruthy();
    expect(screen.getByTestId('open-notifications')).toBeTruthy();
    expect(screen.queryByTestId('open-chat')).toBeNull();
  });
});
