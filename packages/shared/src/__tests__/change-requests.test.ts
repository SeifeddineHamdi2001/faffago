import { describe, expect, it } from 'vitest';
import {
  CHANGE_REQUEST_APPLY_MESSAGES_FR,
  ChangeRequestApplyRefusal,
  changeRequestApplyRefusal,
  refuseChangeRequestSchema,
} from '../parcel-forms.js';
import { ParcelEventType } from '../parcel-state-machine.js';
import { PUBLIC_TIMELINE_EVENT_TYPES } from '../public-tracking.js';
import { PARCEL_EVENT_LABELS_FR } from '../seller-parcels.js';
import { ParcelLocation, ParcelStatus } from '../statuses.js';

const LOCALITE = '3f1e4b6a-2c7d-4e8f-9a0b-1c2d3e4f5a6b';

describe('applying a change request (D-44, D-57)', () => {
  it('applies a phone or an address wherever the parcel is, from Ramassé to Relancé', () => {
    for (const status of [
      ParcelStatus.RAMASSE,
      ParcelStatus.AU_DEPOT,
      ParcelStatus.EN_LIVRAISON,
      ParcelStatus.A_VERIFIER,
      ParcelStatus.RELANCE,
    ]) {
      expect(
        changeRequestApplyRefusal({
          status,
          location: ParcelLocation.AVEC_LE_LIVREUR,
          fields: { recipientPhone: '98765432' },
        }),
      ).toBeNull();
    }
  });

  it('applies a new localité only while the parcel is at the depot, whatever its status', () => {
    const fields = { localiteId: LOCALITE, address: '9 rue du Lac' };
    expect(
      changeRequestApplyRefusal({
        status: ParcelStatus.A_VERIFIER,
        location: ParcelLocation.AU_DEPOT,
        fields,
      }),
    ).toBeNull();
    expect(
      changeRequestApplyRefusal({
        status: ParcelStatus.A_VERIFIER,
        location: ParcelLocation.AVEC_LE_LIVREUR,
        fields,
      }),
    ).toBe(ChangeRequestApplyRefusal.LOCALITE_HORS_DEPOT);
    // Still with the ramasseur: not at the depot yet.
    expect(
      changeRequestApplyRefusal({
        status: ParcelStatus.RAMASSE,
        location: ParcelLocation.AVEC_LE_RAMASSEUR,
        fields,
      }),
    ).toBe(ChangeRequestApplyRefusal.LOCALITE_HORS_DEPOT);
  });

  it('applies nothing once the parcel is delivered, cancelled or on its way back', () => {
    for (const status of [
      ParcelStatus.LIVRE,
      ParcelStatus.ANNULE,
      ParcelStatus.RETOUR_AU_DEPOT,
      ParcelStatus.RETOUR_RECU,
    ]) {
      expect(
        changeRequestApplyRefusal({
          status,
          location: ParcelLocation.AU_DEPOT,
          fields: { address: '9 rue du Lac' },
        }),
      ).toBe(ChangeRequestApplyRefusal.COLIS_HORS_DELAI);
    }
  });

  it('says why, in French', () => {
    expect(CHANGE_REQUEST_APPLY_MESSAGES_FR).toEqual({
      DEMANDE_TRAITEE: 'Cette demande a déjà été traitée.',
      COLIS_HORS_DELAI:
        'Le colis n’accepte plus de modification : livré, annulé ou en retour. Refusez la demande.',
      LOCALITE_HORS_DEPOT: 'Nouvelle localité : la demande s’applique quand le colis est au dépôt.',
      LOCALITE_INACTIVE: 'La localité demandée a été désactivée : refusez la demande.',
    });
  });
});

describe('refusing a change request (D-57)', () => {
  it('needs a reason, which the seller reads', () => {
    expect(refuseChangeRequestSchema.parse({ reason: '  Numéro injoignable  ' })).toEqual({
      reason: 'Numéro injoignable',
    });
    expect(refuseChangeRequestSchema.safeParse({ reason: 'ok' }).success).toBe(false);
    expect(refuseChangeRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe('the MODIFICATION_APPLIQUEE event (D-57)', () => {
  it('has its label and stays off public tracking', () => {
    expect(ParcelEventType.MODIFICATION_APPLIQUEE).toBe('MODIFICATION_APPLIQUEE');
    expect(PARCEL_EVENT_LABELS_FR.MODIFICATION_APPLIQUEE).toBe('Modification appliquée');
    expect(PUBLIC_TIMELINE_EVENT_TYPES).not.toContain(ParcelEventType.MODIFICATION_APPLIQUEE);
  });
});
