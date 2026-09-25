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
| **D-1 … D-87** | Decisions taken during the build: D-1 to D-3 shape the schema, D-4 to D-87 are rules |

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

**Rules decided during the build — D-4 to D-87**

- [D-4 · Relancer, Retourner and Changer de client are the seller's alone](#d-4--relancer-retourner-and-changer-de-client-are-the-sellers-alone)
- [D-5 · "Voir comme le vendeur" is read-only impersonation](#d-5--voir-comme-le-vendeur-is-read-only-impersonation)
- [D-6 · Login throttling is held in memory](#d-6--login-throttling-is-held-in-memory)
- [D-7 · The courier PIN never reaches the server](#d-7--the-courier-pin-never-reaches-the-server)
- [D-8 · A parcel is attempted at most five times](#d-8--a-parcel-is-attempted-at-most-five-times)
- [D-9 · "Reporté par le client" is planned, not verified](#d-9--reporté-par-le-client-is-planned-not-verified)
- [D-10 · Auth is phase 1, not phase 0](#d-10--auth-is-phase-1-not-phase-0)
- [D-11 · Screen access for Dépôt and Service client](#d-11--screen-access-for-dépôt-and-service-client)
- [D-12 · Deactivating a courier is refused while work is open](#d-12--deactivating-a-courier-is-refused-while-work-is-open)
- [D-13 · A 10-second grace window on refresh tokens](#d-13--a-10-second-grace-window-on-refresh-tokens)
- [D-14 · Outdated courier apps reach the scan upload only](#d-14--outdated-courier-apps-reach-the-scan-upload-only)
- [D-15 · The browser never holds a token](#d-15--the-browser-never-holds-a-token)
- [D-16 · Demo accounts for development only](#d-16--demo-accounts-for-development-only)
- [D-17 · Localités: a third level under the délégation](#d-17--localités-a-third-level-under-the-délégation)
- [D-18 · "Seed et Paramètres" is phase 2](#d-18--seed-et-paramètres-is-phase-2)
- [D-19 · The Grand Tunis geography](#d-19--the-grand-tunis-geography)
- [D-20 · Paramètres](#d-20--paramètres)
- [D-21 · No parcel status changes without its event](#d-21--no-parcel-status-changes-without-its-event)
- [D-22 · Phase 3 has no HTTP endpoint](#d-22--phase-3-has-no-http-endpoint)
- [D-23 · The old item of an échange at delivery](#d-23--the-old-item-of-an-échange-at-delivery)
- [D-24 · `closedAt` is the end of the parcel's life](#d-24--closedat-is-the-end-of-the-parcels-life)
- [D-25 · What a suspended seller can still do](#d-25--what-a-suspended-seller-can-still-do)
- [D-26 · Another seller's parcel does not exist](#d-26--another-sellers-parcel-does-not-exist)
- [D-27 · A deactivated localité takes no new parcel](#d-27--a-deactivated-localité-takes-no-new-parcel)
- [D-28 · Cancelling after pickup](#d-28--cancelling-after-pickup)
- [D-29 · Relancer carries its date](#d-29--relancer-carries-its-date)
- [D-30 · The 48-hour clock starts at the server](#d-30--the-48-hour-clock-starts-at-the-server)
- [D-31 · A cancelled order's public timeline ends at Commande annulée](#d-31--a-cancelled-orders-public-timeline-ends-at-commande-annulée)
- [D-32 · Seller documents: encrypted, private, kept](#d-32--seller-documents-encrypted-private-kept)
- [D-33 · Creating a seller](#d-33--creating-a-seller)
- [D-34 · A statut change applies to the next bon](#d-34--a-statut-change-applies-to-the-next-bon)
- [D-35 · Ramassage requests](#d-35--ramassage-requests)
- [D-36 · What the label's barcode and QR hold](#d-36--what-the-labels-barcode-and-qr-hold)
- [D-37 · CSV import](#d-37--csv-import)
- [D-38 · The seller's timeline](#d-38--the-sellers-timeline)
- [D-39 · What phase 4 contains](#d-39--what-phase-4-contains)
- [D-40 · The net shown on Détail du colis](#d-40--the-net-shown-on-détail-du-colis)
- [D-41 · Changing the COD before pickup](#d-41--changing-the-cod-before-pickup)
- [D-42 · Correcting the contact, or changing it](#d-42--correcting-the-contact-or-changing-it)
- [D-43 · The site's domain is an environment variable](#d-43--the-sites-domain-is-an-environment-variable)
- [D-44 · Demander une modification](#d-44--demander-une-modification)
- [D-45 · What a label prints, Arabic included](#d-45--what-a-label-prints-arabic-included)
- [D-46 · Mes colis and Détail du colis](#d-46--mes-colis-and-détail-du-colis)
- [D-47 · Pickup requests and Profil](#d-47--pickup-requests-and-profil)
- [D-48 · Tableau de bord: what happened over a period](#d-48--tableau-de-bord-what-happened-over-a-period)
- [D-49 · Browser tests: Playwright on PGlite, a merge gate](#d-49--browser-tests-playwright-on-pglite-a-merge-gate)
- [D-50 · What phase 5 contains](#d-50--what-phase-5-contains)
- [D-51 · Geography and zones in Paramètres](#d-51--geography-and-zones-in-paramètres)
- [D-52 · Marking a courier absent](#d-52--marking-a-courier-absent)
- [D-53 · Depot scans](#d-53--depot-scans)
- [D-54 · Cancelling a web scan](#d-54--cancelling-a-web-scan)
- [D-55 · Tournées](#d-55--tournées)
- [D-56 · Forcer un statut in phase 5](#d-56--forcer-un-statut-in-phase-5)
- [D-57 · Applying a change request](#d-57--applying-a-change-request)
- [D-58 · Planning pickups](#d-58--planning-pickups)
- [D-59 · Marquer comme traité on Saisie manuelle](#d-59--marquer-comme-traité-on-saisie-manuelle)
- [D-60 · The seller's timeline shows the phone's time](#d-60--the-sellers-timeline-shows-the-phones-time)
- [D-61 · The ramasseur's bon scan steps wait for phase 8](#d-61--the-ramasseurs-bon-scan-steps-wait-for-phase-8)
- [D-62 · Mes gains (livreur) waits for phase 8](#d-62--mes-gains-livreur-waits-for-phase-8)
- [D-63 · GPS: required to open the app, never blocks a scan](#d-63--gps-required-to-open-the-app-never-blocks-a-scan)
- [D-64 · One queue, one route](#d-64--one-queue-one-route)
- [D-65 · Cancelling a courier's scan](#d-65--cancelling-a-couriers-scan)
- [D-66 · What Livré confirms](#d-66--what-livré-confirms)
- [D-67 · Pickup scans and Terminer le ramassage](#d-67--pickup-scans-and-terminer-le-ramassage)
- [D-68 · Mémoire d'adresse](#d-68--mémoire-dadresse)
- [D-69 · The courier app's technical choices](#d-69--the-courier-apps-technical-choices)
- [D-70 · Relancer corrects the parcel directly](#d-70--relancer-corrects-the-parcel-directly)
- [D-71 · The seller reads the courier's note on a failure](#d-71--the-seller-reads-the-couriers-note-on-a-failure)
- [D-72 · Changer de client withdraws a waiting change request](#d-72--changer-de-client-withdraws-a-waiting-change-request)
- [D-73 · Appels Faffa Go](#d-73--appels-faffa-go)
- [D-74 · Changer de client, in detail](#d-74--changer-de-client-in-detail)
- [D-75 · The 48-hour job](#d-75--the-48-hour-job)
- [D-76 · The in-app alert, the lists and the wording](#d-76--the-in-app-alert-the-lists-and-the-wording)
- [D-77 · Demo parcels waiting on the seller](#d-77--demo-parcels-waiting-on-the-seller)
- [D-78 · Real PostgreSQL in the tests, without Docker](#d-78--real-postgresql-in-the-tests-without-docker)
- [D-79 · The Caisse](#d-79--the-caisse)
- [D-80 · Bons de versement](#d-80--bons-de-versement)
- [D-81 · Bons de retour](#d-81--bons-de-retour)
- [D-82 · Livreur pay](#d-82--livreur-pay)
- [D-83 · What the seller sees of the money](#d-83--what-the-seller-sees-of-the-money)
- [D-84 · The ramasseur's visit](#d-84--the-ramasseurs-visit)
- [D-85 · Forcer un statut on money](#d-85--forcer-un-statut-on-money)
- [D-86 · Choices made building phase 8](#d-86--choices-made-building-phase-8)
- [D-87 · Choices made building phase 9](#d-87--choices-made-building-phase-9)

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

**Where.** `apps/api/src/auth/impersonation.service.ts`, the
`impersonation_sessions` table, and `PermissionsGuard`, which lets the token
through GET routes marked `@AllowImpersonation` only.

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

**Numbers approved on 2026-09-25**: 5 free failures per identifier, 30 per IP,
then 1 s doubling up to 15 minutes. The error texts in `AUTH_MESSAGES` were
approved the same day. "Aucun compte ramasseur pour ce numéro" (Coursier 2)
is kept, although it tells whether a number has an account.

**Where.** `LOGIN_THROTTLE` and `AUTH_MESSAGES` in `packages/shared/src/auth.ts`.

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

### D-11 · Screen access for Dépôt and Service client

**This changes a row of Admin 2**, which is now **v1.11**: preparing bons de
retour is no longer admin-only, Dépôt prepares them too. Bons de versement
stay with the admin alone, like everything else touching money.

| Screen          | Admin | Dépôt                              | Service client                         |
| --------------- | ----- | ---------------------------------- | -------------------------------------- |
| Aujourd'hui     | Oui   | Oui, figures of its own work       | Oui, figures of its own work           |
| Colis           | Oui   | Read, reprint the label            | Read, log calls, apply change requests |
| Exceptions      | Oui   | Read; acts with its own rights     | Read; acts with its own rights         |
| Retours         | Oui   | Read, prepare bons de retour       | Read                                   |
| Journal d'audit | Oui   | —                                  | —                                      |
| Vendeurs        | Oui   | Contact info and parcels           | Contact info and parcels               |
| Coursiers       | Oui   | Name, phone, zone, today's parcels | Name, phone, zone, today's parcels     |

**The seller's email is admin-only.** It is his login identifier, so Dépôt and
Service client see the shop name, the contact name and the contact phone, and
nothing else (`VENDEURS_EMAIL`). The Coursiers list shows them the active
couriers only; the admin also sees deactivated accounts, the CIN, the vehicle
and, with `PAIE_COURSIERS`, the pay plan.

No role but the admin forces a status. Account creation, passwords,
suspension, Paramètres, CIN / patente documents, courier pay and debts stay
with the admin.

**How it is encoded.** A `*_LECTURE` permission opens a screen; acting always
needs the permission of the action. What a screen shows is narrowed by the
service: the Vendeurs and Coursiers pages leave out documents, pay and debts
for anyone without `VENDEURS_DOCUMENTS` or `PAIE_COURSIERS`, and Aujourd'hui
computes its figures per role.

**Where.** `packages/shared/src/permissions.ts`; the test copies the table.

### D-12 · Deactivating a courier is refused while work is open

Admin 4.15 says the old account is deactivated "once nothing is owed". This is
enforced, in two steps:

1. **At once**: `acceptsWork = false`. No new parcel, pickup or bon reaches him.
   This holds even when step 2 refuses, and is audited as
   `ARRET_NOUVEAU_TRAVAIL`.
2. **The deactivation** is refused while anything is open, and the refusal
   lists every blocker with a count: parcels in his hands, delivered parcels
   whose cash is still `CHEZ_LE_COURSIER`, a bon de versement or bon de retour
   `EN_ROUTE` with him. From phase 8: a caisse session not `CLOTUREE`, a
   payslip `A_PAYER`, a debt `EN_COURS`.

Step 1 is also what keeps step 2 honest: nothing new can be assigned between
the check and the deactivation. **Réactiver** restores the login and the work.

**Where.** `deactivateCourier` in `apps/api/src/accounts/accounts.service.ts`,
`courier-open-work.ts`, and `CourierBlockerType` in `packages/shared`; the
three phase 8 checks are `it.todo` tests.

### D-13 · A 10-second grace window on refresh tokens

Refresh tokens rotate, and a token presented again after it was rotated
revokes the session (it was evidently copied). Two tabs refreshing at once
would trip that and log the user out, so:

- **Server.** A refresh token presented again within **10 seconds** of its
  rotation gets the **same** new token back, as long as the session is still
  open. The attempt is registered before its first database call, so two
  requests at the very same instant share one rotation. Held in memory, for
  the reason given in D-6. After 10 seconds, a replay still revokes.
- **Web.** One refresh at a time across every tab of the browser, shared
  through a lock (`navigator.locks`) so the other tabs wait for it and read
  the new token.

**Where.** `SESSION_POLICY.refreshGraceSeconds` and `SessionsService.refresh`.

### D-14 · Outdated courier apps reach the scan upload only

Tech-stack 5 wants the app to empty its scan queue before it blocks for an
update, and the API to refuse old versions. Both hold: the **scan upload** is
the one route marked `@AllowOutdatedCourierApp` (phase 6); every other courier
route, the login and the refresh included, refuses a version below the
minimum set in Paramètres. A test fails if the marker appears on any other
route.

### D-15 · The browser never holds a token

The web app (Next.js) is the only client of the API from the browser side:

- The login, refresh and logout route handlers keep the access and refresh
  tokens in **httpOnly**, `SameSite=Lax` cookies (`Secure` in production). The
  page can read only `fg_exp`, the access token's expiry.
- The **middleware** refreshes the access token before a page or a back office
  call runs, and hands the new one to the page it lets through. A refused
  refresh (idle staff, regenerated password, deactivation) clears the cookies
  and opens the area's login page with "Session expirée".
- The back office's calls go through `/api/bff/…`, an allowlist of API paths
  (`accounts`, `sellers`), with the admin's own token. Every write checks the
  **Origin** header.
- "Voir comme le vendeur" keeps its token in its **own cookie**: the seller
  space reads with it, the back office never does, so the admin's tab keeps
  working while he looks.
- **One refresh across tabs (D-13, web side):** before a back office call, a tab
  takes a `navigator.locks` lock, re-reads `fg_exp` and refreshes only if it is
  still stale. On the server, concurrent refreshes of one token share one call.
- The Next.js server forwards the browser's `X-Forwarded-For` and user agent,
  so the API's login throttling (D-6) and audit entries see the real client.
  The reverse proxy must set those headers from the connection.

The API still checks the role on every call; the web app only routes.

**Where.** `apps/web/src/middleware.ts`, `apps/web/src/app/api/`,
`apps/web/src/lib/`.

### D-16 · Demo accounts for development only

`pnpm --filter @faffago/api db:seed:demo` creates a seller "Boutique Démo", a
Dépôt `demo.depot`, a Service client `demo.sc`, a livreur and a ramasseur, and
prints their passwords once, like `admin:reset`. It **refuses to run when
`NODE_ENV=production`**, needs the first admin from the normal seed, never
changes an existing password, and is never run by `db:seed` or
`prisma:deploy`. Tests hold all of this.

**Where.** `apps/api/prisma/seed-demo.ts`, `apps/api/test/seed-demo.spec.ts`.

### D-17 · Localités: a third level under the délégation

**This changes the specs**: Vendeur (parcel form, CSV, label, pickup
address), Admin 4.16 (a managed list of localités) and Coursier (what a stop
shows). The délégation alone is too coarse to find a customer; sellers and
customers name the neighbourhood.

**The data.** `apps/api/prisma/data/localites-grand-tunis.csv`: 938 rows over
the 48 délégations, built from La Poste Tunisienne's postal code list
(github.com/TangoRythm/Tunisia-Geodata-API), plus well-known neighbourhoods
missing from it, plus one **Autre** per délégation. Imported by the seed,
idempotently, keyed on délégation code + French name.

Corrections made to the file as delivered (941 rows), approved 2026-09-23:

- Two names garbled by an encoding error, already garbled in La Poste's own
  file: **Ferme N°7** (El Battan) and **Maakel Ezzaïm** (Sidi El Béchir,
  AR معقل الزعيم). No other encoding error in the file.
- **El Mourouj 2** is kept where La Poste puts it, under **El Kabaria (1074)**;
  the copy added under El Mourouj is removed. La Poste has **no "El Mourouj 1"**
  at all; it stays under El Mourouj, marked "délégation à confirmer".
- The alias **Ain Zaghouan** stays on both Ain Zaghouan Nord and Sud: the
  search shows both, and a CSV row that says only "Ain Zaghouan" is a row
  error the seller settles in the dropdown.
- The **8 rows marked "délégation à confirmer"** were corrected on
  2026-09-23:

  | Localité                | Délégation     | Postal code | Change                   |
  | ----------------------- | -------------- | ----------- | ------------------------ |
  | Les Jardins d'El Menzah | Ariana Ville   | 2092, 2083  | confirmed                |
  | Centre Urbain Nord      | Cité El Khadra | 1082        | confirmed                |
  | L'Aouina                | La Goulette    | 2045        | confirmed                |
  | Ain Zaghouan Nord       | La Marsa       | 2046        | confirmed                |
  | Ain Zaghouan Sud        | La Marsa       | 2046        | confirmed                |
  | Lac 2                   | La Goulette    | 1053        | moved from La Marsa      |
  | Cité Olympique          | Cité El Khadra | 1003        | moved from El Omrane Sup |
  | El Mourouj 1            | El Mourouj     | 2074        | confirmed                |

  The second postal code of Les Jardins d'El Menzah is an alias, like every
  extra code. The file now has no row left to confirm.

- **Both lake areas are in La Goulette** (decided 2026-09-23): "Les Berges du
  Lac" (Lac 1, 1053) moves from La Marsa, where La Poste lists it, to sit
  next to Lac 2.
- **One Cité Olympique** (Cité El Khadra, 1003): La Poste's "Cité Oplympique"
  and "Cité Olympeade" rows are removed and kept as its aliases, so a seller
  or a CSV that uses either spelling still finds it. The file goes from 940
  to 938 rows.

**The model.**

- `Localite`: délégation, French name, Arabic name (optional), postal code
  (the first one; any others go into the aliases), aliases, active.
- **The Arabic name is optional.** When it is empty every screen shows the
  French name. The admin fills Arabic names in Paramètres.
- `Parcel.localiteId` and `PickupAddress.localiteId` are **required**. The
  délégation is always derived from the localité, never entered separately.
- **Zones stay at délégation level**: a localité inherits its délégation's zone.

**How it is used** (each screen comes with its own phase; the model and the
API now):

- Seller parcel form and pickup addresses: cascading gouvernorat → délégation
  → localité, plus one search box across localités and aliases. "Ennasr"
  proposes "Cité Ennasr 1 — Ariana Ville, Ariana" and fills all three.
- A name that exists in more than one délégation (`nom_ambigu`) is **always
  shown with its délégation**, in search results and in the CSV preview.
- CSV import: accepts a localité name or alias, plus the délégation when the
  name is ambiguous. Unknown or ambiguous is a row error in the preview.
- **A row with a délégation but no localité is a row error too** (decided
  2026-09-23). The preview lets the seller fix any localité error **on the
  spot**: a dropdown on that row with the délégation's localités, Autre
  included and last (or the candidates of an ambiguous name), so he never
  re-uploads the file for it. `resolveLocalite` returns that list with the
  error; the screen comes with the CSV import (phase 4).
- Label and courier app: localité + délégation.
- Public tracking: délégation only, unchanged (Q1).
- Parcels filed under **Autre** are listed for the admin so missing localités
  can be added. The admin adds, renames and deactivates localités.

> Refines **Q5** (the CSV now resolves a localité) and **A-18** (localités
> have an optional Arabic name).

### D-18 · "Seed et Paramètres" is phase 2

A new phase 2 is inserted and every later phase shifts by one, as in D-10:
parcel core is phase 3, the seller space 4, back office operations 5, the
courier app 6, À vérifier 7, money 8, the public site 9, communication 10,
deployment 11.

Phase 2 is the seed data (geography, localités, zones, Paramètres), the
settings service and its API, and the web **Paramètres** screen for fees,
retenue, limits and contact links. The screens for zones, délégations and
localités stay with the zones and Tournées (phase 5), alongside courier zone
assignment.

### D-19 · The Grand Tunis geography

Reviewed in `docs/geo-review.md`.

- **48 délégations**: Tunis 21, Ariana 7, Ben Arous 12, **Manouba 8**. Den Den
  is not a délégation: La Poste lists it as a localité of La Manouba, and the
  seed no longer creates `MAN-DENDEN`.
- **Codes are ours**, `TUN-MARSA` style, not INS codes. They never change.
- **Spellings are the ones customers recognise.** French: Ariana and Manouba
  (gouvernorats); La Médina, Bab El Bhar, Djebel Jelloud, Séjoumi, Djedeida,
  Kalâat el-Andalous, Cité Ettadhamen, La Nouvelle Médina, Bou Mhel
  el-Bassatine, La Manouba (délégations). Arabic: باب بحر, الكبارية, سكرة,
  حي التضامن, المنيهلة.
- **Zones**: the 15 zones of the review are seeded as initial data, with no
  courier assigned, zone 14 being La Manouba + Oued Ellil. Small zones are
  reassigned as the team grows rather than redrawn; a zone may cross a
  gouvernorat border. The seed never overwrites a zone the admin has changed.

### D-20 · Paramètres

- **Money settings are stored as digit strings** in the JSON column
  (`"2000"`) and read as `bigint`, like every other amount.
- **Failure reasons are shown read-only** in Paramètres. The list stays fixed
  in `packages/shared`: "Reporté par le client" has its own rule (D-9) and the
  courier app translates every reason.
- **Minimum courier app version**: `1.0.0` to start.
- **The validation bounds** of each setting (`SETTING_VALUE_SCHEMAS`: fees up
  to 9 digits of millimes, retenue 0–100 %, 1–720 hours, 1–10 attempts, 0–10
  client changes, 0–3600 s, 1–1440 min, 1–100 parcels, versions x.y.z, https
  links) are typing guards, approved on 2026-09-23.
- The other defaults — change-client fee 1,000 DT, pickup fee 2,000 DT below 5
  parcels, retenue 3 %, 48 hours, 3 attempts, one client change per parcel,
  60 s scan cancel window, 15 min clock skew — are approved as seeded.
- **Starting values** given on 2026-09-23, seeded on a fresh database; the
  admin changes them in Paramètres afterwards:

  | Setting                       | Value                                   |
  | ----------------------------- | --------------------------------------- |
  | Delivery fee                  | 5,500 DT = `5500` millimes              |
  | Return fee                    | 2,000 DT = `2000` millimes              |
  | Courier rate per parcel livré | 3,500 DT = `3500` millimes              |
  | Phone                         | +216 99 602 208                         |
  | WhatsApp                      | https://wa.me/21699602208 (same number) |
  | Facebook                      | https://www.facebook.com/Faffago        |
  | Instagram                     | https://www.instagram.com/faffago/      |
  | TikTok                        | https://www.tiktok.com/@faffa_goo       |

- **TikTok is added to the contact links.** This changes landing 2.8, now
  **v1.3**; Admin 4.16 already says "social media".
- The seed only **creates** settings, never overwrites them, so a value the
  admin has changed survives every later run.

### D-21 · No parcel status changes without its event

"Every status change goes through the parcel event service" (CLAUDE.md) is
enforced by the database, like append-only.

- Each `parcel_events` row records the transaction that wrote it
  (`txid`, default `txid_current()`, never set by the application).
- A **deferred constraint trigger** on `parcels` runs at commit for every
  parcel created, and for every parcel whose status or location changed. It
  requires an event **of the same transaction** whose new status and new
  location are exactly the state the parcel is left in. Otherwise the whole
  transaction is refused, whatever the role, `faffago_app` included.
- Deferred to the commit because the parcel row and its events are written
  one after the other, and a new parcel must exist before its CREATION event
  can reference it.
- The cash status is not covered: it moves with the Caisse and the bons
  (phase 8).

**Tests.** `pglite-prisma-adapter` 0.6.1 swallows an error raised by COMMIT
(the transaction is rolled back, but `$transaction` resolves). The test
adapter (`test/support/pglite-adapter.ts`) runs `SET CONSTRAINTS ALL
IMMEDIATE` before COMMIT, so the trigger fires while the transaction is still
open and its error reaches the caller. Production uses the real driver.

**Where.** Migration `20260927000000_parcel_status_needs_event`,
`test/parcel-state-trigger.spec.ts`.

### D-22 · Phase 3 has no HTTP endpoint

Phase 3 is the parcel core: `ParcelsService.create` and `ParcelEventService`,
tested directly. `POST /parcels` comes with the Créer un colis screen in
phase 4; the scans, decisions and jobs that move parcels come with their own
phases and all go through `ParcelEventService`.

### D-23 · The old item of an échange at delivery

When a Colis d'échange is scanned Livré: `exchangeItemCollected = true` and
`exchangeItemStatus = RETOUR_AU_DEPOT`, while the livreur still carries the
item (the A-7 precedent: a return in the courier's hands). No return fee is
ever charged for it (A-10).

**Where.** `ARTICLE_ECHANGE_A_RECUPERER` in `packages/shared/src/parcel-effects.ts`.

### D-24 · `closedAt` is the end of the parcel's life

`closedAt` is set when the parcel's life ends: **delivered and paid** (cash
Payé, stamped by the money phase), **return received**, or **cancelled before
pickup**. A cancellation after pickup does not close the parcel: it still has
to travel back (D-28).

Statistics do not use `closedAt`. The delivery rate (Vendeur 4.1) counts each
parcel on the date of its outcome: `deliveredAt` for a delivered parcel, the
Retour reçu event for a returned one. Vendeur 4.1 is reworded accordingly
(**v1.8**).

### D-25 · What a suspended seller can still do

Suspension blocks **creating parcels and requesting pickups**, nothing else.
A suspended seller still edits or cancels a Créé parcel and takes the À
vérifier decisions, so the 48-hour rule never returns parcels because of a
suspension. Vendeur 4.6 says so (**v1.8**).

**Where.** `ParcelsService.create` refuses with `COMPTE_SUSPENDU`;
`ParcelEventService` does not look at the account state.

### D-26 · Another seller's parcel does not exist

A seller acting on a parcel that is not his gets exactly the answer for an
unknown code: 404 / **Code inconnu**. He never learns that the code exists.

**Where.** `ParcelEventService.apply`, before the state machine runs.

### D-27 · A deactivated localité takes no new parcel

Creating a parcel on a localité the admin has deactivated is refused
(`LOCALITE_INACTIVE`). Parcels created before keep it.

### D-28 · Cancelling after pickup

**Adds a path to the state machine.** Vendeur 4.6 said a cancellation after
pickup "follows the return flow and is charged the return fee"; this is how.

- **From Créé**: plain cancellation, Annulé, no fee (unchanged).
- **From Ramassé, Au dépôt, En livraison, À vérifier and Relancé**: exactly
  Retourner. Status **Retour au dépôt**, location unchanged (with the livreur
  if he carries it, A-7), return fee charged `EN_ATTENTE`, 48-hour clock
  stopped.
- The event type is `ANNULATION`, with the metadata
  `{ annulation: "APRES_RAMASSAGE" }` (label _Après ramassage_), so the
  history shows why.
- **Refused** once Livré, or already in a return status.
- The seller's alone, like every decision (D-4).
- Public tracking reads **Commande annulée** for the rest of the parcel's
  life: `publicStatusFor` now takes `cancelledAt`, which every ANNULATION
  event sets. `docs/landing.md` 4.2 is now **v1.4**.

**Approved with it (2026-09-24).** A parcel cancelled while the **ramasseur**
still carries it is Retour au dépôt with the ramasseur. The Entrée dépôt scan
accepted Ramassé only, so the parcel could never have been scanned in. Entrée
dépôt now also takes a Retour au dépôt parcel from the ramasseur: location
Au dépôt, status unchanged, no effect — the way Retour de tournée already
does for the livreur.

**Where.** The `ANNULER` and `SCAN_ENTREE_DEPOT` branches of
`packages/shared/src/parcel-state-machine.ts`, `canCancel`,
`CANCELLATION_AFTER_PICKUP`; tests under "cancelling after pickup".

### D-29 · Relancer carries its date

The seller's **Relancer** without a date is refused by the state machine with
the reason `DATE_RELANCE_REQUISE`. D-9 already said the seller picks a date,
and the database stores a relance with its date and origin or not at all
(`parcels_relaunch_is_complete`), so without this a dateless Relancer ended
in a database error. The date is checked in the same tomorrow-to-7-days
window as before.

The message is neutral for now (_Date de relance obligatoire_); the wording
the seller reads comes with the À vérifier screen (phase 7). _Worded in
**D-76**: "Choisissez le jour de la nouvelle tentative de livraison"._

**Where.** The `DECISION_RELANCER` branch of `parcel-state-machine.ts`.

### D-30 · The 48-hour clock starts at the server

The À vérifier deadline runs from the **server time at which the failure is
recorded**, not the device time of the scan. A scan made offline and synced
later reaches the seller later, and he cannot decide about a failure before
he knows of it.

**Where.** `DEMARRER_DELAI_VERIFICATION` in `parcel-effects.ts`, fed with the
server clock by `ParcelEventService`.

### D-31 · A cancelled order's public timeline ends at Commande annulée

**For phase 9.** When the seller cancels after pickup (D-28), the parcel
still travels back, but the customer's page ends at **Commande annulée**:
the return-trip events (Départ retour, Retour reçu) are hidden for a
cancelled order. Every other return still shows them.

**Where.** To build with the public tracking endpoint: filter
`PUBLIC_TIMELINE_EVENT_TYPES` by `cancelledAt`.

### D-32 · Seller documents: encrypted, private, kept

Decided 2026-09-24, for the CIN, patente and auto-entrepreneur card
(Vendeur 2.2, Admin 4.14).

| Rule              | Detail                                                                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where             | The server's own disk, outside the repository and anything the reverse proxy serves, readable by the API's system user only                                                     |
| Encryption        | **AES-256-GCM in the application**, before the file touches the disk. Each file records the **id of the key** that encrypted it, for rotation                                   |
| The key           | `STORAGE_ENCRYPTION_KEY` in `.env`, kept by the owner in **two offline places**. Losing it loses every document                                                                 |
| Formats           | **JPEG, PNG, PDF**, checked from the file's bytes, not its name. **10 MB** maximum                                                                                              |
| Images            | **Re-encoded** on upload, which strips EXIF (a phone photo carries GPS coordinates). PDFs are stored as sent                                                                    |
| Who sees them     | **The admin only.** The seller never sees his own documents                                                                                                                     |
| Audit             | Every upload **and every view** is written to `audit_log`                                                                                                                       |
| Replacing         | A new document **never overwrites** the old one: the old version is kept, marked replaced                                                                                       |
| Deletion          | **None, automatic or otherwise.** How long documents are kept after a seller leaves is **open**, to decide with the accountant                                                  |
| Off-server backup | Destination **open**, decided in phase 11 after a legal check on hosting personal data outside Tunisia (loi organique 2004-63). The same question applies to the whole database |

Files are named by a random UUID and written once. The authenticated data of
each encryption is the file's storage key, so two files cannot be swapped on
disk without the decryption failing.

**Where.** `apps/api/src/storage/`, `seller_documents`, and
`SELLER_DOCUMENT_POLICY` in `packages/shared/src/sellers.ts`.

### D-33 · Creating a seller

- **CIN front and back are required at creation.** A seller with statut
  Patente or Auto-entrepreneur also needs that document in the same request.
  No account exists without them.
- **Switching to Patente or Auto-entrepreneur** requires uploading that
  document in the same action.
- **Product category is a fixed list**: Mode et vêtements, Chaussures, Bijoux
  et accessoires, Beauté et cosmétique, Électronique, Maison et déco, Enfants
  et bébés, Sport, Alimentation, Autre.

**Where.** `ProductCategory` and `requiredDocumentsFor` in
`packages/shared/src/sellers.ts`.

### D-34 · A statut change applies to the next bon

Changing a seller's statut is audited (before and after) and applies to the
bons de versement **prepared after the change**. Each bon snapshots the statut
it was computed with (phase 8); an existing bon is never recalculated.

### D-35 · Ramassage requests

- **Time window**: a closed list, **Matin** or **Après-midi**.
- **Cancelling**: the seller can cancel while the request is **Demandé** or
  **Planifié**, at no cost (A-13).
- **One open request per pickup address** at a time.
- **Editing an address** a pickup already uses changes future requests only:
  the old address is kept, deactivated, and a new one takes its place.

### D-36 · What the label's barcode and QR hold

- **Code128** carries the parcel code alone, for barcode guns.
- **QR** carries the public tracking URL, `/suivi/FG-…`, built from a setting
  for the site's domain. Every scanner extracts the code from that URL, and
  accepts the bare code as well. Both are tested.

> Refined by **D-43**: that setting is the environment variable
> `NEXT_PUBLIC_SITE_URL`, never a Paramètres value.

> What else the label prints, Arabic included: **D-45**.

### D-37 · CSV import

- Verdicts: a **localité** problem the seller can settle in the preview's
  dropdown is **À vérifier**; any other problem is **Erreur**. Only rows
  **Valide** at import time are imported (Vendeur 4.3).
- At most **500 rows** per file.
- **Échange** and **Ouverture autorisée** accept `oui`, `non`, `1`, `0`, in any
  case; empty means `non`.

### D-38 · The seller's timeline

On Détail du colis the seller sees **"Faffa Go"** for every staff action, a
courier by **first name only**, and "where" as the **location label** (au
dépôt, avec le livreur…). **Never GPS coordinates.**

### D-39 · What phase 4 contains

Beyond the list in PROGRESS.md:

- **Modifier and Annuler** (Vendeur 4.6) are in phase 4, Annuler after pickup
  included (D-28).
- **Demander une modification**: the seller files it in phase 4; Service
  client applies it in phase 5.
- **Tableau de bord**: the Aujourd'hui counts and the quick actions only.
  À recevoir and the delivery rate come with the money (phase 8).

### D-40 · The net shown on Détail du colis

Net = COD − the delivery fee **frozen on the parcel**, labelled as an
**estimate before retenue**. For a returned parcel the money block shows
**− return fee** instead. The bon de versement remains the only real figure.

### D-41 · Changing the COD before pickup

While the parcel is **Créé** the seller may change the COD like any other
field. The fees stay as frozen (they do not depend on the COD). The change is
a `MODIFICATION_VENDEUR` event. The label printed before carries the old
amount, so the screen warns the seller to **reprint the label** after saving.

> Refined by **D-44**: the warning shows when any printed field changes.

### D-42 · Correcting the contact, or changing it

The contact person is the one whose CIN was submitted (Vendeur 2.3), so two
separate actions, decided 2026-09-24:

- **Modifier** corrects the contact's name or phone (a typo). Audited, no
  document.
- **Changer de contact** names a different person and requires **the new
  person's CIN front and back in the same action**, like a statut change
  (D-33). The previous CIN documents are kept as replaced versions (D-32).
  Audited, before and after.

The seller's login email is not part of either: it belongs to the account.

### D-43 · The site's domain is an environment variable

The public site's address is `NEXT_PUBLIC_SITE_URL`, **not a Paramètres
setting**: it is printed in the QR code of every label (D-36) and must never
change once labels are printed. Production: **https://www.mirely.store**.
The API reads the same variable to build the QR code, and refuses to print
labels without it.

**If Faffa Go ever moves to a domain of its own**, `www.mirely.store` must
keep redirecting `/suivi/*` to the new domain **forever**: labels already
printed carry the old address and cannot change.

### D-44 · Demander une modification

Decided 2026-09-24, with the phase 4 step 2 review. Vendeur 4.6: after pickup
the seller asks, Faffa Go applies.

- **What the seller can ask**: phone, phone 2, address, landmark, and the
  **localité**.
- **When**: from Ramassé to Relancé. Before pickup the seller uses Modifier;
  once delivered, cancelled or in a return, nothing can be asked.
- **One waiting request per parcel.** A new one is refused while another is
  En attente; the seller **edits** the waiting one or **withdraws** it.
  A withdrawn request keeps its row with the status **Retirée**, who
  withdrew it and when. `ChangeRequestStatus.RETIREE` is added for this.
- **A new localité** (phase 5, Service client): applied only while the parcel
  is **at the depot** (location Au dépôt). While the livreur carries it, the
  request waits. Applying it changes the délégation, and so the zone, is
  written as an event, and the depot reprints the label with the same code
  (A-9).
- **The reprint warning** after Modifier shows when any field printed on the
  label changes (Vendeur 4.4), not only the COD. Refines D-41, which stands:
  the COD stays editable while Créé, only the fees stay frozen.

### D-45 · What a label prints, Arabic included

Decided 2026-09-24, with the phase 4 step 4 review. Refines Vendeur 4.4 and
D-36.

- **Arabic is required.** Names, addresses and landmarks typed by sellers
  or imported from a CSV may be Arabic, often mixed with French and numbers.
- **Fonts**: Noto Sans (Latin) and Noto Sans Arabic, both under the SIL Open
  Font License, embedded in each PDF and subset to the characters used. Each
  character is drawn in the font of its script; Arabic letters are shaped.
- **Direction**: the Unicode bidirectional algorithm, per field. A field
  takes the direction of its first strong letter and is aligned on that
  side (an Arabic name on the right); French, numbers and Arabic in one line
  keep their own order, e.g. `حي النصر، rue 12, imm. B`.
- **Wrapping**: a field wraps within its box and never overflows the label.
  Past its lines it ends with "…"; the address takes the lines the other
  fields leave.
- **The second phone** is printed only when the parcel has one.
- **The landmark** is printed under the address, captioned "Repère", when
  there is one. **The courier note stays off the label.**
- A character neither font can draw (an emoji, say) prints as "?".

### D-46 · Mes colis and Détail du colis

Decided 2026-09-24, with the phase 4 step 5 review (Vendeur 4.7, 4.8).

**The status groups of Mes colis**, in this order, each with the seller's
own count (under the same search and dates):

| Group      | Holds                                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------- |
| Tous       | Every parcel. The only group that holds **Annulé**                                                          |
| À vérifier | À vérifier. **Highlighted** while its count is above 0: the seller has 48 hours to decide (D-9 excepted)    |
| En cours   | Créé, Ramassé, Au dépôt, En livraison, Relancé                                                              |
| Livrés     | Livré, with two sub-groups: **Payés** (cash Payé) and **Non payés** (cash with the courier or at the depot) |
| Retours    | Retour au dépôt, Retour en route, Retour reçu                                                               |

**The track line**: the delivery flow of Vendeur 4.8; À vérifier and
Relancé stop at En livraison, marked; a return switches to the return flow
of 4.12; Annulé is struck through.

**The history**: the seller's own actions read "Vous", the team and the
automatic rules "Faffa Go", a courier his first name only (D-38); the
place is a label, never GPS. The failure reason is shown. **The courier's
free-text note is hidden** until phase 7 (À vérifier) decides what the
seller reads of it. _Superseded by **D-71**: the seller reads it._ Status corrections and cancelled scans are shown.

**Exporter**: the table's columns plus phone 2 and the address,
`;`-separated with a byte-order mark, at most 10 000 rows.

**Where.** `packages/shared/src/seller-parcels.ts`.

### D-47 · Pickup requests and Profil

Decided 2026-09-24, with the phase 4 step 6 review (Vendeur 4.5, 4.14).
Completes D-35.

- **Which parcels**: a parcel is in one open request (Demandé or Planifié)
  at most, and only **Créé** parcels can be chosen. A request lists its
  parcels **or** gives their number, never both.
- **The first address** the seller saves becomes the default.
- **Editing an address**: one no request has used is edited in place; once
  a request has used it, it is replaced (D-35).
- **What the seller sees once planned**: the ramasseur's first name, the
  planned day and window.
- **The seller asks for a window only** (Matin or Après-midi), not a date:
  the depot plans the day. Fine for launch.
- **A suspended seller** manages addresses and cancels requests, but cannot
  request a new pickup.
- **No `audit_log` entry** for pickup requests: who cancelled is stored on
  the request itself.
- **Profil** shows the pickup fee rule next to the three rates of 4.14.
- **Extra parcels at the scan** (for phase 6): the ramasseur can scan Créé
  parcels of the same seller that the request did not list
  (`PickupParcel.expected = false`). They are picked up normally and count
  toward the 5-parcel free threshold.

**Where.** `packages/shared/src/pickups.ts`, `apps/api/src/pickups`.

### D-48 · Tableau de bord: what happened over a period

Decided 2026-09-24, with the phase 4 step 7 plan (Vendeur 4.1, D-39).

**What the tiles count**: what **happened** to the seller's parcels during
the period, not where they are now. Each tile counts **distinct parcels**
with at least one event of its kind in the period:

| Tile         | Event                                                   |
| ------------ | ------------------------------------------------------- |
| Créés        | `CREATION`                                              |
| Ramassés     | `RAMASSAGE`                                             |
| En livraison | `SORTIE_COURSIER`                                       |
| Livrés       | `LIVRAISON`                                             |
| Échecs       | `ECHEC_LIVRAISON`, any reason but Reporté par le client |
| Reportés     | `ECHEC_LIVRAISON`, reason `REPORTE_PAR_LE_CLIENT` (D-9) |

- **Reportés** is a tile added to Vendeur 4.1's list: a customer
  postponement is not a failure to verify (D-9), so Échecs leaves it out.
- A parcel counts in several tiles when several things happened to it (out
  in the morning, delivered at noon: En livraison and Livrés). It counts once
  per tile, however many events of that kind it had.
- **A cancelled scan is taken back** (its scan has `cancelledAt`, A-11). A
  **status correction** (`FORCAGE_STATUT`) counts nowhere.
- **Which day an event belongs to**: the Tunis calendar day (D-46) of the
  phone's clock for a scan, so an offline scan synced the next morning stays
  on the day it was made (as A-12 does for the Caisse); the server's clock
  for everything else.

**The period (added beyond the spec)**: Aujourd'hui (default), Hier, 7
derniers jours (today and the 6 days before), Ce mois (from the 1st to
today), and a custom range of **366 days at most**. The block's title
follows the choice; a custom range reads "Du JJ/MM/AAAA au JJ/MM/AAAA".
The period lives in the page's address. A refused range shows today, with
the reason. **The delivery rate (phase 8) uses this same selector.**

**API**: `GET /dashboard?from=AAAA-MM-JJ&to=AAAA-MM-JJ` (both or neither,
then today), VENDEUR only and open to Voir comme le vendeur (read-only);
the seller comes from the session. Other roles 403.

**Quick actions**: Créer un colis and Demander un ramassage, hidden for a
suspended seller (with one line saying why) and under Voir comme le vendeur.
The tiles are not links for now.

**Where.** `packages/shared/src/seller-dashboard.ts`, `apps/api/src/dashboard`,
`apps/web/src/components/seller-dashboard-screen.tsx`.

### D-49 · Browser tests: Playwright on PGlite, a merge gate

Decided 2026-09-24, with the phase 4 step 8 plan.

- **What the browser tests run against**: the real NestJS API on **PGlite**,
  a fresh database in memory on every run. Every migration is applied and
  the normal seed runs, with a test admin. Nothing to install or configure,
  and the same on a CI runner. The connection to a real PostgreSQL stays
  proved in phase 11, as before.
- **How**: Playwright (`apps/web/e2e`, Chromium only) starts the API on port
  **3101** (`pnpm --filter @faffago/api e2e:server`) and a **production build**
  of the web app on port **3100** (`pnpm dev` uses 3000/3001). The build
  replaces `apps/web/.next`: stop the web app's `pnpm dev` first. Secrets
  are drawn on every run. One browser worker, the tests in order: each
  starts where the previous one stopped. Each role has its own browser
  context (its own cookies).
- **A merge gate**: `pnpm e2e` must pass, beside `pnpm lint`,
  `pnpm typecheck` and `pnpm test`, before a phase is merged into `main`
  (CLAUDE.md, How to work). It is not part of `pnpm test` and not needed for
  each commit: it builds the web app and takes about a minute.
- **The API from TypeScript**: NestJS needs decorator metadata, which tsx does
  not write, so `test/e2e/register-ts.cjs` compiles each file with
  TypeScript itself (as ts-jest does). No new dependency.

**Where.** `apps/web/playwright.config.ts`, `apps/web/e2e`,
`apps/api/test/e2e/server.ts`, the `e2e` task in `turbo.json`.

### D-50 · What phase 5 contains

Decided 2026-09-24, with the phase 5 plan. Beyond the list in PROGRESS.md:

- **Applying seller change requests** (D-39, D-44, D-57) and **Réimprimer
  l'étiquette** for Dépôt and Admin (A-9) are in phase 5.
- **Exceptions** (Admin 4.7): a first screen in phase 5 with the rows whose
  data exists — Saisie manuelle (A-22), seller change request waiting, parcel
  at the depot more than 48 h without a tour, pickup planned but not done.
  Phase 10 adds the rest.
- **The scan station ships with three modes**: Entrée dépôt, Sortie coursier,
  Retour de tournée. Préparation retours and Archivage bons need the bons and
  come with phase 8.
- **The ramassage scan**, the extra parcels (D-47) and the pickup fee at
  closing (A-13) stay in **phase 6**, with the ramasseur's app. For browser
  tests before that, the demo seed (development only, D-16) puts demo parcels
  in Ramassé through the parcel event service, acting as the demo ramasseur.
- **Aujourd'hui** (back office, Admin 4.1) comes later: its courier and cash
  blocks need phases 6 and 8.

### D-51 · Geography and zones in Paramètres

Decided 2026-09-24 (Admin 4.5, 4.16; refines D-17, D-19).

- **Gouvernorats and délégations**: the admin renames them, in French and in
  Arabic, and changes a délégation's zone. **No adding, no deactivating**:
  the 4 gouvernorats and 48 délégations are fixed, and their codes never
  change (D-19). Every change is audited.
- **The seed becomes create-only** for gouvernorats and délégations, like
  localités, zones and settings: a name the admin corrected survives every
  later run.
- **The admin editing Arabic names is the review path** for the native-speaker
  check of the place names (PROGRESS, Open questions), closed once the screen
  exists.
- **Zones**: the admin creates, renames and deactivates them. Deactivating is
  **refused while délégations are attached**. A délégation with no zone is
  allowed; its parcels go to a **"Sans zone"** column in Tournées,
  highlighted.
- **Courier assignment** (Admin 4.5, 4.15): per zone, one livreur and one
  ramasseur, each a titular and a backup. The courier's role must match, and
  he must be active and accepting new work (D-12).

### D-52 · Marking a courier absent

Decided 2026-09-24 (Admin 4.5, 4.15).

- **Admin and Dépôt** mark a courier absent for a day, and remove the
  absence. Both are audited.
- For that day his zones switch to their backup: Tournées fills his columns
  with the backup livreur, and pickups are pre-filled with the backup
  ramasseur (A-14). This is worked out when read, never stored.
- **The absent ramasseur's pickups already planned for that day move to the
  backup ramasseur in the same action.**
- When the backup is absent or missing too, the column reads **"Sans
  coursier"**, highlighted so it cannot be missed.

### D-53 · Depot scans

Decided 2026-09-24 (Admin 4.2, tech-stack 2).

- Every scan carries a **UUID drawn by the browser**. The same id again
  returns the first result, accepted or refused; the same id with a
  different parcel or mode is refused. Refused scans are stored too.
- **Sortie coursier to another courier than the one planned** is accepted:
  the scan is the assignment; the result says "Prévu pour X". It is still
  refused when the chosen courier is **unavailable** (inactive, not accepting
  new work, or absent that day).
- **Retour de tournée**: the courier is chosen first; a parcel another
  courier carries is refused with "Colis d'un autre coursier".
- **Two refusal codes added**: the courier is unavailable, and a scan
  identifier reused for another scan.
- **`Scan.parcelBefore`**: what the parcel was before the scan, kept so a
  cancellation can restore it. A Sortie coursier clears the relance date,
  slot and origin, and no event records them.
- A parcel whose label must be reprinted (D-57) shows a warning on its next
  depot scan.

### D-54 · Cancelling a web scan

Decided 2026-09-24 (A-11, Admin 4.2).

- **Annuler le dernier scan**: the user's own last accepted scan, not yet
  cancelled, within the window in Paramètres (60 s), measured on the
  **server clock** (a web scan is online by nature), and only while nothing
  has happened to the parcel since that scan.
- **Only the person who scanned** can cancel it.
- The parcel goes back to `parcelBefore`, with an `ANNULATION_SCAN` event;
  the scan row keeps its place with `cancelledAt`.
- After the window, only the admin corrects it (D-56). Once the courier's
  caisse session is Clôturée nothing can be cancelled (A-11, phase 8).

### D-55 · Tournées

Decided 2026-09-24 (Admin 4.5).

- Every parcel due today (`isDueForTour`) sits in its zone's column, under
  the livreur covering that zone today (D-52).
- A **manual move** is stored as the parcel's planned livreur and written as
  an **`AFFECTATION_LIVREUR`** event, **hidden from the seller and from
  public tracking**.
- Parcels of a délégation with no zone: **"Sans zone"** column (D-51).

### D-56 · Forcer un statut in phase 5

Decided 2026-09-24 (Admin 4.3, 4.17). Admin only, a reason required, one
`FORCAGE_STATUT` event and an `audit_log` entry, before and after.

- **Allowed**: moves between **Ramassé** (with the ramasseur), **Au dépôt**
  (at the depot) and **En livraison** (with the livreur chosen), and
  **location-only fixes** (with the livreur ↔ at the depot) for **À vérifier,
  Relancé and Retour au dépôt**.
- **No effect runs**: no charge, no 48-hour clock, the attempt count
  unchanged.
- **Refused until phase 8** defines how money is reversed: anything touching
  Livré, Annulé, a return status or a charge.
- Cancelling a scan after its window (D-54) is the admin's, with a reason,
  under the same rules.

### D-57 · Applying a change request

Decided 2026-09-24 (Vendeur 4.6, D-44).

- **Service client and Admin** apply or refuse. A request is applied **as a
  whole**.
- A request with a **localité** is applied only while the parcel's
  **location** is Au dépôt (D-44), whatever its status: the location, not
  the status Au dépôt.
- Applying writes a new event, **`MODIFICATION_APPLIQUEE`**, with each field
  before and after; the seller's timeline shows it as "Faffa Go".
- **Refusing requires a reason, and the seller sees it.**
- **`labelReprintNeeded`**: set when an applied change touches a printed
  field. A badge in Colis and Tournées, a warning on the next depot scan,
  cleared when staff reprint the label.

### D-58 · Planning pickups

Decided 2026-09-24 (Admin 4.4, A-14).

- The ramasseur is pre-filled with the one covering the zone of **the
  pickup's address** that day (A-14, D-52); the team can change it.
- **Staff cannot cancel a seller's pickup request**; the seller does it
  himself (D-35).

### D-59 · Marquer comme traité on Saisie manuelle

Decided 2026-09-25, closing the open question left after phase 5 step 9
(A-22).

- **Admin and Dépôt** mark a manual entry as treated, once dealt with.
  `Scan.treatedAt` and `Scan.treatedByUserId` record who and when; asked
  twice, it answers the same and keeps the first answer.
- **A treated entry leaves the Exceptions queue** at once: `manualEntries`
  excludes any scan with `treatedAt` set, so treating one has the same
  visible effect as the 7-day window running out, only immediate and
  deliberate.
- **Same permission as the station**: `Permission.SCAN_DEPOT`, since the
  people who scan at the depot are the ones who clear its exceptions.
  Service client reads the queue (D-11) but cannot treat an entry.

**Where.** `ExceptionsService.treatManualEntry`,
`POST /exceptions/manual-entries/:scanId/treat`, migration
`20261007000000_manual_entry_treated`.

### D-60 · The seller's timeline shows the phone's time

Decided 2026-09-25, closing the open question left after phase 5 step 5
(D-46, D-48).

- **Détail du colis** now shows the seller each event at **the phone's
  time** (`deviceTime`) — when it actually happened — instead of the
  server's reception time. This matches the Tableau de bord, which already
  files a scan under the phone's day (A-12, D-48).
- **A scan flagged for clock skew** (device clock more than 15 minutes from
  the server's, A-12) is untrustworthy, so its event still shows the
  **server's time**, as before.
- **An event with no device time** (a seller's own action, a staff action, an
  automatic rule) keeps showing the server's time: there is no phone to read
  it from.
- **Staff keep both**, unchanged: Colis already shows `deviceTime` and
  `clockSkewFlagged` beside the server time in the full event log (phase 5
  step 6).

**Where.** `sellerTimelineTime` in `packages/shared/src/seller-parcels.ts`,
used by `ParcelQueriesService.detail`.

### D-61 · The ramasseur's bon scan steps wait for phase 8

Decided 2026-09-25, with the phase 6 plan (Coursier 4.6).

The ramasseur's flow has three scan steps: **Colis** (pickup), **Bon de
versement** (scan the bon's QR, marking Remis) and **Retours** (scan a
returned parcel, Retour reçu, the bon de retour signed on paper). The last
two need a bon that only exists once phase 8 builds bon preparation — there
is nothing to scan yet.

- **Phase 6 builds Colis** (the pickup scan, D-47's extra parcels included)
  **and Terminer le ramassage**, which closes the pickup and charges the
  pickup fee (A-13): that rule needs no bon, only the count scanned.
- **Bon de versement and Retours join with phase 8**, the way the depot's
  scan station shipped three of its five modes in phase 5 and gained the
  rest with the bons (D-50).
- **`PickupStatus.EFFECTUE`** is written by Terminer, with the pickup fee
  charge (`EN_ATTENTE`) if fewer than 5 parcels were scanned, none at 0 or
  5+ (A-13).

### D-62 · Mes gains (livreur) waits for phase 8

Decided 2026-09-25, with the phase 6 plan (Coursier 4.10).

Mes gains reads "parcels livrés × rate − debts = amount due"; debts
(`CourierDebt`, an écart) are only created once phase 8 builds Caisse
session closing. Phase 6 ships **without Mes gains**: the tab, and the
figure, come whole with phase 8, debts included, rather than showing a
number that always reads "no debt yet" for weeks.

### D-63 · GPS: required to open the app, never blocks a scan

Decided 2026-09-25, with the phase 6 plan (Coursier §2, §6 rule 2,
tech-stack 4).

- **Location permission is required to use the app**: asked at login,
  refused entry to the scanner without it, matching the spec's plain
  wording ("Location permission is required").
- **A scan is never blocked for lack of a GPS fix.** Permission granted but
  no fix yet (indoors, weak signal): the scan is recorded with `gpsLat` /
  `gpsLng` null, same as a depot scan already tolerates. The staff log
  already shows GPS when it has it (Colis, D-11); a null value now reads
  **"Sans position"** there, no new column needed — the absence is the flag.

### D-64 · One queue, one route

Decided 2026-09-25, building phase 6 (Coursier 4.9, D-14).

- **Every courier operation goes through `POST /scans/courier`**, in the order
  the phone recorded it: a scan (Ramassage, Livré, Échec), a cancellation,
  Terminer le ramassage, a note d'adresse. It is the one route an outdated app
  reaches (D-14), so nothing the courier did offline is stuck behind a forced
  update.
- **Each operation gets its own answer** and its own transaction. An
  operation the API cannot read is answered `OPERATION_INVALIDE` and the phone
  drops it; the ones after it still go through. A scan missing what its action
  needs is stored as refused, with the reason.
- **Idempotent by the phone's id**: a scan by its UUID (`scans.clientScanId`),
  Terminer and a note by theirs (`courier_operations`, new table). Sent again,
  the first answer comes back and nothing is written.
- **`Permission.APP_COURSIER`** (Livreur, Ramasseur) guards the routes both
  couriers use; each service narrows by role. No new capability: it is the
  app Coursier 2 gives both.

**Where.** `apps/api/src/courier`, `packages/shared/src/courier.ts`,
migration `20261008000000_courier_scans`.

### D-65 · Cancelling a courier's scan

Decided 2026-09-25, building phase 6, applying A-11 and A-1.

- **His own last scan, within the window measured between the two phone
  times** (the scan's and the Annuler's), so a scan cancelled offline is
  cancelled however late both reach the server. A scan never sent is simply
  taken off the phone's queue.
- **Everything the scan wrote is put back**: status, place, attempts, cash
  status, delivery and pickup times, the frozen courier rate, the 48-hour
  deadline, the failure reason, the échange item.
- **The charges the scan created become ANNULEE**: the delivery fee of a
  Livré, the return fee of a third failure. A fee is owed only for what
  happened (A-1). Each charge now records its scan (`seller_charges.scanId`).
  Delivered again for real, a new scan owes a new fee.
- **Refused** once anything else happened to the parcel, once one of its
  charges left EN_ATTENTE, or — for a pickup scan — once Terminer counted it.

### D-66 · What Livré confirms

Decided 2026-09-25, building phase 6 (Coursier 4.4, A-10, A-24).

- The amount sent with Livré must be **exactly the COD** frozen on the parcel,
  or the scan is refused (`MONTANT_DIFFERENT`): there is no partial payment.
- On an **échange**, Livré requires the old item confirmed collected
  (`ECHANGE_NON_CONFIRME` otherwise). Not collected is an Échec.
- A code typed from a damaged label is accepted and **flagged**
  (`SAISIE_MANUELLE`), and lands in Exceptions like the depot's (A-22, D-59).

### D-67 · Pickup scans and Terminer le ramassage

Decided 2026-09-25, building phase 6 (Coursier 4.6, A-13, D-47, D-61).

- A pickup scan names **his own pickup, Planifié**. An extra parcel must be
  **Créé and of the same seller** (`COLIS_AUTRE_VENDEUR` otherwise).
- **Terminer** counts the parcels scanned, extra ones included, and closes
  the pickup: **Effectué** with the pickup fee as a `RAMASSAGE` charge
  (EN_ATTENTE, deducted from the next bon) below 5, none from 5; **Annulé** at
  zero, at no cost, cancelled by the ramasseur with "Aucun colis ramassé" —
  A-13's "treated as cancelled". Parcels announced but not scanned stay Créé,
  free for a new request.
- After Terminer, a scan for that pickup is refused (`RAMASSAGE_TERMINE`).
- The ramasseur's day lists his pickups planned for today **or earlier** and
  still open, then those he closed today.

### D-68 · Mémoire d'adresse

Decided 2026-09-25, building phase 6 (Coursier 4.3).

- **One memory per customer phone**; the latest note replaces the previous
  one. A note is saved **after a successful delivery**, by the livreur who
  delivered; a **meeting point** on any parcel he carries or delivered, written
  on the parcel and in the memory.
- **"Déjà livré ici"** shows when a parcel to that number has been delivered,
  note or not.
- Read by **couriers and staff** (the Colis page shows it); no seller route
  ever reads it, nor the parcel's meeting point.

### D-69 · The courier app's technical choices

Decided 2026-09-25, building phase 6.

- **`expo-camera` reads the labels, not `react-native-vision-camera`**
  (tech-stack 4 named it): its version 5, current for this Expo SDK, scans
  codes on iOS only. `expo-camera` uses ML Kit on Android and follows the SDK.
- **Stops are reordered with Monter / Descendre**, kept on the phone, rather
  than by dragging: large buttons work one-handed with gloves; a drag in a long
  list does not.
- **Arabic right to left per component**, not by flipping the whole app,
  which on Android needs a restart.
- **The PIN is asked at start and after 5 minutes in the background**
  (`PIN_RELOCK_AFTER_MS`). A GPS fix is waited for **4 seconds** at a scan.
- **TypeScript stays at the monorepo's version** (5.9); Expo's check is told
  to skip it.
- **APK signing, hosting and OTA updates move to phase 11** (deployment):
  they need the production keys and server. The forced update itself is built.
- The app has **no Chat, Notifications or Mes gains tab**: post-launch
  (CLAUDE.md) and D-62.
- **One React version for the whole monorepo, pinned exactly** (19.2.3, the
  one React Native 0.86 embeds). With `node-linker=hoisted` two versions put
  the web's `react-dom` beside the app's `react` and broke every web test;
  the web app steps back from 19.3.0. React moves in both apps together, when
  the Expo SDK moves.

### D-70 · Relancer corrects the parcel directly

Decided 2026-09-25, with the phase 7 plan. Vendeur 4.9 lets the seller
"correct the phone, address or note" with Relancer; D-44 sends every change
after pickup through Demander une modification. For Relancer, Vendeur 4.9 wins:

- The Relancer form offers **phone, phone 2, address, landmark and Note pour
  le coursier**, pre-filled. What the seller changes is **applied at once**,
  with the decision, in the same transaction.
- Each changed field is written **before and after** on the
  `DECISION_RELANCER` event (`metadata.changes`), like a Modifier (D-41).
- A changed **printed** field sets `labelReprintNeeded` (D-57): the depot
  reprints with the same code when the parcel comes back (A-9). The seller
  reads "Faffa Go réimprime l'étiquette au dépôt". The courier note is not
  printed (D-45), so it alone asks for no reprint.
- The **localité** is not on the form: it changes the zone and applies only
  at the depot, so it stays a change request (D-44).

**Where.** `relancerSchema`, `RELANCER_CORRECTION_FIELDS` in
`packages/shared/src/a-verifier.ts`; `DecisionsService.relancer`.

### D-71 · The seller reads the courier's note on a failure

Decided 2026-09-25, closing what D-46 left for phase 7. **Supersedes the
"note hidden" line of D-46.**

- The courier's free text on an Échec is shown to the seller **for every
  reason**, as **"Note du livreur : « … »"**: under the reason on Détail du
  colis and in the À vérifier list, and on each Échec line of the history.
- **Never on public tracking** (landing 4.3). No other free text of an event
  reaches the seller (a correction's reason stays staff-side).
- The courier app says so under the note field: **"Visible par le vendeur"**
  (Arabic: يراها البائع).

**Why.** "Client disponible après 17 h" is what the seller needs to decide.
D-9 already showed the note of a postponement.

### D-72 · Changer de client withdraws a waiting change request

Decided 2026-09-25. A request filed for the old customer must never be applied
to the new one: Changer de client sets any request still En attente to
**Retirée**, handled by the seller, in the same transaction. Retourner and
Annuler après ramassage need nothing: applying is already refused once the
parcel is a return (`COLIS_HORS_DELAI`).

### D-73 · Appels Faffa Go

Decided 2026-09-25 (Admin 2, 4.6; Vendeur 4.8, rule 18; D-11).

- **Who logs**: Admin and Service client (`SUIVI_A_VERIFIER`), from the
  À vérifier follow-up or the Colis page: `POST /colis/:code/appels`.
- **What**: answered or not (**Répondu** / **Pas de réponse**) and an optional
  note (300 characters), at the **server's time**.
- **When**: from pickup until the parcel's journey ends (not Créé, Annulé or
  Retour reçu).
- **Never edited, never deleted**. A mistake is corrected by logging again.
- **The seller** reads time, outcome and note, as "Faffa Go", never the staff
  member. **The team** reads who called.
- The calls are the team's to the customer or to the seller; one log for both.

**Where.** `logCallSchema`, `canLogCall`; `CallsService`.

### D-74 · Changer de client, in detail

Decided 2026-09-25 (Vendeur 4.9, A-6, A-17, D-8, D-9, Q3).

- **The form** is the customer part of Créer un colis: name, phone, phone 2,
  localité, address, landmark, COD (it may change, 0 allowed), Colis
  d'échange, Ouverture autorisée, Note pour le coursier. The product stays the
  same parcel. A deactivated localité is refused (D-27).
- **When**: À vérifier or Relancé, both origins, **location Au dépôt**, once
  per parcel. With the courier, the refusal reads "Disponible au retour au
  dépôt".
- **What it writes**: status Au dépôt, attempts back to 0, the
  `CHANGEMENT_CLIENT` charge at the fee **frozen on the parcel**
  (`EN_ATTENTE`), `labelReprintNeeded`, and the old customer **whole** in
  `parcel_client_changes` (migration `20261009000000_client_change_details`
  adds phone 2, landmark, courier note and the two options). Nothing of the
  old customer's delivery carries over: the failure reason and note, the
  meeting point and the Tournées plan are cleared. The COD before and after
  go on the event.
- **Who sees the old customer**: staff, on the Colis page ("Changement de
  client"). The seller and public tracking see the new customer only (A-17).

### D-75 · The 48-hour job

Decided 2026-09-25 (Vendeur 4.9, rule 15; D-30).

- Runs **every minute**, returns every parcel still À vérifier whose
  `verifyDeadlineAt` has passed on the **server clock**, **200 per pass**,
  oldest first.
- **One transaction per parcel**, through the parcel event service, as the
  system (no actor): `RETOUR_AUTO_48H`, the return fee frozen on the parcel,
  location unchanged (A-7). The locked parcel is read again, so a seller
  deciding at the same instant wins or loses cleanly; a second pass returns
  nothing twice.
- **The deadline is stored when the failure is recorded.** Changing "À
  vérifier time limit" in Paramètres changes the next failures only, like a
  rate change.
- A customer postponement has no deadline (D-9); any decision clears it.

**Where.** `VerifyDeadlineJob` in `apps/api/src/a-verifier`.

### D-76 · The in-app alert, the lists and the wording

Decided 2026-09-25, building phase 7. Notifications are post-launch, so:

- **Menu badge**: the seller's count of parcels À vérifier on the **À
  vérifier** menu item (Vendeur 3), on every page of the seller space.
- **Tableau de bord banner**: every parcel with **less than 24 hours** left,
  soonest first, each with its time left and a link to decide — the "Plus que
  24 h pour décider" of Vendeur 4.13. Absent when there is none.
- **Time left** is counted from the **server's clock**, sent with the page,
  and shown as "Retour automatique dans 31 h 20 min", in red under 24 hours.
- **The seller's À vérifier screen** lists À vérifier parcels only, soonest
  first; each opens Détail du colis, where the decisions are ("Votre
  décision"). Relancé parcels are decided on Détail du colis (Changer la date,
  Retourner, Changer de client).
- **The team's À vérifier screen** (`/admin/a-verifier`): Admin and Service
  client, per Admin 2; every seller's parcels with reason, courier note,
  attempt, location, time left, the customer's and the seller's contacts, the
  last call, and Noter un appel. Dépôt has no access (Admin 2).
- **DATE_RELANCE_REQUISE** now reads "Choisissez le jour de la nouvelle
  tentative de livraison" (closes D-29's open wording).
- The Relancer and Changer la date pickers offer tomorrow to 7 days ahead,
  in Tunis days (D-9).

### D-77 · Demo parcels waiting on the seller

Decided 2026-09-25 (D-16, D-50). `db:seed:demo` also adds two failed
deliveries of Boutique Démo, through the state machine step by step: one with
the demo livreur, failed 2 hours ago; one back at the depot, failed 40 hours
ago (under 24 hours left). Development and browser tests only, never in
production.

**Where.** `seedDemoFailures` in `apps/api/prisma/seed-demo.ts`.

### D-78 · Real PostgreSQL in the tests, without Docker

Decided 2026-09-25, before phase 8 (PROGRESS, phase 3: "required before
money"). The development machine has no Docker, so Testcontainers is out.

- **`embedded-postgres`** (dev dependency of the API) ships the official
  PostgreSQL **17** binaries for every platform through npm. A test starts a
  throwaway server in its own process, initialised in **UTF-8**, applies the
  migrations with **`prisma migrate deploy`**, and runs the API on the
  **unmodified `PrismaService`** (real driver, no adapter), connected as
  **`faffago_app` with its password**.
- **What it proves**, in `pnpm test`: two Livré scans of one parcel at the
  same instant — held behind a row lock until both have queued — deliver
  once, with one event and one fee; the same, unassisted, over ten parcels;
  the same scan UUID twice at once is written once; Livré and the seller's
  Annuler at once never charge both fees (A-1); an error the D-21 trigger
  raises at COMMIT reaches the caller as a failure (interactive, batch and
  single statement); `faffago_app` cannot UPDATE `parcel_events`.
- **Everything else stays on PGlite**, which is faster and needs nothing.
- The `test` task passes `TEMP`, `TMP` and the profile folders through turbo,
  as `e2e` already did: without them `initdb` crashes on Windows.

**Where.** `apps/api/test/real-postgres/`, `test/support/real-postgres.ts`,
`test/support/real-postgres-server.mjs`; `createTestApp(…, { databaseUrl })`.

### D-79 · The Caisse

Decided 2026-09-25, answering the phase 8 questions 1 to 3 (Admin 4.9, A-11,
A-12). **Changes Admin 4.9**, now **v1.13**: its "the day cannot be closed
while a courier … has not been counted" becomes the daily summary below.

- **One session per courier and business day**, counted and closed **on its
  own**, by Admin or Dépôt (`CAISSE`). **Compter** writes the amount handed
  over (Comptée); a recount replaces it until **Clôturer** (Clôturée). There is
  no "close the day" that waits for everyone.
- **Daily summary**: for a business day, every courier who delivered or took
  bons that day, with attendu, compté, écart and **Ouverte / Comptée /
  Clôturée**, and the totals.
- **Attendu, livreur**: the COD of every parcel his accepted, not cancelled
  Livré scan delivered **on that business day** (the phone's day, A-12) whose
  cash is still Chez le coursier, **plus the "scan tardif"**: a Livré of an
  earlier day whose own session was already Clôturée when it arrived (answer
  2). A day never counted keeps its parcels: it shows as Ouverte in its own
  summary. Worked out when read, and **written into the session's lines at
  Compter**.
- **Attendu, ramasseur**: the net of the bons de versement handed to him that
  day and not remis.
- **Clôturer is refused if the attendu changed since Compter** (a scan synced
  in between): "Le montant attendu a changé : recomptez".
- **At Clôturer**, in one transaction: each parcel's cash goes Au dépôt with an
  `ENCAISSEMENT_DEPOT` event; a **negative écart of a livreur** becomes a
  `CourierDebt` (En cours); a **negative écart of a ramasseur** is recorded on
  the session only and listed for HR (his pay is outside the app); a
  **positive écart** is flagged (answer 3).
- **Positive écart**: no credit to the courier. It stays flagged until the
  **admin** marks it **Vérifié** with a note (`CAISSE_ECARTS`, admin only, new
  permission; `ecartCheckedAt`, `ecartCheckedByUserId`).
- **Once Clôturée, no scan of that courier's day can be cancelled** (A-11):
  `ANNULATION_CAISSE_CLOTUREE`. Only the admin's Forcer un statut remains (D-85).
- **Debts**: the admin cancels a debt with a note (`PAIE_COURSIERS`). Only what
  is left is cancelled; what a fiche already deducted stays deducted.

### D-80 · Bons de versement

Decided 2026-09-25 (Vendeur 4.11, Admin 4.10, A-2, A-3, A-5, D-34; answers 4
and 5).

- **Préparer le bon**: admin only. The seller's parcels Livré, cash Au dépôt,
  in no active bon, all ticked; what he unticks waits. The server re-reads and
  locks everything, then runs `buildBonVersement`: charges oldest first, never
  negative (A-2), the retenue on the base after every fee, half-up (A-3), the
  **statut and the rate frozen on the bon** (D-34). Included charges become
  Déduite. One bon per parcel (A-5a).
- **Number** `BV-2026-0925-01`, per Tunis day, from `document_counters`.
  **QR**: `BV:` + a random token. A typed bon number is accepted and flagged,
  like a typed parcel code.
- **Attached to the seller's next Planifié pickup** (its ramasseur and day).
  None: the bon waits unattached; Admin or Dépôt (`PLANIFIER_RAMASSAGES_TOURNEES`)
  **assigns a ramasseur and a day**, and it shows in his app as a visit with
  nothing to pick up, no pickup fee (answer 4). A bon whose pickup is cancelled
  is unattached again. Planning a pickup attaches the seller's unattached bons.
- **En route**: Admin or Dépôt hands the bon and its cash to the ramasseur at
  the Caisse (answer 5): the net joins his session's attendu
  (`caisse_session_bons.takenOutMillimes`).
- **Remis**: the ramasseur scans the bon's QR (`BON_VERSEMENT_REMIS`): bon
  Remis, every parcel's cash **Payé** with a `PAIEMENT_VENDEUR` event, the
  parcel closed (D-24).
- **Not remis** by the evening: at his Clôturer the cash counts as brought
  back, the bon returns to Préparé, unattached (A-5b).
- **Archivé**: the signed copy scanned at the depot, station mode **Archivage
  bons** (D-50).
- **Annuler le bon** (A-5): admin, **Préparé only** (a bon brought back is
  Préparé again), a reason, audited. Its parcels are free again
  (`bon_versement_parcels.releasedAt`: one unreleased line per parcel), its
  charges back to En attente, the number never reused.
- **PDF**: two copies (Exemplaire vendeur, Exemplaire Faffa Go), each on its
  own A4 pages with the QR, the parcels, the fee lines, the retenue on its own
  line and the net. Built on request, never stored (D-86).

### D-81 · Bons de retour

Decided 2026-09-25 (Vendeur 4.12, Admin 4.11, A-7, A-10, D-11; answer 6).

- **Préparation retours** (station, Admin and Dépôt): a parcel Retour au dépôt
  and at the depot joins its seller's open Préparé bon de retour, created with
  its number (`BR-…`) when there is none. Also the **old item of an échange**:
  the delivered parcel's code, item collected and not yet in a bon, becomes an
  `ARTICLE_RECUPERE` line with an `ARTICLE_ECHANGE_RECUPERE` event, **no fee**
  (A-10).
- **Attached and handed out like a bon de versement** (D-80): `DEPART_RETOUR`
  moves each parcel to Retour en route with the ramasseur.
- **Retour reçu**: the ramasseur scans each parcel (the échange parcel's code
  for its item). The bon is **Remis** once every line is received.
- **Not handed over** (answer 6): at his Clôturer, each line not received goes
  back — parcel **Retour au dépôt, at the depot**, a new transition and event
  `RETOUR_NON_REMIS`, no fee — and the bon returns to Préparé, unattached; its
  received lines stay received. The ramasseur's session exists as soon as he
  takes a bon de retour, even with no cash.
- **Archivé** through Archivage bons, like a bon de versement.

### D-82 · Livreur pay

Decided 2026-09-25 (Admin 4.12, Coursier 4.10, A-15, A-16; answers 7, 8).

- **A fiche is due** once its period has ended **and** no parcel of his
  delivered on or before its end still has its cash Chez le coursier (every
  session closed). It pays **every delivered parcel not yet on a fiche** up to
  the period's end, at the **rate frozen at delivery** (A-15): late parcels
  catch up. Nothing delivered, no fiche.
- **Debts** En cours are deducted **when the fiche is prepared**, oldest
  first; what does not fit stays (Admin 4.12). Number `FP-2026-0925-01`.
  **Payée**: admin. Preparing and paying: `PAIE_COURSIERS`.
- **Plan change** (A-16): takes effect **the day after the current period
  ends**; the first period of the new plan runs from that day to its calendar
  end (a first short week, answer 8). Stored as a pending plan and its date.
- **Mes gains** (app): the current period's parcels × their rates − debts en
  cours = amount due, the next payment date (the day after the period), and
  the fiches.

### D-83 · What the seller sees of the money

Decided 2026-09-25 (Vendeur 4.1, 4.11, 4.12, D-40, D-48; answer 10).

- **À recevoir**: COD − the delivery fee frozen on the parcel, for every
  delivered parcel not yet paid, split **chez les coursiers** / **au dépôt**
  (a parcel in a bon Préparé or En route counts au dépôt). The other fees
  waiting — return, change-client, pickup — show on their own line, **Frais à
  déduire**. The retenue is not estimated.
- **Taux de livraison**: livrés ÷ (livrés + retournés) over the Tableau de
  bord's period (D-48): a parcel counts on its `LIVRAISON` or `RETOUR_RECU`
  event (D-24), a cancelled scan taken back. "—" with nothing to count.
- **Menu badges**: Paiements counts the bons de versement **En route**,
  Retours the bons de retour En route.
- The seller prints his own bons; another seller's does not exist (D-26).

### D-84 · The ramasseur's visit

Decided 2026-09-25 (Coursier 4.6, 4.7; D-61).

- His day lists his pickups and his **bon-only visits**, each seller with
  **À emporter**: the bons de versement (number, net) and de retour (number,
  lines) he carries.
- The steps **Bon de versement** and **Retours** use the same queue
  (`POST /scans/courier`): `BON_VERSEMENT_REMIS` with the QR, `RETOUR_RECU`
  with the parcel's label.
- **Ma caisse**: a livreur's cash, a ramasseur's bon cash still to hand out,
  and the result of each closed session: **Conforme**, or the écart.

### D-85 · Forcer un statut on money

Decided 2026-09-25 (D-56, A-11; answer 9). One more move, admin only, with a
reason: **undo a Livré whose cash is still Chez le coursier**. The parcel goes
back to En livraison with its livreur, the attempt it counted taken back; the
delivery fee becomes Annulée, the frozen courier rate is removed, the cash
status and the échange item cleared. Everything else touching Livré, a return,
Annulé or a charge stays refused.

### D-86 · Choices made building phase 8

Decided 2026-09-25, building phase 8 (none touches a fee, a status or a
permission beyond D-79 to D-85).

- **The scan tardif is claimed by the first session counted.** A late Livré
  belongs to any later open session of its courier; the first one counted
  writes it into its lines, and no other session counts it after that.
- **Bon steps are not undone.** A Remis or Retour reçu scan, and an
  Archivage, are corrected by the admin (`ANNULATION_BON`; the correction is
  D-88); a Préparation
  retours scan is cancelled like any depot scan, the line leaving the bon.
- **Handing out a bon** needs a ramasseur active and taking work (D-12), and
  his caisse of today not closed; it opens that session if needed.
- **The fiche de paie** stores the Paramètres rate of the day it is prepared
  for the record, and prints the parcels grouped by the rate frozen on them
  (A-15). A fiche cannot be cancelled.
- **Money documents**: A4, two copies of each bon (Exemplaire vendeur,
  Exemplaire Faffa Go), each on its own pages with its QR; the fiche de paie
  once. Built on request, never stored.
- **The delivery rate chart**: one bar per day, 0–100 % scale, when the
  period has 2 to 31 days.
- **Under Voir comme le vendeur**, Paiements and Retours show no print link:
  printing goes through the seller's own session (D-5, D-15).
- **The courier app** shows days as `JJ/MM`, like the rest of the app.
- **API tests**: 40 % of the cores instead of 50 %, and a worker past 768 MB
  replaced between files (`workerIdleMemoryLimit`): with the money files the
  suite ran out of memory (PGlite, then argon2) beside the web and app tests.
  Two older tests depended on the time of day and are fixed: one sorted
  events by server time, mixing the test clock and the real one (now by the
  event sequence); one looked for the GPS "36.8" in a text that holds the
  real creation time (now distinctive coordinates).

### D-87 · Choices made building phase 9

Decided 2026-09-25, building the public site (none touches a fee, a status or
a permission).

- **Tracking**: `GET /public/tracking/:code?langue=FR|AR`, `@Public`. A wrong
  code (malformed or unknown, the same answer, as D-26) slows the visitor's
  IP: 10 free, then 1 s doubling up to 60 s, forgotten after an hour; a found
  parcel clears it (`PUBLIC_TRACKING_THROTTLE`, in memory like D-6). The
  unused `PUBLIC_TRACKING_RATE_LIMIT_PER_MINUTE` is gone from `.env.example`.
- **The public timeline** (Q2): each whitelisted event is a step, and a step
  repeated in a row shows once, at its latest date (Ramassé + Entrée dépôt =
  one "Chez Faffa Go"; a second attempt one "En cours de livraison").
  Events of a cancelled scan are dropped (D-54); Départ retour and Retour reçu
  are dropped once `cancelledAt` is set (D-31). The track line: Commande
  enregistrée › Chez Faffa Go › En cours de livraison › Livré (or Retourné au
  vendeur); a cancelled order reads Commande enregistrée › Commande annulée.
- **The amount to prepare** shows while the delivery is ahead, not once
  delivered, returned or cancelled; a COD of 0 reads "Rien à payer à la
  livraison". The livreur's first name only while En cours de livraison.
- **Addresses**: `/fr/suivi/FG-…` and `/ar/suivi/FG-…`. `/suivi/FG-…` (the QR
  code, D-36, D-43) and `/` redirect to the remembered language, else the
  browser's (Accept-Language order), else French. The language is remembered
  in the `fg_locale` cookie by any visit to `/fr` or `/ar`, never by a
  prefetch. The switch goes to the same page in the other language.
- **`GET /public/site-info`**, `@Public`: fees, the À vérifier limit and the
  attempts (the FAQ quotes them), contact links, délégations by gouvernorat,
  the Meta Pixel id; never `GET /settings`. The web server keeps it 5 minutes
  (`PUBLIC_SITE_CACHE_SECONDS`), keeps the last good copy if the API fails,
  and reads it on each request, never at build.
- **Meta Pixel**: a setting `meta_pixel_id`, empty = off (the default), digits
  only; Paramètres › Suivi publicitaire. When on: PageView, and Meta's
  standard `Contact` event with the channel on each Devenir partenaire link
  (WhatsApp, phone, Facebook, Instagram, TikTok).
- **SEO**: title and description per language, canonical, `hreflang` fr / ar
  / x-default, Open Graph and Twitter card, `sitemap.xml` (both languages),
  `robots.txt` (the landing page only; no seller space, back office, API or
  tracking page). Tracking pages are `noindex`. The Open Graph image carries
  the brand only, in Latin letters (no Arabic font in the renderer); the text
  beside it is in the page's language.
- **Landing page**: the sections of Landing 2 in order; the hero headline is
  the "Returns" angle. Phone top bar: logo, language, Devenir partenaire, a
  menu that opens without JavaScript. The FAQ opens without JavaScript too.
  Contact links left empty in Paramètres are not shown.
- **Not invented, so not shown**: the company's legal information in the
  footer (Landing 2.8) waits for the real details; the hero's courier and
  motorcycle is a simple brand-coloured drawing until a real illustration or
  photo exists.
- **Bon PDFs** (pre-phase-9 check): the Remis par / Reçu par blocks print Nom,
  Date and Signature on both copies of both documents.

**Where.** `apps/api/src/public`, `packages/shared/src/public-tracking.ts`,
`packages/shared/src/public-site.ts`, `apps/web/src/app/(public)`,
`apps/web/src/components/public`, `apps/web/src/lib/locale.ts`,
`apps/web/src/lib/public-texts.ts`, `apps/web/src/middleware.ts`.

### D-88 · Correcting a bon scanned by mistake

Decided 2026-09-25, the proposal of the pre-phase-9 check approved with two
additions. Replaces D-86's "the admin corrects (`ANNULATION_BON`)", which had
no path behind it.

- **Who and how**: the admin alone (`CORRIGER_BON`), a reason required, one
  transaction, audited (`CORRECTION_BON_VERSEMENT`, `CORRECTION_BON_RETOUR`),
  one append-only `bon_corrections` row. The mistaken scan (Remis, Retour
  reçu) is marked cancelled with the reason, so public tracking and the
  delivery rate drop it. **Refused once the bon is Archivé**: the signed copy
  proves the seller received it. **No fee changes**: the charges on the bon
  stay Déduite; the return fee was charged when the return was decided.
- **Bon de versement scanned Remis**, the ramasseur's caisse of the day he
  carried it still open: the bon goes back **En route** with him, each
  parcel's cash **Payé → Au dépôt** (one `CORRECTION_BON` event, the parcel
  reopened), and his caisse expects the net again (a count made since must be
  redone).
- **Same, his caisse already closed**: the bon goes back **Préparé**,
  unattached, the cash Au dépôt; the closed session is never rewritten. His
  surplus of that session explains the bon: the part it covers is recorded,
  and a surplus fully explained is marked Vérifié with "Expliqué par la
  correction du bon BV-…". **No matching surplus** (addition 1): what the
  surplus does not cover is recorded as **his shortfall, for HR**, with the bon
  and the reason, listed in Caisse › "Bons corrigés après clôture, non
  couverts par un surplus (RH)" beside the other ramasseur écarts; never a
  courier debt (ramasseurs are paid outside the app). A surplus is never used
  twice for two bons of the same session.
- **A line of a bon de retour scanned Retour reçu**: the new transition out of
  Retour reçu (`CORRECTION_RETOUR_RECU`, admin only). The ramasseur's caisse
  of the day of that scan still open and the bon still his: the parcel goes
  back **Retour en route** with him, the bon En route (his Clôturer then brings
  it back as D-81 says). Closed: the parcel goes back **Retour au dépôt**, at
  the depot, the bon **Préparé** and unattached. The old item of an échange
  follows its line (`exchangeItemStatus`), the parcel itself does not move. A
  bon out again on another trip waits for that trip's Clôturer.
- **The seller** (addition 2) reads **"Correction Faffa Go"** on his bon in
  Paiements or Retours (with its date) and on the parcel's timeline; never the
  reason. Staff read the reason on the bon, the Colis log and the audit.
- **Not built**: undoing a wrong Archivage scan (Archivé → Remis), proposed as a
  separate action with no money effect; not requested.

**Where.** `bonVersementCorrection`, `bonRetourLineCorrection`,
`correctBonSchema` in `packages/shared/src/bons.ts`; `CORRECTION_RETOUR_RECU`,
`CashTransition.BON_CORRIGE` in `parcel-state-machine.ts`;
`apps/api/src/money/bon-corrections.service.ts`; migration
`20261011000000_bon_corrections`.

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
and ADMIN. _(Screen: phase 5.)_

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
> Refined by **D-17**: localités carry an optional Arabic name, falling back to
> the French one.

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

A **Saisie manuelle** row is added to the Exceptions queue. _(Screen: phase 5.)_

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
  _Refined by **D-17**: a row now resolves to a localité._
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
`users_username_format` and the two lowercase unique indexes;
`users_staff_phone_key` (Q8). Session lifetimes and throttle numbers in
`SESSION_POLICY` and `LOGIN_THROTTLE` (`packages/shared/src/auth.ts`); the
sessions in `apps/api/src/auth/sessions.service.ts`; the throttling in
`login-throttle.service.ts`; the last-admin guard in `accounts.service.ts`.

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
