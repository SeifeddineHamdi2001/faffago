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
| web `impersonation-banner` — sous-titre | Consultation en lecture seule : aucune action possible. |
| web `impersonation-banner` — bouton     | Quitter                                                 |
| `AUTH_MESSAGES.lectureSeule`            | Consultation en lecture seule : aucune action possible. |

The banner's first line, "Vous consultez le compte de {boutique}", is D-5.

## Site public (placeholder, phase 9)

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

| Key                          | Français                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `tunisianPhone`              | 8 chiffres, format tunisien                                                                                                          |
| `codAmount`                  | Montant invalide. Format : 85,000                                                                                                    |
| `codAmount`                  | Le montant COD ne peut pas être négatif                                                                                              |
| `createParcelSchema`         | Nom du destinataire obligatoire · Localité obligatoire · Adresse obligatoire · Description du produit obligatoire · Au moins 1 pièce |
| login schemas                | Mot de passe obligatoire · Email obligatoire · Identifiant obligatoire                                                               |
| `username`                   | Identifiant : 4 caractères minimum, a-z 0-9 . _ -                                                                                    |
| account schemas              | Obligatoire · 80 caractères maximum · CIN obligatoire · 20 caractères maximum                                                        |
| `createCourierAccountSchema` | Plan de paie obligatoire · Le ramasseur est payé par les RH, sans plan de paie                                                       |

## Paramètres › Tarifs et règles (`/admin/parametres`, phase 2)

| Key                                   | Français                                                                                                                                                                                                         |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| web `parametres-tabs`                 | Tarifs et règles · Utilisateurs                                                                                                                                                                                  |
| web `settings-screen` — sections      | Frais · Retenue à la source · Règles · Liens de contact · Raisons d'échec                                                                                                                                        |
| web `settings-screen` — note Frais    | Les mêmes pour tous les vendeurs. Un nouveau tarif s'applique aux colis créés après la modification ; les colis existants gardent leurs frais.                                                                   |
| web `settings-screen` — Frais         | Frais de livraison (DT) · Frais de retour (DT) · Frais de changement de client (DT) · Frais de ramassage (DT) · Ramassage gratuit à partir de (colis) · Tarif coursier par colis livré (DT)                      |
| web `settings-screen` — Retenue       | Retenue à la source, CIN uniquement (%)                                                                                                                                                                          |
| web `settings-screen` — Règles        | Délai À vérifier (heures) · Tentatives de livraison maximum · Changements de client par colis · Annulation d'un scan (secondes) · Écart d'horloge signalé (minutes) · Version minimale de l'application coursier |
| web `settings-screen` — Liens         | Téléphone · WhatsApp · Facebook · Instagram · TikTok                                                                                                                                                             |
| web `settings-screen` — note Liens    | Affichés sur le site public, dans Devenir partenaire.                                                                                                                                                            |
| web `settings-screen` — note Raisons  | Liste fixe, choisie par le livreur. Non modifiable.                                                                                                                                                              |
| web `settings-screen` — boutons, état | Enregistrer · Enregistré                                                                                                                                                                                         |
| web `settings-screen` — erreurs       | Montant invalide. Format : 5,500 · Nombre entier attendu · Pourcentage invalide. Format : 3 ou 2,5 · Valeur obligatoire                                                                                          |
| `SETTING_VALUE_SCHEMAS` (shared)      | Montant en millimes, en chiffres (ex. 5500) · Nombre entier attendu · Minimum {n} · Maximum {n} · Version au format 1.2.3 · Lien complet commençant par https://                                                 |
| api `settings.service`                | Ce paramètre n'existe pas.                                                                                                                                                                                       |

## Localités (D-17)

| Key                                             | Français                                                                                                                                                          |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resolveLocalite` (shared, aperçu CSV)          | Localité obligatoire                                                                                                                                              |
| `resolveLocalite`                               | Localité inconnue : « {nom} » · Localité inconnue à {délégation} : « {nom} »                                                                                      |
| `resolveLocalite`                               | « {nom} » existe dans plusieurs délégations ({liste}). Précisez la délégation.                                                                                    |
| `resolveLocalite`                               | « {nom} » correspond à plusieurs localités ({liste}). Choisissez la bonne.                                                                                        |
| `createLocaliteSchema` / `updateLocaliteSchema` | Délégation obligatoire · Nom obligatoire · Code postal à 4 chiffres · Aucune modification                                                                         |
| api `geo.service`                               | Localité introuvable. · Délégation introuvable. · Cette délégation a déjà une localité « {nom} ». · La localité « Autre » ne peut être ni renommée ni désactivée. |
| seed, CSV data                                  | Autre · أخرى (the row every délégation has for places not yet listed)                                                                                             |

## Colis (phase 3)

| Key                                                    | Français                                                                     |
| ------------------------------------------------------ | ---------------------------------------------------------------------------- |
| api `parcels.service` — compte suspendu (D-25)         | Votre compte est suspendu : vous ne pouvez pas créer de colis.               |
| api `parcels.service` — localité désactivée (D-27)     | Cette localité n’est plus proposée. Choisissez-en une autre.                 |
| api `parcels.service` — localité inconnue              | Localité introuvable.                                                        |
| api `parcels.service` — aucun code libre               | Impossible d’attribuer un code au colis pour le moment. Réessayez.           |
| `CANCELLATION_AFTER_PICKUP_LABEL_FR` (shared, D-28)    | Après ramassage                                                              |
| `SCAN_REFUSAL_MESSAGES_FR.DATE_RELANCE_REQUISE` (D-29) | Date de relance obligatoire (neutral; the seller's wording comes in phase 7) |

## Vendeurs — comptes et documents (phase 4, D-32 à D-34)

| Key                                                    | Français                                                                                                                                                                                                                |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SELLER_DOCUMENT_TYPE_LABELS_FR`                       | CIN (recto) · CIN (verso) · Patente · Carte auto-entrepreneur                                                                                                                                                           |
| web `create-seller-form` — champs                      | Nom de la boutique · Catégorie de produits · Choisir… · Lien de la boutique (facultatif) · Personne de contact · Prénom · Nom · Téléphone · Email (identifiant de connexion) · Statut · Documents                       |
| web `create-seller-form` — note CIN uniquement         | Retenue à la source sur chaque paiement, après les frais Faffa Go.                                                                                                                                                      |
| web `create-seller-form` — aide documents              | Photo JPEG ou PNG, ou PDF. 10 Mo maximum. Visibles par l’admin uniquement.                                                                                                                                              |
| web `create-seller-form` — erreurs                     | Document obligatoire · Fichier trop volumineux : 10 Mo maximum.                                                                                                                                                         |
| web `seller-detail-screen` — fiche                     | Personne de contact · Créé le · Documents · Visibles par l’admin uniquement. · Voir · Remplacer                                                                                                                         |
| web `seller-detail-screen` — versions                  | Versions remplacées ({n}) · envoyé le {date}, remplacé le {date}                                                                                                                                                        |
| web `seller-detail-screen` — actions                   | Modifier · Changer le statut · Suspendre · Réactiver                                                                                                                                                                    |
| web `seller-detail-screen` — Modifier le vendeur       | Modifier le vendeur · Prénom du contact · Nom du contact · Enregistrer                                                                                                                                                  |
| web `seller-detail-screen` — Changer le statut         | Statut actuel : {statut}. Le changement s’applique aux bons de versement préparés après lui ; un bon déjà préparé ne change pas. · Nouveau statut                                                                       |
| web `seller-detail-screen` — Changer de contact (D-42) | Une autre personne devient le contact : elle reçoit l’argent et les retours et signe les bons. Joignez sa CIN. Pour corriger une faute de frappe, utilisez Modifier.                                                    |
| web `seller-detail-screen` — Remplacer                 | Remplacer : {document} · L’ancienne version reste consultable. · Nouveau fichier                                                                                                                                        |
| web `seller-detail-screen` — Suspendre le vendeur      | Le vendeur pourra se connecter et suivre ses colis, ses paiements et ses retours, mais ne pourra plus créer de colis ni demander de ramassage.                                                                          |
| web `seller-detail-screen` — Réactiver le vendeur      | Le vendeur pourra de nouveau créer des colis et demander des ramassages.                                                                                                                                                |
| `createSellerSchema` / `updateSellerSchema`            | Nom de la boutique obligatoire · Catégorie obligatoire · Lien invalide. Exemple : https://www.facebook.com/maboutique · Le lien doit commencer par https:// · Email invalide · Statut obligatoire · Aucune modification |
| `addSellerDocumentSchema`                              | Type de document obligatoire                                                                                                                                                                                            |
| `SELLER_MESSAGES`                                      | Vendeur introuvable · Document introuvable · Document obligatoire : {documents} · Document non demandé pour ce statut : {documents} · Fichier obligatoire.                                                              |
| `SELLER_MESSAGES` — fichiers                           | Format refusé. Envoyez une photo JPEG ou PNG, ou un PDF. · Fichier trop volumineux : 10 Mo maximum. · Fichier illisible. Reprenez la photo ou envoyez un autre fichier.                                                 |
| `SELLER_MESSAGES` — états                              | Le vendeur a déjà ce statut. · Ce compte est déjà suspendu. · Ce compte est déjà actif.                                                                                                                                 |

## Colis du vendeur (phase 4, étape 2)

| Key                                             | Français                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| web `seller-nav`                                | Tableau de bord · Créer un colis                                                                                                                                                                                                                                                                               |
| web `parcel-form` — champs                      | Téléphone 2 (facultatif) · Repère (facultatif) · Note pour le coursier (facultatif) · Créer le colis · Enregistrer                                                                                                                                                                                             |
| web `localite-picker`                           | Rechercher une localité · Rechercher une localité (ex. Ennasr, 2026) · Résultats · Gouvernorat · Délégation · Localité · Choisir…                                                                                                                                                                              |
| web `create-parcel-screen` — lecture seule      | Consultation en lecture seule : aucun colis ne peut être créé.                                                                                                                                                                                                                                                 |
| web `parcel-screen` — fiche                     | Créé le {date} · Destinataire · Téléphone · Localité · Adresse · Produit · {n} pièce(s) · Montant COD · Options · Note pour le coursier · Modifier {code}                                                                                                                                                      |
| web `parcel-screen` — actions                   | Modifier · Demander une modification · Annuler le colis · Garder le colis                                                                                                                                                                                                                                      |
| web `parcel-screen` — annuler avant ramassage   | Le colis sera annulé. Cette action est définitive.                                                                                                                                                                                                                                                             |
| web `parcel-screen` — annuler après ramassage   | Le colis a déjà été ramassé : il devient un retour et vous sera rendu. Frais de retour : {montant}, déduits de votre prochain paiement.                                                                                                                                                                        |
| web `parcel-screen` — `REPRINT_WARNING` (D-41)  | Colis modifié. Réimprimez l’étiquette : celle déjà imprimée porte les anciennes informations.                                                                                                                                                                                                                  |
| web `parcel-screen` — demande                   | Demandes de modification · Remplissez seulement ce qui change. Faffa Go applique la modification. · Nouveau téléphone · Nouveau téléphone 2 · Nouvelle adresse · Nouveau repère · Note pour Faffa Go (facultatif) · Envoyer la demande                                                                         |
| `CHANGE_REQUEST_FIELD_LABELS_FR`                | Téléphone · Téléphone 2 · Localité · Adresse · Repère                                                                                                                                                                                                                                                          |
| `CHANGE_REQUEST_STATUS_LABELS_FR`               | En attente · Appliquée · Refusée · Retirée (D-44)                                                                                                                                                                                                                                                              |
| web `parcel-screen` — demande en attente (D-44) | Modifier la demande · Retirer la demande · Garder la demande · Enregistrer la demande · Faffa Go n’appliquera pas cette demande. Vous pourrez en envoyer une autre. · Remplissez seulement ce qui change. Faffa Go applique la modification ; une nouvelle localité est appliquée quand le colis est au dépôt. |
| `PARCEL_MESSAGES` (D-44)                        | Une demande attend déjà Faffa Go pour ce colis : modifiez-la ou retirez-la. · Demande introuvable. · Cette demande a déjà été traitée ou retirée.                                                                                                                                                              |
| `parcelChangeRequestSchema`                     | Adresse trop courte · Localité invalide · Indiquez au moins une modification                                                                                                                                                                                                                                   |
| `PARCEL_MESSAGES`                               | Code inconnu · Le colis a été ramassé : il ne se modifie plus directement. Demandez une modification. · Ce colis ne peut plus être annulé. · Ce colis ne peut plus être modifié. · Le colis n’est pas encore ramassé : modifiez-le directement. · Cette demande a déjà été utilisée. Rechargez la page.        |
| `updateParcelSchema`                            | Aucune modification                                                                                                                                                                                                                                                                                            |

## Import CSV (phase 4, étape 3, D-37)

| Key                                     | Français                                                                                                                                                                                                                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| web `seller-nav`                        | Import CSV                                                                                                                                                                                                                                                                     |
| web `csv-import-screen` — préparer      | Remplissez le modèle, une ligne par colis ({n} au maximum), puis enregistrez-le au format CSV. La localité se donne par son nom ; ajoutez la délégation quand le nom existe à plusieurs endroits. · Liste des délégations · Fichier CSV                                        |
| web `csv-import-screen` — aperçu        | {fichier} : {n} valide(s) · {n} à vérifier · {n} erreur(s) · Ligne · État · Destinataire · Téléphone · Localité · COD · Détail · Localité de la ligne {n} · Choisir…                                                                                                           |
| web `csv-import-screen` — importer      | Seules les lignes valides sont importées. Pour les autres, corrigez le fichier et chargez-le de nouveau. · Importer {n} colis                                                                                                                                                  |
| web `csv-import-screen` — refus serveur | Refusée à l’import : rechargez la page, puis chargez le fichier de nouveau.                                                                                                                                                                                                    |
| web `csv-import-screen` — résultat      | {n} colis importés depuis {fichier}. · Ligne {n} · Nouvel import                                                                                                                                                                                                               |
| web `csv-import-screen` — lecture seule | Consultation en lecture seule : aucun colis ne peut être importé.                                                                                                                                                                                                              |
| web `csv-import-screen` — fichiers      | modele-import-faffago.csv · delegations-faffago.csv (colonnes : code, delegation, gouvernorat)                                                                                                                                                                                 |
| `readCsvFile` (shared)                  | Le fichier est vide. · Colonne inconnue : {colonnes}. Utilisez les colonnes du modèle. · La colonne {colonne} apparaît deux fois. · Colonne obligatoire absente : {colonnes}. · Le fichier ne contient aucun colis. · {n} colis dans le fichier : {max} au maximum par import. |
| `evaluateCsvRow` (shared)               | {n} cellules au lieu de {m}. Un montant avec une virgule doit être entre guillemets, ou enregistrez le fichier avec le point-virgule comme séparateur. · Texte trop long : 500 caractères maximum · Indiquez oui ou non                                                        |
| `csvImportRequestSchema`                | Aucun colis à importer · 500 colis au maximum par import                                                                                                                                                                                                                       |
| api `parcel-imports.service`            | {n} ligne(s) refusée(s) : aucun colis n’a été importé. Corrigez-les dans l’aperçu. · Une même ligne du fichier est envoyée deux fois. · Import introuvable.                                                                                                                    |

## Étiquettes (phase 4, étape 4, D-36)

| Key                                  | Français                                                                                             |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| api `label-renderer` — texte imprimé | FAFFA GO · Expéditeur (au-dessus du nom de la boutique) · COD · Destinataire · Repère (D-45)         |
| api `label-content` — drapeaux       | ÉCHANGE · OUVERTURE AUTORISÉE                                                                        |
| `LABEL_FORMAT_LABELS_FR`             | Thermique 10 × 15 cm · A4 (4 par page)                                                               |
| web `print-labels` — titres          | Imprimer l’étiquette · Réimprimer l’étiquette · Imprimer toutes les étiquettes                       |
| api `labels.service` — refus         | Impression impossible pour le moment : l’adresse du site n’est pas configurée. · Import introuvable. |
| api `labels.controller`              | Aucun colis · 500 étiquettes au maximum                                                              |
| Noms des fichiers PDF                | etiquette-{code}.pdf · etiquettes.pdf · etiquettes-import.pdf                                        |

## Mes colis et Détail du colis (phase 4, étape 5, D-38, D-40)

| Key                                    | Français                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| web `seller-nav`                       | Mes colis                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `PARCEL_GROUP_LABELS_FR` (D-46)        | Tous · À vérifier · En cours · Livrés · Payés · Non payés · Retours                                                                                                                                                                                                                                                                                                                                                                               |
| web `mes-colis-screen` — filtres       | Filtrer par statut · Livrés : paiement · Rechercher · Code, nom ou téléphone · Du · Au · Filtrer · Effacer · Filtre invalide : tous les colis sont affichés.                                                                                                                                                                                                                                                                                      |
| web `mes-colis-screen` — tableau       | Code · Destinataire · Délégation · Suivi · Statut · Paiement · COD · Date · Aucun colis. · Tout sélectionner sur cette page · Sélectionner {code}                                                                                                                                                                                                                                                                                                 |
| web `mes-colis-screen` — actions       | Exporter · Imprimer {n} étiquette(s) · Précédent · Suivant · Page {n} sur {m} · {n} colis                                                                                                                                                                                                                                                                                                                                                         |
| web `track-line`                       | Livraison : étape {n} sur {m} · Retour : étape {n} sur {m}                                                                                                                                                                                                                                                                                                                                                                                        |
| `RETURN_FLOW_LABELS_FR` (Vendeur 4.12) | À vérifier · Retour au dépôt · En route · Reçu                                                                                                                                                                                                                                                                                                                                                                                                    |
| web `parcel-screen` — tentatives       | Tentative {n} sur {m}                                                                                                                                                                                                                                                                                                                                                                                                                             |
| web `parcel-screen` — argent (D-40)    | Argent · Montant COD · Frais de livraison · Net estimé · Estimation avant retenue à la source : le bon de versement fait foi. · Frais de retour · Aucun frais. · Paiement                                                                                                                                                                                                                                                                         |
| web `parcel-screen` — historique       | Historique                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `PARCEL_EVENT_LABELS_FR`               | Colis créé · Colis modifié · Colis annulé · Ramassé · Arrivé au dépôt · Parti en livraison · Livreur assigné · Livré · Échec de livraison · Revenu au dépôt · Relancé · Retour demandé · Changement de client · Retour automatique : 48 h sans décision · Retour automatique : 3e tentative · Retour préparé · Retour en route · Retour reçu · Argent remis au dépôt · Payé · Ancien article récupéré · Statut corrigé par Faffa Go · Scan annulé |
| `timelineActorLabel` (D-38)            | Vous · Faffa Go · {prénom du coursier}                                                                                                                                                                                                                                                                                                                                                                                                            |
| `parcelListQuerySchema`                | Date au format AAAA-MM-JJ · La date de début doit précéder la date de fin                                                                                                                                                                                                                                                                                                                                                                         |
| api `parcel-queries.service` — export  | mes-colis.csv (colonnes : Code, Date, Destinataire, Téléphone, Téléphone 2, Localité, Délégation, Adresse, Statut, Paiement, Montant COD (DT)) · {n} colis : {max} au maximum par export. Choisissez des dates.                                                                                                                                                                                                                                   |

## Ramassages et Profil (phase 4, étape 6, D-35)

| Key                                          | Français                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| web `seller-nav`                             | Ramassages · Profil                                                                                                                                                                                                                                                                                                                                                                                |
| `PICKUP_SLOT_LABELS_FR` (D-35)               | Matin · Après-midi                                                                                                                                                                                                                                                                                                                                                                                 |
| web `pickups-screen` — liste                 | Demander un ramassage · Aucun ramassage demandé pour l’instant. · Demandé le {date} · {n} colis · Prévu le {jour} · {créneau} · {prénom}                                                                                                                                                                                                                                                           |
| web `pickups-screen` — détail                | Ramassage · Adresse · Demandé le · Prévu le · Colis · {n} ramassés sur {m} · Note · Ramassé · Non ramassé                                                                                                                                                                                                                                                                                          |
| web `pickups-screen` — annulation            | Annuler le ramassage · Le ramassage est annulé, sans frais. Les colis restent chez vous, prêts pour une prochaine demande. · Garder le ramassage                                                                                                                                                                                                                                                   |
| web `pickup-request-form`                    | Adresse de ramassage · Nouvelle adresse · Elle est enregistrée dans votre profil et proposée la prochaine fois. · Colis à ramasser · Choisir les colis prêts · Indiquer seulement le nombre · Nombre de colis · Aucun colis créé en attente de ramassage. · {n} colis choisis · Créneau · Note pour le ramasseur (facultatif) · Demander le ramassage                                              |
| web `ramassages/nouveau` — refus             | Consultation en lecture seule : aucun ramassage ne peut être demandé. · Votre compte est suspendu : vous ne pouvez pas demander de ramassage.                                                                                                                                                                                                                                                      |
| web `pickup-address-fields`                  | Adresse · Repère (facultatif) · Nom de l’adresse (facultatif, ex. Entrepôt)                                                                                                                                                                                                                                                                                                                        |
| `pickupRequestSchema`, `pickupAddressSchema` | Choisissez un créneau · Choisissez une adresse de ramassage · Choisissez les colis à ramasser, ou indiquez leur nombre · Au moins 1 colis · Nombre entier · 500 colis au maximum · 300 caractères maximum · 60 caractères maximum · Adresse obligatoire                                                                                                                                            |
| `PICKUP_MESSAGES`                            | Ramassage introuvable. · Adresse introuvable. · Cette adresse a été remplacée : choisissez-en une autre. · Un ramassage est déjà demandé à cette adresse : attendez qu’il soit effectué, ou annulez-le. · Colis déjà ramassé, annulé, inconnu ou déjà dans un ramassage : {codes} · Ce ramassage ne peut plus être annulé. · Votre compte est suspendu : vous ne pouvez pas demander de ramassage. |
| web `profile-screen` — boutique              | Profil · Boutique et contact · Boutique · Catégorie de produits · Lien de la boutique · Personne de contact · Téléphone · Email (identifiant de connexion) · Statut · Retenue à la source de {taux} % sur chaque paiement, après les frais Faffa Go. · Pour modifier ces informations ou votre mot de passe, contactez Faffa Go.                                                                   |
| web `profile-screen` — tarifs                | Tarifs · Frais de livraison · Frais de retour · Changement de client · Ramassage · {frais} en dessous de {n} colis, gratuit à partir de {n} · Les mêmes pour tous les vendeurs.                                                                                                                                                                                                                    |
| web `profile-screen` — adresses              | Adresses de ramassage · Ajouter une adresse · Aucune adresse : elle est demandée à votre premier ramassage. · Par défaut · Choisir par défaut · Modifier · Modifier l’adresse · Les ramassages déjà demandés gardent l’ancienne adresse. · Annuler · Enregistrer                                                                                                                                   |

## Tableau de bord (phase 4, étape 7, D-48)

| Key                                      | Français                                                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `DASHBOARD_TILE_LABELS_FR` (Vendeur 4.1) | Créés · Ramassés · En livraison · Livrés · Échecs · Reportés                                                                    |
| `DASHBOARD_PERIOD_LABELS_FR` (D-48)      | Aujourd’hui · Hier · 7 derniers jours · Ce mois · Période personnalisée                                                         |
| `dashboardTitle` — période personnalisée | Du {JJ/MM/AAAA} au {JJ/MM/AAAA} · Le {JJ/MM/AAAA}                                                                               |
| web `seller-dashboard-screen` — période  | Du · Au · Afficher · Période invalide ({raison}) : aujourd’hui est affiché. · Période inconnue                                  |
| web `seller-dashboard-screen` — suspendu | Votre compte est suspendu : vous ne pouvez pas créer de colis ni demander de ramassage.                                         |
| `dashboardQuerySchema`                   | Date invalide · Indiquez la date de début et la date de fin · La date de début doit précéder la date de fin · 366 jours au plus |

"Reportés" is the tile of D-9 postponements, added with D-48; the other five
tile labels are Vendeur 4.1's list, capitalised.

## Paramètres › Zones (`/admin/parametres/zones`, D-51)

| Key                                       | Français                                                                                     |
| ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| web `parametres-tabs`                     | Zones · Géographie                                                                           |
| web `zones-screen` — aide                 | Les délégations changent de zone dans l’onglet Géographie.                                   |
| web `zones-screen` — boutons              | Créer une zone · Renommer · Désactiver · Réactiver · Enregistrer les coursiers               |
| web `zones-screen` — champs               | Nom de la zone · Livreur titulaire · Livreur backup · Ramasseur titulaire · Ramasseur backup |
| web `zones-screen` — choix vide, états    | Personne · Aucune délégation · Désactivée · Enregistré · {nom} (ne reçoit plus de travail)   |
| web `zones-screen` — dialogue             | Renommer la zone                                                                             |
| `ZONE_ASSIGNMENT_KIND_LABELS_FR`          | Titulaire · Backup                                                                           |
| `SAME_TITULAR_AND_BACKUP_MESSAGE`         | Le titulaire et le backup doivent être deux personnes différentes                            |
| API `ZONE_EXISTE`                         | Une zone s’appelle déjà « {nom} ».                                                           |
| API `ZONE_INACTIVE`                       | Cette zone est désactivée : réactivez-la d’abord.                                            |
| API `ZONE_NON_VIDE`                       | Cette zone contient encore {n} délégation(s) : déplacez-les d’abord vers une autre zone.     |
| API `AFFECTATION_ROLE_INCORRECT`          | Ce compte n’est pas un livreur. · …pas un ramasseur.                                         |
| API `COURSIER_INDISPONIBLE` (affectation) | {prénom nom} ne reçoit plus de nouveau travail : il ne peut pas être affecté.                |
| `SANS_ZONE_LABEL`, `SANS_COURSIER_LABEL`  | Sans zone · Sans coursier                                                                    |

## Paramètres › Géographie (`/admin/parametres/geographie`, D-17, D-51)

| Key                                               | Français                                                                                                                |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| web `geography-screen` — lien                     | Colis classés sous Autre · Localités ({n}) · ← Géographie                                                               |
| web `geography-screen` — colonnes                 | Délégation · Nom en arabe · Zone · Localités                                                                            |
| web `geography-screen` — dialogue                 | Modifier {nom} · Nom en français · Nom en arabe                                                                         |
| web `localites-screen` — colonnes                 | Localité · Nom en arabe · Code postal · Autres noms                                                                     |
| web `localites-screen` — boutons, champ           | Ajouter une localité · Modifier · Désactiver · Réactiver · Autres noms (séparés par des virgules)                       |
| web `geographie/autre` — page                     | Les 200 plus récents. Ajoutez les localités qui manquent dans la délégation concernée. · Aucun colis classé sous Autre. |
| web `geographie/autre` — colonnes                 | Colis · Délégation · Adresse · Vendeur · Statut · Créé le                                                               |
| API `GOUVERNORAT_EXISTE`                          | Un gouvernorat s’appelle déjà « {nom} ».                                                                                |
| API `DELEGATION_EXISTE`                           | Ce gouvernorat a déjà une délégation « {nom} ».                                                                         |
| API `GOUVERNORAT_INTROUVABLE`, `ZONE_INTROUVABLE` | Gouvernorat introuvable. · Zone introuvable.                                                                            |

## Coursiers — Absences (`/admin/coursiers`, D-52)

| Key                                               | Français                                                                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| web `couriers-screen`                             | Absences · Absent aujourd’hui                                                                                            |
| web `courier-absences-dialog` — titre, liste      | Absences de {prénom nom} · Absences prévues · Aucune absence prévue. · Chargement… · Retirer                             |
| web `courier-absences-dialog` — formulaire        | Jour · Motif (facultatif) · Marquer absent · Fermer · Ce jour-là, ses zones passent à leur backup.                       |
| web `courier-absences-dialog` — résultat          | Absent le {JJ/MM/AAAA}. · {boutique} : ramassage confié à {prénom} · {boutique} : aucun backup disponible, à replanifier |
| API `ABSENCE_EXISTE`                              | Ce coursier est déjà marqué absent ce jour-là.                                                                           |
| API `ABSENCE_DATE_PASSEE`                         | Choisissez aujourd’hui ou un jour à venir.                                                                               |
| API `ABSENCE_INTROUVABLE`, `COURSIER_INTROUVABLE` | Aucune absence ce jour-là. · Coursier introuvable.                                                                       |

## Scan (`/admin/scan`, Admin 4.2, D-50, D-53)

Mode names and the refusal messages "Colis déjà livré", "Mauvais mode", "Colis d'un autre coursier", "Code inconnu" are the spec's.

| Key                                                       | Français                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| web `admin-nav`                                           | Scan                                                                                                                                                                                                                                                                                     |
| web `scan-station` — champs                               | Coursier · Choisir… · Code du colis                                                                                                                                                                                                                                                      |
| web `scan-station` — aide                                 | Douchette : scannez directement. Étiquette abîmée : tapez le code puis Entrée (saisie manuelle, signalée).                                                                                                                                                                               |
| web `scan-station` — caméra                               | Activer la caméra · Arrêter la caméra                                                                                                                                                                                                                                                    |
| web `scan-station` — résultat                             | {statut} · {lieu} · Coursier : {prénom nom} · Prévu pour {prénom nom} · Saisie manuelle signalée · Touchez l’écran pour fermer                                                                                                                                                           |
| web `scan-station` — liste                                | Derniers scans · Annulé · Annuler le dernier scan                                                                                                                                                                                                                                        |
| `ScanCancelRefusal` (D-54)                                | Scan introuvable · Ce scan a été refusé : il n’a rien changé · Seule la personne qui a scanné peut annuler ce scan · Seul votre dernier scan peut être annulé · Délai d’annulation dépassé : seul l’admin peut corriger · Le colis a changé depuis ce scan : il ne peut plus être annulé |
| API — annulation réussie                                  | Scan annulé · {statut} · {lieu}                                                                                                                                                                                                                                                          |
| web `camera-scanner`                                      | Caméra indisponible : autorisez la caméra, ou utilisez la douchette.                                                                                                                                                                                                                     |
| `SCAN_REFUSAL_MESSAGES_FR.COURSIER_INDISPONIBLE`          | Coursier indisponible : absent, inactif ou ne reçoit plus de travail                                                                                                                                                                                                                     |
| `SCAN_REFUSAL_MESSAGES_FR.SCAN_ID_REUTILISE`              | Identifiant de scan déjà utilisé pour un autre scan                                                                                                                                                                                                                                      |
| `SCAN_REFUSAL_MESSAGES_FR.COLIS_PAS_AU_DEPOT` (phase 3)   | Le colis n'est pas au dépôt                                                                                                                                                                                                                                                              |
| `SCAN_REFUSAL_MESSAGES_FR.COURSIER_NON_PRECISE` (phase 3) | Choisissez un coursier avant de scanner                                                                                                                                                                                                                                                  |

## Tournées (`/admin/tournees`, Admin 4.5, D-55)

| Key                                 | Français                                                                                                                                     |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| web `admin-nav`                     | Tournées                                                                                                                                     |
| web `tournees-screen` — titre, vide | Tournées du {JJ/MM/AAAA} · Aucun colis à sortir aujourd’hui.                                                                                 |
| web `tournees-screen` — charge      | Charge par livreur · {prénom nom} : {n} · Sans coursier : {n}                                                                                |
| web `tournees-screen` — colonne     | {prénom nom} · titulaire / backup · Tout · {localité}, {délégation} · {boutique} · Relancé · {créneau} · tentative {n} · → {prénom nom}      |
| web `tournees-screen` — sélection   | 1 colis sélectionné · {n} colis sélectionnés · Livreur · Choisir… · Déplacer · Remettre selon la zone · 1 colis déplacé · {n} colis déplacés |
| API `COLIS_HORS_TOURNEE`            | Colis pas au dépôt en attente d’une tournée : {codes}.                                                                                       |
| web `couriers-screen`               | Aujourd’hui : {n} en main · {n} prévus en tournée                                                                                            |

## Ramassages, équipe (`/admin/ramassages`, Admin 4.4, D-58)

| Key                                | Français                                                                                                                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| web `admin-nav`                    | Ramassages                                                                                                                                                                                                    |
| web `ramassages-screen` — onglets  | Demandés · Planifiés · Effectués · Annulés                                                                                                                                                                    |
| web `ramassages-screen` — carte    | {n} colis · créneau demandé : {créneau} · Planifié le {JJ/MM/AAAA} · {créneau} · {prénom nom} · Ramasseur de la zone aujourd’hui : {prénom nom} / aucun · Détail · Planifier · Replanifier · Aucun ramassage. |
| web `ramassages-screen` — dialogue | Planifier le ramassage · Jour · Créneau · Ramasseur · Choisir… · Titulaire de la zone ce jour-là · Backup de la zone ce jour-là · Aucun ramasseur de la zone ce jour-là · Fermer                              |
| web `ramassages-screen` — détail   | ← Ramassages · Colis annoncés · À ramasser · Ramassé · Le vendeur a indiqué {n} colis, sans les lister. · À emporter · {n} colis · Rien à emporter pour ce vendeur.                                           |
| API `RAMASSAGE_NON_PLANIFIABLE`    | Ce ramassage est effectué ou annulé : il ne peut plus être planifié.                                                                                                                                          |
| API `DATE_PASSEE`                  | Choisissez aujourd’hui ou un jour à venir.                                                                                                                                                                    |
| `planPickupSchema`                 | Date invalide · Choisissez un créneau · Choisissez un ramasseur                                                                                                                                               |

## Colis, équipe (`/admin/colis`, Admin 4.3)

| Key                             | Français                                                                                                                                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| web `admin-nav`                 | Colis                                                                                                                                                                                                                                             |
| web `colis-screen` — filtres    | Recherche · Code, client, téléphone ou boutique · Statut · Paiement · Vendeur · Livreur · Zone · Tous · Toutes · Créé du · au · Rechercher · Effacer · Exporter                                                                                   |
| web `colis-screen` — liste      | Colis · Vendeur · Destinataire · Lieu · Statut · Montant · Livreur · {n} colis · page {n} sur {n} · Page précédente · Page suivante · Aucun colis.                                                                                                |
| web `colis-screen` — détail     | ← Colis · Réimprimer l’étiquette · Destinataire · Colis · Argent · Vendeur : · {n} pièce(s) · Échange · Ouverture autorisée · Note : · Avec : · Prévu pour : · Tentative {n} · Décision du vendeur avant le {date} · Relancé pour le {JJ/MM/AAAA} |
| web `colis-screen` — argent     | Montant COD · Frais de livraison · Frais de retour · Changement de client · Tarif livreur · Argent · Bon de versement                                                                                                                             |
| web `colis-screen` — journal    | Journal du colis · Règle automatique · Après ramassage · Prévu pour {nom} · GPS {lat}, {lng} (± {n} m) · Heure du téléphone : · Saisie manuelle · Scan annulé · Horloge décalée                                                                   |
| `CHARGE_STATUS_LABELS_FR`       | En attente · Déduite · Annulée                                                                                                                                                                                                                    |
| `SCAN_SOURCE_LABELS_FR`         | Application coursier · Caméra · Douchette · Saisie manuelle                                                                                                                                                                                       |
| API `EXPORT_TROP_GRAND` (Colis) | {n} colis : 10000 au maximum par export. Choisissez des filtres.                                                                                                                                                                                  |
| web `seller-detail-screen`      | Voir ses colis                                                                                                                                                                                                                                    |

## Demandes de modification, équipe (Colis, D-57)

| Key                                                   | Français                                                                                                                                                                                                                                                             |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| web `change-requests-panel`                           | Demandes de modification · {champ} : {avant} → {après} · « {note du vendeur} » · Raison : {raison} · Appliquer · Refuser                                                                                                                                             |
| web `change-requests-panel` — dialogue                | Refuser la demande · Le vendeur lira cette raison. · Raison · Fermer · Refuser                                                                                                                                                                                       |
| `CHANGE_REQUEST_APPLY_MESSAGES_FR`                    | Cette demande a déjà été traitée. · Le colis n’accepte plus de modification : livré, annulé ou en retour. Refusez la demande. · Nouvelle localité : la demande s’applique quand le colis est au dépôt. · La localité demandée a été désactivée : refusez la demande. |
| `refuseChangeRequestSchema`                           | Indiquez la raison                                                                                                                                                                                                                                                   |
| API `DEMANDE_INTROUVABLE`                             | Demande de modification introuvable.                                                                                                                                                                                                                                 |
| `PARCEL_EVENT_LABELS_FR.MODIFICATION_APPLIQUEE`       | Modification appliquée                                                                                                                                                                                                                                               |
| web `colis-screen`, `tournees-screen`, `scan-station` | Étiquette à réimprimer · Étiquette à réimprimer : une modification a changé ce qui est imprimé.                                                                                                                                                                      |
| web `parcel-screen` (vendeur)                         | Raison du refus : {raison}                                                                                                                                                                                                                                           |

## Forcer un statut (Colis, D-56)

"Forcer un statut" is the spec's label.

| Key                                           | Français                                                                                                                                                                                                                                  |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| web `forcage` — dialogue                      | Seulement pour corriger une erreur de scan. La correction et sa raison sont enregistrées dans le journal d’audit. · Nouvel état · Choisir… · {statut} · {lieu} · Livreur · Raison · Fermer · Corriger · Choisissez le nouvel état         |
| web `forcage` — aucun choix                   | Aucune correction de statut possible pour ce colis.                                                                                                                                                                                       |
| web `forcage` — scan                          | Annuler ce scan · Le colis revient à son état d’avant le scan. La raison est enregistrée dans le journal d’audit. · Annuler le scan                                                                                                       |
| `FORCAGE_MESSAGES_FR`                         | Cette correction n’est pas possible ici : seuls Ramassé, Au dépôt et En livraison, ou le lieu d’un colis À vérifier, Relancé ou Retour au dépôt, se corrigent. · Le colis est déjà dans cet état. · Choisissez le livreur qui a le colis. |
| `forcerStatutSchema`, `adminScanCancelSchema` | Indiquez la raison de la correction                                                                                                                                                                                                       |

## Exceptions (`/admin/exceptions`, Admin 4.7, D-50)

| Key                        | Français                                                                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| web `admin-nav`            | Exceptions                                                                                                                                                                      |
| `EXCEPTION_KIND_LABELS_FR` | Colis au dépôt depuis plus de 48 h sans tournée · Ramassage planifié non effectué · Demande de modification du vendeur en attente · Saisie manuelle du code                     |
| web `exceptions-screen`    | {libellé} ({n}) · Rien à signaler. · Au dépôt depuis le {date} · prévu le {JJ/MM/AAAA} · Assigner · Replanifier · Appliquer / refuser · Voir la demande · Code inconnu · refusé |

## Libellés sans équivalent dans les specs (`packages/shared`)

| Key                                 | Français                                                                                             |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `PARCEL_LOCATION_LABELS_FR` (D-1)   | Chez le vendeur · Avec le ramasseur · Au dépôt · Avec le livreur · Chez le client · Rendu au vendeur |
| `BON_STATUS_LABELS_FR.ANNULE` (A-5) | Annulé                                                                                               |
| `CHARGE_TYPE_LABELS_FR` (D-2)       | Frais de livraison · Frais de retour · Changement de client · Frais de ramassage                     |
| `CHAT_THREAD_STATE_LABELS_FR` (Q15) | Ouvert · Lecture seule · Clos                                                                        |

## Application coursier (`apps/courier/src/i18n/messages.ts`, phase 6)

The whole app, in both languages. **The Arabic must be read by a native
speaker before launch.** The French texts the specs word (Livreur, Ramasseur,
Ma journée, Ma tournée, Livré, Échec, Terminer le ramassage, Annuler le dernier
scan, "3 scans en attente d'envoi", Déjà livré ici…) are listed too, so the
Arabic can be checked against them. Statuses, failure reasons, slots, pay
plans and the API's refusals have their Arabic in the same file
(`STATUS_AR`, `FAILURE_REASON_AR`, `REFUSAL_AR`…).

| Key                  | Français                                                                                             | العربية                                                             |
| -------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `appName`            | Faffa Go Coursier                                                                                    | فافا قو - الموزّعون                                                 |
| `loginTitle`         | Connexion                                                                                            | تسجيل الدخول                                                        |
| `loginSteps`         | 1 · Livreur ou Ramasseur › 2 · Téléphone › 3 · Mot de passe                                          | ١ · موزّع أو جامع طرود › ٢ · الهاتف › ٣ · كلمة السرّ                |
| `roleLivreur`        | Livreur                                                                                              | موزّع                                                               |
| `roleRamasseur`      | Ramasseur                                                                                            | جامع طرود                                                           |
| `phone`              | Téléphone                                                                                            | رقم الهاتف                                                          |
| `password`           | Mot de passe                                                                                         | كلمة السرّ                                                          |
| `login`              | Se connecter                                                                                         | تسجيل الدخول                                                        |
| `chooseRoleFirst`    | Choisissez Livreur ou Ramasseur                                                                      | اختر موزّع أو جامع طرود                                             |
| `networkError`       | Pas de connexion. Réessayez quand le réseau revient.                                                 | لا يوجد اتصال. أعد المحاولة عند عودة الشبكة.                        |
| `sessionExpired`     | Session expirée : reconnectez-vous. Vos scans en attente sont conservés.                             | انتهت الجلسة: سجّل الدخول من جديد. عمليات المسح غير المرسلة محفوظة. |
| `pinCreate`          | Choisissez un code PIN à 4 chiffres                                                                  | اختر رمزًا سريًا من 4 أرقام                                         |
| `pinConfirm`         | Confirmez le code PIN                                                                                | أكّد الرمز السري                                                    |
| `pinEnter`           | Entrez votre code PIN                                                                                | أدخل رمزك السري                                                     |
| `pinMismatch`        | Les deux codes ne sont pas identiques                                                                | الرمزان غير متطابقين                                                |
| `pinWrong`           | Code PIN incorrect                                                                                   | الرمز السري غير صحيح                                                |
| `pinForgotten`       | Code PIN oublié ? Se déconnecter                                                                     | نسيت الرمز؟ تسجيل الخروج                                            |
| `erase`              | Effacer                                                                                              | مسح                                                                 |
| `locationNeeded`     | La position du téléphone est enregistrée avec chaque scan. Autorisez la localisation pour continuer. | يُسجَّل موقع الهاتف مع كل عملية مسح. اسمح بتحديد الموقع للمتابعة.   |
| `allow`              | Autoriser                                                                                            | السماح                                                              |
| `openSettings`       | Ouvrir les réglages                                                                                  | فتح الإعدادات                                                       |
| `updateTitle`        | Mise à jour obligatoire                                                                              | تحديث إجباري                                                        |
| `updateSending`      | Envoi des scans en attente avant la mise à jour : {count} restant(s).                                | إرسال عمليات المسح المعلّقة قبل التحديث: بقي {count}.               |
| `updateInstall`      | Installez la nouvelle version de l’application pour continuer.                                       | ثبّت النسخة الجديدة من التطبيق للمتابعة.                            |
| `tabJournee`         | Journée                                                                                              | اليوم                                                               |
| `tabTournee`         | Tournée                                                                                              | الجولة                                                              |
| `tabScanner`         | Scanner                                                                                              | مسح                                                                 |
| `tabRamassages`      | Ramassages                                                                                           | الاستلام                                                            |
| `tabCaisse`          | Caisse                                                                                               | الصندوق                                                             |
| `tabMenu`            | Menu                                                                                                 | القائمة                                                             |
| `pendingScans`       | {count} scans en attente d’envoi                                                                     | {count} عمليات مسح في انتظار الإرسال                                |
| `offline`            | Hors ligne                                                                                           | غير متصل                                                            |
| `refusedScans`       | Scans refusés                                                                                        | عمليات مسح مرفوضة                                                   |
| `maJournee`          | Ma journée                                                                                           | يومي                                                                |
| `aLivrer`            | À livrer                                                                                             | للتوصيل                                                             |
| `ramassages`         | Ramassages                                                                                           | الاستلام                                                            |
| `bonsEtRetours`      | Bons et retours                                                                                      | الوصولات والمرتجعات                                                 |
| `cashPorte`          | Cash porté                                                                                           | النقود المحمولة                                                     |
| `progress`           | {done} faits sur {total}                                                                             | {done} من {total}                                                   |
| `avantDeRentrer`     | Avant de rentrer                                                                                     | قبل العودة                                                          |
| `toBringBackCount`   | {count} colis à rapporter au dépôt                                                                   | {count} طرود يجب إرجاعها إلى المستودع                               |
| `cashToHandIn`       | Cash à remettre : {amount}                                                                           | نقود يجب تسليمها: {amount}                                          |
| `nothingOpen`        | Rien d’ouvert : bonne soirée.                                                                        | لا شيء معلّق: مساء الخير.                                           |
| `refresh`            | Actualiser                                                                                           | تحديث                                                               |
| `lastUpdate`         | Mis à jour à {time}                                                                                  | آخر تحديث {time}                                                    |
| `maTournee`          | Ma tournée                                                                                           | جولتي                                                               |
| `noStops`            | Aucun colis à livrer.                                                                                | لا توجد طرود للتوصيل.                                               |
| `attempt`            | Tentative {n}/{m}                                                                                    | المحاولة {n}/{m}                                                    |
| `exchange`           | Échange                                                                                              | استبدال                                                             |
| `openingAllowed`     | Ouverture autorisée                                                                                  | مسموح بالفتح                                                        |
| `deliveredHere`      | Déjà livré ici                                                                                       | سبق التوصيل هنا                                                     |
| `call`               | Appeler                                                                                              | اتصال                                                               |
| `callPhone2`         | Appeler le 2e numéro                                                                                 | الاتصال بالرقم الثاني                                               |
| `callSeller`         | Appeler le vendeur                                                                                   | الاتصال بالبائع                                                     |
| `whatsapp`           | WhatsApp                                                                                             | واتساب                                                              |
| `scan`               | Scanner                                                                                              | مسح                                                                 |
| `moveUp`             | Monter                                                                                               | إلى الأعلى                                                          |
| `moveDown`           | Descendre                                                                                            | إلى الأسفل                                                          |
| `postponedTo`        | Reporté au {date}                                                                                    | مؤجّل إلى {date}                                                    |
| `relaunchedTo`       | Relancé pour le {date}                                                                               | أُعيد إرساله ليوم {date}                                            |
| `sellerNote`         | Note du vendeur                                                                                      | ملاحظة البائع                                                       |
| `landmark`           | Repère                                                                                               | معلم                                                                |
| `meetingPoint`       | Point de rendez-vous                                                                                 | نقطة اللقاء                                                         |
| `addressNote`        | Note d’adresse                                                                                       | ملاحظة العنوان                                                      |
| `saveMeetingPoint`   | Enregistrer le point de rendez-vous                                                                  | حفظ نقطة اللقاء                                                     |
| `meetingPointSaved`  | Point de rendez-vous enregistré                                                                      | تم حفظ نقطة اللقاء                                                  |
| `retourAuDepot`      | Retour au dépôt                                                                                      | الإرجاع إلى المستودع                                                |
| `bringBackTonight`   | À rapporter au dépôt ce soir                                                                         | يجب إرجاعها إلى المستودع هذا المساء                                 |
| `nothingToBringBack` | Aucun colis à rapporter.                                                                             | لا توجد طرود للإرجاع.                                               |
| `scanTitle`          | Scannez l’étiquette                                                                                  | امسح الملصق                                                         |
| `typeCode`           | Saisir le code                                                                                       | إدخال الرمز                                                         |
| `typeCodeHint`       | Étiquette abîmée : tapez le code du colis (signalé à l’admin)                                        | ملصق تالف: اكتب رمز الطرد (يُبلَّغ به المشرف)                       |
| `parcelCode`         | Code du colis                                                                                        | رمز الطرد                                                           |
| `validate`           | Valider                                                                                              | تأكيد                                                               |
| `cameraNeeded`       | Autorisez la caméra pour scanner les étiquettes.                                                     | اسمح باستعمال الكاميرا لمسح الملصقات.                               |
| `notInTour`          | Ce colis n’est pas dans votre tournée.                                                               | هذا الطرد ليس في جولتك.                                             |
| `unreadableCode`     | Code illisible : ce n’est pas une étiquette Faffa Go.                                                | رمز غير مقروء: ليس ملصق فافا قو.                                    |
| `alreadyScanned`     | Déjà scanné — {action} à {time}                                                                      | تم مسحه من قبل — {action} على الساعة {time}                         |
| `choosePickupFirst`  | Ouvrez d’abord un ramassage pour y scanner les colis.                                                | افتح عملية استلام أولًا لمسح طرودها.                                |
| `livre`              | Livré                                                                                                | تم التسليم                                                          |
| `echec`              | Échec                                                                                                | فشل                                                                 |
| `amountToCollect`    | Montant à encaisser                                                                                  | المبلغ الواجب تحصيله                                                |
| `confirmAmount`      | J’ai encaissé exactement {amount}                                                                    | حصّلت بالضبط {amount}                                               |
| `confirmExchange`    | J’ai récupéré l’ancien article                                                                       | استرجعت القطعة القديمة                                              |
| `confirmDelivery`    | Confirmer la livraison                                                                               | تأكيد التسليم                                                       |
| `chooseReason`       | Choisissez le motif                                                                                  | اختر السبب                                                          |
| `postponeDate`       | Date demandée par le client                                                                          | التاريخ الذي طلبه الحريف                                            |
| `slotOptional`       | Créneau (facultatif)                                                                                 | الفترة (اختياري)                                                    |
| `noteOptional`       | Note (facultatif)                                                                                    | ملاحظة (اختياري)                                                    |
| `confirmFailure`     | Confirmer l’échec                                                                                    | تأكيد الفشل                                                         |
| `back`               | Retour                                                                                               | رجوع                                                                |
| `close`              | Fermer                                                                                               | إغلاق                                                               |
| `scanSaved`          | Scan enregistré                                                                                      | تم تسجيل المسح                                                      |
| `scanQueued`         | Scan enregistré : il partira dès qu’il y a du réseau                                                 | تم تسجيل المسح: سيُرسل عند توفّر الشبكة                             |
| `cancelLastScan`     | Annuler le dernier scan                                                                              | إلغاء آخر مسح                                                       |
| `scanCancelled`      | Scan annulé                                                                                          | تم إلغاء المسح                                                      |
| `cancelTooLate`      | Délai d’annulation dépassé : seul l’admin peut corriger                                              | انتهت مهلة الإلغاء: المشرف وحده يمكنه التصحيح                       |
| `addressNoteHint`    | Immeuble, étage, porte… pour le prochain livreur                                                     | العمارة، الطابق، الباب… للموزّع القادم                              |
| `saveNote`           | Enregistrer la note                                                                                  | حفظ الملاحظة                                                        |
| `noteSaved`          | Note d’adresse enregistrée                                                                           | تم حفظ ملاحظة العنوان                                               |
| `maCaisse`           | Ma caisse                                                                                            | صندوقي                                                              |
| `aRemettre`          | À remettre ce soir                                                                                   | للتسليم هذا المساء                                                  |
| `ofWhichPending`     | dont {amount} en attente d’envoi                                                                     | منها {amount} في انتظار الإرسال                                     |
| `nothingToHandIn`    | Rien à remettre pour le moment.                                                                      | لا شيء للتسليم حاليًا.                                              |
| `mesRamassages`      | Mes ramassages                                                                                       | عمليات الاستلام                                                     |
| `noPickups`          | Aucun ramassage prévu.                                                                               | لا توجد عمليات استلام مبرمجة.                                       |
| `doneToday`          | Terminés aujourd’hui                                                                                 | المنتهية اليوم                                                      |
| `contact`            | Contact : {name}                                                                                     | المسؤول: {name}                                                     |
| `cashOnlyToContact`  | Argent et retours uniquement à cette personne. Vous pouvez vérifier sa CIN.                          | النقود والمرتجعات لهذا الشخص فقط. يمكنك التثبّت من بطاقة تعريفه.    |
| `expected`           | Attendus                                                                                             | المنتظرة                                                            |
| `scanned`            | Scannés                                                                                              | الممسوحة                                                            |
| `missing`            | Pas encore scannés                                                                                   | لم تُمسح بعد                                                        |
| `extra`              | En plus de la demande                                                                                | زيادة على الطلب                                                     |
| `declared`           | {count} colis annoncés                                                                               | {count} طرود معلن عنها                                              |
| `scanParcels`        | Scanner les colis                                                                                    | مسح الطرود                                                          |
| `finishPickup`       | Terminer le ramassage                                                                                | إنهاء الاستلام                                                      |
| `finishConfirm`      | Terminer avec {count} colis scanné(s) ?                                                              | إنهاء بـ {count} طرد ممسوح؟                                         |
| `finishFee`          | Moins de 5 colis : frais de ramassage pour le vendeur.                                               | أقل من 5 طرود: معلوم استلام على البائع.                             |
| `finishNone`         | Aucun colis : le ramassage sera clôturé sans frais.                                                  | لا طرود: سيُغلق الاستلام بدون معلوم.                                |
| `confirm`            | Confirmer                                                                                            | تأكيد                                                               |
| `aEmporterNone`      | À emporter : rien                                                                                    | للحمل: لا شيء                                                       |
| `planned`            | Prévu le {date}                                                                                      | مبرمج يوم {date}                                                    |
| `menu`               | Menu                                                                                                 | القائمة                                                             |
| `profil`             | Profil                                                                                               | الملف الشخصي                                                        |
| `role`               | Rôle                                                                                                 | الدور                                                               |
| `zones`              | Zones                                                                                                | المناطق                                                             |
| `payPlan`            | Plan de paie                                                                                         | نظام الخلاص                                                         |
| `payPlanChange`      | Pour changer de plan de paie, demandez-le à l’admin.                                                 | لتغيير نظام الخلاص، اطلب ذلك من المشرف.                             |
| `language`           | Langue                                                                                               | اللغة                                                               |
| `french`             | Français                                                                                             | Français                                                            |
| `arabic`             | العربية                                                                                              | العربية                                                             |
| `changePin`          | Changer le code PIN                                                                                  | تغيير الرمز السري                                                   |
| `passwordAdminOnly`  | Le mot de passe ne se change que par l’admin.                                                        | كلمة السرّ لا يغيّرها إلا المشرف.                                   |
| `logout`             | Se déconnecter                                                                                       | تسجيل الخروج                                                        |
| `logoutPending`      | Il reste {count} scan(s) à envoyer : ils seront envoyés à votre prochaine connexion.                 | بقي {count} مسح للإرسال: سيُرسل عند دخولك القادم.                   |
| `appVersion`         | Version {version}                                                                                    | النسخة {version}                                                    |
| `noZone`             | Aucune zone                                                                                          | لا توجد منطقة                                                       |

### Written by the API or the web for phase 6

| Key                                   | Français                                                                                                                                                                                                                                  |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API, Terminer le ramassage            | Ramassage terminé : {n} colis, frais de ramassage {montant} · Ramassage terminé : {n} colis · Ramassage clôturé sans colis : aucun frais                                                                                                  |
| API, note d'adresse                   | Mémoire d’adresse enregistrée                                                                                                                                                                                                             |
| `COURIER_OPERATION_ERROR_MESSAGES_FR` | Opération illisible : elle a été retirée de la file · Identifiant déjà utilisé par une autre opération · Écrivez une note ou un point de rendez-vous · La note d’adresse s’enregistre après une livraison réussie                         |
| `SCAN_REFUSAL_MESSAGES_FR`, phase 6   | Ramassage introuvable, ou confié à un autre ramasseur · Ce ramassage est déjà terminé · Ce colis appartient à un autre vendeur · Le montant encaissé doit être exactement le COD du colis · Confirmez que l’ancien article a été récupéré |
| `SCAN_CANCEL_REFUSAL_MESSAGES_FR`     | Ramassage terminé : ce scan ne peut plus être annulé                                                                                                                                                                                      |
| `SCAN_ACTION_LABELS_FR`               | Ramassage · Entrée dépôt · Sortie coursier · Livré · Échec · Retour de tournée · Préparation retours · Retour reçu · Bon de versement remis · Archivage bon                                                                               |
| web Colis, journal (D-63)             | Sans position                                                                                                                                                                                                                             |
| web Colis, destinataire               | Mémoire d’adresse · Point de rendez-vous : {texte}                                                                                                                                                                                        |
| web Exceptions (D-59)                 | Marquer comme traité                                                                                                                                                                                                                      |
| app.json, permissions                 | La caméra sert à scanner les étiquettes des colis. · La position est enregistrée avec chaque scan.                                                                                                                                        |

## Terminal (équipe technique uniquement)

`admin:reset`, `db:seed`, `db:seed:demo` and `documents:verify` print short French messages
("Mot de passe régénéré. Il ne sera plus affiché.", "Comptes de
démonstration…", "Aucun admin : lancez d'abord…"). They are never shown to a
seller, a courier or the team in the app, and are listed only for completeness.
