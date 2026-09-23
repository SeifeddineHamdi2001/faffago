# Faffa Go — décisions

Every business and technical rule decided after the specs were written. The
specs in this folder stay the source of truth; where a decision changes one, the
spec has been amended and its version bumped, and the entry says so.

**How the numbering works.** Three series, because they were answered in three
rounds and are referenced by those names in the code and in the commit history:

| Series         | What it is                                                                           |
| -------------- | ------------------------------------------------------------------------------------ |
| **A-1 … A-24** | Ambiguities and contradictions found while reviewing the specs against the schema    |
| **Q1 … Q16**   | Follow-up clarifications on the answers to those                                     |
| **D-1 … D-10** | Decisions taken during the build: D-1 to D-3 shape the schema, D-4 to D-10 are rules |

Entries are never renumbered. Where a later answer overrides an earlier one, the
earlier entry says which one supersedes it rather than being rewritten.

> D-4 to D-10 were briefly numbered D-1 to D-7 in the first version of this
> file, which collided with the schema decisions already approved under those
> names. The code comments now say D-4 and D-9.

---

## Contents

**Schema — D-1 to D-3**

- [D-1 · `ParcelLocation` is its own column](#d-1--parcellocation-is-its-own-column)
- [D-2 · `SellerCharge` is the single deduction table](#d-2--sellercharge-is-the-single-deduction-table)
- [D-3 · Actor columns carry no Prisma relation](#d-3--actor-columns-carry-no-prisma-relation)

**Rules decided during the build — D-4 to D-10**

- [D-4 · Relancer, Retourner and Changer de client are the seller's alone](#d-4--relancer-retourner-and-changer-de-client-are-the-sellers-alone)
- [D-5 · "Voir comme le vendeur" is read-only impersonation](#d-5--voir-comme-le-vendeur-is-read-only-impersonation)
- [D-6 · Login throttling is held in memory](#d-6--login-throttling-is-held-in-memory)
- [D-7 · The courier PIN never reaches the server](#d-7--the-courier-pin-never-reaches-the-server)
- [D-8 · A parcel is attempted at most five times](#d-8--a-parcel-is-attempted-at-most-five-times)
- [D-9 · "Reporté par le client" is planned, not verified](#d-9--reporté-par-le-client-is-planned-not-verified)
- [D-10 · Auth is phase 1, not phase 0](#d-10--auth-is-phase-1-not-phase-0)

**Money — A-1 to A-5**

- [A-1 · The delivery fee is charged only on a delivered parcel](#a-1--the-delivery-fee-is-charged-only-on-a-delivered-parcel)
- [A-2 · A bon de versement is never negative](#a-2--a-bon-de-versement-is-never-negative)
- [A-3 · The retenue base and its rounding](#a-3--the-retenue-base-and-its-rounding)
- [A-4 · The comma is the decimal separator](#a-4--the-comma-is-the-decimal-separator)
- [A-5 · One bon per parcel, and how a bon is cancelled](#a-5--one-bon-per-parcel-and-how-a-bon-is-cancelled)

**Statuses — A-6 to A-8**

- [A-6 · Attempts, Relancer and Changer de client](#a-6--attempts-relancer-and-changer-de-client)
- [A-7 · A return decided while the courier still has the parcel](#a-7--a-return-decided-while-the-courier-still-has-the-parcel)
- [A-8 · Parcels that go out and come back unattempted](#a-8--parcels-that-go-out-and-come-back-unattempted)

**Operations — A-9 to A-16**

- [A-9 · The label is reprinted with the same code](#a-9--the-label-is-reprinted-with-the-same-code)
- [A-10 · The recovered item of an exchange](#a-10--the-recovered-item-of-an-exchange)
- [A-11 · Cancelling a scan](#a-11--cancelling-a-scan)
- [A-12 · What "today" means for the Caisse](#a-12--what-today-means-for-the-caisse)
- [A-13 · Pickup fee at zero parcels and on a cancelled pickup](#a-13--pickup-fee-at-zero-parcels-and-on-a-cancelled-pickup)
- [A-14 · Which zone drives the ramasseur](#a-14--which-zone-drives-the-ramasseur)
- [A-15 · The livreur rate is frozen at delivery](#a-15--the-livreur-rate-is-frozen-at-delivery)
- [A-16 · Pay periods](#a-16--pay-periods)

**Interfaces and accounts — A-17 to A-24**

- [A-17 · What the seller and the customer see after a client change](#a-17--what-the-seller-and-the-customer-see-after-a-client-change)
- [A-18 · Place names in French and Arabic](#a-18--place-names-in-french-and-arabic)
- [A-19 · Parcel codes](#a-19--parcel-codes)
- [A-20 · Login identifiers and passwords](#a-20--login-identifiers-and-passwords)
- [A-21 · Address and landmark are separate fields](#a-21--address-and-landmark-are-separate-fields)
- [A-22 · Manual code entry surfaces in Exceptions](#a-22--manual-code-entry-surfaces-in-exceptions)
- [A-23 · One chat thread per parcel](#a-23--one-chat-thread-per-parcel)
- [A-24 · Fixed COD, and the courier app in two languages](#a-24--fixed-cod-and-the-courier-app-in-two-languages)

**Clarifications — Q1 to Q16**

- [Q1 to Q3 · Public tracking](#q1-to-q3--public-tracking)
- [Q4 to Q6 · Languages](#q4-to-q6--languages)
- [Q7 to Q13 · Credentials and sessions](#q7-to-q13--credentials-and-sessions)
- [Q14 to Q16 · Chat](#q14-to-q16--chat)

---

## Schema

### D-1 · `ParcelLocation` is its own column

Status and physical position move independently. _Retour de tournée_ keeps the
status À vérifier while moving the parcel to the depot, and it is that move,
not the status, which unlocks Changer de client (Vendeur 4.9, Admin 4.2).
Encoding it in the status would have meant inventing new statuses.

**Where.** `ParcelLocation` in `packages/shared/src/statuses.ts`,
`parcels.location`.

### D-2 · `SellerCharge` is the single deduction table

Delivery, return, change-client and pickup fees are all rows in one table, each
carrying the amount frozen on its parcel. A bon de versement prints its
deduction lines straight from it, so a rate change can never alter an old bon.

**Where.** `seller_charges`, and `buildBonVersement` in
`packages/shared/src/fees.ts`.

### D-3 · Actor columns carry no Prisma relation

"Who did this" columns are plain indexed UUIDs in `schema.prisma`; their foreign
keys are declared in the first migration. Declaring all twenty-five as Prisma
relations would put twenty-five back-relations on `User`.

`audit_log.actorUserId` deliberately has no foreign key at all: the audit trail
must outlive every other table and never be blocked by a reference check.

---

## Rules decided during the build

### D-4 · Relancer, Retourner and Changer de client are the seller's alone

Service client follows up — calls the customer, writes in the parcel chat,
chases the seller — but never decides **Relancer**, **Retourner** or **Changer
de client**. If a seller asks by phone, service client tells him to do it in his
space.

**Why.** Faffa Go never decides a return (CLAUDE.md; Admin rule 13; Vendeur
decision 13). A team member pressing Relancer is a smaller version of the same
mistake: it commits the seller's money and his customer relationship.

**Where.** `ALLOWED_ACTORS` in `packages/shared/src/parcel-state-machine.ts`
lists only `VENDEUR` for the three decisions; a test asserts every other role is
refused.

### D-5 · "Voir comme le vendeur" is read-only impersonation

Built as part of the auth work (phase 1).

| Rule     | Detail                                                                                      |
| -------- | ------------------------------------------------------------------------------------------- |
| Who      | **ADMIN only**                                                                              |
| What     | **Read-only.** Any write or action is refused while impersonating                           |
| Token    | Its own token type, 30 minutes, **no refresh**                                              |
| Visible  | Banner in the seller space: _"Vous consultez le compte de [shop name]"_ with an exit button |
| Recorded | Start **and** end written to `audit_log`: admin, seller, time                               |

**Why.** The admin needs to see exactly what a seller sees in order to answer
him (Admin 4.14). He does not need to act as him, and an unbounded impersonation
token would be the most dangerous credential the platform issues.

### D-6 · Login throttling is held in memory

Rate limiting per identifier and per IP, exponential backoff, **no permanent
lockout**, state held in the API process.

**Why.** One VPS, one process. A restart clearing a backoff is not a hole when
there is no lockout to bypass, and a courier standing at a customer's door must
never be locked out until an admin intervenes. A `login_attempt` table can be
added later if the Exceptions queue needs the history.

### D-7 · The courier PIN never reaches the server

The 4-digit PIN that protects the app when it is reopened (Coursier 4.12) is set
by the courier on his own phone and stored only there. `Courier.pinHash` has
been dropped.

A courier who forgets his PIN logs out and logs back in with his password; the
admin regenerates that password if he has forgotten it too.

**Why.** An unused credential column is a liability, and a PIN the server can
check is a second password to protect for no gain.

**Where.** Migration `20260924000000_postponement_and_drop_pin`. Supersedes the
"password change" line of Coursier 4.12, which is why that spec is now v1.8.

### D-8 · A parcel is attempted at most five times

Three attempts, and **Changer de client** resets the counter for a fresh three.
In practice that caps a parcel at **five**: the third failure returns the parcel
automatically, and Changer de client needs the status À vérifier, so the seller
has to change customer after the second failure at the latest. 2 + 3.

Changer de client stays limited to **once per parcel**. Confirms and corrects
A-6, which said six.

**Where.** `maxClientChangesPerParcel: 1` in `packages/shared/src/settings.ts`;
exercised end to end by the test _"caps a parcel at five attempts in practice,
not six"_.

### D-9 · "Reporté par le client" is planned, not verified

**This changes a rule in the specs.**

> A failed delivery always goes to À vérifier — CLAUDE.md

A customer postponement is the exception. When the customer himself asks for
another day, nothing needs verifying and nobody needs to decide: the courier
plans it and the parcel waits for that day.

#### The courier

- In the **Échec** flow, the reason **Reporté par le client** requires a date.
  Date picker, default tomorrow, allowed from **tomorrow up to 7 days ahead**.
- Optional slot — **Matin / Après-midi / Soir** — and an optional note.
- Also usable **before any visit**, when the customer asks by phone in the
  morning.
- It **counts as a delivery attempt**.

#### What happens

- Status → **Relancé**, with the date and the slot recorded.
- Event `ECHEC_LIVRAISON`, reason `REPORTE_PAR_LE_CLIENT`, date in the metadata.
- **Not** À vérifier. No 48-hour deadline: `verifyDeadlineAt` stays null.
- The livreur brings it back with **Retour de tournée**: the parcel moves to the
  depot, the status stays Relancé.
- On the chosen day it appears in **Tournées** for the zone's livreur like any
  relancé parcel, and the courier is notified (`COLIS_RELANCE_AUJOURDHUI`).
- **If it was the third attempt the three-attempt rule wins**: automatic return,
  no postponement.

#### The seller

- Notified: _"Livraison reportée au [date] à la demande du client"_.
- His parcel shows **Reporté au [date]** with the slot and the courier's note.
- Until the parcel goes out again he can **change the date** — same 7-day
  window — or choose **Retourner**. **Changer de client** becomes possible once
  the parcel is back at the depot.

#### The customer

Public tracking reads **Livraison reportée** with the new date. No reason text,
and the failure event itself never appears in the public timeline.

#### What this needed, beyond the rule itself

1. **`Parcel.relaunchOrigin`** (`VENDEUR` | `CLIENT`). The seller's own Relancer
   and a customer postponement both land on Relancé but read differently, so the
   origin is stored rather than guessed.
2. **A second public status, `LIVRAISON_REPORTEE_CLIENT`.** `docs/landing.md`
   4.2 is split accordingly and is now **v1.2**.
3. **`Retourner` and `Changer de client` now also work from Relancé**, for both
   origins, with no gating.
4. **The seller's own Relancer now carries a date**, validated in the same 1–7
   day window (Vendeur 4.9 already says he picks a date and slot).
5. **`RelaunchSlot` is a closed list** where the first migration had free text.

**Where.** `packages/shared/src/parcel-state-machine.ts` (the `SCAN_ECHEC`
branch, `DECISION_CHANGER_DATE`, `isValidPostponementDate`, `isDueForTour`),
`packages/shared/src/public-tracking.ts` (`publicStatusFor`), migration
`20260924000000_postponement_and_drop_pin`, tests in
`packages/shared/src/__tests__/postponement.test.ts`.

### D-10 · Auth is phase 1, not phase 0

`docs/PROGRESS.md` had the login and the role guards under phase 0 alongside the
monorepo and the schema. They are their own piece of work and are now phase 1;
everything after has shifted by one, and the old "phase 6b" is phase 8.

---

## Money

### A-1 · The delivery fee is charged only on a delivered parcel

A returned parcel pays the **return fee only**, never both. The change-client
fee of 1,000 DT is charged **on top** of whatever the parcel ends up paying.

**Where.** `ParcelEffect.CREER_FRAIS_LIVRAISON` is emitted only by `SCAN_LIVRE`;
`CREER_FRAIS_RETOUR` only by the three ways a return is decided.

### A-2 · A bon de versement is never negative

If the net would be zero or below, no bon is generated: the charges stay
`EN_ATTENTE` and carry to the next one. If the net is positive but some charges
do not fit, charges are taken **oldest first** and the walk stops at the first
one that would push the net to zero or below; that charge and everything after
it carry over. The admin sees a **solde débiteur** per seller.

Because a charge that does not fit is always carried, the net is positive by
construction; the only case with no bon at all is having nothing to pay.

**Where.** `buildBonVersement` in `packages/shared/src/fees.ts`, and the CHECK
constraint `bons_versement_net_positive`, which also verifies the lines add up.

### A-3 · The retenue base and its rounding

- **(a)** The pickup fee **is** a Faffa Go fee and is inside the base.
  Base = total COD − all Faffa Go fees on that bon.
- **(b)** Rounded **half-up at the millime**, in one function so the accountant
  can change it in one place.

**Where.** `applyRateBps` in `packages/shared/src/money.ts`; `computeRetenue` in
`fees.ts`. Still to be signed off by the accountant.

### A-4 · The comma is the decimal separator

2,000 DT = `2000` millimes. 1,000 DT = `1000` millimes. 85,000 DT = `85000`.

### A-5 · One bon per parcel, and how a bon is cancelled

- **(a)** A parcel belongs to **one bon only**; the unique constraint stays.
- **(b)** A bon not remis today is **not** cancelled. The cash goes back into the
  caisse (`CaisseSessionBon.returnedMillimes`), the bon returns to **Préparé**
  and goes out again.
- An admin-only **Annuler le bon** is allowed while it is Préparé, or En route
  and brought back, with a reason, audited: the parcels become unpaid again, the
  charges go back to `EN_ATTENTE`, and **the number is never reused**.

**Where.** `BonStatus.ANNULE`, added for this path and not part of the flow the
specs draw. `CashTransition.BON_ANNULE` returns the parcels to _Au dépôt_.

---

## Statuses

### A-6 · Attempts, Relancer and Changer de client

The third failed attempt is an **automatic return**, with no seller decision.
Relancer is bounded only by that cap. Changer de client resets the counter to
zero and is limited to **once per parcel**.

> Superseded in part by **D-8**: the practical maximum is five attempts, not
> six, because Changer de client needs the status À vérifier and the third
> failure has already returned the parcel.

### A-7 · A return decided while the courier still has the parcel

The status flips to **Retour au dépôt** on the seller's decision; the location
stays _Avec le livreur_ until the depot scan. The 48-hour clock stops at the
decision, and the return fee charge is created there as `EN_ATTENTE`.

### A-8 · Parcels that go out and come back unattempted

**Retour de tournée** also accepts a parcel still _En livraison_ with no attempt:
status back to **Au dépôt**, location _Au dépôt_, attempt counter unchanged, no
failure reason, no new status.

**Where.** The `EN_LIVRAISON` branch of `SCAN_RETOUR_DE_TOURNEE`.

---

## Operations

### A-9 · The label is reprinted with the same code

After a client change, or a phone or address correction, the depot reprints the
label with the **same code**. **Réimprimer l'étiquette** is available to DEPOT
and ADMIN. _(Screen: phase 4.)_

### A-10 · The recovered item of an exchange

- **(a)** **No return fee** on the recovered item.
- **(b)** It gets its **own row** in Retours.

**Where.** `BonRetourItemType.ARTICLE_RECUPERE`, `Parcel.exchangeItemStatus`.

### A-11 · Cancelling a scan

The one-minute window is measured on **device time**. Once the caisse session is
**Clôturée** the scan can no longer be cancelled; only an admin **Forçage
statut** can correct it, audited.

### A-12 · What "today" means for the Caisse

The business day comes from the **device time**, so a scan made at 23:40 and
synced the next morning still counts for the day the courier worked. A scan
whose device clock is more than **15 minutes** from the server clock is accepted
but **flagged**.

**Where.** `businessDateOf` and `isClockSkewSuspect` in
`packages/shared/src/fees.ts`; `scans.businessDate` and `scans.clockSkewFlagged`.

### A-13 · Pickup fee at zero parcels and on a cancelled pickup

**Zero parcels scanned costs nothing** — the visit produced no pickup, so it is
treated as cancelled. A pickup cancelled after being Planifié costs nothing in
v1.

**Where.** `computePickupFee`.

### A-14 · Which zone drives the ramasseur

The zone of the **address used for that specific pickup**, not a single zone per
seller.

### A-15 · The livreur rate is frozen at delivery

`Parcel.courierRateMillimes` is written when the parcel is scanned **Livré**, so
a later rate change cannot move pay already earned.

**Where.** `ParcelEffect.FIGER_TARIF_COURSIER`; `buildPayslip` sums the frozen
rates rather than multiplying by one current rate.

### A-16 · Pay periods

**Hebdomadaire runs Monday to Sunday.** A plan change takes effect at the start
of the next period, never mid-period.

**Where.** `payPeriodFor` in `packages/shared/src/fees.ts`.

---

## Interfaces and accounts

### A-17 · What the seller and the customer see after a client change

- The seller always sees the **full recipient details** of his own parcels; he
  entered them.
- After **Changer de client** the parcel shows the **new** customer everywhere,
  exactly like a new parcel. The previous customer survives only in
  `parcel_client_changes`, which is staff-visible.
- The timeline shows a **Changement de client** event, on the seller's timeline
  and on public tracking.

> The clause about public tracking showing no COD was **superseded by Q1**:
> landing 4.1 stands as written, amount included.

### A-18 · Place names in French and Arabic

Gouvernorats and délégations carry **both** names, both required in the seed,
and each interface shows the one for its language. The CSV import accepts either
name or the code.

> Refined by **Q4**: only the public site and the courier app ever show Arabic.

### A-19 · Parcel codes

`FG-` plus **8 characters** of the Crockford alphabet — the digits minus I, L, O
and U, so nothing is misread off a damaged thermal label. Random, never
sequential.

**Where.** `packages/shared/src/codes.ts`.

### A-20 · Login identifiers and passwords

| Role                         | Logs in with                                  |
| ---------------------------- | --------------------------------------------- |
| Vendeur                      | **Email** + password                          |
| Admin, Dépôt, Service client | **Username** + password                       |
| Livreur, Ramasseur           | **Phone** + password, after choosing the role |

All accounts are created by the admin. The password is generated at random (12+
characters, none that can be confused when read aloud), shown **once** in a copy
box, and stored only as an **argon2id** hash. Nobody but the admin can change a
password; **Régénérer le mot de passe** is available on any account at any time
and revokes every session. Every creation and regeneration is audited, without
the password.

Phone stops being a login identifier for the web, so `@@unique([phone, role])`
stays only to keep a phone from being reused within a role.

**Changes the specs.** `docs/vendeur.md` is now **v1.6** and `docs/admin.md`
**v1.10**, with a new section _Identifiants et mots de passe_.

### A-21 · Address and landmark are separate fields

The landmark stays its own optional field on the seller's form, because the
courier screen shows it separately and large.

### A-22 · Manual code entry surfaces in Exceptions

A **Saisie manuelle** row is added to the Exceptions queue. _(Screen: phase 4.)_

**Where.** `scans.manualEntry`, indexed for that query.

### A-23 · One chat thread per parcel

One thread per parcel, from the courier's assignment until the parcel is
delivered and paid or the return is received. A new livreur sees the whole
previous conversation; `ChatThread.courierId` points at the current one and old
messages keep their sender. **The ramasseur never joins.**

> Refined by **Q15**, which adds the locked state.

### A-24 · Fixed COD, and the courier app in two languages

The COD amount is **fixed**; there is no partial payment. If the customer wants
to pay less it is an Échec with the reason _Refusé_. The courier app is French
and Arabic, so notifications are stored as **type + parameters** and rendered in
the courier's language rather than as text.

---

## Clarifications

### Q1 to Q3 · Public tracking

- **Q1.** Landing 4.1 stands as written: chevron line, public status, date of
  last update, **shop name**, **délégation**, and the **amount to prepare in
  cash**. This reverses the clause in A-17 that removed the amount.
- **Q2.** The public timeline is a **whitelist**: Commande enregistrée → Chez
  Faffa Go → En cours de livraison → Changement de client → Livré / Retourné au
  vendeur / Commande annulée, each with a date. No failure events, no depot
  scans, no names except the livreur's first name on the current _En cours de
  livraison_ line. The status label itself still follows landing 4.2.
- **Q3.** After a client change the code shows _Changement de client_ and then
  the new delivery's progress, shop name, délégation and amount. Intended: none
  of it is personal data about the new customer.

**Where.** `PUBLIC_TIMELINE_EVENT_TYPES` and `PublicTrackingView` in
`packages/shared/src/public-tracking.ts`.

### Q4 to Q6 · Languages

- **Q4.** The **seller space and the back office are French only** — no
  right-to-left, no language switch. The public site follows the locale in the
  URL (`/fr` → `nameFr`, `/ar` → `nameAr`); the courier app follows
  `User.langue`. The seller space, the back office, the CSV template and every
  PDF always use `nameFr`.
- **Q5.** The CSV accepts the **délégation code alone**, or **gouvernorat +
  délégation** together. Names are matched without case or accents, in French or
  Arabic. Ambiguous or unknown is a **row error** in the preview, never a guess.
  The template page offers a downloadable délégation list with codes.
- **Q6.** The printed label always uses `nameFr`.

**Where.** `packages/shared/src/geo.ts` — `delegationNameFor`,
`normalizeForMatch`, `resolveDelegation`.

### Q7 to Q13 · Credentials and sessions

- **Q7.** The admin-only password rule covers **couriers too**; the password
  change is gone from Coursier 4.12. The PIN stays device-local (see D-7).
- **Q8.** `@@unique([phone, role])` stays **global**. Two sellers, or two staff,
  never share a phone number.
- **Q9.** The system **refuses to deactivate the last active admin** and refuses
  to regenerate his password from the back office. That case is handled on the
  server with `pnpm --filter @faffago/api admin:reset <username>`, audited. An
  admin may regenerate another admin's password, audited.
- **Q10.** Rate limiting per identifier and per IP with exponential backoff and
  **no permanent lockout** (see D-6).
- **Q11.** Web refresh token **7 days**; staff idle logout **30 minutes**;
  sellers no idle logout. Courier refresh token **90 days**, PIN to reopen.
- **Q12.** A forced logout **never deletes the local `scan_queue`**. Pending
  scans are flushed after the courier logs back in and keep their original
  device time and `clientScanId`.
- **Q13.** The seller's email is **required, unique, case-insensitive, stored
  lowercase**, and is never used to send anything. Usernames are lowercase
  `a-z 0-9 . _ -`, at least 4 characters, unique without case.

**Where.** `admin-reset.ts`; the CHECK constraints
`users_login_identifier_matches_role`, `users_email_is_lowercase`,
`users_username_format` and the two lowercase unique indexes. The throttling,
the session lifetimes and the last-admin guard are built in phase 1.

### Q14 to Q16 · Chat

- **Q14.** The thread opens on the **Sortie coursier** scan, not when the
  Tournées screen pre-fills a column.
- **Q15.** It goes **read-only** when the parcel is scanned back at the depot;
  Faffa Go staff can still read and reply, which is how À vérifier and returns
  are followed up. When the parcel goes out again — after Relancer or Changer de
  client — the **same thread reopens** with the new livreur, who sees the whole
  history. It closes for good when the parcel is delivered and paid, or the
  return is received.
- **Q16.** No livreur, no thread.

**Where.** `packages/shared/src/chat.ts` — `chatStateFor` derives
`OUVERT` / `VERROUILLE` / `CLOS` from the parcel, so the thread cannot drift out
of step with it.
