import { describe, expect, it } from 'vitest';
import {
  FORCAGE_MESSAGES_FR,
  ForcageRefusal,
  forcedStatusRefusal,
  forcedTargets,
  forcerStatutSchema,
  targetNeedsLivreur,
} from '../forcage.js';
import { ParcelLocation as L, ParcelStatus as S } from '../statuses.js';

const LIVREUR = '3f1e4b6a-2c7d-4e8f-9a0b-1c2d3e4f5a6b';

describe('Forcer un statut on a Livré (D-85)', () => {
  const livre = (cashStatus: 'CHEZ_LE_COURSIER' | 'AU_DEPOT' | 'PAYE') => ({
    status: S.LIVRE,
    location: L.CHEZ_LE_CLIENT,
    cashStatus,
  });
  const back = { status: S.EN_LIVRAISON, location: L.AVEC_LE_LIVREUR };

  it('undoes a Livré whose cash is still with the courier, back out with him', () => {
    expect(forcedStatusRefusal(livre('CHEZ_LE_COURSIER'), back)).toBeNull();
    expect(forcedTargets(livre('CHEZ_LE_COURSIER'))).toEqual([back]);
  });

  it('refuses once the cash is counted or paid, and any other target', () => {
    expect(forcedStatusRefusal(livre('AU_DEPOT'), back)).toBe(ForcageRefusal.FORCAGE_NON_AUTORISE);
    expect(forcedStatusRefusal(livre('PAYE'), back)).toBe(ForcageRefusal.FORCAGE_NON_AUTORISE);
    expect(forcedTargets(livre('AU_DEPOT'))).toEqual([]);
    expect(
      forcedStatusRefusal(livre('CHEZ_LE_COURSIER'), { status: S.AU_DEPOT, location: L.AU_DEPOT }),
    ).toBe(ForcageRefusal.FORCAGE_NON_AUTORISE);
  });

  it('never forces a parcel into Livré', () => {
    expect(forcedStatusRefusal(back, { status: S.LIVRE, location: L.CHEZ_LE_CLIENT })).toBe(
      ForcageRefusal.FORCAGE_NON_AUTORISE,
    );
  });
});

describe('Forcer un statut in phase 5 (D-56)', () => {
  it('moves between Ramassé, Au dépôt and En livraison, each at its place', () => {
    const ramasse = { status: S.RAMASSE, location: L.AVEC_LE_RAMASSEUR };
    const depot = { status: S.AU_DEPOT, location: L.AU_DEPOT };
    const sortie = { status: S.EN_LIVRAISON, location: L.AVEC_LE_LIVREUR };
    for (const [from, to] of [
      [ramasse, depot],
      [depot, ramasse],
      [depot, sortie],
      [sortie, depot],
      [sortie, ramasse],
      [ramasse, sortie],
    ] as const) {
      expect(forcedStatusRefusal(from, to)).toBeNull();
    }
  });

  it('fixes only the place of À vérifier, Relancé and Retour au dépôt', () => {
    for (const status of [S.A_VERIFIER, S.RELANCE, S.RETOUR_AU_DEPOT]) {
      expect(
        forcedStatusRefusal(
          { status, location: L.AVEC_LE_LIVREUR },
          { status, location: L.AU_DEPOT },
        ),
      ).toBeNull();
      expect(
        forcedStatusRefusal(
          { status, location: L.AU_DEPOT },
          { status, location: L.AVEC_LE_LIVREUR },
        ),
      ).toBeNull();
      // Their status never moves here: that is a seller decision or a return.
      expect(
        forcedStatusRefusal(
          { status, location: L.AU_DEPOT },
          { status: S.AU_DEPOT, location: L.AU_DEPOT },
        ),
      ).toBe(ForcageRefusal.FORCAGE_NON_AUTORISE);
    }
  });

  it('refuses anything touching Livré, Annulé, a return or Créé until phase 8', () => {
    const depot = { status: S.AU_DEPOT, location: L.AU_DEPOT };
    for (const target of [
      { status: S.LIVRE, location: L.CHEZ_LE_CLIENT },
      { status: S.ANNULE, location: L.CHEZ_LE_VENDEUR },
      { status: S.RETOUR_AU_DEPOT, location: L.AU_DEPOT },
      { status: S.RETOUR_RECU, location: L.RENDU_AU_VENDEUR },
      { status: S.CREE, location: L.CHEZ_LE_VENDEUR },
      { status: S.A_VERIFIER, location: L.AU_DEPOT },
    ]) {
      expect(forcedStatusRefusal(depot, target)).toBe(ForcageRefusal.FORCAGE_NON_AUTORISE);
    }
    expect(forcedStatusRefusal({ status: S.LIVRE, location: L.CHEZ_LE_CLIENT }, depot)).toBe(
      ForcageRefusal.FORCAGE_NON_AUTORISE,
    );
    expect(
      forcedStatusRefusal({ status: S.RETOUR_RECU, location: L.RENDU_AU_VENDEUR }, depot),
    ).toBe(ForcageRefusal.FORCAGE_NON_AUTORISE);
  });

  it('refuses a status at the wrong place, and the state the parcel is already in', () => {
    expect(
      forcedStatusRefusal(
        { status: S.AU_DEPOT, location: L.AU_DEPOT },
        { status: S.EN_LIVRAISON, location: L.AU_DEPOT },
      ),
    ).toBe(ForcageRefusal.FORCAGE_NON_AUTORISE);
    expect(
      forcedStatusRefusal(
        { status: S.AU_DEPOT, location: L.AU_DEPOT },
        { status: S.AU_DEPOT, location: L.AU_DEPOT },
      ),
    ).toBe(ForcageRefusal.MEME_ETAT);
  });

  it('lists the targets the screen offers', () => {
    expect(forcedTargets({ status: S.AU_DEPOT, location: L.AU_DEPOT })).toEqual([
      { status: S.RAMASSE, location: L.AVEC_LE_RAMASSEUR },
      { status: S.EN_LIVRAISON, location: L.AVEC_LE_LIVREUR },
    ]);
    expect(forcedTargets({ status: S.A_VERIFIER, location: L.AVEC_LE_LIVREUR })).toEqual([
      { status: S.A_VERIFIER, location: L.AU_DEPOT },
    ]);
    expect(forcedTargets({ status: S.LIVRE, location: L.CHEZ_LE_CLIENT })).toEqual([]);
  });

  it('asks the livreur for a parcel put with a livreur', () => {
    expect(targetNeedsLivreur({ status: S.EN_LIVRAISON, location: L.AVEC_LE_LIVREUR })).toBe(true);
    expect(targetNeedsLivreur({ status: S.AU_DEPOT, location: L.AU_DEPOT })).toBe(false);
  });

  it('needs a reason, and the livreur when the target needs one', () => {
    const base = { status: S.AU_DEPOT, location: L.AU_DEPOT, reason: 'Entrée scannée par erreur' };
    expect(forcerStatutSchema.parse(base)).toEqual(base);
    expect(forcerStatutSchema.safeParse({ ...base, reason: 'oups' }).success).toBe(false);
    expect(
      forcerStatutSchema.safeParse({
        status: S.EN_LIVRAISON,
        location: L.AVEC_LE_LIVREUR,
        reason: 'Sorti sans scan',
      }).success,
    ).toBe(false);
    expect(
      forcerStatutSchema.parse({
        status: S.EN_LIVRAISON,
        location: L.AVEC_LE_LIVREUR,
        livreurId: LIVREUR,
        reason: 'Sorti sans scan',
      }).livreurId,
    ).toBe(LIVREUR);
  });

  it('says why, in French', () => {
    expect(FORCAGE_MESSAGES_FR.FORCAGE_NON_AUTORISE).toBe(
      'Cette correction n’est pas possible ici : seuls Ramassé, Au dépôt et En livraison, le lieu d’un colis À vérifier, Relancé ou Retour au dépôt, ou un Livré dont l’argent est encore chez le coursier, se corrigent.',
    );
    expect(FORCAGE_MESSAGES_FR.MEME_ETAT).toBe('Le colis est déjà dans cet état.');
    expect(FORCAGE_MESSAGES_FR.LIVREUR_INVALIDE).toBe('Choisissez le livreur qui a le colis.');
  });
});
