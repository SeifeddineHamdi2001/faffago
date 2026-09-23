import { describe, expect, it } from 'vitest';
import { Role, SYSTEM_ACTOR } from '../roles.js';
import {
  applyCashTransition,
  applyParcelAction,
  canChangeClient,
  canEditFreely,
  canRelaunch,
  CashTransition,
  isPayableToSeller,
  ParcelAction,
  ParcelEffect,
  ParcelEventType,
  ScanRefusal,
  type ParcelActionCommand,
  type ParcelSnapshot,
  type ParcelTransition,
} from '../parcel-state-machine.js';
import { FailureReason, ParcelCashStatus, ParcelLocation, ParcelStatus } from '../statuses.js';

const LIVREUR_ID = 'livreur-1';
const MAX_ATTEMPTS = 3;
const MAX_CLIENT_CHANGES = 1;

function parcel(overrides: Partial<ParcelSnapshot> = {}): ParcelSnapshot {
  return {
    status: ParcelStatus.CREE,
    location: ParcelLocation.CHEZ_LE_VENDEUR,
    cashStatus: null,
    attemptCount: 0,
    changeClientCount: 0,
    currentLivreurId: null,
    isExchange: false,
    ...overrides,
  };
}

function command(
  action: ParcelAction,
  overrides: Partial<ParcelActionCommand> = {},
): ParcelActionCommand {
  const defaultActors: Partial<Record<ParcelAction, ParcelActionCommand['actor']>> = {
    SCAN_RAMASSAGE: Role.RAMASSEUR,
    SCAN_ENTREE_DEPOT: Role.DEPOT,
    SCAN_SORTIE_COURSIER: Role.DEPOT,
    SCAN_LIVRE: Role.LIVREUR,
    SCAN_ECHEC: Role.LIVREUR,
    SCAN_RETOUR_DE_TOURNEE: Role.DEPOT,
    SCAN_PREPARATION_RETOURS: Role.DEPOT,
    SCAN_RETOUR_RECU: Role.RAMASSEUR,
    DEPART_RETOUR: Role.DEPOT,
    AUTO_RETOUR_48H: SYSTEM_ACTOR,
  };
  return {
    action,
    actor: defaultActors[action] ?? Role.VENDEUR,
    actorCourierId: LIVREUR_ID,
    maxAttempts: MAX_ATTEMPTS,
    maxClientChanges: MAX_CLIENT_CHANGES,
    ...overrides,
  };
}

function expectOk(result: ParcelTransition) {
  if (!result.ok) throw new Error(`Refusé : ${result.message}`);
  return result;
}

// ─────────────────────────────────────────────────────────────

describe('the happy path: Créé to Livré', () => {
  it('walks the flow of Vendeur 4.8 one scan at a time', () => {
    let current = parcel();

    current = expectOk(applyParcelAction(current, command(ParcelAction.SCAN_RAMASSAGE))).next;
    expect(current.status).toBe(ParcelStatus.RAMASSE);
    expect(current.location).toBe(ParcelLocation.AVEC_LE_RAMASSEUR);

    current = expectOk(applyParcelAction(current, command(ParcelAction.SCAN_ENTREE_DEPOT))).next;
    expect(current.status).toBe(ParcelStatus.AU_DEPOT);

    current = expectOk(
      applyParcelAction(
        current,
        command(ParcelAction.SCAN_SORTIE_COURSIER, { assignToCourierId: LIVREUR_ID }),
      ),
    ).next;
    expect(current.status).toBe(ParcelStatus.EN_LIVRAISON);
    expect(current.currentLivreurId).toBe(LIVREUR_ID);

    const delivered = expectOk(applyParcelAction(current, command(ParcelAction.SCAN_LIVRE)));
    expect(delivered.next.status).toBe(ParcelStatus.LIVRE);
    expect(delivered.next.cashStatus).toBe(ParcelCashStatus.CHEZ_LE_COURSIER);
    expect(delivered.next.attemptCount).toBe(1);
  });

  it('charges the delivery fee only on delivery (A-1)', () => {
    const current = parcel({
      status: ParcelStatus.EN_LIVRAISON,
      location: ParcelLocation.AVEC_LE_LIVREUR,
      currentLivreurId: LIVREUR_ID,
    });
    const result = expectOk(applyParcelAction(current, command(ParcelAction.SCAN_LIVRE)));
    expect(result.events[0]?.effects).toContain(ParcelEffect.CREER_FRAIS_LIVRAISON);
  });

  it('freezes the livreur rate at delivery (A-15)', () => {
    const current = parcel({
      status: ParcelStatus.EN_LIVRAISON,
      location: ParcelLocation.AVEC_LE_LIVREUR,
      currentLivreurId: LIVREUR_ID,
    });
    const result = expectOk(applyParcelAction(current, command(ParcelAction.SCAN_LIVRE)));
    expect(result.events[0]?.effects).toContain(ParcelEffect.FIGER_TARIF_COURSIER);
  });

  it('opens the parcel chat when the livreur actually takes it out', () => {
    const current = parcel({ status: ParcelStatus.AU_DEPOT, location: ParcelLocation.AU_DEPOT });
    const result = expectOk(
      applyParcelAction(
        current,
        command(ParcelAction.SCAN_SORTIE_COURSIER, { assignToCourierId: LIVREUR_ID }),
      ),
    );
    expect(result.events[0]?.effects).toContain(ParcelEffect.OUVRIR_CHAT);
  });

  it('asks for the old item when the parcel is an échange', () => {
    const current = parcel({
      status: ParcelStatus.EN_LIVRAISON,
      location: ParcelLocation.AVEC_LE_LIVREUR,
      currentLivreurId: LIVREUR_ID,
      isExchange: true,
    });
    const result = expectOk(applyParcelAction(current, command(ParcelAction.SCAN_LIVRE)));
    expect(result.events[0]?.effects).toContain(ParcelEffect.ARTICLE_ECHANGE_A_RECUPERER);
  });
});

describe('refusals at the scan screen (Admin 4.2)', () => {
  it('refuses a parcel already delivered', () => {
    const result = applyParcelAction(
      parcel({ status: ParcelStatus.LIVRE, location: ParcelLocation.CHEZ_LE_CLIENT }),
      command(ParcelAction.SCAN_LIVRE),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal).toBe(ScanRefusal.COLIS_DEJA_LIVRE);
    expect(result.message).toBe('Colis déjà livré');
  });

  it('refuses a cancelled parcel', () => {
    const result = applyParcelAction(
      parcel({ status: ParcelStatus.ANNULE }),
      command(ParcelAction.SCAN_RAMASSAGE),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe('Colis annulé');
  });

  it("refuses another courier's parcel", () => {
    const result = applyParcelAction(
      parcel({
        status: ParcelStatus.EN_LIVRAISON,
        location: ParcelLocation.AVEC_LE_LIVREUR,
        currentLivreurId: 'livreur-2',
      }),
      command(ParcelAction.SCAN_LIVRE, { actorCourierId: LIVREUR_ID }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("Colis d'un autre coursier");
  });

  it('refuses the wrong mode with a clear reason', () => {
    const result = applyParcelAction(
      parcel({ status: ParcelStatus.CREE }),
      command(ParcelAction.SCAN_ENTREE_DEPOT),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe(ScanRefusal.MAUVAIS_MODE);
  });

  it('refuses a Sortie coursier scan with no courier chosen', () => {
    const result = applyParcelAction(
      parcel({ status: ParcelStatus.AU_DEPOT, location: ParcelLocation.AU_DEPOT }),
      command(ParcelAction.SCAN_SORTIE_COURSIER, { assignToCourierId: null }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe(ScanRefusal.COURSIER_NON_PRECISE);
  });

  it('demands a reason for every échec (Coursier rule 03)', () => {
    const result = applyParcelAction(
      parcel({
        status: ParcelStatus.EN_LIVRAISON,
        location: ParcelLocation.AVEC_LE_LIVREUR,
        currentLivreurId: LIVREUR_ID,
      }),
      command(ParcelAction.SCAN_ECHEC, { failureReason: undefined }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe(ScanRefusal.MOTIF_ECHEC_REQUIS);
  });
});

describe('permissions', () => {
  it('lets only a livreur mark a parcel Livré', () => {
    const current = parcel({
      status: ParcelStatus.EN_LIVRAISON,
      location: ParcelLocation.AVEC_LE_LIVREUR,
      currentLivreurId: LIVREUR_ID,
    });
    for (const actor of [Role.ADMIN, Role.DEPOT, Role.SERVICE_CLIENT, Role.VENDEUR, Role.RAMASSEUR]) {
      const result = applyParcelAction(current, command(ParcelAction.SCAN_LIVRE, { actor }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.refusal).toBe(ScanRefusal.ROLE_NON_AUTORISE);
    }
  });

  it('lets only the seller decide on a parcel À vérifier (Admin rule 13)', () => {
    const current = parcel({
      status: ParcelStatus.A_VERIFIER,
      location: ParcelLocation.AU_DEPOT,
      attemptCount: 1,
    });
    for (const action of [
      ParcelAction.DECISION_RELANCER,
      ParcelAction.DECISION_RETOURNER,
      ParcelAction.DECISION_CHANGER_CLIENT,
    ]) {
      for (const actor of [Role.ADMIN, Role.DEPOT, Role.SERVICE_CLIENT, Role.LIVREUR]) {
        const result = applyParcelAction(current, command(action, { actor }));
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.refusal).toBe(ScanRefusal.ROLE_NON_AUTORISE);
      }
    }
  });

  it('lets only the depot scan parcels in and out', () => {
    const current = parcel({ status: ParcelStatus.RAMASSE, location: ParcelLocation.AVEC_LE_RAMASSEUR });
    expect(
      applyParcelAction(current, command(ParcelAction.SCAN_ENTREE_DEPOT, { actor: Role.ADMIN })).ok,
    ).toBe(true);
    expect(
      applyParcelAction(current, command(ParcelAction.SCAN_ENTREE_DEPOT, { actor: Role.DEPOT })).ok,
    ).toBe(true);
    expect(
      applyParcelAction(current, command(ParcelAction.SCAN_ENTREE_DEPOT, { actor: Role.LIVREUR })).ok,
    ).toBe(false);
  });

  it('lets only the system trigger the 48-hour return', () => {
    const current = parcel({ status: ParcelStatus.A_VERIFIER, location: ParcelLocation.AU_DEPOT });
    expect(applyParcelAction(current, command(ParcelAction.AUTO_RETOUR_48H)).ok).toBe(true);
    expect(
      applyParcelAction(current, command(ParcelAction.AUTO_RETOUR_48H, { actor: Role.ADMIN })).ok,
    ).toBe(false);
  });
});

describe('a failed delivery', () => {
  const outForDelivery = parcel({
    status: ParcelStatus.EN_LIVRAISON,
    location: ParcelLocation.AVEC_LE_LIVREUR,
    currentLivreurId: LIVREUR_ID,
  });

  it('always goes to À vérifier first (CLAUDE.md)', () => {
    const result = expectOk(
      applyParcelAction(
        outForDelivery,
        command(ParcelAction.SCAN_ECHEC, { failureReason: FailureReason.NE_REPOND_PAS }),
      ),
    );
    expect(result.next.status).toBe(ParcelStatus.A_VERIFIER);
    expect(result.next.attemptCount).toBe(1);
    expect(result.events[0]?.effects).toContain(ParcelEffect.DEMARRER_DELAI_VERIFICATION);
  });

  it('stays with the courier until the depot scans it back', () => {
    const result = expectOk(
      applyParcelAction(
        outForDelivery,
        command(ParcelAction.SCAN_ECHEC, { failureReason: FailureReason.INJOIGNABLE }),
      ),
    );
    expect(result.next.location).toBe(ParcelLocation.AVEC_LE_LIVREUR);
  });

  it('becomes a return on the third attempt, without asking the seller (A-6)', () => {
    const thirdAttempt = { ...outForDelivery, attemptCount: 2 };
    const result = expectOk(
      applyParcelAction(
        thirdAttempt,
        command(ParcelAction.SCAN_ECHEC, { failureReason: FailureReason.REFUSE }),
      ),
    );

    expect(result.next.status).toBe(ParcelStatus.RETOUR_AU_DEPOT);
    expect(result.next.attemptCount).toBe(3);
    // The failure and its reason are recorded before the automatic return,
    // so the timeline still shows why the parcel came back.
    expect(result.events.map((e) => e.type)).toEqual([
      ParcelEventType.ECHEC_LIVRAISON,
      ParcelEventType.RETOUR_AUTO_3E_TENTATIVE,
    ]);
    expect(result.events[1]?.effects).toContain(ParcelEffect.CREER_FRAIS_RETOUR);
  });

  it('starts no 48-hour countdown on the third attempt', () => {
    const result = expectOk(
      applyParcelAction(
        { ...outForDelivery, attemptCount: 2 },
        command(ParcelAction.SCAN_ECHEC, { failureReason: FailureReason.REFUSE }),
      ),
    );
    expect(result.events[0]?.effects).not.toContain(ParcelEffect.DEMARRER_DELAI_VERIFICATION);
  });
});

describe('Retour de tournée', () => {
  it('moves a failed parcel to the depot without changing its status', () => {
    const current = parcel({
      status: ParcelStatus.A_VERIFIER,
      location: ParcelLocation.AVEC_LE_LIVREUR,
      attemptCount: 1,
    });
    const result = expectOk(
      applyParcelAction(current, command(ParcelAction.SCAN_RETOUR_DE_TOURNEE)),
    );
    expect(result.next.status).toBe(ParcelStatus.A_VERIFIER);
    expect(result.next.location).toBe(ParcelLocation.AU_DEPOT);
  });

  it('brings back a parcel that was never attempted, untouched (A-8)', () => {
    const current = parcel({
      status: ParcelStatus.EN_LIVRAISON,
      location: ParcelLocation.AVEC_LE_LIVREUR,
      currentLivreurId: LIVREUR_ID,
      attemptCount: 1,
    });
    const result = expectOk(
      applyParcelAction(current, command(ParcelAction.SCAN_RETOUR_DE_TOURNEE)),
    );

    expect(result.next.status).toBe(ParcelStatus.AU_DEPOT);
    expect(result.next.location).toBe(ParcelLocation.AU_DEPOT);
    expect(result.next.attemptCount).toBe(1);
    expect(result.next.currentLivreurId).toBeNull();
  });

  it('brings back a parcel the seller already decided to return (A-7)', () => {
    const current = parcel({
      status: ParcelStatus.RETOUR_AU_DEPOT,
      location: ParcelLocation.AVEC_LE_LIVREUR,
    });
    const result = expectOk(
      applyParcelAction(current, command(ParcelAction.SCAN_RETOUR_DE_TOURNEE)),
    );
    expect(result.next.status).toBe(ParcelStatus.RETOUR_AU_DEPOT);
    expect(result.next.location).toBe(ParcelLocation.AU_DEPOT);
  });

  it('refuses a parcel that is not with a livreur', () => {
    const current = parcel({ status: ParcelStatus.A_VERIFIER, location: ParcelLocation.AU_DEPOT });
    expect(applyParcelAction(current, command(ParcelAction.SCAN_RETOUR_DE_TOURNEE)).ok).toBe(false);
  });
});

describe('seller decisions on À vérifier', () => {
  const withCourier = parcel({
    status: ParcelStatus.A_VERIFIER,
    location: ParcelLocation.AVEC_LE_LIVREUR,
    attemptCount: 1,
  });
  const atDepot = parcel({
    status: ParcelStatus.A_VERIFIER,
    location: ParcelLocation.AU_DEPOT,
    attemptCount: 1,
  });

  it('Relancer is free, gives one new attempt and stops the countdown', () => {
    const result = expectOk(applyParcelAction(atDepot, command(ParcelAction.DECISION_RELANCER)));
    expect(result.next.status).toBe(ParcelStatus.RELANCE);
    expect(result.next.attemptCount).toBe(1);
    expect(result.events[0]?.effects).toEqual([ParcelEffect.ARRETER_DELAI_VERIFICATION]);
  });

  it('Relancer can be chosen while the courier still has the parcel', () => {
    const result = expectOk(applyParcelAction(withCourier, command(ParcelAction.DECISION_RELANCER)));
    expect(result.next.location).toBe(ParcelLocation.AVEC_LE_LIVREUR);
  });

  it('Retourner charges the return fee and stops the clock at the decision (A-7)', () => {
    const result = expectOk(applyParcelAction(withCourier, command(ParcelAction.DECISION_RETOURNER)));
    expect(result.next.status).toBe(ParcelStatus.RETOUR_AU_DEPOT);
    expect(result.next.location).toBe(ParcelLocation.AVEC_LE_LIVREUR);
    expect(result.events[0]?.effects).toEqual([
      ParcelEffect.ARRETER_DELAI_VERIFICATION,
      ParcelEffect.CREER_FRAIS_RETOUR,
    ]);
  });

  it('Changer de client is refused while the courier has the parcel (rule 12)', () => {
    const result = applyParcelAction(withCourier, command(ParcelAction.DECISION_CHANGER_CLIENT));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe(ScanRefusal.COLIS_PAS_AU_DEPOT);
  });

  it('Changer de client resets the attempts and charges 1,000 DT (A-6)', () => {
    const result = expectOk(applyParcelAction(atDepot, command(ParcelAction.DECISION_CHANGER_CLIENT)));
    expect(result.next.status).toBe(ParcelStatus.AU_DEPOT);
    expect(result.next.attemptCount).toBe(0);
    expect(result.next.changeClientCount).toBe(1);
    expect(result.events[0]?.effects).toContain(ParcelEffect.CREER_FRAIS_CHANGEMENT_CLIENT);
  });

  it('allows Changer de client only once per parcel (A-6)', () => {
    const alreadyChanged = { ...atDepot, changeClientCount: 1 };
    const result = applyParcelAction(alreadyChanged, command(ParcelAction.DECISION_CHANGER_CLIENT));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe(ScanRefusal.CHANGEMENT_CLIENT_DEJA_UTILISE);
  });

  it('cannot send a parcel out again until the seller has decided', () => {
    const waiting = parcel({ status: ParcelStatus.A_VERIFIER, location: ParcelLocation.AU_DEPOT });
    const result = applyParcelAction(
      waiting,
      command(ParcelAction.SCAN_SORTIE_COURSIER, { assignToCourierId: LIVREUR_ID }),
    );
    expect(result.ok).toBe(false);
  });

  it('sends a Relancé parcel out again on the next tour', () => {
    const relaunched = parcel({ status: ParcelStatus.RELANCE, location: ParcelLocation.AU_DEPOT });
    const result = expectOk(
      applyParcelAction(
        relaunched,
        command(ParcelAction.SCAN_SORTIE_COURSIER, { assignToCourierId: LIVREUR_ID }),
      ),
    );
    expect(result.next.status).toBe(ParcelStatus.EN_LIVRAISON);
  });

  it('caps a parcel at five attempts in practice, not six (A-6)', () => {
    // A-6 describes "3 attempts, a client change, 3 more". In the flow the
    // sixth attempt is unreachable: the third failure returns the parcel
    // automatically, and Changer de client needs the status À vérifier. So the
    // seller has to change customer after the second failure at the latest,
    // which caps the parcel at 2 + 3 attempts. Flagged for confirmation.
    let current = parcel({ status: ParcelStatus.AU_DEPOT, location: ParcelLocation.AU_DEPOT });
    let failures = 0;

    const dispatch = () => {
      current = expectOk(
        applyParcelAction(
          current,
          command(ParcelAction.SCAN_SORTIE_COURSIER, { assignToCourierId: LIVREUR_ID }),
        ),
      ).next;
    };
    const fail = () => {
      current = expectOk(
        applyParcelAction(
          current,
          command(ParcelAction.SCAN_ECHEC, { failureReason: FailureReason.NE_REPOND_PAS }),
        ),
      ).next;
      failures += 1;
    };
    const bringBack = () => {
      current = expectOk(
        applyParcelAction(current, command(ParcelAction.SCAN_RETOUR_DE_TOURNEE)),
      ).next;
    };
    const relaunch = () => {
      current = expectOk(applyParcelAction(current, command(ParcelAction.DECISION_RELANCER))).next;
    };

    dispatch();
    fail();
    bringBack();
    relaunch();

    dispatch();
    fail();
    bringBack();
    expect(current.attemptCount).toBe(2);
    expect(current.status).toBe(ParcelStatus.A_VERIFIER);

    // Last moment at which the seller can still change customer.
    current = expectOk(
      applyParcelAction(current, command(ParcelAction.DECISION_CHANGER_CLIENT)),
    ).next;
    expect(current.attemptCount).toBe(0);
    expect(current.status).toBe(ParcelStatus.AU_DEPOT);

    dispatch();
    fail();
    bringBack();
    relaunch();

    dispatch();
    fail();
    bringBack();
    relaunch();

    dispatch();
    fail();

    expect(failures).toBe(5);
    expect(current.attemptCount).toBe(3);
    expect(current.status).toBe(ParcelStatus.RETOUR_AU_DEPOT);

    // One client change per parcel, so this is definitively a return.
    expect(applyParcelAction(current, command(ParcelAction.DECISION_CHANGER_CLIENT)).ok).toBe(false);
  });

  it('the 48-hour job returns a parcel nobody decided on (Vendeur rule 15)', () => {
    const result = expectOk(applyParcelAction(atDepot, command(ParcelAction.AUTO_RETOUR_48H)));
    expect(result.next.status).toBe(ParcelStatus.RETOUR_AU_DEPOT);
    expect(result.events[0]?.type).toBe(ParcelEventType.RETOUR_AUTO_48H);
    expect(result.events[0]?.effects).toContain(ParcelEffect.CREER_FRAIS_RETOUR);
  });

  it('the 48-hour job does nothing once the seller has decided', () => {
    const decided = parcel({ status: ParcelStatus.RELANCE, location: ParcelLocation.AU_DEPOT });
    expect(applyParcelAction(decided, command(ParcelAction.AUTO_RETOUR_48H)).ok).toBe(false);
  });
});

describe('the return journey', () => {
  it('goes from the depot to the seller and closes the parcel', () => {
    let current = parcel({
      status: ParcelStatus.RETOUR_AU_DEPOT,
      location: ParcelLocation.AU_DEPOT,
    });

    const prepared = expectOk(
      applyParcelAction(current, command(ParcelAction.SCAN_PREPARATION_RETOURS)),
    );
    expect(prepared.next.status).toBe(ParcelStatus.RETOUR_AU_DEPOT);
    current = prepared.next;

    current = expectOk(applyParcelAction(current, command(ParcelAction.DEPART_RETOUR))).next;
    expect(current.status).toBe(ParcelStatus.RETOUR_EN_ROUTE);
    expect(current.location).toBe(ParcelLocation.AVEC_LE_RAMASSEUR);

    const received = expectOk(applyParcelAction(current, command(ParcelAction.SCAN_RETOUR_RECU)));
    expect(received.next.status).toBe(ParcelStatus.RETOUR_RECU);
    expect(received.next.location).toBe(ParcelLocation.RENDU_AU_VENDEUR);
    expect(received.events[0]?.effects).toContain(ParcelEffect.CLOTURER_CHAT);
  });

  it('refuses to group a return that is still with the courier', () => {
    const current = parcel({
      status: ParcelStatus.RETOUR_AU_DEPOT,
      location: ParcelLocation.AVEC_LE_LIVREUR,
    });
    const result = applyParcelAction(current, command(ParcelAction.SCAN_PREPARATION_RETOURS));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal).toBe(ScanRefusal.COLIS_PAS_AU_DEPOT);
  });

  it('refuses any further scan once the return is received', () => {
    const closed = parcel({
      status: ParcelStatus.RETOUR_RECU,
      location: ParcelLocation.RENDU_AU_VENDEUR,
    });
    for (const action of [
      ParcelAction.SCAN_RAMASSAGE,
      ParcelAction.SCAN_ENTREE_DEPOT,
      ParcelAction.SCAN_SORTIE_COURSIER,
      ParcelAction.SCAN_RETOUR_RECU,
    ]) {
      expect(applyParcelAction(closed, command(action, { assignToCourierId: LIVREUR_ID })).ok).toBe(
        false,
      );
    }
  });
});

describe('editing and cancelling', () => {
  it('lets the seller edit and cancel before pickup', () => {
    const created = parcel();
    expect(applyParcelAction(created, command(ParcelAction.MODIFIER)).ok).toBe(true);
    const cancelled = expectOk(applyParcelAction(created, command(ParcelAction.ANNULER)));
    expect(cancelled.next.status).toBe(ParcelStatus.ANNULE);
  });

  it('refuses a free edit after pickup (Vendeur 4.6)', () => {
    const picked = parcel({
      status: ParcelStatus.RAMASSE,
      location: ParcelLocation.AVEC_LE_RAMASSEUR,
    });
    expect(applyParcelAction(picked, command(ParcelAction.MODIFIER)).ok).toBe(false);
    expect(applyParcelAction(picked, command(ParcelAction.ANNULER)).ok).toBe(false);
  });
});

describe('cash', () => {
  const delivered = parcel({
    status: ParcelStatus.LIVRE,
    location: ParcelLocation.CHEZ_LE_CLIENT,
    cashStatus: ParcelCashStatus.CHEZ_LE_COURSIER,
  });

  it('moves to the depot when the Caisse session is closed (Admin rule 06)', () => {
    expect(applyCashTransition(delivered, CashTransition.CLOTURE_CAISSE)).toBe(
      ParcelCashStatus.AU_DEPOT,
    );
  });

  it('becomes Payé when the seller signs the bon', () => {
    const atDepot = { ...delivered, cashStatus: ParcelCashStatus.AU_DEPOT };
    expect(applyCashTransition(atDepot, CashTransition.BON_REMIS)).toBe(ParcelCashStatus.PAYE);
  });

  it('cannot be paid while the cash is still with the courier', () => {
    expect(applyCashTransition(delivered, CashTransition.BON_REMIS)).toBe(
      ParcelCashStatus.CHEZ_LE_COURSIER,
    );
  });

  it('goes back to the depot when the admin cancels a bon (A-5b)', () => {
    const paid = { ...delivered, cashStatus: ParcelCashStatus.PAYE };
    expect(applyCashTransition(paid, CashTransition.BON_ANNULE)).toBe(ParcelCashStatus.AU_DEPOT);
  });

  it('leaves an undelivered parcel without a cash status', () => {
    const undelivered = parcel({ status: ParcelStatus.EN_LIVRAISON });
    expect(applyCashTransition(undelivered, CashTransition.CLOTURE_CAISSE)).toBeNull();
  });
});

describe('button helpers', () => {
  it('enables Changer de client only once the parcel is back at the depot', () => {
    expect(
      canChangeClient(
        parcel({ status: ParcelStatus.A_VERIFIER, location: ParcelLocation.AVEC_LE_LIVREUR }),
        MAX_CLIENT_CHANGES,
      ),
    ).toBe(false);
    expect(
      canChangeClient(
        parcel({ status: ParcelStatus.A_VERIFIER, location: ParcelLocation.AU_DEPOT }),
        MAX_CLIENT_CHANGES,
      ),
    ).toBe(true);
  });

  it('disables Relancer once the attempts are used up', () => {
    const exhausted = parcel({ status: ParcelStatus.A_VERIFIER, attemptCount: 3 });
    expect(canRelaunch(exhausted, MAX_ATTEMPTS)).toBe(false);
  });

  it('marks a parcel payable only when delivered and counted at the depot (rule 04)', () => {
    expect(
      isPayableToSeller(
        parcel({ status: ParcelStatus.LIVRE, cashStatus: ParcelCashStatus.CHEZ_LE_COURSIER }),
      ),
    ).toBe(false);
    expect(
      isPayableToSeller(parcel({ status: ParcelStatus.LIVRE, cashStatus: ParcelCashStatus.AU_DEPOT })),
    ).toBe(true);
  });

  it('allows a free edit only before pickup', () => {
    expect(canEditFreely(parcel())).toBe(true);
    expect(canEditFreely(parcel({ status: ParcelStatus.AU_DEPOT }))).toBe(false);
  });
});
