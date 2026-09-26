# Faffa Go — User guide for every role

> **How to read this guide.** Screen names, buttons and statuses are written in
> French, in **bold**, exactly as they appear on screen. Explanations are in
> English. Amounts are in dinars with three decimals (`85,000 DT`).
>
> This guide describes the platform as built on 2026-09-26. Where it and
> `docs/decisions.md` ever differ, decisions.md wins.

## Contents

1. [The platform in one page](#1-the-platform-in-one-page)
2. [Accounts and logging in](#2-accounts-and-logging-in)
3. [The life of a parcel](#3-the-life-of-a-parcel)
4. [Vendeur — the seller space](#4-vendeur--the-seller-space)
5. [Ramasseur — the courier app](#5-ramasseur--the-courier-app)
6. [Livreur — the courier app](#6-livreur--the-courier-app)
7. [Dépôt — the back office](#7-dépôt--the-back-office)
8. [Service client — the back office](#8-service-client--the-back-office)
9. [Admin — the back office](#9-admin--the-back-office)
10. [The customer — public tracking](#10-the-customer--public-tracking)
11. [A typical day, hour by hour](#11-a-typical-day-hour-by-hour)
12. [Scan refusals and what to do](#12-scan-refusals-and-what-to-do)
13. [Questions people ask](#13-questions-people-ask)
14. [Status reference](#14-status-reference)
15. [Glossary](#15-glossary)

---

## 1. The platform in one page

Faffa Go delivers parcels for online sellers in Grand Tunis and collects the
cash on delivery (COD). The platform has three parts:

| Part                     | Who uses it                                 | Where                                   |
| ------------------------ | ------------------------------------------- | --------------------------------------- |
| **Espace vendeur**       | Sellers                                     | Website, `/vendeur` (computer or phone) |
| **Back office**          | Faffa Go team: Admin, Dépôt, Service client | Website, `/admin` (computer or phone)   |
| **Application coursier** | Livreurs and Ramasseurs                     | Android app installed by Faffa Go       |
| **Public site**          | Everyone, including the seller's customers  | Website home page and `/suivi/FG-…`     |

Six roles, each with its own job:

| Role               | Job in one line                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| **Vendeur**        | Creates parcels, prints labels, asks for pickups, decides what happens after a failed delivery.          |
| **Ramasseur**      | Picks up parcels at sellers, hands them their cash (bon de versement) and their returns (bon de retour). |
| **Livreur**        | Delivers parcels to customers and collects the COD.                                                      |
| **Dépôt**          | Scans parcels in and out of the depot, plans pickups and tours, counts the couriers' cash.               |
| **Service client** | Follows failed deliveries, calls customers, applies sellers' change requests.                            |
| **Admin**          | Everything above, plus money (seller payments, courier pay), accounts and settings.                      |

Five rules that shape everything:

1. **The scan is the proof.** A parcel moves only when its label is scanned. Every
   scan records who, when and where; nothing can be edited afterwards.
2. **Cash has an owner at every moment**: with a courier, at the depot, or paid to
   the seller.
3. **A failed delivery is a question, not a return.** The seller decides. Faffa Go
   never decides a return.
4. **Couriers hand in all their cash every day.**
5. **Payments to sellers are cash only**, brought by the ramasseur with a signed
   paper bon.

---

## 2. Accounts and logging in

There is **no public sign-up** and **no "forgot password" button**. The admin
creates every account and is the only person who can give a new password.

| Role                         | Logs in at           | With                                                       |
| ---------------------------- | -------------------- | ---------------------------------------------------------- |
| Vendeur                      | `/vendeur/connexion` | Email + password                                           |
| Admin, Dépôt, Service client | `/admin/connexion`   | Username + password                                        |
| Livreur, Ramasseur           | Courier app          | Choose **Livreur** or **Ramasseur**, then phone + password |

**Passwords.** The admin's screen generates a random password and shows it
**once**, with a **Copier les identifiants** button. Hand it to the person
directly. It cannot be read again later. If someone loses it, the admin uses
**Régénérer le mot de passe**: a new password is shown once, and every session
of that account is logged out immediately.

**Menu.** On a computer the menu is a sidebar on the left. On a phone, tap the
burger button at the top to open it. The notification bell is always visible at
the top; **Se déconnecter** is at the bottom of the menu.

**Notifications** are in-app only: no SMS, WhatsApp or email. The bell shows the
unread count and refreshes every 30 seconds.

---

## 3. The life of a parcel

### 3.1 The normal path

```
Créé ─► Ramassé ─► Au dépôt ─► En livraison ─► Livré
seller   ramasseur   depot scan    depot scan      livreur scan
creates  scans at    "Entrée       "Sortie         at the customer
         the seller  dépôt"        coursier"
```

Once delivered, the parcel has a second status, for its **cash**:

```
Chez le coursier ─► Au dépôt ─► Payé
livreur holds it    counted at     in a bon de versement
                    the Caisse     handed to the seller
```

### 3.2 When a delivery fails

```
Échec (livreur scans + chooses a reason)
   │
   ├─ reason "Reporté par le client" ─► Relancé on the date the customer chose
   │
   └─ any other reason ─► À vérifier  (48-hour countdown starts)
                             │
                             ├─ seller: Relancer ──────────► Relancé (1 new attempt, free)
                             ├─ seller: Retourner ─────────► Retour au dépôt (return fee)
                             ├─ seller: Changer de client ─► Au dépôt, new customer (1,000 DT)
                             └─ no decision in 48 h ───────► Retour au dépôt automatically
```

- The **3rd failed attempt** makes the parcel a return automatically.
- **Changer de client** is only possible once the parcel is **back at the depot**,
  and only once per parcel. It restarts the attempt counter, so a parcel can be
  tried at most five times in all.

### 3.3 Returns

```
Retour au dépôt ─► Retour en route ─► Retour reçu
at the depot,       with the ramasseur    scanned at the seller,
in a bon de retour  on his next visit      bon de retour signed
```

### 3.4 Fees

Rates are the **same for every seller** and set by the admin in Paramètres. A
parcel keeps the fees in force the day it was created.

| Fee                  | When it is charged                                    | Amount                                |
| -------------------- | ----------------------------------------------------- | ------------------------------------- |
| Frais de livraison   | Parcel delivered                                      | Set in Paramètres                     |
| Frais de retour      | Parcel becomes a return, or is cancelled after pickup | Set in Paramètres                     |
| Changement de client | Seller uses Changer de client                         | **1,000 DT**                          |
| Frais de ramassage   | A pickup where fewer than **5** parcels were scanned  | **2,000 DT**; free from 5 parcels     |
| Retenue à la source  | Sellers with statut **CIN uniquement** only           | **3%** of (total COD − Faffa Go fees) |

All fees are deducted in the seller's **next bon de versement**, line by line.
Relancer is free. The retenue is a tax withheld for the State, not a Faffa Go
fee; it is always shown on its own line and backed by a certificate.

**Example of a bon de versement (CIN uniquement seller):**

| Line                                                      | Amount         |
| --------------------------------------------------------- | -------------- |
| Total COD of the parcels paid                             | 1 000,000 DT   |
| − Faffa Go fees (delivery, return, change-client, pickup) | − 84,000 DT    |
| = Base after fees                                         | 916,000 DT     |
| − Retenue à la source 3%                                  | − 27,480 DT    |
| **= Net paid in cash**                                    | **888,520 DT** |

---

## 4. Vendeur — the seller space

Log in at `/vendeur/connexion` with the email and password Faffa Go gave you.

### 4.1 Menu

| Menu item                      | What it is for                                                  |
| ------------------------------ | --------------------------------------------------------------- |
| **Tableau de bord**            | Your money, what needs your attention, how deliveries are going |
| **Mes colis › Tous les colis** | Every parcel you created                                        |
| **Mes colis › À ramasser**     | Parcels waiting for pickup, to print their labels               |
| **À vérifier**                 | Failed deliveries waiting for your decision (badge = count)     |
| **Créer un colis**             | One new parcel                                                  |
| **Import CSV**                 | Many parcels at once from a file                                |
| **Ramassages**                 | Pickup requests and their history                               |
| **Paiements**                  | Money owed to you, bons de versement, retenue certificates      |
| **Retours**                    | Returns and bons de retour                                      |
| **Profil**                     | Your shop, contact person, pickup addresses, rates              |
| Bell (top bar)                 | **Notifications**                                               |

### 4.2 Tableau de bord

- **À recevoir** — what Faffa Go owes you, as a breakdown: **Montant total des
  colis livrés**, minus **Frais de livraison**, **Frais de retour**, **Frais de
  ramassage** (and **Changement de client** when there is one), giving **Total à
  recevoir**. Below it: how much is still **chez les coursiers** and how much is
  **au dépôt**, ready to be paid. The 3% retenue is not estimated here; it
  appears on the bon.
- A **red banner** lists every parcel with less than 24 hours left before its
  automatic return, with a link to decide.
- Counts of your parcels by status, and your **Taux de livraison** (delivered ÷
  (delivered + returns)) with a chart.
- Quick buttons: **Créer un colis**, **Demander un ramassage**.

### 4.3 Create a parcel

**Créer un colis** — fill in:

| Field                  | Required | Notes                                                                  |
| ---------------------- | -------- | ---------------------------------------------------------------------- |
| Nom du destinataire    | Yes      |                                                                        |
| Téléphone              | Yes      | 8 digits                                                               |
| Téléphone 2            | No       | 8 digits                                                               |
| Localité               | Yes      | Pick gouvernorat → délégation → localité, or type in the search box    |
| Adresse                | Yes      | As precise as possible                                                 |
| Repère                 | No       | A landmark ("près de la pharmacie"); the courier sees it in large type |
| Description du produit | Yes      | e.g. "2 bracelets"                                                     |
| Nombre de pièces       | Yes      | Default 1                                                              |
| Montant COD (DT)       | Yes      | Three decimals; **0** if the customer already paid                     |
| Colis d'échange        | No       | The courier delivers the new item and brings back the old one          |
| Ouverture autorisée    | No       | The customer may open the parcel before paying                         |
| Note pour le coursier  | No       | e.g. "sonner deux fois"                                                |

After saving, print the label straight away.

**Import CSV** — for many parcels:

1. Click **Télécharger le modèle** and fill in the template.
2. Upload it. Each row shows **Valide**, **À vérifier** (e.g. localité not
   recognised — pick the right one from the dropdown in the preview) or
   **Erreur** (e.g. phone too short — fix the file and upload again).
3. Only valid rows are imported. Then print all the labels in one batch.

### 4.4 Labels

The whole system runs on the label. **Every parcel must carry its label before
pickup.**

- Formats: thermal **100 × 150 mm**, or **A4 with 4 labels** per sheet.
- The label shows the barcode, a QR code (the customer can scan it to track the
  parcel), the code `FG-XXXXXXXX`, the COD in large type, the customer's details,
  your shop name and the **Échange** / **Ouverture autorisée** flags.
- **Mes colis › À ramasser** lists every parcel still to be picked up, all
  selected, ready to print the labels; **Imprimer la liste** prints the list itself.
- You can reprint any label at any time; it keeps the same code.

### 4.5 Ask for a pickup

**Ramassages › Demander un ramassage**:

1. Choose the pickup address. The **first time**, fill it in (gouvernorat,
   délégation, localité, address, landmark); it is saved in your profile. You can
   save several addresses.
2. Choose the **créneau**: **Matin** or **Après-midi**. Faffa Go picks the day.
3. Add a note if needed, and confirm.

Every parcel in status **Créé** is included automatically. Parcels you create
after the request are simply scanned as extras by the ramasseur.

- **Moins de 5 colis : ramassage à 2,000 DT.** The fee counts the parcels the
  ramasseur actually scans, not what you announced. From 5 parcels it is free.
  If nothing is scanned, nothing is charged.
- Statuses: **Demandé** › **Planifié** (you see the ramasseur's first name, the
  day and the créneau) › **Effectué**, or **Annulé**.
- You can cancel a request, free of charge, while it is **Demandé** or **Planifié**.
- One open request per address at a time.
- After the pickup you see exactly which parcels were picked up and which were not.

### 4.6 Change or cancel a parcel

| Parcel status                                        | What you can do                                                                                                                                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Créé** (not picked up yet)                         | **Modifier** any field (COD included) or **Annuler** at no cost. If a printed field changes, reprint the label.                                                                                         |
| Ramassé → Relancé                                    | **Demander une modification**: phone, phone 2, address, landmark or localité. Faffa Go applies it (or refuses with a reason you can read). One waiting request per parcel; you can edit or withdraw it. |
| Ramassé, Au dépôt, En livraison, À vérifier, Relancé | **Annuler** still works, but it becomes a return: status **Retour au dépôt**, **return fee charged**.                                                                                                   |
| Livré, or already a return                           | Nothing can be changed.                                                                                                                                                                                 |

### 4.7 Mes colis and the parcel page

- **Tous les colis**: table with code, customer, délégation, status, cash status,
  COD, date. Filter by group (En cours, Livrés, À vérifier, Payés / Non payés,
  Retours), search by code, name or phone, choose dates, **Exporter** to CSV.
- Click a parcel to open its page: the track line, the full history (who, when),
  the attempt ("Tentative 2 sur 3"), the money (COD, fees, net, cash status and
  bon number), **Appels Faffa Go** (calls our team made), the **Chat**, and the
  actions available right now.
- Couriers always appear by **first name only**.

### 4.8 À vérifier — deciding after a failed delivery

When a delivery fails, the parcel appears in **À vérifier** with the reason the
livreur chose, read-only: **Ne répond pas**, **Injoignable**, **Adresse
incorrecte** or **Refusé**. If the livreur wrote a note you see it as **Note du
livreur : « … »**.

1. Call your customer from your own phone.
2. Open the parcel and choose under **Votre décision**:

| Action                           | Effect                                                                                                                                                                                                                                                                     |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Relancer**                     | Free. Choose the day (tomorrow up to 7 days ahead). You may correct the phone, phone 2, address, landmark and courier note in the same form. One new attempt; if it fails, the parcel comes back to À vérifier.                                                            |
| **Retourner**                    | The parcel comes back to you. Return fee charged.                                                                                                                                                                                                                          |
| **Changer de client** — 1,000 DT | Deliver to a different customer: enter the new name, phones, localité, address, landmark and COD (the price may change). Attempts restart. **Only once the parcel is back at the depot** — until then the button reads **Disponible au retour au dépôt**. Once per parcel. |

> **48-hour rule.** Each parcel shows "Retour automatique dans 31 h 20 min"
> (red under 24 h). Without a decision in time, it becomes a return
> automatically. The **3rd failed attempt** also makes it a return
> automatically.

**When the customer asked for another day** (reason **Reporté par le client**),
the parcel does **not** go to À vérifier: it shows **Reporté au [date]** and goes
out again that day on its own. Until then you can **Changer la date**,
**Retourner**, or **Changer de client** (at the depot).

### 4.9 Chat

Each parcel has one chat between you and its livreur, opened when the parcel
leaves with a courier. Use it for quick coordination ("le client est disponible
après 17h"). Quick replies are offered. The chat becomes read-only when the
parcel's story is over. Faffa Go staff can read every chat and write as
**Faffa Go**.

### 4.10 Paiements

You never ask for a payment: Faffa Go prepares it and the ramasseur brings the
cash, usually during a pickup visit.

- **À recevoir**: every delivered, unpaid parcel with its cash status. Only
  parcels whose cash is **Au dépôt** can go into a payment. Parcels still being
  counted simply wait for the next bon.
- **Bons de versement** (`BV-2026-0921-01`): date, parcels, each deduction line,
  the retenue on its own line, and the net. Status **Préparé** › **En route** ›
  **Remis**. The menu badge counts bons on their way to you.
- **At handover**: the contact person counts the cash, signs the paper bon and
  keeps their copy. The ramasseur scans the bon's QR code. Only the **contact
  person** registered with Faffa Go may receive cash; the ramasseur may check
  their CIN.
- **Imprimer**: print or download any bon.
- **Certificats de retenue à la source** (CIN uniquement only): download the
  certificate of each bon and the yearly summary.
- If Faffa Go corrects a bon scanned by mistake, it reads **Correction Faffa Go**.

### 4.11 Retours

Returns (your decision, the 48-hour rule, the 3rd attempt, a cancellation after
pickup, and the old items of exchanges) come back to you with the ramasseur:

**Retour au dépôt** › **En route** › **Reçu**. The ramasseur scans each returned
parcel in front of the contact person, who signs the **bon de retour**
(`BR-2026-0921-01`). Faffa Go's responsibility ends there. Print any bon de
retour from this screen.

### 4.12 Profil

Read-only: shop, contact person, statut (with a note if the 3% retenue applies),
rates and the pickup fee rule. You manage your **pickup addresses** here (add,
edit, choose the default). To change anything else — shop details, contact
person, statut, password — contact Faffa Go.

### 4.13 If your account is suspended

You can still log in, see everything, edit or cancel **Créé** parcels, manage
addresses, cancel pickup requests and take your À vérifier decisions. You cannot
create parcels or request pickups.

---

## 5. Ramasseur — the courier app

The ramasseur picks up parcels at sellers and is the **only** person who hands
sellers their cash and their returns. Ramasseurs are employees paid outside the
app, so there is no earnings screen.

### 5.1 Getting started

1. Open the app and tap **Ramasseur**.
2. Enter your phone number and the password the admin gave you.
3. Create a **4-digit PIN**. The app asks for it each time you open it and after
   5 minutes in the background.
4. Allow **location**: the app does not open without it. (A scan is never
   blocked if the GPS has no fix yet.)
5. Choose your language in **Menu › Profil**: French or Arabic.

**Bottom bar:** **Journée** · **Ramassages** · **Scanner** (orange, centre) ·
**Caisse** · **Menu**.

### 5.2 Your day

**Journée** shows today's pickups and bon visits, and **Avant de rentrer**: what
is still open at the end of the day. **Ramassages** lists each seller to visit
today (and older ones still open), with shop name, address, créneau, the
**seller's phone**, the **contact person's name**, and **À emporter**: the bons
de versement (number and amount) and bons de retour you carry for them.

A visit may have no parcels to pick up: it is then only to deliver a bon.

### 5.3 The visit, step by step

Open the seller and follow the steps **Colis › Bon de versement › Retours ›
Terminer**:

1. **Colis** — scan each parcel label. The screen shows expected vs scanned. You
   may scan extra parcels of the same seller if they are **Créé**. Parcels not
   scanned stay with the seller.
2. **Bon de versement** — hand the cash and the paper bon to the **contact
   person** (name shown on screen; you may check their CIN). They count and sign.
   Scan the bon's **QR code**: the bon becomes **Remis**.
3. **Retours** — scan each returned parcel in front of the contact person
   (**Retour reçu**). They sign the bon de retour.
4. **Terminer le ramassage** — closes the visit. Below 5 parcels scanned, the
   seller is charged 2,000 DT; at zero, the pickup is cancelled at no cost. After
   this, no more scans for that pickup.

Bring the **signed copies** of the bons back to the depot.

### 5.4 Ma caisse

Your **Caisse** shows the bon cash you still carry. In the evening, every bon
must be either **Remis** (scanned at the seller) or brought back with its full
cash. After the depot counts, you see **Conforme** or the écart. A missing amount
is reported to HR.

### 5.5 No signal?

Keep working. Every scan is saved on the phone and sent when the signal returns;
a banner shows "3 scans en attente d'envoi". The same parcel can never be
recorded twice. Do not log out while scans are waiting.

---

## 6. Livreur — the courier app

### 6.1 Getting started

Same as the ramasseur (section 5.1), but tap **Livreur** on the login screen.

**Bottom bar:** **Journée** · **Tournée** · **Scanner** (orange, centre) ·
**Caisse** · **Menu** (Chat, Notifications, Mes gains, Profil).

### 6.2 Morning: getting your parcels

At the depot, the team scans your parcels out (**Sortie coursier**). They appear
in **Tournée**, grouped by délégation. Each stop shows the customer, localité and
délégation, the full address and landmark in large type, the **COD in large
type**, the attempt (e.g. 2/3), the seller's note, and the **Échange** /
**Ouverture autorisée** flags. **Déjà livré ici** means this customer was
delivered before; read the saved address note.

Reorder your stops with **Monter** / **Descendre**: you know the fastest route.

### 6.3 Finding the customer (no maps)

- **Appeler** — calls the customer (and phone 2).
- **WhatsApp** — opens a ready message asking the customer to guide you.
- **Point de rendez-vous** — if the customer prefers to meet at a café or
  pharmacy, record it on the parcel.
- **Chat** with the seller, or call the seller (you see their phone).

### 6.4 Delivering

Tap **Scanner** and scan the label. Two large buttons:

**Livré (green)**

1. The screen shows the COD to collect. The customer pays **exactly** this
   amount — no partial payment. If they want to pay less, it is an **Échec ·
   Refusé** and the seller decides.
2. For an **Échange** parcel, confirm you collected the old item. Not collected =
   Échec.
3. Confirm. The cash is added to your Caisse.
4. Optional: save a **note d'adresse** ("immeuble bleu à côté de la pharmacie,
   2e étage"). Every courier will see it next time a parcel goes to this phone
   number. Sellers never see it.

**Échec (red)**

1. Choose the reason: **Ne répond pas**, **Injoignable**, **Adresse incorrecte**,
   **Reporté par le client**, **Refusé**.
2. For **Reporté par le client**, choose the date the customer wants (tomorrow up
   to 7 days) and optionally **Matin / Après-midi / Soir**. You can do this even
   before visiting, when the customer asks by phone in the morning.
3. Add a note if useful. **The seller reads it** ("Visible par le vendeur").
4. Keep the parcel and bring it back to the depot tonight.

**Wrong button?** **Annuler** the last scan within 1 minute. After that, only the
admin can correct it.

**Damaged label?** Type the code by hand. It is accepted but flagged to the team.

### 6.5 Evening: back at the depot

- **Retour au dépôt** lists the failed parcels you must bring back. The depot
  scans them (**Retour de tournée**) and they leave your list.
- Hand in **all** your cash. The depot counts it; you then see **Conforme** or
  the écart. **Missing cash becomes a debt deducted from your pay.**
- A reminder arrives at the end of the day if parcels or cash are still with you.

### 6.6 Mes gains

Parcels delivered in the current period × rate − debts = amount due, the next
payment date, and your **fiches de paie**. Only delivered parcels are paid;
failed attempts are not. Your pay plan (**Journalier**, **Hebdomadaire** Monday
to Sunday, or **Mensuel**) is set by the admin; ask the admin to change it — the
change starts after the current period.

### 6.7 Notifications and chat

**Menu › Notifications**: new parcels assigned to you, Relancé parcels for today
(07:00), end-of-day reminder (18:00), new chat messages. **Menu › Chat**: the
chats of your parcels, with quick replies (**Client ne répond pas**, **Adresse
introuvable**, **Je passe dans 10 min**, **Client demande un autre jour**).
Messages written offline are sent when the signal returns.

---

## 7. Dépôt — the back office

Log in at `/admin/connexion`. Your menu: **Scan**, **Colis**, **Ramassages**,
**Tournées**, **Exceptions**, **Chats**, **Caisse**, **Retours**, **Vendeurs**,
**Coursiers**. You do not handle seller payments, courier pay, accounts or
settings.

### 7.1 Scan — the depot's scan station

Choose a mode with the large buttons, then scan parcel after parcel without
tapping in between (phone camera, or a USB barcode gun on a computer; **Activer
la caméra** to use the camera).

| Mode                    | When                                              | Result                                                                                                |
| ----------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Entrée dépôt**        | Parcels arrive from a pickup                      | **Au dépôt**                                                                                          |
| **Sortie coursier**     | Morning dispatch — choose the livreur first       | **En livraison**, assigned to that livreur                                                            |
| **Retour de tournée**   | A livreur brings back parcels — choose them first | Failed parcels are now at the depot (unlocks Changer de client); unattempted ones go back to Au dépôt |
| **Préparation retours** | Grouping returns for a seller                     | Added to that seller's bon de retour                                                                  |
| **Archivage bons**      | Signed paper bons come back                       | Bon **Archivé**                                                                                       |

- Each scan shows a clear result: **green** (done) or **red** with the reason
  (see section 12).
- **Annuler le dernier scan**: your own last scan, within 60 seconds, if nothing
  happened to the parcel since. After that, ask the admin.
- If a label needs reprinting (address changed, new customer), the scan warns
  you. Reprint it from the parcel page: **Réimprimer l'étiquette** (same code).

### 7.2 Ramassages — planning pickups

- New requests arrive as **Demandé** (you get a notification).
- Open one, check the ramasseur (pre-filled with the ramasseur of the address's
  zone; change it if needed), choose the **day** and créneau: it becomes
  **Planifié**, and the seller and the ramasseur are told.
- **À emporter** shows the bons de versement and bons de retour ready for that
  seller, so one visit covers everything.
- You cannot cancel a seller's request; the seller does it.
- A bon with no planned pickup waits: assign it a ramasseur and a day, and it
  becomes a bon-only visit.

### 7.3 Tournées — preparing the dispatch

- Parcels due today, grouped in columns by zone, under the livreur covering that
  zone. Relancé parcels appear on their chosen day.
- **Move** any parcel to another livreur; the livreur is notified.
- **"Sans coursier"** / **"Sans zone"** columns are highlighted. At launch,
  zones are left without livreurs on purpose and parcels are assigned by hand:
  these columns are normal then. Move the parcels, or simply scan them out to the
  right livreur in **Sortie coursier** — the scan is the assignment.
- Check each livreur's load before dispatch.
- **Courier absent**: mark them absent for the day (Coursiers screen). Their zones
  switch to the backup livreur and backup ramasseur, and their planned pickups
  move to the backup ramasseur.

### 7.4 Caisse — counting the couriers' cash

Every courier hands in all their cash every day.

**Handing bons to the ramasseur (morning):** **Caisse › Départ ramasseur** —
choose the ramasseur and **Remettre au ramasseur**. The bons go **En route**, and
their cash is added to what that ramasseur must bring back or deliver.

**Counting (evening), for each courier:**

1. Open the courier's session. It shows the **attendu**: the COD of their Livré
   parcels still with them (for a ramasseur: the bon cash not handed over).
2. Count the cash and enter the **compté**, then **Compter**. You can recount
   until the session is closed.
3. **Clôturer**. If a late scan changed the attendu, you'll read "Le montant
   attendu a changé : recomptez" — count again.

At **Clôturer**: the parcels' cash moves to **Au dépôt** and becomes payable to
sellers; a shortfall of a livreur becomes a **debt**; a shortfall of a ramasseur
is listed for HR; a surplus is flagged for the admin. Bons not handed over go
back to Préparé, and unreceived returns go back to Retour au dépôt.

Each courier is counted and closed on their own. The **daily summary** lists
everyone with money that day: **Ouverte**, **Comptée** or **Clôturée**.

### 7.5 Retours — bons de retour

Returns at the depot, grouped by seller. Scan them in **Préparation retours**:
each joins the seller's open bon de retour. The old item of an **exchange** is
scanned with the delivered parcel's code (no fee). The bon travels with the
seller's next pickup, like a bon de versement.

### 7.6 Exceptions

One queue of everything stuck, each row with its action. You can **Marquer
comme traité** a **Saisie manuelle** (a code typed by hand) once checked.

| Exception                                         | What to do                           |
| ------------------------------------------------- | ------------------------------------ |
| Parcel at the depot more than 48 h without a tour | Assign it                            |
| Parcel close to its 48-hour À vérifier limit      | Service client calls                 |
| Courier has not handed over their cash            | Open the Caisse                      |
| Bon en route not Remis after 24 h                 | Contact the ramasseur                |
| Signed bon not archived after 48 h                | Scan it in **Archivage bons**        |
| Pickup planned but not done                       | Re-plan it                           |
| Seller change request waiting                     | Service client applies or refuses    |
| Saisie manuelle                                   | Check, then **Marquer comme traité** |

### 7.7 What else you can see

**Colis** (read, reprint labels), **Chats** (read and write as Faffa Go),
**Vendeurs** (shop, contact name and phone, parcels — not the email or
documents), **Coursiers** (name, phone, zone, today's parcels; mark absent).

---

## 8. Service client — the back office

Log in at `/admin/connexion`. Your menu: **Colis**, **À vérifier**,
**Exceptions**, **Chats**, **Retours**, **Vendeurs**, **Coursiers**.

> **You never decide for the seller.** **Relancer**, **Retourner** and
> **Changer de client** are the seller's alone. If a seller asks you by phone,
> tell them to do it in their space.

### 8.1 À vérifier — following failed deliveries

The list of every seller's parcels in À vérifier, sorted by time left, with the
reason, the livreur's note, the attempt, where the parcel is (with the livreur /
at the depot), the customer's and the seller's contacts, and the last call.

- Call the customer or the seller when useful.
- **Noter un appel**: **Répondu** or **Pas de réponse**, plus an optional note.
  The seller sees it under **Appels Faffa Go** (as "Faffa Go", never your name).
  Calls cannot be edited or deleted; log a new one to correct.
- Focus on parcels with less than 24 hours left.

### 8.2 Change requests

Sellers ask for changes after pickup (phone, phone 2, address, landmark,
localité). Open the parcel (or the Exceptions row) and **apply** or **refuse**:

- A request is applied as a whole.
- A **new localité** can only be applied while the parcel is **at the depot**;
  while the livreur carries it, the request waits.
- **Refusing needs a reason**, which the seller reads.
- If a printed field changed, the parcel is flagged for a label reprint at the
  depot.

### 8.3 Chats

**Chats** is one inbox of every parcel chat, filtered by unread, seller or
courier. You read and write in any chat; your messages appear as **Faffa Go**.

### 8.4 Read-only screens

**Colis** (with calls logging), **Exceptions**, **Retours**, **Vendeurs**,
**Coursiers**, as described for the Dépôt.

---

## 9. Admin — the back office

The admin sees every menu item and is the only one who touches money, accounts
and settings. Everything the Dépôt and Service client do (sections 7 and 8), the
admin can do too — except the seller's decisions on À vérifier.

### 9.1 Vendeurs

**Créer un vendeur**: shop name, category, store link, contact person (full
name, phone, **email = login**), **statut** (**Patente**, **Auto-entrepreneur**,
**CIN uniquement**), the **CIN number** (8 digits, required for CIN uniquement),
and the documents: CIN front and back always, plus the patente or
auto-entrepreneur card. Documents are encrypted and visible to admins only. Copy
the credentials shown once and hand them over.

On a seller's page:

- **Voir comme le vendeur** — see exactly what the seller sees, read-only, for 30
  minutes. A banner reminds you; nothing can be changed from there.
- **Suspendre / Réactiver** — see 4.13 for what a suspended seller can still do.
- **Régénérer le mot de passe**.
- **Changer le statut** — the retenue starts or stops from the **next** bon.
- **Modifier** corrects the contact person's name or phone (a typo); **Changer
  de contact** names a new person and needs their CIN front and back.
- Parcels, amount payable now, returns waiting, bons history, delivery rate.

### 9.2 Coursiers

**Créer un coursier**: name, phone (login), CIN, vehicle and role — **Livreur**
or **Ramasseur**. One account = one role. For a livreur, the pay plan.

- **Zones**: assign each courier to zones, as titular or backup.
- **Absent** for a day (see 7.3).
- **Changer de rôle**: create a **new account** with the new role. The old one
  stays open (no new work) so the person can still see what they are owed.
- **Désactiver** stops new work immediately, but is refused while anything is
  still open (parcels, cash, bons, an open caisse, an unpaid fiche, a debt); the
  screen lists what blocks it.
- **Régénérer le mot de passe**, change zones or pay plan.

### 9.3 Paiements vendeurs — bons de versement

1. Open a seller. Every parcel **Livré** with cash **Au dépôt** and not yet paid
   is ticked. Untick any you want to hold back.
2. Check the calculation: total COD − delivery, return, change-client and pickup
   fees = base; − 3% retenue for CIN uniquement; = net.
3. **Préparer le bon**. It is numbered, printed in two copies (Exemplaire
   vendeur, Exemplaire Faffa Go) with a QR code, and attached to the seller's
   next planned pickup. With no pickup planned, assign a ramasseur and a day.
4. Put the cash with the bon. In the morning, hand them out in **Caisse ›
   Départ ramasseur** (bon **En route**).
5. The ramasseur scans it at the seller (**Remis**), the parcels become **Payé**.
6. Scan the signed copy in **Archivage bons** (**Archivé**).

- **Annuler le bon**: only while **Préparé**, with a reason. Its parcels are free
  again; the number is never reused.
- A bon for a **CIN uniquement** seller without a CIN number is refused; the
  seller appears in Exceptions.
- **Correcting a bon scanned Remis by mistake**: admin only, with a reason,
  before it is **Archivé**. The seller reads "Correction Faffa Go".

### 9.4 Caisse — the admin's part

Beyond counting (7.4): a **positive écart** stays flagged until you check it and
mark it **Vérifié** with a note (**Vérifier l'écart**). Ramasseur shortfalls,
including bons corrected after closing, are listed for HR.

### 9.5 Paie coursiers

Livreurs are paid per delivered parcel, at the rate in force the day of the
delivery. A **fiche de paie** comes due when the livreur's period has ended and
all their cash of that period is counted and closed.

1. **Paie coursiers** lists who is due (you also get a notification).
2. Prepare the fiche: period, parcels, rate, debts deducted (oldest first), net.
   If the debts are more than the pay, the rest carries over.
3. Print it, pay the livreur, mark it **Payée**.

**Cancel a debt** (e.g. the money was found): with a note. What a fiche already
deducted stays deducted.

### 9.6 Rapports

One report at a time, for a period; each exports to **CSV** or **Excel**.

| Report                  | Content                                                                      |
| ----------------------- | ---------------------------------------------------------------------------- |
| **Retenue à la source** | Monthly total withheld per seller, for the tax declaration; certificates     |
| **Chiffre d'affaires**  | Delivery, return, change-client and pickup fees by period                    |
| **Activité**            | Delivery rate, return rate, average delivery time — by seller, zone, courier |
| **Argent**              | Cash collected, handed over, paid to sellers, still held; courier debts      |
| **Paie coursiers**      | Pay per livreur and period, deductions                                       |
| **Écarts ramasseurs**   | Missing bon cash per ramasseur and month, for HR                             |

### 9.7 Colis — Forcer un statut

For correcting scanning mistakes only. A reason is required and the action is
audited. Allowed moves: between **Ramassé**, **Au dépôt** and **En livraison**;
fixing where an À vérifier / Relancé / Retour au dépôt parcel physically is; and
undoing a **Livré** whose cash is still with the livreur. Anything else touching
Livré, a return, Annulé or money is refused. Cancelling a courier's scan after
its 1-minute window is done the same way — impossible once that courier's caisse
is closed.

### 9.8 Paramètres

| Tab                  | What you set                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tarifs et règles** | **Frais**: delivery, return, change-client (1,000 DT), pickup (2,000 DT) and the free threshold (5), courier rate per parcel. **Règles**: À vérifier limit (48 h), maximum attempts (3), scan cancel window, changes of customer per parcel, clock-gap flag, minimum courier app version. **Retenue à la source** (3%). **Raisons d'échec** (read-only). **Liens de contact** for Devenir partenaire (Facebook, Instagram, TikTok, WhatsApp, phone). **Société** (raison sociale, matricule fiscal, adresse — needed for retenue certificates). **Suivi publicitaire** (Meta Pixel id; empty = off). |
| **Géographie**       | Rename gouvernorats, délégations (French and Arabic), and manage localités; see parcels filed under **Autre**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Zones**            | Create, rename, deactivate zones; attach délégations; set each zone's livreur and ramasseur, titular and backup.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Utilisateurs**     | Staff accounts: Admin, Dépôt, Service client.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

A rate change only affects parcels created **after** it.

### 9.9 Staff accounts

**Paramètres › Utilisateurs**: create an Admin, Dépôt or Service client account
with a username. One person can hold one account; at launch one person may do
all the jobs with an Admin account. The platform refuses to deactivate the last
admin.

---

## 10. The customer — public tracking

The seller's customer scans the QR code on the label, or types the code on the
home page, and lands on `/fr/suivi/FG-…` (or `/ar/…` in Arabic).

They see: **Commande enregistrée** › **Chez Faffa Go** › **En cours de
livraison** › **Livré** (or **Retourné au vendeur**, **Livraison reportée** with
the new date, **Commande annulée**); the amount to prepare while the delivery is
ahead ("Rien à payer à la livraison" if the COD is 0); and the livreur's first
name while the parcel is out for delivery.

They never see their name, phone, address, a failure reason or any internal note.

The home page presents the service, the prices and the zones served, in French
and Arabic. **Devenir partenaire** shows Faffa Go's contact links; there is no
sign-up form.

---

## 11. A typical day, hour by hour

| When           | Who            | What                                                                                      |
| -------------- | -------------- | ----------------------------------------------------------------------------------------- |
| Evening before | Vendeur        | Creates parcels, prints labels, asks for a pickup                                         |
| Evening before | Dépôt          | Plans tomorrow's pickups (day, ramasseur); Admin prepares bons de versement               |
| 07:00          | Livreurs       | Notified of Relancé parcels for today                                                     |
| Morning        | Dépôt          | Checks **Tournées**, moves parcels, scans **Sortie coursier** for each livreur            |
| Morning        | Dépôt / Admin  | **Caisse › Départ ramasseur**: bons and their cash to the ramasseurs                      |
| Day            | Livreurs       | Deliver, scan **Livré** or **Échec**                                                      |
| Day            | Ramasseurs     | Visit sellers: parcels, bons de versement, returns, **Terminer**                          |
| Day            | Dépôt          | **Entrée dépôt** for parcels arriving from pickups                                        |
| Day            | Vendeurs       | Decide on **À vérifier** parcels                                                          |
| Day            | Service client | Follows À vérifier (under 24 h first), logs calls, applies change requests, answers chats |
| 18:00          | Couriers       | End-of-day reminder if something is still with them                                       |
| Evening        | Dépôt          | **Retour de tournée** for failed parcels; **Préparation retours**; **Archivage bons**     |
| Evening        | Dépôt          | **Caisse**: count and close each courier's session                                        |
| Evening        | Admin          | Checks écarts and **Exceptions**; prepares bons de versement and fiches de paie when due  |

---

## 12. Scan refusals and what to do

A red result always says why. The most common:

| Message                                     | Meaning and what to do                                                                  |
| ------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Code inconnu**                            | Code not found. Check the label; type the code by hand if it is damaged.                |
| **Colis déjà livré**                        | Already delivered. Nothing to do.                                                       |
| **Mauvais mode**                            | This parcel cannot be scanned in this mode now. Check the mode and the parcel's status. |
| **Colis d'un autre coursier**               | Another courier carries this parcel. Check who and scan with the right courier chosen.  |
| **Déjà scanné — Livré à 14:32**             | (App) You already recorded this. Nothing to do.                                         |
| Courier unavailable                         | The chosen courier is inactive or marked absent today. Choose another.                  |
| **Le montant attendu a changé : recomptez** | (Caisse) A scan arrived after your count. Count again, then close.                      |
| **Disponible au retour au dépôt**           | (Seller) Changer de client waits until the depot scans the parcel back.                 |

When the phone was offline and the parcel changed in the meantime (moved to
another courier, cancelled), the app shows the refusal with its reason once the
scan is sent.

---

## 13. Questions people ask

**I forgot my password.** Contact the Faffa Go admin; they give you a new one.
There is no self-service reset.

**The courier asks the customer for more / less than the COD.** Never. The
customer pays exactly the COD shown. If they refuse, it is an Échec · Refusé.

**Can Faffa Go return a parcel for me?** No. Only you (Retourner), the 48-hour
rule or the 3rd failed attempt make a return.

**Why is my money not paid yet?** A delivered parcel is payable once the
livreur's cash has been counted at the depot (**Au dépôt**). Payments are then
prepared by Faffa Go and brought by the ramasseur, usually with a pickup.

**Why was I charged 2,000 DT for a pickup?** Fewer than 5 parcels were scanned
at that pickup. From 5 it is free.

**Can someone else sign for my payment?** No. Only the contact person
registered with Faffa Go receives cash and returns.

**The courier app says it must be updated.** Install the new version Faffa Go
gives you. Scans waiting to be sent are sent first.

**I scanned the wrong button.** Annuler within 1 minute; after that, call the
admin.

**Where is the customer's address note?** Couriers and staff see it on the parcel.
Sellers never do.

---

## 14. Status reference

**Parcel**

| Status              | Meaning                                                           |
| ------------------- | ----------------------------------------------------------------- |
| **Créé**            | Created by the seller, not picked up yet                          |
| **Ramassé**         | Scanned by the ramasseur at the seller                            |
| **Au dépôt**        | Scanned in at the depot                                           |
| **En livraison**    | Out with a livreur                                                |
| **Livré**           | Delivered, COD collected                                          |
| **À vérifier**      | Delivery failed, waiting for the seller's decision (with reason)  |
| **Relancé**         | New attempt planned (by the seller, or postponed by the customer) |
| **Retour au dépôt** | Decided as a return, waiting to go back                           |
| **Retour en route** | With the ramasseur, on its way back to the seller                 |
| **Retour reçu**     | Handed back to the seller; bon de retour signed                   |
| **Annulé**          | Cancelled by the seller before pickup                             |

**Cash** (delivered parcels only): **Chez le coursier** › **Au dépôt** › **Payé**

| Object                  | Statuses                                   |
| ----------------------- | ------------------------------------------ |
| Ramassage               | Demandé › Planifié › Effectué · Annulé     |
| Bon de versement        | Préparé › En route › Remis › Archivé       |
| Bon de retour           | Préparé › En route › Remis › Archivé       |
| Session de caisse       | Ouverte › Comptée › Clôturée               |
| Dette coursier          | En cours › Déduite · Annulée               |
| Fiche de paie           | À payer › Payée                            |
| Demande de modification | En attente › Appliquée · Refusée · Retirée |
| Vendeur                 | Actif · Suspendu                           |
| Coursier                | Actif · Inactif                            |

---

## 15. Glossary

| Term                         | Meaning                                                                                 |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| **COD**                      | Cash on delivery: the amount the customer pays the livreur                              |
| **Bon de versement (BV)**    | The paper and record of a cash payment to a seller                                      |
| **Bon de retour (BR)**       | The paper and record of returns handed back to a seller                                 |
| **Retenue à la source**      | 3% tax withheld for CIN uniquement sellers, with a certificate (`RS-…`)                 |
| **Contact person**           | The seller's registered person (CIN holder), the only one who receives cash and returns |
| **Attendu / Compté / Écart** | What a courier should hand in / what they handed in / the difference                    |
| **Fiche de paie (FP)**       | A livreur's pay slip for a period                                                       |
| **Zone**                     | A group of délégations with a livreur and a ramasseur (titular and backup)              |
| **Tournée**                  | A livreur's parcels for the day                                                         |
| **Note d'adresse**           | A courier's saved description of where a customer lives                                 |
| **Saisie manuelle**          | A code typed by hand instead of scanned; accepted but flagged                           |
| **Voir comme le vendeur**    | The admin's read-only view of a seller's space                                          |
