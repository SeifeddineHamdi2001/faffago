import { describe, expect, it } from 'vitest';
import { CourierBlockerType, courierBlocker } from '../accounts.js';

describe('courierBlocker labels (D-12)', () => {
  it('agrees in number', () => {
    expect(courierBlocker(CourierBlockerType.BON_RETOUR_EN_ROUTE, 1).label).toBe(
      '1 bon de retour en route',
    );
    expect(courierBlocker(CourierBlockerType.BON_RETOUR_EN_ROUTE, 3).label).toBe(
      '3 bons de retour en route',
    );
    expect(courierBlocker(CourierBlockerType.ARGENT_CHEZ_LE_COURSIER, 2).label).toBe(
      "2 colis livrés dont l'argent n'est pas remis",
    );
    expect(courierBlocker(CourierBlockerType.CAISSE_NON_CLOTUREE, 2).label).toBe(
      '2 sessions de caisse non clôturées',
    );
  });

  it('keeps "colis" invariable', () => {
    expect(courierBlocker(CourierBlockerType.COLIS_EN_MAIN, 4).label).toBe('4 colis en main');
  });

  it('has a label for every type', () => {
    for (const type of Object.values(CourierBlockerType)) {
      expect(courierBlocker(type, 1).label).toMatch(/^1 /);
    }
  });
});
