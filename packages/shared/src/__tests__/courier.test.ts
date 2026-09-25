import { describe, expect, it } from 'vitest';
import {
  COURIER_SCAN_ACTIONS_BY_ROLE,
  FAILURE_REASONS_IN_ORDER,
  PARCEL_ACTION_BY_COURIER_SCAN,
  courierCashCarried,
  courierOperationSchema,
  courierScanCancelRefusal,
  courierSyncSchema,
  isWithinCancelWindow,
  operationIdOf,
  postponementChoices,
  telLink,
  whatsappLink,
  whatsappMessageFr,
  type CourierScanCancelFacts,
} from '../courier.js';
import { FAILURE_REASON_LABELS_FR } from '../statuses.js';

const uuid = '0f9c3a1e-4b7d-4c2a-9e51-3d8f6b2a1c77';

describe('the operations the app queues', () => {
  it('reads a Livré scan, money as digits', () => {
    const parsed = courierOperationSchema.parse({
      kind: 'SCAN',
      clientScanId: uuid,
      action: 'LIVRE',
      rawCode: 'FG-AB12CD34',
      source: 'APP_COURSIER',
      deviceTime: '2026-09-25T10:00:00.000+01:00',
      gps: { lat: 36.8, lng: 10.18, accuracyM: 12 },
      collectedMillimes: '85000',
      exchangeItemCollected: false,
    });
    expect(parsed).toMatchObject({ kind: 'SCAN', action: 'LIVRE', collectedMillimes: '85000' });
  });

  it('accepts a scan with no GPS fix (D-63)', () => {
    const parsed = courierOperationSchema.safeParse({
      kind: 'SCAN',
      clientScanId: uuid,
      action: 'ECHEC',
      rawCode: 'FG-AB12CD34',
      source: 'APP_COURSIER',
      deviceTime: '2026-09-25T10:00:00.000Z',
      gps: null,
      failureReason: 'NE_REPOND_PAS',
      note: '  ',
    });
    expect(parsed.success).toBe(true);
    // An empty note is no note.
    expect(parsed.success && parsed.data.kind === 'SCAN' && parsed.data.note).toBeNull();
  });

  it('refuses a scan action the app does not make in phase 6 (D-61)', () => {
    const parsed = courierOperationSchema.safeParse({
      kind: 'SCAN',
      clientScanId: uuid,
      action: 'RETOUR_RECU',
      rawCode: 'FG-AB12CD34',
      source: 'APP_COURSIER',
      deviceTime: '2026-09-25T10:00:00.000Z',
    });
    expect(parsed.success).toBe(false);
  });

  it('refuses money that is not whole millimes', () => {
    const parsed = courierOperationSchema.safeParse({
      kind: 'SCAN',
      clientScanId: uuid,
      action: 'LIVRE',
      rawCode: 'FG-AB12CD34',
      source: 'APP_COURSIER',
      deviceTime: '2026-09-25T10:00:00.000Z',
      collectedMillimes: '85.5',
    });
    expect(parsed.success).toBe(false);
  });

  it('reads a cancellation, a Terminer and an address note', () => {
    for (const operation of [
      { kind: 'ANNULATION', clientScanId: uuid, deviceTime: '2026-09-25T10:00:30.000Z' },
      {
        kind: 'TERMINER_RAMASSAGE',
        operationId: uuid,
        pickupId: uuid,
        deviceTime: '2026-09-25T10:00:30.000Z',
      },
      {
        kind: 'NOTE_ADRESSE',
        operationId: uuid,
        parcelCode: 'FG-AB12CD34',
        note: 'Immeuble bleu, 2e étage',
        deviceTime: '2026-09-25T10:00:30.000Z',
      },
    ]) {
      expect(courierOperationSchema.safeParse(operation).success).toBe(true);
    }
  });

  it('caps a note and a meeting point', () => {
    const parsed = courierOperationSchema.safeParse({
      kind: 'NOTE_ADRESSE',
      operationId: uuid,
      parcelCode: 'FG-AB12CD34',
      meetingPoint: 'x'.repeat(201),
      deviceTime: '2026-09-25T10:00:30.000Z',
    });
    expect(parsed.success).toBe(false);
  });

  it('lets the upload carry anything, each operation read on its own', () => {
    expect(courierSyncSchema.safeParse({ operations: [{ nonsense: true }] }).success).toBe(true);
    expect(courierSyncSchema.safeParse({ operations: [] }).success).toBe(false);
    expect(courierSyncSchema.safeParse({ operations: new Array(51).fill({}) }).success).toBe(false);
  });

  it('names each operation by the scan it is about, or its own id', () => {
    expect(
      operationIdOf({ kind: 'ANNULATION', clientScanId: uuid, deviceTime: '2026-09-25T10:00:00Z' }),
    ).toBe(uuid);
  });
});

describe('who scans what (Coursier 5)', () => {
  it('gives the livreur Livré and Échec, the ramasseur the pickup', () => {
    expect(COURIER_SCAN_ACTIONS_BY_ROLE.LIVREUR).toEqual(['LIVRE', 'ECHEC']);
    expect(COURIER_SCAN_ACTIONS_BY_ROLE.RAMASSEUR).toEqual(['RAMASSAGE']);
    expect(PARCEL_ACTION_BY_COURIER_SCAN.LIVRE).toBe('SCAN_LIVRE');
  });

  it('lists the five failure reasons in the order of Coursier 4.4', () => {
    expect(FAILURE_REASONS_IN_ORDER.map((r) => FAILURE_REASON_LABELS_FR[r])).toEqual([
      'Ne répond pas',
      'Injoignable',
      'Adresse incorrecte',
      'Reporté par le client',
      'Refusé',
    ]);
  });
});

describe('Annuler le dernier scan on the phone’s clock (A-11)', () => {
  const scanDeviceTime = new Date('2026-09-25T10:00:00.000Z');
  const facts = (over: Partial<CourierScanCancelFacts> = {}): CourierScanCancelFacts => ({
    accepted: true,
    alreadyCancelled: false,
    byActor: true,
    isLatestOfActor: true,
    scanDeviceTime,
    cancelDeviceTime: new Date('2026-09-25T10:00:59.000Z'),
    windowSeconds: 60,
    parcelUnchangedSince: true,
    chargesStillWaiting: true,
    pickupFinished: false,
    ...over,
  });

  it('allows his own last scan within the minute, however late it reaches the server', () => {
    expect(courierScanCancelRefusal(facts())).toBeNull();
  });

  it('measures the minute between the two phone times', () => {
    expect(
      courierScanCancelRefusal(facts({ cancelDeviceTime: new Date('2026-09-25T10:01:01.000Z') })),
    ).toBe('ANNULATION_HORS_DELAI');
    expect(
      courierScanCancelRefusal(facts({ cancelDeviceTime: new Date('2026-09-25T09:59:59.000Z') })),
    ).toBe('ANNULATION_HORS_DELAI');
  });

  it('refuses another courier, a scan not his last, a refused or cancelled scan', () => {
    expect(courierScanCancelRefusal(facts({ byActor: false }))).toBe('ANNULATION_AUTRE_PERSONNE');
    expect(courierScanCancelRefusal(facts({ isLatestOfActor: false }))).toBe(
      'ANNULATION_PAS_DERNIER',
    );
    expect(courierScanCancelRefusal(facts({ accepted: false }))).toBe('ANNULATION_SCAN_REFUSE');
    expect(courierScanCancelRefusal(facts({ alreadyCancelled: true }))).toBe(
      'ANNULATION_SCAN_REFUSE',
    );
  });

  it('refuses once the parcel moved on, a charge left, or the pickup was closed', () => {
    expect(courierScanCancelRefusal(facts({ parcelUnchangedSince: false }))).toBe(
      'ANNULATION_COLIS_MODIFIE',
    );
    expect(courierScanCancelRefusal(facts({ chargesStillWaiting: false }))).toBe(
      'ANNULATION_COLIS_MODIFIE',
    );
    expect(courierScanCancelRefusal(facts({ pickupFinished: true }))).toBe(
      'ANNULATION_RAMASSAGE_TERMINE',
    );
  });

  it('tells the phone when to stop offering Annuler', () => {
    expect(isWithinCancelWindow(scanDeviceTime, new Date('2026-09-25T10:01:00.000Z'), 60)).toBe(
      true,
    );
    expect(isWithinCancelWindow(scanDeviceTime, new Date('2026-09-25T10:01:00.001Z'), 60)).toBe(
      false,
    );
  });
});

describe('Reporté par le client: the days offered (D-9)', () => {
  it('offers tomorrow up to seven days ahead, from the Tunis day', () => {
    // 23:30 in Tunis on the 25th is still the 25th there.
    expect(postponementChoices(new Date('2026-09-25T22:30:00.000Z'))).toEqual([
      '2026-09-26',
      '2026-09-27',
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ]);
  });
});

describe('Ma caisse (Coursier 4.7, 4.9)', () => {
  it('counts the cash carried and the Livré scans still on the phone', () => {
    expect(
      courierCashCarried(
        [{ codAmountMillimes: 85000n }, { codAmountMillimes: 40000n }],
        [{ collectedMillimes: 12500n }],
      ),
    ).toBe(137500n);
    expect(courierCashCarried([], [])).toBe(0n);
  });
});

describe('Trouver le client (Coursier 4.3)', () => {
  it('writes the WhatsApp message of the spec, and the links', () => {
    const text = whatsappMessageFr('Boutique Yasmine', 'La Marsa');
    expect(text).toBe(
      'Bonjour, je suis le livreur Faffa Go pour votre commande de Boutique Yasmine. Je suis à La Marsa, pouvez-vous me guider ?',
    );
    expect(whatsappLink('98 111 222', 'Bonjour')).toBe('https://wa.me/21698111222?text=Bonjour');
    expect(telLink('+216 98111222')).toBe('tel:+21698111222');
  });
});
