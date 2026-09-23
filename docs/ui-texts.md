# Faffa Go — textes d'interface à relire

Every user-facing text that the specs do not word, written during the build.
Approved for now (2026-09-25), **to be reviewed as a whole before launch**.

Labels taken word for word from the specs are not listed ("Se connecter",
"Créer un coursier", "Régénérer le mot de passe", "Copier les identifiants",
"Voir comme le vendeur", "Tableau de bord", status names…).

`{nom}`, `{n}` and the like are filled in at run time. The **Key** column says
where the text lives, so a change is made in one place.

---

## Connexion (`/vendeur/connexion`, `/admin/connexion`)

| Key                                              | Français                                                                                |
| ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| web `login-page` — sous-titre vendeur            | Espace vendeur                                                                          |
| web `login-page` — sous-titre équipe             | Équipe Faffa Go                                                                         |
| web `login-form` — champ (vendeur)               | Email                                                                                   |
| web `login-form` — champ (équipe)                | Identifiant                                                                             |
| web `login-form` — champ                         | Mot de passe                                                                            |
| web `login-form` — mot de passe oublié (vendeur) | Mot de passe oublié ? Contactez Faffa Go : l'équipe vous remet un nouveau mot de passe. |
| web `login-form` — champs vides                  | Remplissez les deux champs.                                                             |
| web `login-form` — erreur inconnue               | Connexion impossible. Réessayez.                                                        |
| web `login-form` — hors ligne                    | Connexion impossible. Vérifiez votre connexion internet.                                |
| `AUTH_MESSAGES.identifiantsIncorrects`           | Identifiant ou mot de passe incorrect                                                   |
| `AUTH_MESSAGES.compteDesactive`                  | Compte désactivé. Contactez Faffa Go.                                                   |
| `AUTH_MESSAGES.tropDeTentatives`                 | Trop de tentatives. Réessayez dans {n} s. · …dans {n} min.                              |
| `AUTH_MESSAGES.sessionExpiree`                   | Session expirée. Reconnectez-vous.                                                      |

## Back office — cadre

| Key                        | Français                          |
| -------------------------- | --------------------------------- |
| web `logout-button`        | Se déconnecter                    |
| web `admin/page` — accueil | Bonjour {prénom}                  |
| web `admin/page` — accueil | Choisissez un écran dans le menu. |

## Coursiers (`/admin/coursiers`)

| Key                                         | Français                                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| web `couriers-screen` — titre               | Coursiers                                                                                                                |
| web `couriers-screen` — sans zone           | Aucune zone                                                                                                              |
| web `couriers-screen` — zone                | {zone} (titulaire) · {zone} (backup)                                                                                     |
| web `couriers-screen` — badge               | Ne reçoit plus de travail                                                                                                |
| web `couriers-screen` — boutons             | Désactiver · Réactiver                                                                                                   |
| web `couriers-screen` — confirmation, titre | Désactiver le coursier                                                                                                   |
| web `couriers-screen` — confirmation, texte | {nom} ne recevra plus de nouveau travail. Le compte sera désactivé si rien n'est encore en cours : colis, argent ou bon. |
| web `couriers-screen` — après un refus      | Le coursier ne reçoit plus de nouveau travail. Relancez la désactivation une fois tout remis.                            |
| `COURIER_DEACTIVATION_REFUSED`              | Désactivation impossible tant que ce coursier a du travail ou de l'argent en cours.                                      |
| `courierBlocker` COLIS_EN_MAIN              | {n} colis en main                                                                                                        |
| `courierBlocker` ARGENT_CHEZ_LE_COURSIER    | {n} colis livré(s) dont l'argent n'est pas remis                                                                         |
| `courierBlocker` BON_VERSEMENT_EN_ROUTE     | {n} bon(s) de versement en route                                                                                         |
| `courierBlocker` BON_RETOUR_EN_ROUTE        | {n} bon(s) de retour en route                                                                                            |
| `courierBlocker` CAISSE_NON_CLOTUREE        | {n} session(s) de caisse non clôturée(s)                                                                                 |
| `courierBlocker` FICHE_DE_PAIE_A_PAYER      | {n} fiche(s) de paie à payer                                                                                             |
| `courierBlocker` DETTE_EN_COURS             | {n} dette(s) en cours                                                                                                    |

### Formulaire « Créer un coursier »

| Key                                 | Français                                                                                           |
| ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| web `create-courier-form` — champs  | Rôle · Livreur · Ramasseur · Prénom · Nom · Téléphone · CIN · Véhicule (facultatif) · Plan de paie |
| web `create-courier-form` — boutons | Annuler · Créer                                                                                    |

## Vendeurs (`/admin/vendeurs`)

| Key                                             | Français                            |
| ----------------------------------------------- | ----------------------------------- |
| web `sellers-screen` — titre                    | Vendeurs                            |
| web `sellers-screen` — liste vide               | Aucun vendeur pour l'instant.       |
| web `sellers-screen` — échec de la consultation | Consultation impossible. Réessayez. |

## Paramètres › Utilisateurs (`/admin/parametres/utilisateurs`)

| Key                                      | Français                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| web `staff-screen` — titre               | Utilisateurs                                                                                |
| web `staff-screen` — bouton              | Créer un utilisateur                                                                        |
| web `staff-screen` — états               | Actif · Inactif                                                                             |
| web `staff-screen` — dernière connexion  | Dernière connexion : {date}                                                                 |
| web `staff-screen` — confirmation, titre | Désactiver le compte                                                                        |
| web `staff-screen` — confirmation, texte | {nom} ne pourra plus se connecter, et toutes ses sessions seront fermées.                   |
| web `staff-screen` — formulaire          | Rôle · Identifiant · Prénom · Nom · Téléphone · Annuler · Créer                             |
| `AUTH_MESSAGES.dernierAdmin`             | Impossible : c'est le dernier admin actif. Utilisez la commande admin:reset sur le serveur. |
| `AUTH_MESSAGES.identifiantDejaUtilise`   | Cet identifiant est déjà utilisé.                                                           |
| `AUTH_MESSAGES.telephoneDejaUtilise`     | Ce numéro est déjà utilisé par un autre compte.                                             |

## Mot de passe généré (création et Régénérer)

| Key                                         | Français                                                                                           |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| web `credentials-dialog` — titre            | Mot de passe généré                                                                                |
| web `credentials-dialog` — avertissement    | Ce mot de passe ne sera plus affiché. Remettez-le à la personne concernée.                         |
| web `credentials-dialog` — après la copie   | Copié                                                                                              |
| web `credentials-dialog` — case à cocher    | J'ai noté le mot de passe                                                                          |
| web `credentials-dialog` — bouton           | Fermer                                                                                             |
| web `credentials-dialog` — texte copié      | Identifiant : {…} / Téléphone : {…} / Email : {…} ⏎ Mot de passe : {…} ⏎ Rôle : {rôle} (coursiers) |
| web `account-actions` — confirmation, texte | Un nouveau mot de passe sera généré pour {nom}. Toutes ses sessions seront fermées immédiatement.  |
| web `account-actions` — boutons             | Annuler · Régénérer                                                                                |

## Espace vendeur (`/vendeur`)

| Key                                     | Français                                                |
| --------------------------------------- | ------------------------------------------------------- |
| web `vendeur/page` — accueil            | Bienvenue, {boutique}.                                  |
| web `impersonation-banner` — sous-titre | Consultation en lecture seule : aucune action possible. |
| web `impersonation-banner` — bouton     | Quitter                                                 |
| `AUTH_MESSAGES.lectureSeule`            | Consultation en lecture seule : aucune action possible. |

The banner's first line, "Vous consultez le compte de {boutique}", is D-5.

## Site public (placeholder, phase 8)

| Key                                     | Français     | العربية                            |
| --------------------------------------- | ------------ | ---------------------------------- |
| web `[locale]/page` — bouton            | Se connecter | تسجيل الدخول (approved 2026-09-25) |
| web `[locale]/page` — changer de langue | Français     | العربية                            |

## Erreurs générales

| Key                                        | Français                                    |
| ------------------------------------------ | ------------------------------------------- |
| `AUTH_MESSAGES.nonAutorise`                | Vous n'avez pas accès à cette action.       |
| `AUTH_MESSAGES.versionAppObsolete`         | Mettez à jour l'application pour continuer. |
| web `lib/client/call` — erreur inconnue    | Une erreur est survenue. Réessayez.         |
| web `lib/server/respond` — origine refusée | Requête refusée.                            |
| api `ZodValidationPipe`                    | Données invalides                           |
| api `accounts.service`                     | Compte introuvable                          |
| api `impersonation.service`                | Vendeur introuvable                         |

## Messages de validation (`packages/shared`)

| Key                          | Français                                                                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `tunisianPhone`              | 8 chiffres, format tunisien                                                                                                            |
| `codAmount`                  | Montant invalide. Format : 85,000                                                                                                      |
| `codAmount`                  | Le montant COD ne peut pas être négatif                                                                                                |
| `createParcelSchema`         | Nom du destinataire obligatoire · Délégation obligatoire · Adresse obligatoire · Description du produit obligatoire · Au moins 1 pièce |
| login schemas                | Mot de passe obligatoire · Email obligatoire · Identifiant obligatoire                                                                 |
| `username`                   | Identifiant : 4 caractères minimum, a-z 0-9 . _ -                                                                                      |
| account schemas              | Obligatoire · 80 caractères maximum · CIN obligatoire · 20 caractères maximum                                                          |
| `createCourierAccountSchema` | Plan de paie obligatoire · Le ramasseur est payé par les RH, sans plan de paie                                                         |

## Libellés sans équivalent dans les specs (`packages/shared`)

| Key                                 | Français                                                                                             |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `PARCEL_LOCATION_LABELS_FR` (D-1)   | Chez le vendeur · Avec le ramasseur · Au dépôt · Avec le livreur · Chez le client · Rendu au vendeur |
| `BON_STATUS_LABELS_FR.ANNULE` (A-5) | Annulé                                                                                               |
| `CHARGE_TYPE_LABELS_FR` (D-2)       | Frais de livraison · Frais de retour · Changement de client · Frais de ramassage                     |
| `CHAT_THREAD_STATE_LABELS_FR` (Q15) | Ouvert · Lecture seule · Clos                                                                        |

## Terminal (équipe technique uniquement)

`admin:reset`, `db:seed` and `db:seed:demo` print short French messages
("Mot de passe régénéré. Il ne sera plus affiché.", "Comptes de
démonstration…", "Aucun admin : lancez d'abord…"). They are never shown to a
seller, a courier or the team in the app, and are listed only for completeness.
