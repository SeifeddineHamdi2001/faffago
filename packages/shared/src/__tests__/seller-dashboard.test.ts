import { describe, expect, it } from 'vitest';
import { ParcelEventType } from '../parcel-state-machine.js';
import {
  DASHBOARD_PERIODS,
  DASHBOARD_PERIOD_LABELS_FR,
  DASHBOARD_TILES,
  DASHBOARD_TILE_LABELS_FR,
  DashboardPeriod,
  DashboardTile,
  MAX_DASHBOARD_RANGE_DAYS,
  addTunisDays,
  countedEventTypes,
  dashboardQuerySchema,
  dashboardTileOf,
  dashboardTitle,
  periodRange,
  tunisDayKey,
  tunisDayStart,
  tunisDaysInRange,
} from '../seller-dashboard.js';
import { FailureReason } from '../statuses.js';

describe('the Tunis calendar day (D-46)', () => {
  it('starts at local midnight, 23:00 UTC the day before', () => {
    expect(tunisDayStart('2026-09-25').toISOString()).toBe('2026-09-24T23:00:00.000Z');
    expect(tunisDayStart('2026-01-01').toISOString()).toBe('2025-12-31T23:00:00.000Z');
  });

  it('names the day an instant belongs to in Tunis, not in UTC', () => {
    expect(tunisDayKey(new Date('2026-09-24T23:30:00.000Z'))).toBe('2026-09-25');
    expect(tunisDayKey(new Date('2026-09-24T22:59:59.999Z'))).toBe('2026-09-24');
  });

  it('adds days across months and years', () => {
    expect(addTunisDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addTunisDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addTunisDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(addTunisDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('counts the days of a range, both ends included', () => {
    expect(tunisDaysInRange('2026-09-25', '2026-09-25')).toBe(1);
    expect(tunisDaysInRange('2026-09-19', '2026-09-25')).toBe(7);
    expect(tunisDaysInRange('2026-01-01', '2026-12-31')).toBe(365);
  });
});

describe('the period (D-48)', () => {
  const today = '2026-09-25';

  it('offers the periods in order, Aujourd’hui first', () => {
    expect(DASHBOARD_PERIODS).toEqual([
      DashboardPeriod.AUJOURD_HUI,
      DashboardPeriod.HIER,
      DashboardPeriod.SEPT_JOURS,
      DashboardPeriod.CE_MOIS,
      DashboardPeriod.PERSONNALISE,
    ]);
    expect(DASHBOARD_PERIOD_LABELS_FR).toEqual({
      AUJOURD_HUI: 'Aujourd’hui',
      HIER: 'Hier',
      SEPT_JOURS: '7 derniers jours',
      CE_MOIS: 'Ce mois',
      PERSONNALISE: 'Période personnalisée',
    });
  });

  it('turns each preset into Tunis days', () => {
    expect(periodRange(DashboardPeriod.AUJOURD_HUI, today)).toEqual({ from: today, to: today });
    expect(periodRange(DashboardPeriod.HIER, today)).toEqual({
      from: '2026-09-24',
      to: '2026-09-24',
    });
    expect(periodRange(DashboardPeriod.SEPT_JOURS, today)).toEqual({
      from: '2026-09-19',
      to: today,
    });
    expect(periodRange(DashboardPeriod.CE_MOIS, today)).toEqual({ from: '2026-09-01', to: today });
  });

  it('crosses a month for Hier and 7 derniers jours', () => {
    expect(periodRange(DashboardPeriod.HIER, '2026-10-01')).toEqual({
      from: '2026-09-30',
      to: '2026-09-30',
    });
    expect(periodRange(DashboardPeriod.SEPT_JOURS, '2026-10-03')).toEqual({
      from: '2026-09-27',
      to: '2026-10-03',
    });
    expect(periodRange(DashboardPeriod.CE_MOIS, '2026-10-01')).toEqual({
      from: '2026-10-01',
      to: '2026-10-01',
    });
  });

  it('titles the block after the choice', () => {
    expect(dashboardTitle(DashboardPeriod.AUJOURD_HUI, { from: today, to: today })).toBe(
      'Aujourd’hui',
    );
    expect(dashboardTitle(DashboardPeriod.SEPT_JOURS, { from: '2026-09-19', to: today })).toBe(
      '7 derniers jours',
    );
    expect(dashboardTitle(DashboardPeriod.CE_MOIS, { from: '2026-09-01', to: today })).toBe(
      'Ce mois',
    );
    expect(
      dashboardTitle(DashboardPeriod.PERSONNALISE, { from: '2026-08-03', to: '2026-09-05' }),
    ).toBe('Du 03/08/2026 au 05/09/2026');
    expect(
      dashboardTitle(DashboardPeriod.PERSONNALISE, { from: '2026-08-03', to: '2026-08-03' }),
    ).toBe('Le 03/08/2026');
  });
});

describe('GET /dashboard parameters (D-48)', () => {
  it('takes both days or neither', () => {
    expect(dashboardQuerySchema.safeParse({}).success).toBe(true);
    expect(dashboardQuerySchema.parse({ from: '2026-09-19', to: '2026-09-25' })).toEqual({
      from: '2026-09-19',
      to: '2026-09-25',
    });
    expect(dashboardQuerySchema.safeParse({ from: '2026-09-19' }).success).toBe(false);
    expect(dashboardQuerySchema.safeParse({ to: '2026-09-19' }).success).toBe(false);
  });

  it('refuses a day that does not exist, or a malformed one', () => {
    expect(dashboardQuerySchema.safeParse({ from: '2026-02-30', to: '2026-03-01' }).success).toBe(
      false,
    );
    expect(dashboardQuerySchema.safeParse({ from: '25/09/2026', to: '2026-09-25' }).success).toBe(
      false,
    );
  });

  it('refuses a range that ends before it starts', () => {
    expect(dashboardQuerySchema.safeParse({ from: '2026-09-25', to: '2026-09-24' }).success).toBe(
      false,
    );
  });

  it('allows 366 days at most', () => {
    expect(MAX_DASHBOARD_RANGE_DAYS).toBe(366);
    // 2028 is a leap year: 2028-01-01 to 2028-12-31 is exactly 366 days.
    expect(dashboardQuerySchema.safeParse({ from: '2028-01-01', to: '2028-12-31' }).success).toBe(
      true,
    );
    const tooLong = dashboardQuerySchema.safeParse({ from: '2025-09-24', to: '2026-09-25' });
    expect(tooLong.success).toBe(false);
    expect(tooLong.error?.issues[0]?.message).toBe('366 jours au plus');
  });
});

describe('the tiles (Vendeur 4.1, D-48)', () => {
  it('are shown in this order, with these labels', () => {
    expect(DASHBOARD_TILES.map((tile) => DASHBOARD_TILE_LABELS_FR[tile])).toEqual([
      'Créés',
      'Ramassés',
      'En livraison',
      'Livrés',
      'Échecs',
      'Reportés',
    ]);
  });

  it('count what happened: one event type each', () => {
    const tileOf = (type: ParcelEventType) => dashboardTileOf({ type, reasonCode: null });
    expect(tileOf(ParcelEventType.CREATION)).toBe(DashboardTile.CREES);
    expect(tileOf(ParcelEventType.RAMASSAGE)).toBe(DashboardTile.RAMASSES);
    expect(tileOf(ParcelEventType.SORTIE_COURSIER)).toBe(DashboardTile.EN_LIVRAISON);
    expect(tileOf(ParcelEventType.LIVRAISON)).toBe(DashboardTile.LIVRES);
    expect(tileOf(ParcelEventType.ECHEC_LIVRAISON)).toBe(DashboardTile.ECHECS);
  });

  it('put a customer postponement under Reportés, never under Échecs (D-9)', () => {
    expect(
      dashboardTileOf({
        type: ParcelEventType.ECHEC_LIVRAISON,
        reasonCode: FailureReason.REPORTE_PAR_LE_CLIENT,
      }),
    ).toBe(DashboardTile.REPORTES);
    for (const reason of Object.values(FailureReason)) {
      if (reason === FailureReason.REPORTE_PAR_LE_CLIENT) continue;
      expect(dashboardTileOf({ type: ParcelEventType.ECHEC_LIVRAISON, reasonCode: reason })).toBe(
        DashboardTile.ECHECS,
      );
    }
  });

  it('count a status correction nowhere, nor any other event', () => {
    const counted = countedEventTypes();
    for (const type of Object.values(ParcelEventType)) {
      const tile = dashboardTileOf({ type, reasonCode: null });
      expect(tile !== null).toBe(counted.includes(type));
    }
    expect(dashboardTileOf({ type: ParcelEventType.FORCAGE_STATUT, reasonCode: null })).toBeNull();
    expect(counted).toEqual([
      ParcelEventType.CREATION,
      ParcelEventType.RAMASSAGE,
      ParcelEventType.SORTIE_COURSIER,
      ParcelEventType.LIVRAISON,
      ParcelEventType.ECHEC_LIVRAISON,
    ]);
  });
});
