import { describe, expect, it } from 'vitest';
import { SANS_ZONE_FILTER, staffParcelQuerySchema } from '../colis.js';

const UUID = '3f1e4b6a-2c7d-4e8f-9a0b-1c2d3e4f5a6b';

describe('the Colis filters (Admin 4.3)', () => {
  it('takes a search, a status, a cash status, a seller, a courier, a zone, dates and a page', () => {
    expect(
      staffParcelQuerySchema.parse({
        q: ' Amira ',
        status: 'AU_DEPOT',
        cashStatus: 'CHEZ_LE_COURSIER',
        sellerId: UUID,
        courierId: UUID,
        zoneId: UUID,
        from: '2026-09-01',
        to: '2026-09-25',
        page: '2',
      }),
    ).toEqual({
      q: 'Amira',
      status: 'AU_DEPOT',
      cashStatus: 'CHEZ_LE_COURSIER',
      sellerId: UUID,
      courierId: UUID,
      zoneId: UUID,
      from: '2026-09-01',
      to: '2026-09-25',
      page: 2,
    });
  });

  it('starts on page 1 with nothing else', () => {
    expect(staffParcelQuerySchema.parse({})).toEqual({ page: 1 });
  });

  it('takes the parcels in no zone as a zone of their own (D-51)', () => {
    expect(staffParcelQuerySchema.parse({ zoneId: SANS_ZONE_FILTER }).zoneId).toBe(
      SANS_ZONE_FILTER,
    );
  });

  it('treats an empty field of the form as no filter', () => {
    expect(staffParcelQuerySchema.parse({ q: '', status: '', sellerId: '' })).toEqual({ page: 1 });
  });

  it('refuses an unknown status, a bad id, a bad day or dates the wrong way round', () => {
    expect(staffParcelQuerySchema.safeParse({ status: 'PERDU' }).success).toBe(false);
    expect(staffParcelQuerySchema.safeParse({ sellerId: '12' }).success).toBe(false);
    expect(staffParcelQuerySchema.safeParse({ from: '25/09/2026' }).success).toBe(false);
    expect(staffParcelQuerySchema.safeParse({ from: '2026-09-25', to: '2026-09-01' }).success).toBe(
      false,
    );
  });
});
