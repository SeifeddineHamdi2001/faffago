# Faffa Go — Interface Admin (spécification v1.12)

> **How to read this document.** Screen names, buttons and statuses are in French, as the team will see them. Explanations are in English. This document completes the seller specification (Interface Vendeur v1.5); both follow the same statuses and rules. Items marked **TO CONFIRM** were adopted as defaults and still need a final yes (see section 8).

## 1. Purpose and core principles

The back office is where the Faffa Go team runs the operation: parcels coming in and going out, failed deliveries, courier cash, seller payments, returns, courier pay and the platform settings. It works on a phone as well as on a computer.

| Principle                                          | What it means                                                                                                               |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Phone first.**                                   | Scanning is done with the phone camera. A USB barcode gun is optional and can be added later without changes.               |
| **The scan is the status change.**                 | Parcels move only through scans and recorded actions. Every event is stored with who, when and where, and cannot be edited. |
| **Money has an owner at every moment.**            | Cash is always either with a courier, in the depot cash, or paid to a seller. The system knows which, parcel by parcel.     |
| **Couriers hand over cash every day.**             | All cash from delivered parcels is handed to the admin daily, whatever the courier's pay plan.                              |
| **Missing money is the courier's responsibility.** | A cash shortfall is recorded as a debt and deducted from the courier's pay.                                                 |
| **The admin alone touches money and settings.**    | Only the admin prepares seller payments, pays couriers, changes rates and rules, and overrides a status.                    |
| **Returns are never decided by Faffa Go.**         | A return comes only from the seller's choice, the 48-hour rule or the third failed attempt.                                 |

## 2. Roles and permissions

Three staff roles. At launch one person can hold all of them; the split exists so staff can be hired without access to money.

_**TO CONFIRM** Roles adopted as proposed during the discussion._

| Action                                    | Admin   | Dépôt   | Service client |
| ----------------------------------------- | ------- | ------- | -------------- |
| Scan (entrée, sortie, retours, archivage) | **Oui** | **Oui** | —              |
| Plan pickups and tours                    | **Oui** | **Oui** | —              |
| Courier cash reconciliation (Caisse)      | **Oui** | **Oui** | —              |
| À vérifier follow-up, log calls           | **Oui** | —       | **Oui**        |
| Read and join parcel chats                | **Oui** | **Oui** | **Oui**        |
| Apply seller change requests              | **Oui** | —       | **Oui**        |
| Prepare bons de versement                 | **Oui** | —       | —              |
| Prepare bons de retour                    | **Oui** | **Oui** | —              |
| Courier pay, cancel a courier debt        | **Oui** | —       | —              |
| Create / suspend sellers and couriers     | **Oui** | —       | —              |
| Override a parcel status                  | **Oui** | —       | —              |
| Paramètres, staff users, reports          | **Oui** | —       | —              |

Screen access (v1.11, decision D-11). Reading a screen never grants its actions: each role acts only with the rights above.

| Screen          | Admin   | Dépôt                                                 | Service client                                        |
| --------------- | ------- | ----------------------------------------------------- | ----------------------------------------------------- |
| Aujourd'hui     | **Oui** | Figures of its own work                               | Figures of its own work                               |
| Colis           | **Oui** | Read, Réimprimer l'étiquette                          | Read, log calls, apply change requests                |
| Exceptions      | **Oui** | Read                                                  | Read                                                  |
| Retours         | **Oui** | Read, prepare bons de retour                          | Read                                                  |
| Journal d'audit | **Oui** | —                                                     | —                                                     |
| Vendeurs        | **Oui** | Shop, contact name and phone, parcels (not the email) | Shop, contact name and phone, parcels (not the email) |
| Coursiers       | **Oui** | Name, phone, zone, today's parcels                    | Name, phone, zone, today's parcels                    |

The seller's email (his login), CIN / patente documents, courier pay and debts, account creation, passwords, suspension and Paramètres stay with the admin.

## 3. Navigation

Sidebar on computer, bottom bar with Scan in the centre on phone. Each role only sees the menu items it can use.

| Group                | Menu items                                                                           |
| -------------------- | ------------------------------------------------------------------------------------ |
| **Journée**          | Aujourd'hui · Scan · Colis · Ramassages · Tournées · À vérifier · Exceptions · Chats |
| **Argent**           | Caisse · Paiements vendeurs · Retours · Paie coursiers · Rapports                    |
| **Gestion**          | Vendeurs · Coursiers · Paramètres · Journal d'audit                                  |
| **Toujours visible** | Search (code, name, phone) · Notifications · User menu                               |

## 4. Features

**Running The Day**

### 4.1 Aujourd'hui

The home screen. The day as a chevron pipeline, then the couriers, then what is blocked.

Flow: À ramasser › Au dépôt › En livraison › Livrés › À vérifier › Retours à rendre

- Each block shows its count and opens the filtered list.
- **Coursiers**: each courier's run (stops done / total), last scan, cash carried now.
- **À traiter**: parcels close to the 48-hour limit, cash not yet handed over, bons en route, pickups not done. Each links to the item.

### 4.2 Scan

Scanning with the phone camera. The mode is chosen with large buttons, then the team scans parcel after parcel in **scan continu**, without tapping between scans.

| Mode                    | Used when                                  | Result of a valid scan                                                    |
| ----------------------- | ------------------------------------------ | ------------------------------------------------------------------------- |
| **Entrée dépôt**        | Parcels arrive from a pickup               | Au dépôt                                                                  |
| **Sortie coursier**     | Morning dispatch; choose the courier first | En livraison, assigned to that courier                                    |
| **Retour de tournée**   | Courier brings back failed parcels         | Stays À vérifier, now physically at the depot (unlocks Changer de client) |
| **Préparation retours** | Returns are grouped for a seller           | Added to that seller's bon de retour                                      |
| **Archivage bons**      | Signed paper bons come back                | Bon marked Archivé                                                        |

- Every scan gives an immediate full-screen result: green (done) or red with the reason, e.g. "Colis déjà livré", "Mauvais mode", "Colis d'un autre coursier", "Code inconnu".
- **Annuler le dernier scan** is possible within 1 minute; after that, only an admin override.
- Manual code entry when a label is damaged.
- A USB barcode gun works on a computer in the same screen, with keyboard shortcuts for the modes.

### 4.3 Colis

- All parcels, searchable by code, name, phone or seller; filters by status, cash status, seller, courier, zone and date; export.
- Parcel detail: track line, full event log, money (COD, fees, cash status, bon), courier reason, Faffa Go calls, chat.
- **Forcer un statut** (admin only): requires a reason, is written to the audit log, and is meant to correct scanning mistakes only.

### 4.4 Ramassages

- **Pickup fee**: when the pickup is closed, if fewer than 5 parcels were scanned, a 2,000 DT pickup fee is added to the seller's next bon de versement. From 5 parcels, it is free.
- Incoming pickup requests from sellers: **Demandé**. The team assigns a courier, date and time slot: **Planifié**.
- The courier is pre-filled with the **ramasseur** of the seller's zone; the team can change it. The ramasseur is a Faffa Go employee, separate from the livreurs.
- **À emporter**: for each pickup, the system lists the bons de versement (cash) and bons de retour (parcels) ready for that seller, so one visit covers everything.
- At the seller, the courier scans each parcel. The pickup becomes **Effectué**, with the list of parcels picked up and those missing.

### 4.5 Tournées

- Parcels at the depot grouped by zone, ready to go out. Relancé parcels appear on the date chosen by the seller.
- **Zones**: the admin groups délégations into zones. Each zone has two separate responsibilities, each with a titular and a backup: a **livreur** (deliveries) and a **ramasseur** (pickups at sellers, plus bons and returns). They are separate people with separate accounts (see 4.15 and 4.16).
- Every parcel at the depot is placed automatically in its zone's column, under the zone's livreur. The team checks the columns and can move any parcel to another courier.
- **Courier absent**: the admin marks him absent for the day, and his zones switch to their backup livreur and backup ramasseur in one click.
- Shows each courier's load before dispatch. The assignment itself happens with the **Sortie coursier** scan.

### 4.6 À vérifier

Supervision of failed deliveries. The seller decides; the team follows up.

Flow: Échec › À vérifier › Relancé (1 tentative) › Livré ou À vérifier

- List of all parcels in À vérifier with the courier's reason, attempt number, where the parcel is (with the courier / at the depot) and a **48-hour countdown**, sorted by time left.
- **Relancer** gives one new attempt, free. If it fails, the parcel comes back to À vérifier and the seller decides again.
- **Changer de client** is only possible once the parcel is scanned back at the depot.
- The service client logs its calls: time, answered or not, note. They appear to the seller under **Appels Faffa Go**.
- The team never decides a return. Returns come from the seller, the 48-hour rule or the third failed attempt, and then appear in 4.11.

### 4.7 Exceptions

Everything that is stuck, in one queue, each with its action:

| Exception                                         | Action                                 |
| ------------------------------------------------- | -------------------------------------- |
| Parcel at the depot more than 48 h without a tour | Assign                                 |
| Parcel close to the 48-hour À vérifier limit      | Call the customer / contact the seller |
| Courier has not handed over his cash today        | Open Caisse                            |
| Bon en route not marked Remis after 24 h          | Contact the courier                    |
| Signed bon not archived after 48 h                | Archive                                |
| Pickup planned but not done                       | Re-plan                                |
| Seller change request waiting                     | Apply / refuse                         |

### 4.8 Chats

- One inbox with every parcel chat between sellers and couriers; filters by unread, seller, courier.
- Staff can read and write in any chat; staff messages are marked "Faffa Go".

**Money**

### 4.9 Caisse

Every courier hands over all the cash from his delivered parcels **every day**. The Caisse is where it is counted.

- For each courier: **attendu** (sum of COD of the parcels he scanned Livré today) and **compté** (what he actually hands over).
- **Écart** = compté − attendu. When the session is closed, the parcels move from "Chez le coursier" to "Au dépôt" and become payable to sellers.

| Example                                 | Amount                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------- |
| Oussama — 14 parcels delivered, attendu | 468,000 DT                                                              |
| Compté                                  | 463,000 DT                                                              |
| **Écart**                               | **− 5,000 DT** › recorded as a courier debt, deducted from his next pay |

- **Negative écart**: automatically becomes a courier debt, deducted from his next pay. The admin can cancel it with a note (e.g. money found later).
- **Positive écart**: recorded and flagged for the admin to check; never absorbed silently.
- An écart does not delay sellers: once the session is closed, all the day's parcels are payable, and the shortfall is the courier's debt.
- **Ramasseur and bons**: cash for bons de versement is handed to the ramasseur when he leaves (bon **En route**). In the evening, every bon must be **Remis** (scanned at the seller) or brought back with its full cash; any missing amount is recorded as an écart on the ramasseur and reported to HR (his pay is not managed in the app).
- The day cannot be closed while a courier who delivered or carried bons today has not been counted.

### 4.10 Paiements vendeurs

Admin only. Preparing the bons de versement that couriers deliver in cash.

- Per seller: every parcel that is Livré, cash Au dépôt and not yet paid, all pre-selected. The admin unticks anything not ready; those parcels wait for a later bon.
- Calculation: total COD − delivery fees − return fees − change-client fees − pickup fees = base after fees; − 3% retenue à la source if statut CIN uniquement; = net in cash.
- **Préparer le bon**: numbers it (`BV-2026-0921-01`), prints two copies with a QR code, and attaches it to the seller's next pickup (**À emporter**), carried by the ramasseur.
- Tracking: **Préparé** › **En route** (courier leaves with it) › **Remis** (courier scans it at the seller, contact person signs) › **Archivé** (signed copy scanned back at the depot).
- Seller summary: payable now, still with couriers, returns and fees to deduct.

### 4.11 Retours

- Returns at the depot grouped by seller. The team scans them into the seller's bon de retour (`BR-2026-0921-01`) with **Préparation retours**.
- The bon is attached to the next pickup; the ramasseur scans each parcel **Retour reçu** at handover, the contact person signs, and the signed copy is archived.
- Return fees are added to the seller's next bon de versement.

### 4.12 Paie coursiers

Livreurs are paid per delivered parcel, on the pay plan they choose. Ramasseurs are employees paid by HR; their pay is **not** managed in the app.

| Rule           | Detail                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rate (livreur) | One rate per parcel Livré, set in Paramètres. Failed attempts are not paid.                                                                            |
| Pay plan       | Chosen by the courier and saved on his profile: **Journalier**, **Hebdomadaire** or **Mensuel**. Cash handover to the depot stays daily in every case. |
| Deductions     | Courier debts from negative écarts in Caisse.                                                                                                          |
| Calculation    | Parcels livrés in the period × rate − deductions = net.                                                                                                |

- The **Paie coursiers** screen lists who is due today according to his plan, with a **fiche de paie** (period, parcels, rate, deductions, net) to print. The admin marks it **Payée**.
- If deductions are larger than the pay, the rest of the debt carries over to the next period.

### 4.13 Rapports

_**TO CONFIRM** List adopted as proposed._

| Report              | Content                                                                         |
| ------------------- | ------------------------------------------------------------------------------- |
| Retenue à la source | Monthly total withheld per seller, for the tax declaration; certificates issued |
| Chiffre d'affaires  | Delivery, return and change-client fees by period                               |
| Activité            | Delivery rate, return rate, average delivery time — by seller, zone, courier    |
| Argent              | Cash collected, handed over, paid to sellers, still held; courier debts         |
| Paie coursiers      | Pay per livreur and period, deductions                                          |
| Écarts ramasseurs   | Missing bon cash per ramasseur and month, to send to HR                         |

_Every report can be exported to CSV / Excel._

**People And Settings**

### 4.14 Vendeurs

- **Créer un vendeur**: shop name, category, store link, contact person name, phone and email (login), statut (Patente / Auto-entrepreneur / CIN uniquement), documents (CIN always; patente or auto-entrepreneur card when applicable). Documents are private to the admin.
- Actions: suspend / reactivate, **Régénérer le mot de passe** (new random password shown once, all sessions revoked), change statut (the retenue stops or starts from the next bon).
- Seller page: parcels, payable now, returns waiting, bons history, delivery rate, and **Voir comme le vendeur** to see exactly what he sees.

### 4.15 Coursiers

- **Créer un coursier**: name, phone (login, with the role chosen on the app login screen), CIN, vehicle, and his role: **Livreur** or **Ramasseur**. A person has one role only. The pay plan applies to livreurs only; ramasseurs are employees paid by HR outside the app.
- Zones are assigned by the admin, per role, as titular or backup. A courier only receives the work matching his role.
- **Changer de rôle**: when a livreur becomes a ramasseur (or the reverse), the admin creates a **new account** with the new role, and the person logs in to it.
- The **old account stays open**, so the person can still see what he is owed (e.g. livreur pay not yet paid). It receives no new work: no parcels, pickups or bons can be assigned to it. Cash, bons and failed parcels still on it must be handed over as usual.
- The admin can deactivate the old account later, once nothing is owed; it is never deleted, so its history stays. **Désactiver** stops new work at once, then is refused while anything is still open — parcels in his hands, cash not handed over, a bon en route, and from phase 8 an open caisse session, an unpaid fiche de paie or a debt en cours — and lists what blocks it (D-12).
- Both accounts can use the same phone number. On the login screen, the person chooses **Livreur** or **Ramasseur**, then enters his phone number and password; each account can have its own password.
- Actions: activate / deactivate, **Régénérer le mot de passe** (shown once, sessions revoked), change zones or pay plan, mark absent for a day.
- Courier page: today's run, cash carried now, Caisse history with écarts, current debt, pay history, delivery rate.

### 4.16 Paramètres

| Setting                                 | Default                                                                                                                             |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Delivery fee, return fee                | Same for every seller                                                                                                               |
| Change-client fee                       | 1,000 DT                                                                                                                            |
| Pickup fee and free threshold           | 2,000 DT when fewer than 5 parcels are picked up; free from 5                                                                       |
| Retenue à la source                     | 3% (CIN uniquement)                                                                                                                 |
| Courier rate per parcel livré           | Set by the admin                                                                                                                    |
| À vérifier time limit                   | 48 hours                                                                                                                            |
| Maximum delivery attempts               | 3                                                                                                                                   |
| Failure reasons                         | Ne répond pas, Injoignable, Adresse incorrecte, Reporté par le client, Refusé — shown read-only (D-20)                              |
| Gouvernorats, délégations and localités | Managed list. Localités: add, rename, deactivate, fill the optional Arabic name; parcels filed under Autre are listed (v1.12, D-17) |
| Zones                                   | Groups of délégations, each with a livreur (titular + backup) and a ramasseur (titular + backup), set by the admin                  |
| Contact links (Devenir partenaire)      | Social media, phone, WhatsApp                                                                                                       |
| Staff users and roles                   | Admin, Dépôt, Service client                                                                                                        |

_Rate changes apply to parcels created after the change; existing parcels keep the fee they were created with._

### Identifiants et mots de passe

All accounts are created by the admin; there is no public sign-up and no
self-service password reset anywhere in the platform.

| Role                         | Logs in with                                                      |
| ---------------------------- | ----------------------------------------------------------------- |
| Vendeur                      | Email + password                                                  |
| Admin, Dépôt, Service client | Username + password                                               |
| Livreur, Ramasseur           | Phone + password, after choosing the role on the app login screen |

- **Créer un compte**: the admin picks the role, fills the information and the
  username (or the email for a seller). The password is generated at random
  (12+ characters, no characters that can be confused when read aloud) and shown
  once in a copy box, **Copier les identifiants**, so the admin can hand it over.
- **Régénérer le mot de passe** is available on any account at any time: a new
  random password is shown once and every session of that account is revoked
  immediately.
- Passwords are stored only as an argon2id hash and are never readable again.
- Every creation and regeneration is written to the Journal d'audit, without the
  password.
- The system refuses to deactivate the last active admin or to regenerate his
  password from the back office. That case is handled on the server with
  `pnpm --filter @faffago/api admin:reset <username>`, which is audited.
- A phone number may carry one livreur account and one ramasseur account. Two
  sellers, or two staff members, never share a phone number.

### 4.17 Journal d'audit

- Read-only log of sensitive actions: status overrides, cancelled scans after 1 minute, account and statut changes, settings changes, cancelled courier debts, manual edits.
- Each entry: who, when, what, value before and after, reason.

### 4.18 Notifications

In-app only, filtered by role: new pickup requests, seller change requests, parcels close to the 48-hour limit, écarts, bons not delivered, new chat messages, couriers due for pay.

## 5. Status reference

Parcel delivery and cash statuses are the same as in the seller specification. The back office adds the following.

| Object             | Statuses                                                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Parcel (delivery)  | Créé › Ramassé › Au dépôt › En livraison › Livré · À vérifier · Relancé · Retour au dépôt › Retour en route › Retour reçu · Annulé |
| Parcel (cash)      | Chez le coursier › Au dépôt › Payé                                                                                                 |
| Ramassage          | Demandé › Planifié › Effectué · Annulé                                                                                             |
| Bon de versement   | Préparé › En route › Remis › Archivé                                                                                               |
| Bon de retour      | Préparé › En route › Remis › Archivé                                                                                               |
| Session de caisse  | Ouverte › Comptée › Clôturée                                                                                                       |
| Dette coursier     | En cours › Déduite · Annulée (with note)                                                                                           |
| Fiche de paie      | À payer › Payée                                                                                                                    |
| Vendeur / Coursier | Actif · Suspendu (vendeur) · Inactif (coursier)                                                                                    |

## 6. Business rules

1.  Only the admin creates seller and courier accounts, prepares seller payments, pays couriers, changes settings and overrides a status.
2.  Scanning is done with the phone camera; a USB barcode gun is optional.
3.  Every scan and action is recorded (who, when, where) and cannot be edited. Corrections go through an override with a reason.
4.  Couriers hand over all cash from delivered parcels to the admin every day.
5.  Écart = compté − attendu. A negative écart becomes a courier debt deducted from his pay; only the admin can cancel it, with a note.
6.  A parcel becomes payable to the seller once the courier's Caisse session is closed.
7.  Seller payments are cash only, per parcel, prepared by the admin and delivered by the ramasseur with the bon; the contact person signs.
8.  The 3% retenue à la source applies to sellers with statut CIN uniquement, after Faffa Go fees.
9.  Signed bons are scanned back at the depot and archived.
10. Returns and bons travel with the seller's pickup visit.
11. A failed delivery goes to À vérifier. Relancer is free and gives one new attempt; a new failure returns the parcel to À vérifier.
12. Changer de client (1,000 DT) is possible only when the parcel is at the depot.
13. The team never decides a return: only the seller, the 48-hour rule or the 3rd failed attempt.
14. Livreurs are paid per parcel livré, according to the pay plan they chose (journalier, hebdomadaire, mensuel). Ramasseurs are employees paid by HR, outside the app.
15. Rates are the same for every seller; a rate change applies only to parcels created after it.
16. A pickup with fewer than 5 parcels picked up costs 2,000 DT, added to the next bon de versement; from 5 parcels it is free.
17. Livreur and ramasseur are separate people with separate accounts. The admin assigns each zone a livreur and a ramasseur, each with a backup.
18. Only the ramasseur hands over bons de versement and bons de retour.
19. Parcels go to the livreur of their zone; pickups, bons de versement and returns go with the ramasseur of the seller's zone. The team can change any assignment.
20. Bon cash carried by a ramasseur is counted in the Caisse; missing money is recorded as an écart and reported to HR.

## 7. Out of scope for version 1

| Item                                           | Reason                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| Required barcode gun or scanning hardware      | Phone camera is enough; gun optional later                             |
| Automatic route optimisation, live courier map | Later phase                                                            |
| Several depots                                 | One depot at launch                                                    |
| Automatic zone balancing between couriers      | The admin sets and adjusts zones; the Activité report shows imbalances |
| Team deciding returns                          | Returns come only from the seller or automatic rules                   |
| Courier pay for failed delivery attempts       | Delivery pay is per parcel livré only                                  |
| Automatic tax filing                           | The system prepares the retenue report; filing is done outside         |
| SMS, WhatsApp or email notifications           | In-app only                                                            |
| API / Shopify / WooCommerce integration        | Later phase                                                            |

## 8. Decisions log

| #   | Question                                         | Decision                                                                                                                                                                        |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | How does the team scan without a barcode gun?    | With the phone camera; gun optional later.                                                                                                                                      |
| 2   | How does Relancer work?                          | Free, one new attempt; a new failure returns the parcel to À vérifier.                                                                                                          |
| 3   | When can Changer de client be used?              | Only when the parcel is at the depot.                                                                                                                                           |
| 4   | Can Faffa Go customer service decide a return?   | No.                                                                                                                                                                             |
| 5   | What happens with missing cash (negative écart)? | Deducted from the courier's pay.                                                                                                                                                |
| 6   | How are couriers paid?                           | Per parcel livré.                                                                                                                                                               |
| 7   | How often are couriers paid?                     | The courier chooses: journalier, hebdomadaire or mensuel.                                                                                                                       |
| 8   | How often do couriers hand over cash?            | Every day, whatever their pay plan.                                                                                                                                             |
| 9   | Staff roles                                      | **TO CONFIRM** Admin, Dépôt, Service client (section 2).                                                                                                                        |
| 10  | Parcel assignment to couriers                    | By zone. The admin assigns each zone a livreur and a ramasseur, each with a backup; the team can move any parcel.                                                               |
| 11  | Reports                                          | **TO CONFIRM** List in 4.13.                                                                                                                                                    |
| 12  | Who does pickups?                                | The ramasseur of the seller's zone, a separate employee. He is the only one who hands over bons de versement and bons de retour.                                                |
| 13  | How is pickup work paid?                         | Ramasseurs are employees paid by HR, outside the app. Missing bon cash is reported to HR.                                                                                       |
| 14  | What if a person changes role?                   | The admin creates a new account with the new role. The old account stays open (no new work) until the person is fully paid; the admin may deactivate it later. History is kept. |
| 15  | Is a pickup charged?                             | Free from 5 parcels picked up; 2,000 DT below 5, counted on the parcels scanned.                                                                                                |
