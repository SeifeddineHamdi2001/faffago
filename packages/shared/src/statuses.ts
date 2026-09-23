/**
 * Every status in the platform, with the exact French label the specs use.
 *
 * These lists are closed. Adding, renaming or reusing a value requires an
 * explicit decision (CLAUDE.md, Parcels and statuses).
 */

/** Delivery status. Vendeur 5, Admin 5. */
export const ParcelStatus = {
  CREE: 'CREE',
  RAMASSE: 'RAMASSE',
  AU_DEPOT: 'AU_DEPOT',
  EN_LIVRAISON: 'EN_LIVRAISON',
  LIVRE: 'LIVRE',
  A_VERIFIER: 'A_VERIFIER',
  RELANCE: 'RELANCE',
  RETOUR_AU_DEPOT: 'RETOUR_AU_DEPOT',
  RETOUR_EN_ROUTE: 'RETOUR_EN_ROUTE',
  RETOUR_RECU: 'RETOUR_RECU',
  ANNULE: 'ANNULE',
} as const;
export type ParcelStatus = (typeof ParcelStatus)[keyof typeof ParcelStatus];

export const PARCEL_STATUS_LABELS_FR: Record<ParcelStatus, string> = {
  CREE: 'Créé',
  RAMASSE: 'Ramassé',
  AU_DEPOT: 'Au dépôt',
  EN_LIVRAISON: 'En livraison',
  LIVRE: 'Livré',
  A_VERIFIER: 'À vérifier',
  RELANCE: 'Relancé',
  RETOUR_AU_DEPOT: 'Retour au dépôt',
  RETOUR_EN_ROUTE: 'Retour en route',
  RETOUR_RECU: 'Retour reçu',
  ANNULE: 'Annulé',
};

/** Statuses at which the parcel's story is over. */
export const TERMINAL_PARCEL_STATUSES: readonly ParcelStatus[] = [
  ParcelStatus.RETOUR_RECU,
  ParcelStatus.ANNULE,
];

/**
 * Where the parcel physically is, tracked apart from its status (D-1).
 *
 * Needed because "Retour de tournée" keeps the status À vérifier while moving
 * the parcel to the depot, and that move is what unlocks Changer de client
 * (Vendeur 4.9, Admin 4.2).
 */
export const ParcelLocation = {
  CHEZ_LE_VENDEUR: 'CHEZ_LE_VENDEUR',
  AVEC_LE_RAMASSEUR: 'AVEC_LE_RAMASSEUR',
  AU_DEPOT: 'AU_DEPOT',
  AVEC_LE_LIVREUR: 'AVEC_LE_LIVREUR',
  CHEZ_LE_CLIENT: 'CHEZ_LE_CLIENT',
  RENDU_AU_VENDEUR: 'RENDU_AU_VENDEUR',
} as const;
export type ParcelLocation = (typeof ParcelLocation)[keyof typeof ParcelLocation];

export const PARCEL_LOCATION_LABELS_FR: Record<ParcelLocation, string> = {
  CHEZ_LE_VENDEUR: 'Chez le vendeur',
  AVEC_LE_RAMASSEUR: 'Avec le ramasseur',
  AU_DEPOT: 'Au dépôt',
  AVEC_LE_LIVREUR: 'Avec le livreur',
  CHEZ_LE_CLIENT: 'Chez le client',
  RENDU_AU_VENDEUR: 'Rendu au vendeur',
};

/** Cash status. Only meaningful once the parcel is Livré. Vendeur 5. */
export const ParcelCashStatus = {
  CHEZ_LE_COURSIER: 'CHEZ_LE_COURSIER',
  AU_DEPOT: 'AU_DEPOT',
  PAYE: 'PAYE',
} as const;
export type ParcelCashStatus = (typeof ParcelCashStatus)[keyof typeof ParcelCashStatus];

export const PARCEL_CASH_STATUS_LABELS_FR: Record<ParcelCashStatus, string> = {
  CHEZ_LE_COURSIER: 'Chez le coursier',
  AU_DEPOT: 'Au dépôt',
  PAYE: 'Payé',
};

/** Failure reasons. Fixed list, chosen only by the courier. Paramètres 4.16. */
export const FailureReason = {
  NE_REPOND_PAS: 'NE_REPOND_PAS',
  INJOIGNABLE: 'INJOIGNABLE',
  ADRESSE_INCORRECTE: 'ADRESSE_INCORRECTE',
  REPORTE_PAR_LE_CLIENT: 'REPORTE_PAR_LE_CLIENT',
  REFUSE: 'REFUSE',
} as const;
export type FailureReason = (typeof FailureReason)[keyof typeof FailureReason];

export const FAILURE_REASON_LABELS_FR: Record<FailureReason, string> = {
  NE_REPOND_PAS: 'Ne répond pas',
  INJOIGNABLE: 'Injoignable',
  ADRESSE_INCORRECTE: 'Adresse incorrecte',
  REPORTE_PAR_LE_CLIENT: 'Reporté par le client',
  REFUSE: 'Refusé',
};

export const PickupStatus = {
  DEMANDE: 'DEMANDE',
  PLANIFIE: 'PLANIFIE',
  EFFECTUE: 'EFFECTUE',
  ANNULE: 'ANNULE',
} as const;
export type PickupStatus = (typeof PickupStatus)[keyof typeof PickupStatus];

export const PICKUP_STATUS_LABELS_FR: Record<PickupStatus, string> = {
  DEMANDE: 'Demandé',
  PLANIFIE: 'Planifié',
  EFFECTUE: 'Effectué',
  ANNULE: 'Annulé',
};

/**
 * Bon de versement and bon de retour share this list.
 * ANNULE exists because the admin may cancel a bon that never reached the
 * seller (A-5b); it is not part of the normal flow drawn in the specs.
 */
export const BonStatus = {
  PREPARE: 'PREPARE',
  EN_ROUTE: 'EN_ROUTE',
  REMIS: 'REMIS',
  ARCHIVE: 'ARCHIVE',
  ANNULE: 'ANNULE',
} as const;
export type BonStatus = (typeof BonStatus)[keyof typeof BonStatus];

export const BON_STATUS_LABELS_FR: Record<BonStatus, string> = {
  PREPARE: 'Préparé',
  EN_ROUTE: 'En route',
  REMIS: 'Remis',
  ARCHIVE: 'Archivé',
  ANNULE: 'Annulé',
};

export const CaisseSessionStatus = {
  OUVERTE: 'OUVERTE',
  COMPTEE: 'COMPTEE',
  CLOTUREE: 'CLOTUREE',
} as const;
export type CaisseSessionStatus = (typeof CaisseSessionStatus)[keyof typeof CaisseSessionStatus];

export const CAISSE_SESSION_STATUS_LABELS_FR: Record<CaisseSessionStatus, string> = {
  OUVERTE: 'Ouverte',
  COMPTEE: 'Comptée',
  CLOTUREE: 'Clôturée',
};

export const DebtStatus = {
  EN_COURS: 'EN_COURS',
  DEDUITE: 'DEDUITE',
  ANNULEE: 'ANNULEE',
} as const;
export type DebtStatus = (typeof DebtStatus)[keyof typeof DebtStatus];

export const DEBT_STATUS_LABELS_FR: Record<DebtStatus, string> = {
  EN_COURS: 'En cours',
  DEDUITE: 'Déduite',
  ANNULEE: 'Annulée',
};

export const PayslipStatus = {
  A_PAYER: 'A_PAYER',
  PAYEE: 'PAYEE',
} as const;
export type PayslipStatus = (typeof PayslipStatus)[keyof typeof PayslipStatus];

export const PAYSLIP_STATUS_LABELS_FR: Record<PayslipStatus, string> = {
  A_PAYER: 'À payer',
  PAYEE: 'Payée',
};

/** Fiscal status of a seller. Decides the 3 % retenue à la source. Vendeur 2.4. */
export const SellerStatut = {
  PATENTE: 'PATENTE',
  AUTO_ENTREPRENEUR: 'AUTO_ENTREPRENEUR',
  CIN_UNIQUEMENT: 'CIN_UNIQUEMENT',
} as const;
export type SellerStatut = (typeof SellerStatut)[keyof typeof SellerStatut];

export const SELLER_STATUT_LABELS_FR: Record<SellerStatut, string> = {
  PATENTE: 'Patente',
  AUTO_ENTREPRENEUR: 'Auto-entrepreneur',
  CIN_UNIQUEMENT: 'CIN uniquement',
};

export const SellerAccountState = {
  ACTIF: 'ACTIF',
  SUSPENDU: 'SUSPENDU',
} as const;
export type SellerAccountState = (typeof SellerAccountState)[keyof typeof SellerAccountState];

export const SELLER_ACCOUNT_STATE_LABELS_FR: Record<SellerAccountState, string> = {
  ACTIF: 'Actif',
  SUSPENDU: 'Suspendu',
};

export const CourierAccountState = {
  ACTIF: 'ACTIF',
  INACTIF: 'INACTIF',
} as const;
export type CourierAccountState = (typeof CourierAccountState)[keyof typeof CourierAccountState];

export const COURIER_ACCOUNT_STATE_LABELS_FR: Record<CourierAccountState, string> = {
  ACTIF: 'Actif',
  INACTIF: 'Inactif',
};

/** Livreurs only. Ramasseurs are paid by HR outside the app. Admin 4.12. */
export const PayPlan = {
  JOURNALIER: 'JOURNALIER',
  HEBDOMADAIRE: 'HEBDOMADAIRE',
  MENSUEL: 'MENSUEL',
} as const;
export type PayPlan = (typeof PayPlan)[keyof typeof PayPlan];

export const PAY_PLAN_LABELS_FR: Record<PayPlan, string> = {
  JOURNALIER: 'Journalier',
  HEBDOMADAIRE: 'Hebdomadaire',
  MENSUEL: 'Mensuel',
};

/** Every deduction line of a bon de versement (D-2). */
export const ChargeType = {
  LIVRAISON: 'LIVRAISON',
  RETOUR: 'RETOUR',
  CHANGEMENT_CLIENT: 'CHANGEMENT_CLIENT',
  RAMASSAGE: 'RAMASSAGE',
} as const;
export type ChargeType = (typeof ChargeType)[keyof typeof ChargeType];

export const CHARGE_TYPE_LABELS_FR: Record<ChargeType, string> = {
  LIVRAISON: 'Frais de livraison',
  RETOUR: 'Frais de retour',
  CHANGEMENT_CLIENT: 'Changement de client',
  RAMASSAGE: 'Frais de ramassage',
};

export const ChargeStatus = {
  EN_ATTENTE: 'EN_ATTENTE',
  DEDUITE: 'DEDUITE',
  ANNULEE: 'ANNULEE',
} as const;
export type ChargeStatus = (typeof ChargeStatus)[keyof typeof ChargeStatus];

/**
 * Why a parcel is in RELANCE (decision 6).
 *
 * VENDEUR: the seller chose Relancer after a failure, and picked the date.
 * CLIENT: the customer asked to postpone, so the courier planned it directly
 * and the parcel never passed through À vérifier.
 *
 * The two are shown differently to the seller and on the public tracking page,
 * which is why the origin is stored rather than inferred.
 */
export const RelaunchOrigin = {
  VENDEUR: 'VENDEUR',
  CLIENT: 'CLIENT',
} as const;
export type RelaunchOrigin = (typeof RelaunchOrigin)[keyof typeof RelaunchOrigin];

export const RELAUNCH_ORIGIN_LABELS_FR: Record<RelaunchOrigin, string> = {
  VENDEUR: 'Relancé',
  CLIENT: 'Reporté par le client',
};

/** Time slots a postponement can name (decision 6). */
export const RelaunchSlot = {
  MATIN: 'MATIN',
  APRES_MIDI: 'APRES_MIDI',
  SOIR: 'SOIR',
} as const;
export type RelaunchSlot = (typeof RelaunchSlot)[keyof typeof RelaunchSlot];

export const RELAUNCH_SLOT_LABELS_FR: Record<RelaunchSlot, string> = {
  MATIN: 'Matin',
  APRES_MIDI: 'Après-midi',
  SOIR: 'Soir',
};

export const Langue = {
  FR: 'FR',
  AR: 'AR',
} as const;
export type Langue = (typeof Langue)[keyof typeof Langue];
