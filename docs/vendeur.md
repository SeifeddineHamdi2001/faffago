# Faffa Go — Interface Vendeur (spécification v1.7)

> **How to read this document.** Screen names, buttons and statuses are written in French, exactly as the seller will see them in the interface. Explanations are in English. Section 8 records the decisions taken during the design discussion.

## 1. Purpose and core principles

The seller interface is where online sellers create parcels, follow them, act on failed deliveries, talk to the courier about a parcel, and see exactly what money and returns Faffa Go owes them. It is a web application, used on desktop and phone.

| Principle                                  | What it means                                                                                                                                                                                 |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Accounts are created by Faffa Go.**      | There is no public sign-up. The admin creates every seller account.                                                                                                                           |
| **Cash only, delivered by the courier.**   | Faffa Go prepares each payment; a courier brings the cash with a bon de versement, and the contact person signs it. No bank transfer, no D17, no payout request button.                       |
| **Same rates for every seller.**           | Delivery fee, return fee and the 1,000 DT change-client fee are identical for all sellers. Sellers registered with CIN only have a 3% retenue à la source withheld on each payment (see 2.4). |
| **Delivered is not the same as paid.**     | Each parcel has a delivery status and, once delivered, a separate cash status. The seller always sees both.                                                                                   |
| **Payment is per parcel.**                 | A payment covers a chosen list of parcels. If some cash is still being counted, only those parcels wait; the rest is paid.                                                                    |
| **A failure is a question, not a return.** | A failed delivery goes to **À vérifier**. It only becomes a return under the rules in section 6.                                                                                              |
| **The seller sees only his own data.**     | Counts, amounts and lists are always filtered to the seller. Depot-wide figures never appear.                                                                                                 |
| **Courier privacy.**                       | The seller only ever sees the courier's first name. No phone number, no photo, no surname.                                                                                                    |

## 2. Access and account

### 2.1 Landing page

The public landing page presents the service and has two entry points:

- **Devenir partenaire** — for new sellers. It opens the Faffa Go contact options: social media (Facebook, Instagram) and phone / WhatsApp. There is no sign-up form.
- **Se connecter** — for existing sellers. Opens the login page (email + password).

_**Mot de passe oublié** — the seller contacts Faffa Go and the admin regenerates the password, which is shown once in the back office and handed over. There is no self-service reset and no SMS reset._

### 2.2 Account creation (by the admin)

The admin creates the account from the back office. The seller only receives a login.

| Information                                                                               | Entered by | Notes                                                                                            |
| ----------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------ |
| Shop name, product category, store link (Facebook / Instagram / site)                     | Admin      | Store link is optional but useful to check the seller is real.                                   |
| Contact person: full name, phone, email                                                   | Admin      | Email is the login identifier. The phone is how the courier reaches the seller.                  |
| Statut: **Patente**, **Auto-entrepreneur** or **CIN uniquement**                          | Admin      | Decides whether the 3% retenue à la source applies (see 2.4).                                    |
| Documents: CIN (front and back) always; patente or auto-entrepreneur card when applicable | Admin      | Uploaded by the admin. Stored privately, visible to admins only.                                 |
| Rates                                                                                     | —          | Not entered per seller. The same rates apply to everyone and are set once in the admin settings. |
| Pickup address                                                                            | Seller     | Not asked at creation. Filled by the seller at his first pickup request (see 4.5).               |

### 2.3 The contact person

The contact person is the person whose CIN (and patente or auto-entrepreneur card) was submitted. This gives one clear rule: **the courier hands cash and returns only to the contact person**, who signs the bon de versement and the bon de retour. The courier may check the CIN at handover.

### 2.4 Seller status and the retenue à la source

| Statut                | Documents                    | Retenue à la source                         |
| --------------------- | ---------------------------- | ------------------------------------------- |
| **Patente**           | CIN + patente                | None                                        |
| **Auto-entrepreneur** | CIN + auto-entrepreneur card | None                                        |
| **CIN uniquement**    | CIN only                     | **3%** of each payment, after Faffa Go fees |

#### How it is calculated in a bon de versement:

| Line                                              | Example        |
| ------------------------------------------------- | -------------- |
| Total COD of the parcels paid                     | 1 000,000 DT   |
| − Faffa Go fees (delivery, return, change-client) | − 84,000 DT    |
| = Base after fees                                 | 916,000 DT     |
| − Retenue à la source 3% (CIN uniquement only)    | − 27,480 DT    |
| **= Net paid in cash**                            | **888,520 DT** |

_Amounts are rounded to the millime. If the seller later provides a patente or auto-entrepreneur card, the admin changes his statut and the retenue stops from the next bon._

> **A tax, not a Faffa Go fee.** The 3% is a retenue à la source: Faffa Go withholds it on behalf of the tax administration and pays it to them. It is shown on its own line, never mixed with Faffa Go fees, and each withholding is backed by a **certificat de retenue à la source** that the seller can download (see 4.11).

### 2.5 Account states

| State        | What the seller can do                                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| **Actif**    | Everything in this document.                                                                                                     |
| **Suspendu** | Set by the admin. The seller can log in and see his parcels, payments and returns, but cannot create parcels or request pickups. |

## 3. Navigation

One top bar on desktop, a bottom bar plus menu on phone. The notification bell and the shop name are always visible.

| Menu item                | Content                                             | Badge        |
| ------------------------ | --------------------------------------------------- | ------------ |
| **Tableau de bord**      | Overview of money, parcels and actions to take      | —            |
| **Colis**                | Mes colis, Créer un colis, Import CSV, Étiquettes   | —            |
| **À vérifier**           | Failed deliveries waiting for the seller's decision | Count        |
| **Ramassages**           | Pickup requests and their history                   | —            |
| **Paiements**            | À recevoir and bons de versement                    | New bons     |
| **Retours**              | Returns at the depot and bons de retour             | New bons     |
| **Notifications** (bell) | In-app notifications                                | Unread count |
| **Profil**               | Shop, contact person, addresses, rates, password    | —            |

## 4. Features

### 4.1 Tableau de bord

The first screen after login. It answers three questions: how much am I owed, what needs my attention, and how are my deliveries going.

- **À recevoir** (hero number): net amount of delivered parcels not yet paid, split into "chez les coursiers" and "au dépôt, prêt à payer".
- **À traiter**: parcels in À vérifier with the time left before automatic return, bons de versement and bons de retour on their way, returns at the depot. Each links to its screen.
- **Aujourd'hui**: the seller's parcels by status (créés, ramassés, en livraison, livrés, échecs).
- **Taux de livraison** over 7 days = livrés ÷ (livrés + retournés) for parcels closed in the period, with a chart showing values and a scale.
- Quick actions: **Créer un colis**, **Demander un ramassage**.

### 4.2 Créer un colis

A fast, keyboard-friendly form. After saving, the seller can print the label immediately.

| Field                               | Required | Rule                                                                                                                                                                                                             |
| ----------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nom du destinataire                 | Yes      |                                                                                                                                                                                                                  |
| Téléphone                           | Yes      | 8 digits, Tunisian format                                                                                                                                                                                        |
| Téléphone 2                         | No       | 8 digits                                                                                                                                                                                                         |
| Gouvernorat / Délégation / Localité | Yes      | Chosen from a fixed list: gouvernorat → délégation → localité, or one search box across localités and their other names. The délégation always comes from the localité; delivery zones depend on it (v1.7, D-17) |
| Adresse                             | Yes      | Free text, with landmark                                                                                                                                                                                         |
| Description du produit              | Yes      | What is inside, e.g. "2 bracelets"                                                                                                                                                                               |
| Nombre de pièces                    | Yes      | Default 1                                                                                                                                                                                                        |
| Montant COD (DT)                    | Yes      | Three decimals. 0 allowed if already paid                                                                                                                                                                        |
| Colis d'échange                     | No       | Toggle. The courier delivers the new item and brings back the old one, which follows the return flow                                                                                                             |
| Ouverture autorisée                 | No       | Toggle. The customer may open the parcel before paying                                                                                                                                                           |
| Note pour le coursier               | No       | e.g. "sonner deux fois"                                                                                                                                                                                          |

### 4.3 Import CSV

- **Télécharger le modèle**: a template file with the exact columns.
- Validation preview before import: each row is **Valide**, **À vérifier** (e.g. localité not recognised) or **Erreur** (e.g. phone too short), with the reason.
- A row whose localité is missing, unknown or ambiguous shows a dropdown with the délégation's localités (Autre last), or the possible localités, so the seller fixes it in the preview without re-uploading the file (v1.7, D-17).
- Only valid rows are imported. The seller can fix the file and re-upload.
- After import: print all labels in one batch.

### 4.4 Étiquettes

Labels are printed by the seller and stuck on each package before pickup. The whole system runs on scanning this label.

- Formats: thermal 100 × 150 mm, and A4 with 4 labels per sheet for sellers without a thermal printer.
- Content: barcode + QR, tracking code (FG-XXXXXX), COD amount in large type, recipient name, phone, localité, délégation and address, seller shop name, flags **Échange** and **Ouverture autorisée**.
- Single or batch printing; reprint anytime.

### 4.5 Ramassages

- **Demander un ramassage**: the seller selects the parcels ready (or states how many), chooses a time window, adds a note.
- **First request only:** the seller fills the pickup address (gouvernorat, délégation, localité, address, landmark). It is saved in the profile and pre-filled next time. The seller can save more than one address.
- Statuses: **Demandé** › **Planifié** › **Effectué**, or **Annulé**.
- **Pickup fee**: free from 5 parcels picked up. Below 5 parcels, a fee of **2,000 DT** applies, counted on the parcels actually scanned by the ramasseur and deducted in the next bon de versement. The request screen shows the rule before the seller confirms ("Moins de 5 colis : ramassage à 2,000 DT").
- At pickup, the courier scans each parcel. The seller sees exactly which parcels were picked up and which were not.

### 4.6 Modifier / annuler un colis

- **Before pickup:** the seller edits or cancels freely.
- **After pickup:** no direct edit. The seller requests a change (phone, address) with **Demander une modification**; Faffa Go applies it. A cancellation after pickup follows the return flow and is charged the return fee.

### 4.7 Mes colis

- Table: code, recipient, délégation, track line, status, cash status, COD, date.
- Filters by status group: En cours, Livrés, À vérifier, Payés / Non payés, Retours. Counts are the seller's own.
- Search by code, name or phone; date range; **Exporter** to CSV.

### 4.8 Détail du colis

Everything about one parcel on a single screen:

Flow: Créé › Ramassé › Au dépôt › En livraison › Livré

- Track line and event timeline (who, when, where). No delivery proof photo.
- Attempts: "Tentative 2 sur 3".
- Money: COD, delivery fee, net, and cash status (chez le coursier / au dépôt / payé, with the bon de versement number).
- **Appels Faffa Go**: only the calls made by the Faffa Go customer service, with time and outcome. The seller's own calls are not logged in the platform.
- **Chat** tab (see 4.10). Courier shown by first name only.
- Contextual actions: print label, request a change, and the À vérifier actions when relevant.

### 4.9 À vérifier

When a delivery fails, the parcel is brought back to the depot and gets the status **À vérifier**, always shown with its reason. The seller calls his customer from his own phone, outside the platform, then records his decision.

#### Reason shown under the status

Only the courier chooses the reason, from a fixed list, when he scans the failure. The seller cannot choose or change it; he sees it read-only, directly under the status, e.g. **À vérifier** · _Ne répond pas_. The seller's own calls to his customer stay outside the platform.

| Reason                | Meaning                                         |
| --------------------- | ----------------------------------------------- |
| Ne répond pas         | The customer did not answer the courier's calls |
| Injoignable           | Phone switched off or number not reachable      |
| Adresse incorrecte    | Address wrong, incomplete or not found          |
| Reporté par le client | The customer asked for another day              |
| Refusé                | The customer refused the parcel at the door     |

#### Seller decisions

| Action                           | What it does                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Relancer**                     | Send the parcel again to the same customer. The seller picks a date / time slot and may correct the phone, address or note. The parcel gets **one** new attempt; free of charge. If it fails again, it comes back to À vérifier.                                                                                                                          |
| **Retourner**                    | The parcel becomes a return and is brought back to the seller (see 4.12). The return fee applies.                                                                                                                                                                                                                                                         |
| **Changer de client** — 1,000 DT | Deliver the parcel to a different customer. The seller enters the new name, phone, address and COD amount (the price may change). The attempt counter restarts at 1. The fee is 1,000 DT for every seller and is deducted in the next bon de versement. **Only available once the parcel is back at the depot**; disabled while the courier still has it. |

_À vérifier starts as soon as the courier scans the failure. Relancer and Retourner can be chosen immediately; Changer de client becomes available when the depot scans the parcel back in (the button shows "Disponible au retour au dépôt")._

> **48-hour rule.** If the seller has not decided within 48 hours, the parcel becomes a return automatically. Each row shows the time left before this happens.

_A parcel also becomes a return automatically when the third delivery attempt fails. Faffa Go customer service can call the customer when needed; those calls appear in the parcel under **Appels Faffa Go**._

### 4.10 Chat du colis

- One conversation per parcel between the seller and the courier assigned to it, for fast coordination ("le client est disponible après 17h").
- The courier appears by **first name only**. No phone number or other information.
- Opens when a courier is assigned; becomes read-only when the parcel is closed (delivered and paid, or return received). If the courier changes, the new courier sees the history.
- Faffa Go staff can read every chat and join it, for disputes and support.
- Quick replies for common messages. Text only in v1.

### 4.11 Paiements

Cash only. Faffa Go prepares the payment and a courier brings the cash to the seller, usually during a pickup visit. The seller never requests a payment; he sees what is coming and signs what he received.

Flow: Chez le coursier › Au dépôt › Payé

- **À recevoir**: every delivered, unpaid parcel with COD − frais = net and its cash status. Only parcels "au dépôt" can be included in a payment.
- **Bons de versement**: each payment, numbered (`BV-2026-0921-01`), with date, list of parcels, deductions (delivery fees, return fees, change-client fees, pickup fees, and the 3% retenue à la source for CIN-only sellers, on its own line) and net total.
- **Handover:** the courier gives the cash and the paper bon to the contact person, who counts, signs and keeps his copy. The courier scans the bon's QR code to record the handover. Status: **Préparé** › **En route** › **Remis**.
- **Imprimer**: the seller can print or download any bon from his space.
- **Certificats de retenue à la source** (CIN uniquement only): the seller downloads the certificate for the amounts withheld, per bon and as a yearly summary.
- Partial payment is normal: if some parcels are still being counted, they stay in À recevoir and appear in a later bon. Nothing else is delayed.

### 4.12 Retours

Flow: À vérifier › Retour au dépôt › En route › Reçu

- **Retour au dépôt**: returns decided (by the seller, the 48-hour rule or the third failed attempt) and waiting to go back.
- **En route**: returns go out with the pickup courier on his next visit to the seller.
- **Reçu**: at handover the courier scans each returned parcel as received, and the contact person signs the **bon de retour** (`BR-2026-0921-01`). Faffa Go's responsibility for the parcel ends here.
- **Imprimer**: the seller can print or download any bon de retour from his space.
- Old items from **Colis d'échange** follow the same flow.

### 4.13 Notifications

In the web application only: a bell with an unread count and a list. No SMS, WhatsApp or email.

| Event                       | Notification                                |
| --------------------------- | ------------------------------------------- |
| Delivery failed             | Colis FG-… à vérifier · [motif]             |
| 24 h left to decide         | Plus que 24 h pour décider sur FG-…         |
| No decision after 48 h      | Colis FG-… retourné automatiquement         |
| Parcel becomes a return     | Colis FG-… en retour                        |
| Bon de versement on its way | Votre paiement BV-… arrive avec le coursier |
| Bon de retour on its way    | Vos retours BR-… arrivent avec le coursier  |
| Pickup planned / done       | Ramassage planifié / effectué               |
| New chat message            | Nouveau message de [prénom] sur FG-…        |
| Account notice              | Compte suspendu / réactivé                  |

### 4.14 Profil

- Shop information and contact person: read-only (changes go through Faffa Go).
- Statut (Patente, Auto-entrepreneur or CIN uniquement), read-only, with a note when the 3% retenue à la source applies.
- Pickup addresses: add, edit, choose the default.
- Rates: delivery fee, return fee, change-client fee (1,000 DT), read-only and the same for every seller.
- Password: changed only by the admin. There is no change-password screen.

## 5. Status reference

These labels are fixed. The interface never uses synonyms.

#### Delivery status (statut du colis)

| Label              | Meaning                                                        |
| ------------------ | -------------------------------------------------------------- |
| Créé               | Created by the seller, not yet picked up                       |
| Ramassé            | Scanned by the courier at the seller's place                   |
| Au dépôt           | Scanned in at the depot                                        |
| En livraison       | Out with a courier                                             |
| Livré              | Delivered, COD collected                                       |
| À vérifier · motif | Delivery failed, waiting for a decision; shown with its reason |
| Relancé            | Seller chose to resend; waiting for the next tour              |
| Retour au dépôt    | Decided as a return, at the depot                              |
| Retour en route    | Out with the pickup courier, on its way back to the seller     |
| Retour reçu        | Scanned as received at handover; bon de retour signed          |
| Annulé             | Cancelled by the seller before pickup                          |

#### Cash status (statut de paiement) — only for delivered parcels

| Label            | Meaning                                                          |
| ---------------- | ---------------------------------------------------------------- |
| Chez le coursier | Collected, the courier still holds the cash                      |
| Au dépôt         | Counted at the courier's end-of-day reconciliation, ready to pay |
| Payé             | Included in a bon de versement signed by the seller              |

#### Other statuses

| Object           | Statuses                               |
| ---------------- | -------------------------------------- |
| Ramassage        | Demandé › Planifié › Effectué · Annulé |
| Bon de versement | Préparé › En route › Remis (signé)     |
| Bon de retour    | Préparé › En route › Remis (signé)     |
| Compte           | Actif · Suspendu                       |

## 6. Business rules

1.  A seller account can only be created by the admin.
2.  The courier hands cash and returns only to the contact person (the CIN holder), who signs the bon.
3.  Payments are in cash only, prepared by Faffa Go and delivered by a courier.
4.  A parcel can be paid only when it is **Livré** and its cash is **Au dépôt**.
5.  A payment covers a list of parcels. A parcel is either fully paid or not paid; no partial amounts per parcel.
6.  Rates are the same for every seller. The change-client fee is 1,000 DT.
7.  Sellers with statut **CIN uniquement** have a 3% retenue à la source, calculated on the amount left after Faffa Go fees, withheld for the tax administration and backed by a certificate.
8.  Return fees are deducted in the next bon de versement. A cancellation after pickup is charged the return fee.
9.  Signed paper bons are brought back by the courier and archived at the depot.
10. Fees (delivery, return, change-client, pickup) are deducted in the bon de versement, line by line.
11. A pickup is free from 5 parcels picked up; below 5, a 2,000 DT pickup fee applies.
12. A failed delivery always goes to **À vérifier** first.
13. Every parcel in À vérifier shows one reason from the fixed list, chosen only by the courier and read-only for the seller.
14. The seller can choose **Relancer** (free, one new attempt), **Retourner** or **Changer de client** (1,000 DT, only when the parcel is at the depot).
15. Without a decision within 48 hours, the parcel becomes a return automatically.
16. Maximum 3 delivery attempts. The third failed attempt makes the parcel a return automatically.
17. Returns go back with the pickup courier and are scanned as received at handover.
18. The seller sees only calls made by Faffa Go, never a log of his own calls.
19. The seller sees only the courier's first name.
20. The seller sees only his own parcels, amounts and counts.
21. Every status change is recorded with who, when and where, and cannot be edited.

## 7. Out of scope for version 1

| Item                                              | Reason                                                  |
| ------------------------------------------------- | ------------------------------------------------------- |
| Public sign-up form                               | Accounts are created by the admin                       |
| Delivery proof photo                              | Not needed for the Tunisian COD market                  |
| Call tools or call log for the seller's own calls | Sellers call from their own phone and system            |
| SMS, WhatsApp or email notifications              | Notifications are in-app only                           |
| Bank transfer, D17 or any non-cash payment        | Payments are cash only                                  |
| Payment requests by the seller                    | Faffa Go decides when to pay                            |
| Per-seller rates                                  | Rates are the same for everyone                         |
| Seller choosing or editing the failure reason     | Only the courier sets it; the seller sees it            |
| In-app confirmation of bons                       | Replaced by the signed paper bon and the courier's scan |
| Several authorised persons per seller             | Possible later; v1 uses one contact person              |
| API and Shopify / WooCommerce integration         | Planned for a later phase                               |

## 8. Decisions log

Points raised during the design discussion and the decision taken for each.

| #   | Question                                                            | Decision                                                                                                                                         |
| --- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | How are return fees charged, given that a return brings in no cash? | Deducted from the next bon de versement as a separate line.                                                                                      |
| 2   | Which documents are required to open an account?                    | CIN always. Statut Patente or Auto-entrepreneur with the matching document; or CIN uniquement with a 3% retenue à la source after Faffa Go fees. |
| 3   | For Changer de client: does the attempt counter restart?            | Yes, it restarts at 1 for the new customer.                                                                                                      |
| 4   | For Changer de client: can the COD amount change?                   | Yes.                                                                                                                                             |
| 5   | Is a cancellation after pickup charged?                             | Yes, the return fee.                                                                                                                             |
| 6   | Where do the signed paper bons go?                                  | The courier brings the signed copy back to the depot, where it is archived.                                                                      |
| 7   | Password reset                                                      | Handled by the admin in v1.                                                                                                                      |
| 8   | Who chooses the failure reason?                                     | Only the courier. The seller sees it read-only.                                                                                                  |
| 9   | Time limit on À vérifier                                            | 48 hours, then automatic return.                                                                                                                 |
| 10  | Devenir partenaire                                                  | Opens contact options: social media and phone / WhatsApp.                                                                                        |
| 11  | Does Relancer cost anything?                                        | No. Relancer is free and gives one new attempt; a new failure returns the parcel to À vérifier.                                                  |
| 12  | When can Changer de client be used?                                 | Only when the parcel is at the depot, never while the courier has it.                                                                            |
| 13  | Can Faffa Go customer service decide a return?                      | No. Returns come only from the seller's decision, the 48-hour rule or the 3rd failed attempt.                                                    |
| 14  | Is a pickup charged?                                                | Free from 5 parcels picked up; 2,000 DT below 5, based on the parcels scanned at pickup.                                                         |
