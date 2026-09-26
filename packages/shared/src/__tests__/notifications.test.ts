import { describe, expect, it } from 'vitest';
import {
  END_OF_DAY_REMINDER_HOUR_TUNIS,
  NotificationType,
  RELANCE_TODAY_NOTICE_HOUR_TUNIS,
  isDailyNoticeDue,
  notificationRecipients,
  notificationTarget,
  notificationText,
  sellerNoticesForParcel,
  type NotificationParams,
} from '../notifications.js';
import { ParcelEventType } from '../parcel-state-machine.js';
import { Permission } from '../permissions.js';
import { Role } from '../roles.js';
import { FailureReason, ParcelStatus } from '../statuses.js';

const SAMPLE: { [T in NotificationType]: NotificationParams[T] } = {
  COLIS_A_VERIFIER: { code: 'FG-ABCD2345', reason: FailureReason.NE_REPOND_PAS },
  COLIS_24H_RESTANTES: { code: 'FG-ABCD2345' },
  COLIS_RETOUR_AUTO_48H: { code: 'FG-ABCD2345' },
  COLIS_EN_RETOUR: { code: 'FG-ABCD2345' },
  BON_VERSEMENT_EN_ROUTE: { number: 'BV-2026-0926-01' },
  BON_RETOUR_EN_ROUTE: { number: 'BR-2026-0926-01' },
  RAMASSAGE_PLANIFIE: { pickupId: 'p1', day: '2026-09-28', window: 'MATIN' },
  RAMASSAGE_EFFECTUE: { pickupId: 'p1', count: 6 },
  NOUVEAU_MESSAGE: { code: 'FG-ABCD2345', from: 'Sami' },
  COMPTE_SUSPENDU: {},
  COMPTE_REACTIVE: {},
  NOUVELLE_DEMANDE_RAMASSAGE: { pickupId: 'p1', shopName: 'Boutique Démo' },
  DEMANDE_MODIFICATION: { code: 'FG-ABCD2345', shopName: 'Boutique Démo' },
  ECART_CAISSE: {
    courierName: 'Sami Ben Ali',
    day: '2026-09-25',
    direction: 'MANQUANT',
    amountMillimes: '5000',
  },
  BON_NON_REMIS: { number: 'BV-2026-0926-01', kind: 'VERSEMENT' },
  COURSIER_A_PAYER: { courierName: 'Sami Ben Ali', day: '2026-09-27' },
  NOUVEAUX_COLIS_ASSIGNES: { count: 3 },
  COLIS_RELANCE_AUJOURDHUI: { count: 2, day: '2026-09-28' },
  COLIS_REPORTE_PAR_CLIENT: { code: 'FG-ABCD2345', date: '2026-09-30' },
  RAPPEL_FIN_DE_JOURNEE: { parcels: 2, bons: 1, cash: true, day: '2026-09-26' },
};

describe('notificationText', () => {
  it('words every type in French, from the wording of the specs', () => {
    for (const type of Object.values(NotificationType)) {
      const text = notificationText(type, SAMPLE[type] as never, 'fr');
      expect(text.length, type).toBeGreaterThan(5);
    }
    expect(notificationText('COLIS_A_VERIFIER', SAMPLE.COLIS_A_VERIFIER, 'fr')).toBe(
      'Colis FG-ABCD2345 à vérifier · Ne répond pas',
    );
    expect(notificationText('COLIS_24H_RESTANTES', SAMPLE.COLIS_24H_RESTANTES, 'fr')).toBe(
      'Plus que 24 h pour décider sur FG-ABCD2345',
    );
    expect(notificationText('COLIS_RETOUR_AUTO_48H', SAMPLE.COLIS_RETOUR_AUTO_48H, 'fr')).toBe(
      'Colis FG-ABCD2345 retourné automatiquement',
    );
    expect(notificationText('COLIS_EN_RETOUR', SAMPLE.COLIS_EN_RETOUR, 'fr')).toBe(
      'Colis FG-ABCD2345 en retour',
    );
    expect(notificationText('BON_VERSEMENT_EN_ROUTE', SAMPLE.BON_VERSEMENT_EN_ROUTE, 'fr')).toBe(
      'Votre paiement BV-2026-0926-01 arrive avec le coursier',
    );
    expect(notificationText('BON_RETOUR_EN_ROUTE', SAMPLE.BON_RETOUR_EN_ROUTE, 'fr')).toBe(
      'Vos retours BR-2026-0926-01 arrivent avec le coursier',
    );
    expect(notificationText('NOUVEAU_MESSAGE', SAMPLE.NOUVEAU_MESSAGE, 'fr')).toBe(
      'Nouveau message de Sami sur FG-ABCD2345',
    );
    expect(notificationText('COMPTE_SUSPENDU', {}, 'fr')).toBe('Compte suspendu');
    expect(notificationText('COMPTE_REACTIVE', {}, 'fr')).toBe('Compte réactivé');
  });

  it('says the customer asked for the postponement (D-9)', () => {
    expect(
      notificationText('COLIS_REPORTE_PAR_CLIENT', SAMPLE.COLIS_REPORTE_PAR_CLIENT, 'fr'),
    ).toBe('Livraison de FG-ABCD2345 reportée au 30/09/2026 à la demande du client');
  });

  it('formats an écart from millimes, never through a float', () => {
    expect(notificationText('ECART_CAISSE', SAMPLE.ECART_CAISSE, 'fr')).toBe(
      'Écart de caisse · Sami Ben Ali · manque 5,000 DT',
    );
    expect(
      notificationText(
        'ECART_CAISSE',
        { ...SAMPLE.ECART_CAISSE, direction: 'EXCEDENT', amountMillimes: '1250' },
        'fr',
      ),
    ).toBe('Écart de caisse · Sami Ben Ali · excédent 1,250 DT');
  });

  it('gives the staff their own wording of the 24-hour mark', () => {
    expect(
      notificationText(
        'COLIS_24H_RESTANTES',
        { code: 'FG-ABCD2345', shopName: 'Boutique Démo' },
        'fr',
      ),
    ).toBe('FG-ABCD2345 · Boutique Démo : plus que 24 h pour décider');
  });

  it('adds the shop to a pickup planned for a ramasseur', () => {
    expect(notificationText('RAMASSAGE_PLANIFIE', SAMPLE.RAMASSAGE_PLANIFIE, 'fr')).toBe(
      'Ramassage planifié le 28/09/2026 (Matin)',
    );
    expect(
      notificationText(
        'RAMASSAGE_PLANIFIE',
        { ...SAMPLE.RAMASSAGE_PLANIFIE, shopName: 'Boutique Démo', window: 'APRES_MIDI' },
        'fr',
      ),
    ).toBe('Ramassage planifié : Boutique Démo, le 28/09/2026 (Après-midi)');
  });

  it('counts, in the singular and the plural', () => {
    expect(notificationText('NOUVEAUX_COLIS_ASSIGNES', { count: 1 }, 'fr')).toBe(
      '1 nouveau colis assigné',
    );
    expect(notificationText('NOUVEAUX_COLIS_ASSIGNES', { count: 3 }, 'fr')).toBe(
      '3 nouveaux colis assignés',
    );
    expect(notificationText('COLIS_RELANCE_AUJOURDHUI', { count: 1, day: 'x' }, 'fr')).toBe(
      '1 colis relancé à livrer aujourd’hui',
    );
    expect(
      notificationText('COLIS_RELANCE_AUJOURDHUI', SAMPLE.COLIS_RELANCE_AUJOURDHUI, 'fr'),
    ).toBe('2 colis relancés à livrer aujourd’hui');
  });

  it('lists only what is left in the end-of-day reminder', () => {
    expect(notificationText('RAPPEL_FIN_DE_JOURNEE', SAMPLE.RAPPEL_FIN_DE_JOURNEE, 'fr')).toBe(
      'Avant de rentrer : 2 colis à rendre au dépôt, 1 bon à rendre, argent à remettre',
    );
    expect(
      notificationText(
        'RAPPEL_FIN_DE_JOURNEE',
        { parcels: 0, bons: 0, cash: true, day: 'x' },
        'fr',
      ),
    ).toBe('Avant de rentrer : argent à remettre');
  });

  it('words the courier types in Arabic, and keeps the others in French (Q4)', () => {
    for (const type of [
      NotificationType.NOUVEAU_MESSAGE,
      NotificationType.RAMASSAGE_PLANIFIE,
      NotificationType.RAMASSAGE_EFFECTUE,
      NotificationType.NOUVEAUX_COLIS_ASSIGNES,
      NotificationType.COLIS_RELANCE_AUJOURDHUI,
      NotificationType.RAPPEL_FIN_DE_JOURNEE,
    ] as const) {
      const ar = notificationText(type, SAMPLE[type] as never, 'ar');
      expect(ar, type).toMatch(/[؀-ۿ]/);
      expect(ar, type).not.toBe(notificationText(type, SAMPLE[type] as never, 'fr'));
    }
    // A seller or back office type is never shown in Arabic: same text.
    expect(notificationText('COLIS_A_VERIFIER', SAMPLE.COLIS_A_VERIFIER, 'ar')).toBe(
      notificationText('COLIS_A_VERIFIER', SAMPLE.COLIS_A_VERIFIER, 'fr'),
    );
  });

  it('keeps the parcel code in an Arabic sentence', () => {
    const ar = notificationText('NOUVEAU_MESSAGE', SAMPLE.NOUVEAU_MESSAGE, 'ar');
    expect(ar).toContain('FG-ABCD2345');
    expect(ar).toContain('Sami');
  });
});

describe('notificationRecipients', () => {
  it('sends the team types to the permission that acts on them', () => {
    expect(
      notificationRecipients('NOUVELLE_DEMANDE_RAMASSAGE', SAMPLE.NOUVELLE_DEMANDE_RAMASSAGE),
    ).toEqual([Permission.PLANIFIER_RAMASSAGES_TOURNEES]);
    expect(notificationRecipients('DEMANDE_MODIFICATION', SAMPLE.DEMANDE_MODIFICATION)).toEqual([
      Permission.DEMANDES_VENDEUR,
    ]);
    expect(notificationRecipients('ECART_CAISSE', SAMPLE.ECART_CAISSE)).toEqual([
      Permission.CAISSE_ECARTS,
    ]);
    expect(notificationRecipients('COURSIER_A_PAYER', SAMPLE.COURSIER_A_PAYER)).toEqual([
      Permission.PAIE_COURSIERS,
    ]);
  });

  it('follows the permission of the bon: versement is the admin’s, retour is shared (D-11)', () => {
    expect(notificationRecipients('BON_NON_REMIS', { number: 'x', kind: 'VERSEMENT' })).toEqual([
      Permission.BONS_VERSEMENT,
    ]);
    expect(notificationRecipients('BON_NON_REMIS', { number: 'x', kind: 'RETOUR' })).toEqual([
      Permission.BONS_RETOUR,
    ]);
  });

  it('sends the seller types to the seller and courier types to couriers', () => {
    expect(notificationRecipients('COLIS_A_VERIFIER', SAMPLE.COLIS_A_VERIFIER)).toEqual([
      Role.VENDEUR,
    ]);
    expect(notificationRecipients('NOUVEAUX_COLIS_ASSIGNES', { count: 1 })).toEqual([Role.LIVREUR]);
    expect(notificationRecipients('RAPPEL_FIN_DE_JOURNEE', SAMPLE.RAPPEL_FIN_DE_JOURNEE)).toEqual([
      Role.LIVREUR,
      Role.RAMASSEUR,
    ]);
  });

  it('tells the staff of a parcel close to its limit as well as the seller', () => {
    expect(notificationRecipients('COLIS_24H_RESTANTES', { code: 'x' })).toEqual([Role.VENDEUR]);
    expect(notificationRecipients('COLIS_24H_RESTANTES', { code: 'x', shopName: 'S' })).toEqual([
      Permission.SUIVI_A_VERIFIER,
    ]);
  });

  it('never sends a message notification to the ramasseur (A-23)', () => {
    expect(notificationRecipients('NOUVEAU_MESSAGE', SAMPLE.NOUVEAU_MESSAGE)).not.toContain(
      Role.RAMASSEUR,
    );
  });
});

describe('notificationTarget', () => {
  it('points at the parcel, the chat, or the screen the notification is about', () => {
    expect(notificationTarget('COLIS_A_VERIFIER', SAMPLE.COLIS_A_VERIFIER)).toEqual({
      screen: 'PARCEL',
      code: 'FG-ABCD2345',
    });
    expect(notificationTarget('NOUVEAU_MESSAGE', SAMPLE.NOUVEAU_MESSAGE)).toEqual({
      screen: 'CHAT',
      code: 'FG-ABCD2345',
    });
    expect(notificationTarget('BON_VERSEMENT_EN_ROUTE', SAMPLE.BON_VERSEMENT_EN_ROUTE)).toEqual({
      screen: 'PAYMENTS',
    });
    expect(notificationTarget('BON_RETOUR_EN_ROUTE', SAMPLE.BON_RETOUR_EN_ROUTE)).toEqual({
      screen: 'RETURNS',
    });
    expect(notificationTarget('RAMASSAGE_PLANIFIE', SAMPLE.RAMASSAGE_PLANIFIE)).toEqual({
      screen: 'PICKUP',
      pickupId: 'p1',
    });
    expect(notificationTarget('COMPTE_SUSPENDU', {})).toEqual({ screen: 'NONE' });
  });
});

describe('sellerNoticesForParcel', () => {
  const base = { code: 'FG-ABCD2345', failureReason: null, relaunchDate: null };

  it('tells the seller a failed delivery is waiting for him, with the reason', () => {
    expect(
      sellerNoticesForParcel({
        ...base,
        failureReason: FailureReason.REFUSE,
        events: [{ type: ParcelEventType.ECHEC_LIVRAISON, newStatus: ParcelStatus.A_VERIFIER }],
      }),
    ).toEqual([
      { type: 'COLIS_A_VERIFIER', params: { code: 'FG-ABCD2345', reason: FailureReason.REFUSE } },
    ]);
  });

  it('tells the seller of a customer postponement, not of a failure (D-9)', () => {
    expect(
      sellerNoticesForParcel({
        ...base,
        failureReason: FailureReason.REPORTE_PAR_LE_CLIENT,
        relaunchDate: '2026-09-30',
        events: [{ type: ParcelEventType.ECHEC_LIVRAISON, newStatus: ParcelStatus.RELANCE }],
      }),
    ).toEqual([
      { type: 'COLIS_REPORTE_PAR_CLIENT', params: { code: 'FG-ABCD2345', date: '2026-09-30' } },
    ]);
  });

  it('sends one notice for a third failure: the return, not the À vérifier before it', () => {
    expect(
      sellerNoticesForParcel({
        ...base,
        failureReason: FailureReason.INJOIGNABLE,
        events: [
          { type: ParcelEventType.ECHEC_LIVRAISON, newStatus: ParcelStatus.A_VERIFIER },
          {
            type: ParcelEventType.RETOUR_AUTO_3E_TENTATIVE,
            newStatus: ParcelStatus.RETOUR_AU_DEPOT,
          },
        ],
      }),
    ).toEqual([{ type: 'COLIS_EN_RETOUR', params: { code: 'FG-ABCD2345' } }]);
  });

  it('tells the seller of the 48-hour return', () => {
    expect(
      sellerNoticesForParcel({
        ...base,
        events: [
          { type: ParcelEventType.RETOUR_AUTO_48H, newStatus: ParcelStatus.RETOUR_AU_DEPOT },
        ],
      }),
    ).toEqual([{ type: 'COLIS_RETOUR_AUTO_48H', params: { code: 'FG-ABCD2345' } }]);
  });

  it('does not tell the seller of what he did himself', () => {
    for (const type of [
      ParcelEventType.DECISION_RETOURNER,
      ParcelEventType.DECISION_RELANCER,
      ParcelEventType.DECISION_CHANGER_CLIENT,
      ParcelEventType.ANNULATION,
      ParcelEventType.MODIFICATION_VENDEUR,
    ]) {
      expect(
        sellerNoticesForParcel({
          ...base,
          events: [{ type, newStatus: ParcelStatus.RETOUR_AU_DEPOT }],
        }),
        type,
      ).toEqual([]);
    }
  });

  it('says nothing for a scan that moves the parcel along', () => {
    expect(
      sellerNoticesForParcel({
        ...base,
        events: [{ type: ParcelEventType.LIVRAISON, newStatus: ParcelStatus.LIVRE }],
      }),
    ).toEqual([]);
  });
});

describe('daily notices', () => {
  it('runs from the chosen Tunis hour, never before', () => {
    // 07:00 in Tunis is 06:00 UTC (UTC+1, no daylight saving).
    const before = new Date('2026-09-28T05:59:00.000Z');
    const at = new Date('2026-09-28T06:00:00.000Z');
    expect(isDailyNoticeDue(before, RELANCE_TODAY_NOTICE_HOUR_TUNIS)).toBe(false);
    expect(isDailyNoticeDue(at, RELANCE_TODAY_NOTICE_HOUR_TUNIS)).toBe(true);
  });

  it('keeps the end-of-day reminder after the working day, before midnight', () => {
    expect(END_OF_DAY_REMINDER_HOUR_TUNIS).toBeGreaterThanOrEqual(17);
    expect(END_OF_DAY_REMINDER_HOUR_TUNIS).toBeLessThan(24);
    // 18:00 in Tunis is 17:00 UTC.
    expect(
      isDailyNoticeDue(new Date('2026-09-28T16:59:00.000Z'), END_OF_DAY_REMINDER_HOUR_TUNIS),
    ).toBe(false);
    expect(
      isDailyNoticeDue(new Date('2026-09-28T17:00:00.000Z'), END_OF_DAY_REMINDER_HOUR_TUNIS),
    ).toBe(true);
  });
});
