import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { Cash, PickupDay, PickupView, Profile } from '../src/api/types';
import { CaisseScreen } from '../src/screens/CaisseScreen';
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
import { PickupScreen } from '../src/screens/ramasseur/PickupScreen';
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
  aEmporter: [],
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
      '/coursier/ramassages': { open: [pickup()], done: [] } satisfies PickupDay,
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
      '/coursier/caisse': { parcels: [], totalMillimes: '0' } satisfies Cash,
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
