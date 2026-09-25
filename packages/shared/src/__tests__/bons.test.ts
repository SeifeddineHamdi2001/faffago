import { describe, expect, it } from 'vitest';
import {
  BonKind,
  bonQrContent,
  bonRetourComplete,
  bonVisitOf,
  formatPayslipNumber,
  parseBonScan,
  payableParcelRefusal,
  prepareBonSchema,
  PayableRefusal,
} from '../bons.js';
import { formatBonNumber, BonNumberKind } from '../codes.js';
import { ParcelCashStatus, ParcelStatus, PickupStatus } from '../statuses.js';

describe('bon numbers', () => {
  it('number a bon de versement per Tunis day (Vendeur 4.11)', () => {
    expect(formatBonNumber(BonNumberKind.BON_VERSEMENT, new Date('2026-09-21T00:00:00Z'), 1)).toBe(
      'BV-2026-0921-01',
    );
  });

  it('number a fiche de paie the same way (D-82)', () => {
    expect(formatPayslipNumber(new Date('2026-09-25T00:00:00Z'), 3)).toBe('FP-2026-0925-03');
  });
});

describe('the QR of a bon (D-80)', () => {
  const token = 'a'.repeat(32);

  it('carries the kind and the token', () => {
    expect(bonQrContent(BonKind.BON_VERSEMENT, token)).toBe(`BV:${token}`);
    expect(bonQrContent(BonKind.BON_RETOUR, token)).toBe(`BR:${token}`);
  });

  it('reads back a scanned QR', () => {
    expect(parseBonScan(`BV:${token}`)).toEqual({
      kind: BonKind.BON_VERSEMENT,
      token,
      number: null,
    });
    expect(parseBonScan(` br:${token.toUpperCase()} `)).toEqual({
      kind: BonKind.BON_RETOUR,
      token,
      number: null,
    });
  });

  it('reads a bon number typed from a damaged print', () => {
    expect(parseBonScan('bv-2026-0921-01')).toEqual({
      kind: BonKind.BON_VERSEMENT,
      token: null,
      number: 'BV-2026-0921-01',
    });
    expect(parseBonScan('BR-2026-0921-112')).toMatchObject({ number: 'BR-2026-0921-112' });
  });

  it('is not a parcel code nor anything else', () => {
    expect(parseBonScan('FG-7K3M9Q2X')).toBeNull();
    expect(parseBonScan('BV:short')).toBeNull();
    expect(parseBonScan('')).toBeNull();
  });
});

describe('payableParcelRefusal — what a bon may pay (Vendeur rule 4, A-5a)', () => {
  const ok = {
    sellerId: 's1',
    status: ParcelStatus.LIVRE,
    cashStatus: ParcelCashStatus.AU_DEPOT,
    inActiveBon: false,
  };

  it('pays a delivered parcel whose cash is at the depot', () => {
    expect(payableParcelRefusal(ok, 's1')).toBeNull();
  });

  it('refuses cash still with the courier, or already paid', () => {
    expect(
      payableParcelRefusal({ ...ok, cashStatus: ParcelCashStatus.CHEZ_LE_COURSIER }, 's1'),
    ).toBe(PayableRefusal.PAS_ENCAISSE);
    expect(payableParcelRefusal({ ...ok, cashStatus: ParcelCashStatus.PAYE }, 's1')).toBe(
      PayableRefusal.DEJA_PAYE,
    );
  });

  it('refuses a parcel already on a bon, another seller’s, or not delivered', () => {
    expect(payableParcelRefusal({ ...ok, inActiveBon: true }, 's1')).toBe(
      PayableRefusal.DEJA_SUR_UN_BON,
    );
    expect(payableParcelRefusal(ok, 's2')).toBe(PayableRefusal.AUTRE_VENDEUR);
    expect(
      payableParcelRefusal({ ...ok, status: ParcelStatus.A_VERIFIER, cashStatus: null }, 's1'),
    ).toBe(PayableRefusal.PAS_LIVRE);
  });
});

describe('bonVisitOf — who carries a bon, and when (D-80, answer 4)', () => {
  const day = new Date('2026-09-26T00:00:00Z');

  it('follows the planned pickup it is attached to', () => {
    expect(
      bonVisitOf(
        { pickupId: 'p1', ramasseurId: null, plannedDate: null },
        { status: PickupStatus.PLANIFIE, ramasseurId: 'r1', plannedDate: day },
      ),
    ).toEqual({ ramasseurId: 'r1', plannedDate: day, viaPickup: true });
  });

  it('uses the ramasseur and day staff assigned when there is no pickup', () => {
    expect(bonVisitOf({ pickupId: null, ramasseurId: 'r2', plannedDate: day }, null)).toEqual({
      ramasseurId: 'r2',
      plannedDate: day,
      viaPickup: false,
    });
  });

  it('is unattached when its pickup was cancelled, or when nothing is set', () => {
    expect(
      bonVisitOf(
        { pickupId: 'p1', ramasseurId: null, plannedDate: null },
        { status: PickupStatus.ANNULE, ramasseurId: 'r1', plannedDate: day },
      ),
    ).toBeNull();
    expect(bonVisitOf({ pickupId: null, ramasseurId: null, plannedDate: null }, null)).toBeNull();
  });
});

describe('bonRetourComplete (D-81)', () => {
  it('is Remis once every line is received', () => {
    expect(bonRetourComplete([{ received: true }, { received: true }])).toBe(true);
    expect(bonRetourComplete([{ received: true }, { received: false }])).toBe(false);
    expect(bonRetourComplete([])).toBe(false);
  });
});

describe('prepareBonSchema', () => {
  const id = '11111111-1111-4111-8111-111111111111';

  it('takes a seller and the parcels ticked', () => {
    expect(prepareBonSchema.parse({ sellerId: id, parcelIds: [id] })).toEqual({
      sellerId: id,
      parcelIds: [id],
    });
  });

  it('refuses an empty selection or a parcel twice', () => {
    expect(prepareBonSchema.safeParse({ sellerId: id, parcelIds: [] }).success).toBe(false);
    expect(prepareBonSchema.safeParse({ sellerId: id, parcelIds: [id, id] }).success).toBe(false);
  });
});
