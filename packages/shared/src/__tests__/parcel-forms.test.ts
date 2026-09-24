import { describe, expect, it } from 'vitest';
import {
  canRequestChange,
  createParcelRequestSchema,
  labelNeedsReprint,
  parcelChangeRequestSchema,
  updateParcelSchema,
} from '../parcel-forms.js';
import { localitesOfTree } from '../localites.js';
import { ParcelStatus } from '../statuses.js';

const form = {
  recipientName: 'Amira Ben Salah',
  recipientPhone: '29 876 543',
  localiteId: '3f1e4b6a-2c7d-4e8f-9a0b-1c2d3e4f5a6b',
  address: '12 rue de Marseille',
  productDescription: '2 bracelets',
  codAmountMillimes: '85,000',
};

describe('Créer un colis, retry-safe', () => {
  it('carries the UUID drawn when the form opened', () => {
    const id = '0b5f4c3e-8a2d-4f1e-9c7b-6a5d4e3f2a1b';
    expect(createParcelRequestSchema.parse({ ...form, clientRequestId: id }).clientRequestId).toBe(
      id,
    );
    expect(createParcelRequestSchema.safeParse({ ...form, clientRequestId: 'x' }).success).toBe(
      false,
    );
  });
});

describe('Modifier (Vendeur 4.6, D-41)', () => {
  it('takes any field alone, the COD in DT included', () => {
    expect(updateParcelSchema.parse({ codAmountMillimes: '90,500' })).toEqual({
      codAmountMillimes: 90500n,
    });
  });

  it('adds no default the seller did not send', () => {
    expect(updateParcelSchema.parse({ address: '14 rue de Rome' })).toEqual({
      address: '14 rue de Rome',
    });
  });

  it('refuses an empty change and a field the form does not have', () => {
    expect(updateParcelSchema.safeParse({}).success).toBe(false);
    expect(updateParcelSchema.safeParse({ deliveryFeeMillimes: '0' }).success).toBe(false);
    expect(updateParcelSchema.safeParse({ status: 'LIVRE' }).success).toBe(false);
  });

  it('asks for a reprint when a printed field changes, not otherwise', () => {
    expect(labelNeedsReprint(['codAmountMillimes'])).toBe(true);
    expect(labelNeedsReprint(['localiteId', 'courierNote'])).toBe(true);
    expect(labelNeedsReprint(['courierNote', 'productDescription', 'landmark'])).toBe(false);
  });
});

describe('Demander une modification (Vendeur 4.6)', () => {
  it('takes a phone or an address, with an optional note', () => {
    expect(
      parcelChangeRequestSchema.parse({ recipientPhone: '98 765 432', note: 'Nouveau n°' }),
    ).toEqual({ recipientPhone: '98765432', note: 'Nouveau n°' });
  });

  it('takes a new localité (D-44)', () => {
    const localiteId = '3f1e4b6a-2c7d-4e8f-9a0b-1c2d3e4f5a6b';
    expect(parcelChangeRequestSchema.parse({ localiteId })).toEqual({ localiteId });
    expect(parcelChangeRequestSchema.safeParse({ localiteId: 'Ennasr' }).success).toBe(false);
  });

  it('refuses a note alone, and anything but phone, address and localité', () => {
    expect(parcelChangeRequestSchema.safeParse({ note: 'x' }).success).toBe(false);
    expect(parcelChangeRequestSchema.safeParse({ codAmountMillimes: '1' }).success).toBe(false);
    expect(parcelChangeRequestSchema.safeParse({ recipientName: 'Autre' }).success).toBe(false);
  });

  it('is open after pickup until the journey ends', () => {
    const open = Object.values(ParcelStatus).filter(canRequestChange);
    expect(open).toEqual(['RAMASSE', 'AU_DEPOT', 'EN_LIVRAISON', 'A_VERIFIER', 'RELANCE']);
  });
});

describe('localitesOfTree', () => {
  it('attaches each localité to its délégation and gouvernorat', () => {
    const [khaznadar] = localitesOfTree({
      gouvernorats: [
        {
          code: 'TUN',
          nameFr: 'Tunis',
          nameAr: 'تونس',
          delegations: [
            {
              id: 'd1',
              code: 'TUN-BARDO',
              nameFr: 'Le Bardo',
              nameAr: 'باردو',
              localites: [
                {
                  id: 'l1',
                  nameFr: 'Khaznadar',
                  nameAr: null,
                  postalCode: '2017',
                  aliases: [],
                  isOther: false,
                },
              ],
            },
          ],
        },
      ],
    });
    expect(khaznadar!.delegation).toMatchObject({
      id: 'd1',
      nameFr: 'Le Bardo',
      gouvernoratNameFr: 'Tunis',
    });
  });
});
