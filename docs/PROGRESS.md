# Faffa Go — build progress

Claude Code updates this file at the end of every task.
Business rules decided after the specs are recorded in `docs/decisions.md`.
Legend: [ ] not started · [~] in progress · [x] done

## Phase 0 — Foundation (done)

- [x] Monorepo (pnpm workspaces + Turborepo): apps/api, apps/web, apps/courier, packages/shared, packages/config
- [x] packages/shared: status enums, money helpers (millimes), state machine, geo/CSV matching, chat lifecycle, zod schemas — 152 tests
- [x] Full Prisma schema reviewed and approved (40 tables) + first migration, with append-only enforcement proved from the `faffago_app` role

## Phase 1 — Auth and permissions

Done: API and web. Merged into `main` on 2026-09-25 after a browser test.

- [x] Permission matrix from Admin 2, encoded in packages/shared and tested
      (`permissions.ts`: the test copies the spec table row by row)
- [x] Login: vendeur = email, staff = username, coursier = téléphone + role choice (A-20)
- [x] Admin-generated passwords (argon2id), shown once, no self-service reset (A-20, Q7).
      Staff and courier creation; seller creation comes in phase 4 with the documents
- [x] Role guards on every endpoint, deny by default; seller scoped to his own data
- [x] Régénérer le mot de passe; last active admin protected; admin:reset CLI (Q9)
- [x] Login throttling, no permanent lockout (D-6); session lifetimes (Q11)
- [x] Voir comme le vendeur: read-only, 30 min, audited (D-5)
- [x] Minimum courier app version enforced by the API; outdated apps reach the
      scan upload only (D-14)
- [x] Screen access for Dépôt and Service client in the matrix (D-11, Admin v1.11);
      the seller's email is admin-only
- [x] Désactiver un coursier: new work stops at once, refused while work is open
      (D-12). The caisse, payslip and debt checks are `it.todo` until phase 8
- [x] Refresh token grace window, 10 s (D-13)
- [x] List endpoints: `GET /accounts/staff`, `GET /accounts/couriers`,
      `GET /sellers`, each narrowed by role
- [x] `db:seed:demo`: demo accounts, development only (D-16)
- [x] apps/web scaffolded: Next.js 15, Tailwind with the brand tokens, `/fr` and
      `/ar` with RTL from the first commit
- [x] Web sessions: tokens in httpOnly cookies, middleware refresh, Origin check,
      one refresh across tabs (D-13 web side, D-15)
- [x] Web screens: the two logins (`/vendeur/connexion`, `/admin/connexion`),
      Coursiers, Vendeurs, Paramètres › Utilisateurs, "Copier les
      identifiants", Régénérer le mot de passe, Désactiver / Réactiver with the
      blocker list, Voir comme le vendeur with its banner
- [ ] Courier login screen with role choice — phase 6

## Phase 2 — Seed et Paramètres

Done. Merged into `main` on 2026-09-23 after a browser test on a reset
database (Paramètres shows the right values and saves). Inserted as a new phase
on 2026-09-23 (D-18).

- [x] Grand Tunis geography reviewed and approved (`docs/geo-review.md`, D-19)
- [x] Localités data in `apps/api/prisma/data/localites-grand-tunis.csv`:
      938 rows, 48 délégations, corrected as approved (D-17)
- [x] `Localite` model; migration `20260926000000_localites` with the
      (localité, délégation) keys on parcels, pickup addresses and the
      Changer de client history; one Autre per délégation — 14 schema tests
- [x] Seed: 48 délégations with the approved spellings, `MAN-DENDEN` removed,
      938 localités create-only by seed key, the 15 initial zones created once,
      settings with the starting values — 20 seed tests
- [x] Settings service and API (`GET /settings`, `PATCH /settings/:key`,
      admin only): every change audited in its transaction, rolled back if the
      audit entry fails, fees frozen on existing parcels, money as digit
      strings — 16 tests
- [x] Geography API: `GET /geo` for every signed-in user; for the admin,
      `/localites` (list, add, change) and `/localites/autre/parcels`, audited —
      19 tests
- [x] Shared: settings validation, `searchLocalites`, `resolveLocalite` with the
      preview's dropdown options, computed ambiguity, `formatRatePercent` /
      `parseRatePercent`, `parseWholeNumber`
- [x] Web: Paramètres › Tarifs et règles (fees, retenue, limits, contact links;
      failure reasons read-only) beside Utilisateurs; PATCH through the BFF
- [x] Starting values for the delivery fee, return fee, courier rate and contact
      links, TikTok included (D-20)
- [x] The 8 localités marked "délégation à confirmer" corrected (D-17): Lac 2
      moves to La Goulette, Cité Olympique to Cité El Khadra, the other six
      are confirmed where they were; all eight now carry a postal code

## Phase 3 — Parcel core

Done. Merged into `main` on 2026-09-24 after lint, typecheck and test passed
through turbo; no browser test, since the phase has no screen. API and shared
only, no HTTP endpoint (D-22).

- [x] `ParcelsService.create`: fees frozen from `feesForNewParcel` at creation,
      délégation taken from the localité, CREATION event in the same
      transaction, random code with retry on collision; refuses a suspended
      seller (D-25) and a deactivated localité (D-27) — 16 tests
- [x] `ParcelEventService`: the only way a parcel moves. Locks the row, runs
      the shared state machine, writes the parcel, one event per step (who,
      when, GPS, device, previous → new, reason, metadata) and the charges it
      owes, in one transaction or the caller's. Actor from the principal
      only; another seller's parcel is "Code inconnu" (D-26) — 22 tests
- [x] `parcelWriteFor` (shared): columns and charges per transition; charges
      copied from the parcel's frozen fees, courier rate frozen at delivery,
      48-hour deadline, timestamps, échange item (D-23), `closedAt` (D-24) —
      18 tests
- [x] Cancellation after pickup in the state machine (D-28) and "Commande
      annulée" on public tracking — 25 tests
- [x] Relancer without a date refused by the state machine (D-29) — 4 tests
- [x] No status change without its event, enforced by a deferred trigger
      (D-21) — 10 schema tests
- [x] Append-only audit log (trigger + revoked privileges + tests)
- [ ] **Required before phase 8 (money)**: two actions on the same parcel at
      the same instant — above all two Livré scans — tested on a real
      PostgreSQL server (Testcontainers). The service takes a
      `SELECT … FOR UPDATE` lock; PGlite has a single connection and cannot
      prove it. The same run proves that, with the production Prisma setup
      (real driver, no test adapter), an error raised at COMMIT by the D-21
      trigger reaches the caller as a failure, not a success. No money is
      counted until both pass.

## Phase 4 — Seller space

Done. Merged into `main` on 2026-09-24 after `pnpm lint`, `pnpm typecheck`,
`pnpm test` and `pnpm e2e` passed through turbo. Plan approved 2026-09-24;
answers recorded as D-32 to D-41. Built and committed in steps 1 to 8, each
reported and approved before the next.

- [x] Seller accounts created by admin (statut, documents in private storage,
      encrypted, D-32, D-33, D-34) — step 1, API and web:
      `POST /sellers` (multipart, CIN front and back plus the statut's
      document, one transaction), `GET /sellers/:id` narrowed per role,
      `PATCH /sellers/:id`, `POST /sellers/:id/statut` (with its document),
      `/suspend`, `/reactivate`, `POST /sellers/:id/documents` (replace, old
      version kept), `GET /sellers/:id/documents/:documentId` (admin only,
      no-store, every view audited). Storage: AES-256-GCM with a key id per
      file, images re-encoded (EXIF and GPS gone, orientation applied),
      write-once files named by UUID, `documents:verify` for restores.
      Migration `20260928000000_seller_documents`: product category enum,
      document rows never deleted and changed only to be marked replaced,
      once (trigger + revoked DELETE). Web: Créer un vendeur, the seller
      page, the BFF carrying uploads and files — 38 API e2e, 33 storage, 10
      schema, 13 shared, 13 web tests. Browser-tested and approved
      2026-09-24.
- [x] Changer de contact (D-42): a different contact person with his CIN
      front and back in one action, the previous CIN kept as replaced;
      Modifier stays for typos — 7 API e2e, 1 web test
- [x] Créer un colis + validation; Modifier / Annuler (D-39, D-41);
      Demander une modification, seller side (D-39) — step 2, API and web:
      `POST /parcels` (retry-safe: the form's UUID in `clientRequestId`,
      201 then 200 for the same request), `GET /parcels/:code` (also for
      Voir comme le vendeur), `PATCH /parcels/:code` (Créé only; one
      MODIFICATION_VENDEUR event with each changed field before and after;
      fees untouched; `reprintLabel` when a printed field changed),
      `POST /parcels/:code/cancel` (Annulé before pickup, the return flow
      with the frozen return fee after, D-28), and
      `POST /parcels/:code/change-requests` (after pickup, until delivered
      or returned). Another seller's code is "Code inconnu" everywhere (D-26); a
      suspended seller still edits, cancels and asks (D-25). Web: Créer un
      colis with the localité search and cascade, the parcel page with
      Modifier, Annuler, Demander une modification. Migration
      `20260929000000_parcel_client_request` — 29 API e2e, 9 shared, 10 web
      tests
- [x] Demander une modification, as decided in D-44: the localité can be
      asked for, and one request waits per parcel (partial unique index).
      The seller edits the waiting one or withdraws it (status Retirée,
      with who and when):
      `PATCH /parcels/:code/change-requests/:id` and
      `POST /parcels/:code/change-requests/:id/withdraw`.
      Migration `20260930000000_change_request_waiting` — 8 API e2e,
      1 shared, 4 web tests. Applying a request (at the depot for a
      localité) is phase 5
- [x] Import CSV (client preview + server validation, D-37) — step 3, API
      and web. The browser reads the file and previews each row as Valide,
      À vérifier (a localité to pick in its dropdown) or Erreur, with the
      reason; Télécharger le modèle and the délégation list with codes.
      `POST /parcels/imports` evaluates every row again with the same shared
      functions and creates them all in one transaction, or none;
      `GET /parcels/imports/:id` gives the codes back for the labels.
      Migration `20261001000000_parcel_imports` — 27 shared, 12 API e2e,
      7 web tests
- [x] Labels PDF (Code128 + QR; thermal and A4, D-36) — step 4. One
      PDF per request, built by the API (pdfkit, bwip-js):
      `GET /parcels/:code/label`, `GET /parcels/labels?codes=…` (up to 500,
      in the order given) and `GET /parcels/imports/:id/labels` (file order),
      each `?format=THERMAL|A4`. The Code128 holds the code, the QR the
      tracking URL built from `NEXT_PUBLIC_SITE_URL` (D-43); without it the
      API refuses to print. `parcelCodeFromScan` reads either symbol, any
      domain. Web: print links on the parcel page and in the reprint
      warning; "Imprimer toutes les étiquettes" after an import — 5 shared,
      18 API, 3 web tests
- [x] Arabic on labels (D-45): Noto Sans and Noto Sans Arabic embedded
      (OFL, `apps/api/assets/fonts`), words shaped in the font of their
      script, each field laid out with the Unicode bidi algorithm
      (bidi-js) in its own direction, wrapped within its box, "…" past its
      lines. The landmark under the address; the second phone only when
      there is one — 16 API tests
- [x] Mes colis + Détail du colis (D-38, D-40) — step 5, API and web.
      `GET /parcels`: the seller's parcels by status group with the count of
      each, search by code, name or phone, a date range in Tunis days,
      50 a page. `GET /parcels/export`: the same filter as CSV (up to
      10 000 rows). `GET /parcels/:code` adds the timeline (Vous, a courier
      by first name, Faffa Go; the place as a label, never GPS or the
      courier's note), the attempts, and the bon of a paid parcel. Web: Mes
      colis with its groups, filters in the address, Exporter, and a
      selection printed as one batch of labels; the parcel page with the
      track line, "Tentative n sur m", the money block and the history.
      Migration `20261002000000_parcel_event_sequence` — 15 shared, 11 API
      e2e, 9 web tests
- [x] Ramassage requests + pickup address at first request (D-35) — step 6,
      API and web. `POST /pickups` (idempotent by the client's UUID): a
      saved address or a new one, the parcels ready (Créé, in no open
      request) or only their number, Matin or Après-midi, a note. One open
      request per address; a suspended seller cannot request. `GET /pickups`,
      `GET /pickups/:id` (which parcels were picked up once Effectué, the
      ramasseur's first name), `POST /pickups/:id/cancel` while Demandé or
      Planifié. Addresses: list, add, edit (replaced once a request used
      them), choose the default. Web: Ramassages, Demander un ramassage with
      the fee rule before confirming, the request page with Annuler.
      Migration `20261003000000_pickup_requests` — 7 shared, 19 API e2e,
      13 web tests
- [x] Profil (Vendeur 4.14) — step 6, built with the pickup addresses.
      `GET /profile`: shop, contact, statut with the retenue note, rates;
      the pickup addresses managed on the same page — 1 API e2e, 5 web tests
- [x] Tableau de bord (D-39, D-48) — step 7, API and web. What happened
      to the seller's parcels over a period: Créés, Ramassés, En livraison,
      Livrés, Échecs, Reportés (D-9 postponements, apart from Échecs);
      distinct parcels per tile, a cancelled scan taken back, a status
      correction counted nowhere, a scan filed under its phone's Tunis day
      (A-12). Period: Aujourd'hui, Hier, 7 derniers jours, Ce mois or a
      custom range of 366 days at most, kept in the address.
      `GET /dashboard?from=&to=` (VENDEUR, Voir comme le vendeur reads).
      Quick actions Créer un colis and Demander un ramassage, hidden when
      suspended or read-only. No migration — 16 shared, 13 API e2e, 11 web
      tests
- [x] Playwright browser tests (D-49) — step 8. One flow, 14 tests in
      order, on the API on PGlite (fresh database) and a production build:
      the logins (a wrong password refused), Créer un coursier and Créer un
      utilisateur (Dépôt) with Copier les identifiants, Créer un vendeur
      with his documents; the seller's first login (Tableau de bord at 0),
      Créer un colis, Import CSV of 3 rows (Arabic name and address, a
      localité settled in the row's dropdown, a French row), Imprimer toutes
      les étiquettes (both formats are PDFs), Mes colis (4 parcels, En cours,
      search by phone), Demander un ramassage (new address, 2 parcels,
      Matin) then Annuler le ramassage, the Tableau de bord over 7 derniers
      jours (Créés = 4), Voir comme le vendeur and Quitter, the Dépôt (shop
      only: no email, no documents, no action), the seller's logout.
      `pnpm e2e` from the root; a merge gate in CLAUDE.md

## Phase 5 — Back office operations

Done. Merged into `main` on 2026-09-25 after `pnpm lint`, `pnpm typecheck`,
`pnpm test` and `pnpm e2e` (23 browser tests) passed through turbo. Plan
approved 2026-09-24; answers recorded as D-50 to D-58. Built in steps 1 to
10, each reported before the next.

- [x] Zones (livreur + ramasseur, titular + backup) and absence switch;
      screens for zones, délégations and localités, with courier zone
      assignment (D-18); the list of parcels filed under Autre — step 1,
      API and web (D-51, D-52).
      `GET /geo/admin`, `PATCH /gouvernorats/:id` and `PATCH /delegations/:id`
      (names in French and Arabic, a délégation's zone or none; no adding, no
      deactivating); `/zones` list, create, rename, deactivate (refused while
      délégations are attached) and `PUT /zones/:id/assignments` (the four
      couriers replaced together; role, account and D-12 checked for a courier
      newly placed, one already in his slot kept); `/couriers/:id/absences`
      list, mark and remove (Admin and Dépôt, audited, today or later), a
      ramasseur's pickups planned that day moved to whoever covers their zone.
      Who covers a zone on a day is worked out when read
      (`coveringCourier`, `ZoneCoverageService`). The seed is now create-only
      for gouvernorats and délégations. The Coursiers list gains each zone's
      role and "absent today". Web: Paramètres › Zones and › Géographie (a
      délégation's localités, the Autre list), the Absences dialog on
      Coursiers. No migration — 16 shared, 32 API e2e (and the seed tests), 26 web tests
- [x] Web scan station (camera + USB gun), 3 modes (D-50), scan
      deduplication — step 2, API and web (D-53). `POST /scans/depot`
      (Admin, Dépôt): Entrée dépôt (D-28 included), Sortie coursier (the
      chosen livreur must be able to work today; another than the one
      planned is accepted and named "Prévu pour"), Retour de tournée (the
      livreur first; another livreur's parcel refused; A-8 included). Every
      scan stored, accepted or refused, under the browser's UUID: the same
      one again answers 200 with the first result, the same one for another
      parcel, mode or person is refused. Manual entry and clock skew flagged
      (A-12, A-22). Migration `20261004000000_depot_scans`:
      `scans.parcelBefore`, `scans.targetCourierId`, two CHECKs. Web: Scan
      in the menu (Admin, Dépôt), the station with F1–F3, the courier
      chooser, the gun or typed code, the camera (`BarcodeDetector`, zxing
      otherwise), the full-screen result and the last 20 scans — 13 shared,
      26 API e2e, 2 schema, 10 web tests
- [x] Annuler le dernier scan (D-54) — step 3, API and web.
      `POST /scans/depot/:scanId/cancel` (Admin, Dépôt): the scanner's own
      last accepted scan, within `scan_cancel_window_seconds` (60 s) on the
      server clock, while the scan's event is still the parcel's last. The
      parcel goes back to `parcelBefore` (relance and manual move included)
      through `ParcelEventService.restoreBeforeScan`, with one
      `ANNULATION_SCAN` event; the scan keeps its row with `cancelledAt`.
      Asked twice, it answers the same. Web: "Annuler le dernier scan" on the
      newest accepted scan of the station, the result in navy, "Annulé" in
      the list. No migration — 5 shared, 11 API e2e, 3 web tests
- [x] Tournées (parcels grouped by zone, manual moves, D-55) — step 4, API
      and web. `GET /tournees` (Admin, Dépôt): the parcels at the depot due
      today (`isDueForTour`: Au dépôt, or Relancé on or after its date), in
      their zone's column under the livreur covering it today (D-52), "Sans
      coursier" and "Sans zone" apart; each courier's load.
      `POST /tournees/moves`: parcels to another livreur able to go out
      today, or back under their zone with null; all or nothing; one
      `AFFECTATION_LIVREUR` event per parcel moved
      (`ParcelEventService.recordPlannedLivreur`), kept off the seller's
      timeline by `EVENT_TYPES_HIDDEN_FROM_SELLER` and off public tracking by
      its whitelist. The Coursiers list gains each livreur's parcels today
      (in hand, planned). Web: Tournées in the menu (Admin, Dépôt), the
      columns, the loads, a selection moved from a bar at the bottom. No
      migration — 9 shared, 14 API e2e, 9 web tests
- [x] Ramassages planning + À emporter (D-58) — step 5, API and web.
      `GET /ramassages?status=` (Admin, Dépôt): the requests with the shop,
      the contact phone, the place and its zone, the window asked, the
      parcels, the note, and for a request the ramasseur covering its zone
      today. `GET /ramassages/:id/suggestion?date=`: the one covering it on
      the day chosen (A-14, D-52). `POST /ramassages/:id/plan`: day (today
      or later), window, a ramasseur able to work that day; again while
      Planifié. `GET /ramassages/:id`: the parcels announced, picked up or
      not, and À emporter (the seller's bons de versement and de retour
      Préparé; empty until phase 8). No cancel route for the team (D-58).
      Migration `20261005000000_pickup_planning`: who planned and when, and
      a CHECK that a planned pickup has its day, window and ramasseur. Web:
      Ramassages in the menu (Admin, Dépôt), a tab per status, Planifier /
      Replanifier with the ramasseur pre-filled, the detail with À emporter
      — 2 shared, 16 API e2e, 10 web tests
- [x] Colis search, detail, Réimprimer l'étiquette (A-9) — step 6, API and
      web. `GET /colis` (Admin, Dépôt, Service client): every parcel,
      searched by code, customer name or phone, or shop; filtered by
      status, cash status, seller, livreur, zone ("Sans zone" included) and
      creation day in Tunis time; 50 a page. `GET /colis/filters`,
      `GET /colis/export` (CSV, 10 000 rows at most). `GET /colis/:code`: the
      customer, the seller, the money (COD, frozen fees, charges, cash
      status, bon), the courier's reason and note, and the whole event log
      (full names and roles, source, statuses and places, GPS, device time,
      manual entry, cancelled scan, clock skew, "Prévu pour").
      `GET /colis/:code/label` (Admin, Dépôt): Réimprimer l'étiquette, same
      code (A-9). Web: Colis in the menu, the filters in the address, the
      pages, Exporter, the detail; "Voir ses colis" on the seller's page. No
      migration — 5 shared, 19 API e2e, 10 web tests
- [x] Applying seller change requests (D-57) — step 7, API and web.
      `GET /demandes-modification` (Service client, Admin): the waiting
      requests, each field now and asked, and why one cannot apply yet.
      `POST /demandes-modification/:id/apply`: as a whole, from Ramassé to
      Relancé, a new localité only while the parcel is at the depot (its
      délégation follows, a Tournées move to another zone is undone), one
      `MODIFICATION_APPLIQUEE` event with each field before and after
      (`ParcelEventService.recordAppliedChange`), read by the seller as
      "Faffa Go". `POST /demandes-modification/:id/refuse`: a reason the
      seller reads. The parcel is locked as the seller's own routes lock it.
      `parcels.labelReprintNeeded`: set when a printed field changed; badge
      in Colis and Tournées, warning on the next depot scan, cleared by the
      team's reprint. Migration `20261006000000_change_requests_applied`.
      Web: the requests on the parcel's Colis page with Appliquer / Refuser,
      the badges, the station's warning, "Raison du refus" for the seller —
      8 shared, 16 API e2e, 12 web tests
- [x] Forcer un statut, scan cancellation after the window (D-56) — step
      8, API and web. `POST /colis/:code/forcer-statut` (admin only): a
      reason required; between Ramassé, Au dépôt and En livraison (the
      livreur named), or the place of an À vérifier, Relancé or Retour au
      dépôt parcel; nothing touching Livré, Annulé, a return or money; no
      effect runs (`forcedStatusRefusal`, `ParcelEventService.forceStatus`).
      One FORCAGE_STATUT event with the reason, and an `audit_log` entry
      before and after. `POST /scans/depot/:scanId/cancel-admin`: any depot
      scan, after its window, with a reason, audited, while its event is the
      parcel's last. Web: Forcer un statut on the parcel's Colis page with
      only the moves allowed, Annuler ce scan on the log — 8 shared, 13 API
      e2e, 8 web tests
- [x] Exceptions, first rows (D-50) — step 9, API and web.
      `GET /exceptions` (every staff role): parcels waiting at the depot for
      a tour more than 48 h since they arrived (a Relancé parcel from the
      start of its day); pickups planned for a day already past; seller
      change requests waiting (D-57); codes typed by hand in the last 7 days
      (A-22). Web: Exceptions in the menu, one block per row with its count,
      each row leading to Tournées, the pickup, or the parcel's Colis page;
      a link to act only for the roles that may. No migration — 4 shared,
      6 API e2e, 6 web tests
- [x] Demo data, Playwright, merge — step 10. `db:seed:demo` (development
      only, D-16, D-50) now adds two livreurs and a ramasseur, assigns the
      demo couriers to three zones (Ben Arous Côte left without, to show
      "Sans coursier"), creates ten demo parcels picked up across four
      délégations — through the shared state machine, one event per step,
      as the ramasseur's scan will in phase 6 — and one pickup request to
      plan (`seedDemoOperations`, idempotent by request id). The test API
      seeds the same data. Playwright `phase-5.spec.ts`, 9 tests in order:
      the zones and délégations, a demo parcel found in Colis, Entrée dépôt
      scanned, cancelled and scanned again, moved in Tournées, Sortie
      coursier with "Prévu pour" and Retour de tournée, the log and Forcer
      un statut, a pickup planned with the zone's ramasseur, Exceptions, a
      livreur marked absent. The phase 4 flow now picks its own shop's row
      on Vendeurs. `pnpm e2e`: 23 tests
- [x] Leftovers, on `main` (D-59, D-60): Marquer comme traité on Saisie
      manuelle (Admin, Dépôt; `Scan.treatedAt`/`treatedByUserId`, migration
      `20261007000000_manual_entry_treated`), and Détail du colis shows the
      seller the phone's time, the server's time only once a scan is flagged
      for clock skew — 3 shared, 6 API e2e, 1 web test

## Phase 6 — Courier app

Done. Merged into `main` on 2026-09-25 after `pnpm lint`, `pnpm typecheck`,
`pnpm test` (688 API, 243 web, 530 shared, 37 app tests) and `pnpm e2e` (23
browser tests) passed through turbo. Not yet run on a real phone: see phase 11.
Branch `phase-6`. Plan 2026-09-25; answers recorded as D-61 to D-63 (the
ramasseur's bon steps and Mes gains wait for phase 8; GPS required to open
the app, never blocks a scan). Chat and notifications are post-launch
(CLAUDE.md).

Steps, all done:

1. [x] Shared (`courier.ts`): the four queue operations and their shapes,
       the device-time cancel rule, postponement days, Ma caisse, the
       WhatsApp message and links; `APP_COURSIER`; refusal codes — 18 shared
       tests
2. [x] API: `POST /scans/courier`, the one route open to outdated apps
       (D-14): scans stored under the phone's UUID, business day and skew
       flag from the phone (A-12), GPS optional (D-63), Livré confirming the
       exact COD and the échange item (D-66), manual entry flagged. Migration
       `20261008000000_courier_scans` (`seller_charges.scanId`,
       `courier_operations`, four CHECKs) — D-64
3. [x] API: Annuler le dernier scan on the phone's clock, the scan's charges
       ANNULEE (D-65)
4. [x] API: `/coursier/tournee` (Ma tournée, Retour au dépôt, stops done
       today), `/coursier/ramassages` and Terminer le ramassage with the
       pickup fee (D-67), `/coursier/caisse`, `/coursier/moi`,
       `PATCH /coursier/moi/langue`
5. [x] API: Mémoire d'adresse (D-68); the Colis page shows it, the meeting
       point and "Sans position" (D-63); Exceptions names every scan action —
       36 API e2e, 1 schema test, 1 web test
6. [x] App: Expo SDK 57 / React Native 0.86 in `apps/courier`, theme (navy on
       orange, 56 px), French and Arabic with right-to-left per component,
       login (role, phone, password; last role pre-selected), PIN on the
       phone, session refreshed before expiry (D-69)
7. [x] App: SQLite `scan_queue`, sync in order every 15 s and when the
       network returns, "Déjà scanné — Livré à 14:32", refused scans listed
       with why, queue kept per courier across a forced logout (Q12), forced
       update once the queue is empty
8. [x] App, livreur: Ma journée (numbers, progress, Avant de rentrer),
       Ma tournée (Monter / Descendre, Appeler, WhatsApp, Scanner), Trouver
       le client, Scanner (camera or typed code), Livré / Échec with the
       fixed reasons and D-9's days, Annuler, note d'adresse, Retour au
       dépôt, Ma caisse with pending scans, Profil
9. [x] App, ramasseur: Ramassages, the pickup (contact to hand cash to,
       expected, missing, extra), continuous pickup scans, Terminer — 37 app
       tests (queue, API client, texts, the provider through a logout, one per
       screen); `expo export` bundles the Android app (967 modules);
       `expo-doctor` 21/21

## Phase 7 — À vérifier

Done. Merged into `main` on 2026-09-25 after `pnpm lint`, `pnpm typecheck`,
`pnpm test` (717 API, 254 web, 552 shared, 37 app tests) and `pnpm e2e` (29
browser tests) passed through turbo.

Built on branch `phase-7` (2026-09-25). The three open questions were answered
the same day and recorded as D-70 to D-72: Relancer corrects the parcel
directly, the seller reads the courier's note, and Changer de client withdraws
a waiting request. The choices made while building are D-73 to D-77.

Steps, all done:

1. [x] Shared (`a-verifier.ts`): the decision forms (Relancer with its
       corrections, Changer la date, Changer de client), time left and the
       24-hour mark, the Appels Faffa Go form, what the seller may decide
       now; `canChangeClient` from Relancé too; DATE_RELANCE_REQUISE worded
       for the seller (D-76). Tests first: 22 shared tests
2. [x] API: the seller's decisions, all through the parcel event service:
       `POST /parcels/:code/{relancer,changer-date,retourner,changer-client}`.
       Changer de client writes the history row, the fee frozen on the
       parcel, `labelReprintNeeded` and withdraws a waiting request (D-72,
       D-74). Migration `20261009000000_client_change_details`
3. [x] API: the 48-hour job, every minute, on the server clock, one
       transaction per parcel, as the system (D-75)
4. [x] API: `GET /a-verifier` and `/a-verifier/resume` (badge, banner);
       Détail du colis gains the courier's note (D-71), the planned day, the
       time left, the decisions and Appels Faffa Go
5. [x] API: `GET /a-verifier/suivi` and `POST /colis/:code/appels` (Admin,
       Service client, D-73); Colis shows the calls and the previous
       customer. 28 API e2e tests
6. [x] Web, seller: the À vérifier screen, "Votre décision" on Détail du
       colis (Relancer, Changer la date, Retourner, Changer de client), the
       menu badge, the Tableau de bord banner under 24 hours (D-76)
7. [x] Web, back office: `/admin/a-verifier` with Noter un appel; Appels
       Faffa Go and the previous customer on Colis. 11 web tests
8. [x] Courier app: "Visible par le vendeur" under the failure note (D-71)
9. [x] Demo data: two failed deliveries of Boutique Démo (D-77); browser
       test `phase-7.spec.ts` (6 tests); decisions, ui-texts

## Phase 8 — Money

- [ ] The ramasseur's Bon de versement (QR, Remis) and Retours (Retour reçu)
      scans in the app, with À emporter on the pickup (D-61)
- [ ] Mes gains in the app, debts included (D-62)
- [ ] A-11 for courier scans: none cancelled once the caisse session of its
      day is Clôturée (`courierScanCancelRefusal` gets that fact)
- [ ] Ma caisse: the depot's count, conforme or écart; the ramasseur's bon cash
- [ ] Caisse sessions (attendu / compté / écart), courier debts
- [ ] Bons de versement (selection, fees, retenue, PDF + QR, Préparé › En route › Remis › Archivé)
- [ ] Tableau de bord, money part (D-39): À recevoir, and Taux de livraison
      with **the same period selector as the Aujourd'hui counts** (D-48:
      Aujourd'hui, Hier, 7 derniers jours, Ce mois, custom range up to 366
      days, Tunis days)
- [ ] Bons de retour
- [ ] Livreur pay (per parcel, pay plans, fiches de paie); ramasseur écarts report for HR

## Phase 9 — Public site

The whole public site, before launch (scope change 2026-09-25, CLAUDE.md
launch scope).

- [ ] Suivre mon colis: public endpoint (public fields only), rate limiting, /suivi/FG-XXXXXX links
- [ ] A cancelled order's timeline ends at "Commande annulée": hide Départ
      retour and Retour reçu when `cancelledAt` is set (D-31)
- [ ] The public timeline skips the events of a cancelled scan (D-54): a
      Sortie coursier cancelled at the depot must not read "En cours de
      livraison". The seller's timeline shows both, with "Scan annulé"
      (D-46)
- [ ] Landing page (FR + AR, RTL), sections as in docs/landing.md
- [ ] Tarifs and Zones couvertes read from Paramètres
- [ ] Open Graph, SEO (/fr, /ar)
- [ ] Meta Pixel (TO CONFIRM): easy to switch off
- [ ] Evaluate upgrading to Next.js 16 (phase 1 stayed on 15, as planned)

## Phase 10 — Communication and reports

- [ ] In-app notifications (all roles)
- [ ] Chat per parcel (seller ↔ livreur, staff can join), lifecycle as in
      D-23 / Q15
- [ ] Exceptions queue, the rest beyond the phase 5 first rows (D-50).
      Phase 5 already has: parcels at the depot without a tour, pickups
      planned but not done, seller change requests waiting, codes typed by
      hand (with Marquer comme traité, D-59)
- [ ] Reports (retenue, revenue, activity, cash, pay) + CSV/Excel export
- [ ] Retenue à la source certificates + monthly report (the retenue amount
      itself is computed and stored on every bon in phase 8, per CLAUDE.md,
      Money). Must be ready before the first tax declaration deadline

## Phase 11 — Deployment

- [ ] VPS setup, HTTPS, environment variables
- [ ] Verify the API connects as `faffago_app` with its password, and that an
      UPDATE on `parcel_events` fails on the production database.
      The tests prove the grants with `SET ROLE`; PGlite has no connection
      layer, so the authentication path is only ever exercised here.
- [ ] Daily off-server backups + tested restore
- [ ] Monitoring and logs
- [ ] The VPS has limited memory: CI and test runs there use fewer workers
      than the development machine (API tests are already capped at half the
      cores; lower it further, or run in band, on a small VPS or CI runner)
- [ ] Courier app release: signing key kept in two places (tech-stack 5), the
      signed APK hosted over HTTPS with its checksum, `EXPO_PUBLIC_API_URL`
      set, OTA updates (EAS Update or equivalent) for JavaScript changes (D-69)
- [ ] Full real-day test with real scans on a low-cost Android phone: the
      camera on thermal labels, a scan with no GPS fix, a day offline then
      synced, a forced logout with scans waiting, the Arabic screens
- [ ] The depot's scan station (phase 5), before launch: with a real USB
      barcode scanner — confirm `GUN_MAX_MEAN_KEY_INTERVAL_MS` (35 ms) tells
      it apart from typing — and with the camera on a phone over HTTPS
      (browsers only open the camera on a secure page)

## Decisions made during the build

<!-- date — decision — reason -->

- 2026-09-23 — **Monorepo**: pnpm workspaces + Turborepo, plus a fifth workspace
  `packages/config` holding the shared tsconfig and ESLint configs, so the three
  apps do not each carry their own copy.
- 2026-09-23 — **Money type**: `bigint` millimes everywhere, `BIGINT` in
  PostgreSQL. Rates are integers in basis points (300 = 3 %), so even a
  percentage never touches a float. One `applyRateBps` holds the half-up
  rounding, which is the single place the accountant changes it (A-3b).
- 2026-09-23 — **`ParcelLocation` is its own column** (D-1). Status and physical
  position move independently: _Retour de tournée_ keeps the status À vérifier
  while moving the parcel to the depot, and that move is what unlocks Changer de
  client. Encoding it in the status would have needed new statuses.
- 2026-09-23 — **`SellerCharge` is the single deduction table** (D-2). Delivery,
  return, change-client and pickup fees are all rows there, each carrying the
  amount frozen on its parcel. A bon de versement prints its lines straight from
  the table, so a settings change can never alter an old bon.
- 2026-09-23 — **Actor columns carry no Prisma relation** (D-3). Their foreign
  keys are declared in the migration instead, which keeps `User` readable.
- 2026-09-23 — **`BonStatus.ANNULE` added.** The specs draw Préparé › En route ›
  Remis › Archivé with no cancellation, but A-5b allows the admin to cancel a
  bon that never reached the seller. The value exists only for that path.
- 2026-09-23 — **Append-only is enforced twice**: a trigger that holds for every
  role including the schema owner, and `REVOKE UPDATE, DELETE, TRUNCATE` for the
  application role. Verified by tests, including `TRUNCATE`.
- 2026-09-23 — **A bon de versement cannot come out negative by construction.**
  A charge that does not fit is carried to the next bon, so the net is always
  positive; the only case with no bon at all is having nothing to pay. A CHECK
  constraint refuses a non-positive net at the database level too.
- 2026-09-23 — **Parcel codes are `FG-` plus 8 Crockford characters** (A-19),
  excluding I, L, O and U so nothing is misread off a damaged thermal label.
- 2026-09-23 — **Testing**: Vitest in `packages/shared`, Jest in `apps/api`. The
  schema tests run on PGlite (PostgreSQL compiled to WebAssembly) rather than
  Testcontainers, so they need no Docker and run in seconds; Testcontainers
  stays for the later tests that need a real server (concurrency on
  `document_counters`, transaction isolation, the two database roles).
- 2026-09-23 — **Chat state is derived, not stored as transitions** (Q15).
  `chatStateFor(parcel)` returns OUVERT / VERROUILLE / CLOS from the parcel's
  own status, location and cash status, so the thread can never drift out of
  step with the parcel it belongs to. VERROUILLE is read-only for the seller and
  the couriers while Faffa Go staff keep replying.
- 2026-09-23 — **Délégation matching is accent- and script-insensitive** (Q5).
  `normalizeForMatch` folds case, Latin accents and Arabic diacritics, including
  the hamza that NFD splits off an alef, so أريانة and اريانة match. A name that
  hits two gouvernorats is a row error naming both, never a guess.
- 2026-09-23 — **Usernames and emails are stored lowercase**, enforced by CHECK
  constraints rather than only by the application (Q13).
- 2026-09-23 — **Specs amended to match A-20 and Q7**: vendeur v1.5 → v1.6,
  admin v1.9 → v1.10 (new section "Identifiants et mots de passe"), coursier
  v1.7 → v1.8. They previously said the seller logs in by phone and that
  couriers can change their own password, which the code no longer does.
- 2026-09-23 — **No `ValidationPipe`, no class-validator.** Input validation is
  zod, so that the browser CSV preview and the server run the same schemas. A
  `ZodValidationPipe` comes with the first endpoints.
- 2026-09-23 — **TypeScript `incremental` and `composite` turned off.** A
  `--noEmit` typecheck and an emitting build shared one `.tsbuildinfo`, so the
  build silently produced nothing. Turbo caches at the task level anyway.
- 2026-09-23 — **Line endings normalised to LF** via `.gitattributes`, and
  `package-lock.json` / `yarn.lock` git-ignored. A clean clone exposed a stray
  `pnpm@12` dependency in the root `package.json` that broke
  `pnpm install --frozen-lockfile`, and a `.prettierrc` plugin that was never
  installed, so `pnpm format` exited 1 on a fresh machine. Both fixed.
- 2026-09-24 — **Decisions D-1 to D-7 recorded in `docs/decisions.md`.** The one
  that changes behaviour is D-6: "Reporté par le client" is planned, not
  verified, and is the single exception to "a failed delivery always goes to
  À vérifier". It adds `Parcel.relaunchOrigin`, the `RelaunchSlot` enum and the
  public status `LIVRAISON_REPORTEE_CLIENT`.
- 2026-09-24 — **Phases renumbered**: auth is phase 1, everything after shifts
  by one, and the old "phase 6b" becomes phase 8.
- 2026-09-23 — **The public timeline is a whitelist**, not a filter. Only the
  events in `PUBLIC_TIMELINE_EVENT_TYPES` are ever exposed, so a new event type
  is private until someone deliberately adds it.

- 2026-09-25 — **Permissions are checked, never role names.** Guards read
  `ROLES_BY_PERMISSION` in `packages/shared`; a route must declare `@Public`,
  `@Authenticated` or `@RequirePermission`, otherwise it refuses everyone, the
  admin included. A test walks every route of the app to catch an undeclared one.
- 2026-09-25 — **A session is a `refresh_tokens` row, re-read on every request.**
  The access token (15 min) carries the session id; the guard reloads the
  session, the account and the role each time. Revoking a session (Régénérer,
  deactivation, logout, idle timeout) takes effect at the next request, not
  when the access token expires. A token whose role no longer matches the
  database is refused.
- 2026-09-25 — **Refresh tokens rotate and slide** (7 days web, 90 days courier,
  pushed forward on each use). Opaque random strings stored as an HMAC. An
  already-rotated token presented again revokes the whole session, since it
  was evidently copied. Two tabs refreshing at the same instant can trigger
  this; the web app serialises its refreshes (done in phase 1: D-13, D-15).
- 2026-09-25 — **Staff idle logout is enforced on the server**, from the
  session's `lastUsedAt` (written at most once a minute). Sellers and couriers
  have none (Q11).
- 2026-09-25 — **Session lifetimes and throttle numbers live in
  `packages/shared` (`SESSION_POLICY`, `LOGIN_THROTTLE`)**, not in `.env`:
  they are business rules. `JWT_*_TTL` and the unused `COURIER_MIN_APP_VERSION`
  were removed from `.env.example`; the minimum app version is read from
  Paramètres (`courier_min_app_version`). The API refuses to start if either
  JWT secret is missing, a placeholder, or shorter than 32 characters.
- 2026-09-25 — **Voir comme le vendeur has its own table**,
  `impersonation_sessions`, so its end is audited however it ends: the exit
  button (`SORTIE`), the admin's session being revoked (`SESSION_REVOQUEE`),
  or 30 minutes passing (`EXPIRATION`, written by a job every minute). A CHECK
  constraint caps it at 30 minutes. Only GET routes marked
  `@AllowImpersonation` accept the token; every write is refused.
- 2026-09-25 — **Q8 is enforced in the database** as well: a partial unique
  index on `users.phone` across the three staff roles.
- 2026-09-25 — **A login reveals nothing before the password is right.** An
  unknown email or username and a wrong password get the same answer and take
  the same time (a dummy argon2 check). A deactivated account is only
  reported after a correct password. The courier message "Aucun compte
  ramasseur pour ce numéro" does reveal whether a number has an account; it
  is used because Coursier 2 words it that way.
- 2026-09-25 — **API tests run the whole app on PGlite through Prisma**, with
  `pglite-prisma-adapter` 0.6.1 (a dev dependency) and a clock injected
  everywhere, so a 90-day session or a 30-minute idle timeout is tested in
  milliseconds. Still no Docker.
- 2026-09-25 — **The API's ESLint knows about decorator metadata.** Without it,
  `consistent-type-imports --fix` would turn injected services into
  `import type` and break Nest's dependency injection at startup.
- 2026-09-25 — **Seed fix:** `FAFFAGO_ADMIN_PASSWORD=""`, as shipped in
  `.env.example`, used to create the first admin with an empty password
  (`??` instead of `||`). The seed and `admin:reset` now use the shared
  generator, which also drops `i` from the alphabet.

- 2026-09-25 — **Answers to the phase 1 questions** recorded as D-11 to D-14
  in `docs/decisions.md`. D-11 changes Admin 2 (bons de retour: Admin and
  Dépôt), so `docs/admin.md` is now **v1.11**. The throttle numbers and error
  texts are approved as they were.
- 2026-09-25 — **`BONS_VERSEMENT_RETOUR` split** into `BONS_VERSEMENT` (Admin)
  and `BONS_RETOUR` (Admin, Dépôt).
- 2026-09-25 — **Réactiver un coursier** restores the login and the work
  (`acceptsWork` back to true), in one action.
- 2026-09-25 — **Tooling:** the stray `node_modules/pnpm` (v12) is removed.
  `pnpm lint`, `pnpm typecheck` and `pnpm test` run through turbo from the
  root. On this machine corepack's shim lives in `~/bin`, because
  `corepack enable` cannot write to `D:\Program Files\Node` without admin
  rights.

- 2026-09-25 — **One branch per phase**, merged into `main` when the phase is
  complete and green through turbo (CLAUDE.md, How to work, 7).
- 2026-09-25 — **The seller's email is admin-only** (`VENDEURS_EMAIL`, D-11).
- 2026-09-25 — **The Coursiers list shows Dépôt and Service client the active
  couriers only.** The admin sees every account. Today's parcels join the list
  with the Tournées (phase 4).
- 2026-09-25 — **Web sessions (D-15):** the browser never holds a token. Route
  handlers keep them in httpOnly cookies; the middleware refreshes; back office
  calls go through an allowlisted `/api/bff`; "Voir comme le vendeur" has its
  own cookie. Next.js 15 (the approved plan) rather than 16.
- 2026-09-25 — **Orange buttons carry navy text.** White on #FF6B35 is 2.9:1,
  below WCAG AA; navy on orange is 5.9:1. `orange-dark` (#B3441A) is the orange
  used for text on white.
- 2026-09-25 — **Verified end to end** before commit: the built API on PGlite
  behind `next start`, driven with curl — login, cookies, middleware refresh,
  courier creation, cross-origin refusal, Dépôt's narrowed views, Voir comme le
  vendeur and its exit, logout, `/ar` in RTL. Playwright replaces this in
  phase 4.

- 2026-09-25 — **Phase 1 merged into `main`.** Approved: staying on Next.js 15
  for now; Dépôt and Service client see active couriers only; navy text on
  every orange button (now a CLAUDE.md UI rule); the Arabic "Se connecter" =
  تسجيل الدخول.
- 2026-09-25 — **`docs/ui-texts.md`** collects every text written during the
  build that the specs do not word: approved for now, reviewed as a whole
  before launch. New texts are added there as they are written (CLAUDE.md, UI).

- 2026-09-23 — **Phase 2 inserted** ("Seed et Paramètres", D-18); every later
  phase shifts by one. Code comments and specs now use the new numbers.
- 2026-09-23 — **Localités** (D-17): a third level, required on parcels and
  pickup addresses, with the délégation stored beside it and a two-column key
  so the two can never disagree. Ambiguity is computed from the names, never
  stored. The seed imports the CSV create-only, recognised by a seed key.
- 2026-09-23 — **Zones seeded once**: the 15 zones are created only while the
  zones table is empty, so the seed never touches a zone the admin changed.
- 2026-09-23 — **Settings**: money as digit strings (D-20); the seed only
  creates keys, so a database seeded in phase 0 keeps its old zero fees until
  they are set in Paramètres or the database is reset. Validation bounds per
  key are typing guards, not business rules; approved on 2026-09-23.
- 2026-09-23 — **El Mourouj 1** stays under BEN-MOUROUJ, marked "délégation à
  confirmer" with the other 7 (D-17).
- 2026-09-23 — **Phase 2 merged into `main`** after lint, typecheck, test and
  build passed through turbo, and a browser test on a reset database.
- 2026-09-23 — **The 8 localités to confirm are corrected** (D-17). The seed
  creates localités only, keyed on délégation + name, so a database seeded
  before this keeps Lac 2 under La Marsa and Cité Olympique under El Omrane
  Supérieur, and gains the corrected rows beside them: reset it. No production
  database exists yet.
- 2026-09-23 — **API tests capped at half the cores** (`maxWorkers: '50%'` in
  `apps/api/jest.config.js`). One run through turbo failed in 5 tests: every
  test file starts its own PGlite and argon2id takes 64 MB per hash, so with
  7 workers beside the web and shared tests the memory ran out ("RuntimeError:
  unreachable", "Memory allocation error"). Reproduced by running the suite
  twice at once; with the cap, 5 turbo runs out of 5 pass. Two suites at once
  still fail, so a smaller machine or CI runner may need fewer workers.
- 2026-09-23 — **Lac 1 joins Lac 2 in La Goulette; Cité Olympique is one row**
  with La Poste's two misspellings as aliases (D-17). 938 localités. A database
  seeded before must be reset.
- 2026-09-23 — **CLAUDE.md, How to work, 8**: never commit when lint,
  typecheck or tests fail; chain with `&&` so a failure stops before the
  commit.
- 2026-09-23 — **`GET /geo` is open to every signed-in role** (sellers,
  couriers, staff, and Voir comme le vendeur). It carries no zone and no seed
  key; zones stay a back office matter.
- 2026-09-23 — **Counts typed in Paramètres go through `parseWholeNumber`** in
  `packages/shared`: the apps' lint forbids `Number()` so that money never
  passes through a float.

- 2026-09-24 — **Phase 3 decisions D-21 to D-28** recorded in
  `docs/decisions.md`. Specs amended: `docs/vendeur.md` **v1.8** (4.1 delivery
  rate on the outcome date, 4.6 cancellation after pickup and what a suspended
  seller keeps), `docs/landing.md` **v1.4** (Commande annulée after pickup).
- 2026-09-24 — **Test adapter**: `pglite-prisma-adapter` swallowed errors
  raised by COMMIT, so a write refused by a deferred trigger looked committed.
  `test/support/pglite-adapter.ts` fires deferred constraints before COMMIT;
  every test that builds a PGlite client uses it.
- 2026-09-24 — **Settings read inside the caller's transaction**
  (`SettingsService.current(tx)`). On PGlite's single connection a read from
  outside waited behind the open transaction until it timed out.
- 2026-09-24 — **The 48-hour clock starts at the server time** the failure is
  recorded, not the device time (D-30, approved).
- 2026-09-24 — **Answers recorded as D-29 to D-31**: Relancer carries its
  date (the state machine refuses it without one), the 48-hour clock, and a
  cancelled order's public timeline (phase 9). The Entrée dépôt consequence of
  D-28 is approved.
- 2026-09-24 — **Phase 3 merged into `main`.**
- 2026-09-24 — **README** phase numbers corrected (web from phase 1, courier
  app phase 6).

- 2026-09-24 — **Phase 4 housekeeping**: `pnpm-lock.yaml` goes in
  `.prettierignore` (pnpm writes it), `docker-compose.yml` and
  `pnpm-workspace.yaml` formatted, and `pnpm format` now covers yaml too.
  CLAUDE.md, How to work, 7: push `main` to `origin` after every merge.

- 2026-09-24 — **Phase 4, step 1 (seller accounts).** Choices made while
  building, within D-32 to D-34:
  - The contact's first and last name live on the seller's `User`, like
    every account; `contactFullName` is written from them.
  - `sha256` is taken on the **encrypted** file, so `documents:verify`
    checks a restore without the key; `--decrypt` also proves the key.
  - The GCM associated data is the storage key, so two files swapped on disk
    fail to open rather than showing the wrong CIN.
  - The document row's id is its storage key. A replacement is recorded by
    marking the old row first, then inserting the new one; the reference
    between them is checked at commit (deferred foreign key).
  - `sharp` (native image library) re-encodes JPEG and PNG. PDFs are stored
    as sent.
  - Old free-text product categories become Autre in the migration (only the
    demo seller and test fixtures had one). The demo seller has no
    documents: it is development-only (D-16).
  - **The API now refuses to start without `STORAGE_ENCRYPTION_KEY`.** A
    development `.env` needs `STORAGE_ENCRYPTION_KEY_ID` and a key from
    `openssl rand -base64 32` (see `.env.example`).

- 2026-09-24 — **Answers recorded as D-42 and D-43**: Modifier corrects the
  contact, Changer de contact replaces him with his CIN; the site's domain is
  `NEXT_PUBLIC_SITE_URL` (production `https://www.mirely.store`), never a
  Paramètres value, since every label's QR code carries it.

- 2026-09-24 — **Phase 4, step 2 (parcels).** Choices made while building:
  - **Demander une modification** carries the phone, phone 2, address and
    landmark (Vendeur 4.6 says "phone, address"). It is open from Ramassé to
    Relancé, and refused once delivered, cancelled or in a return. Several
    requests may wait at once: nothing in the specs limits them.
  - **Modifier** writes nothing when nothing changed, and records every
    changed field, before and after, on its MODIFICATION_VENDEUR event
    (money as digit strings). The reprint warning shows when any field
    printed on the label changed (Vendeur 4.4), not only the COD.
  - `ParcelEventService` takes `details` for the first event of an action;
    Modifier is its first user.
  - The seller's staff-side note on a change request (`staffNote`) is never
    sent to the seller.
  - The seller menu lists the screens built so far; the rest of Vendeur 3
    joins as each step lands.

- 2026-09-24 — **Answers recorded**: D-43 gains the permanent `/suivi/*`
  redirect from `www.mirely.store` should the domain ever change; D-44
  holds the change request rules (localité allowed, applied at the depot;
  one waiting request, edited or withdrawn; `ChangeRequestStatus.RETIREE`
  added, approved) and the reprint warning on any printed field. D-41
  stands: the COD is editable while Créé, only the fees are frozen.

- 2026-09-24 — **Phase 4, step 3 (Import CSV).** Choices made while building:
  - **A CSV reader of our own** in `packages/shared` (RFC 4180: quotes,
    doubled quotes, line breaks in cells) instead of `papaparse`, planned
    earlier: shared is ESM and the API's Jest runs CommonJS, and the reader
    is small and fully tested.
  - **No separate validation endpoint.** The browser previews with the
    shared functions; the import itself re-checks every row on the server
    and is **all or nothing**: if one row fails there (a localité closed
    since the page loaded), nothing is created and the refused rows come
    back with their reasons. A retried import (same id, drawn per file)
    returns the first one.
  - The file may be UTF-8 or **Windows-1252** (a French Excel's plain
    "CSV"), separated by `;`, `,` or tab. An unknown or duplicated column
    refuses the file (a typo would otherwise drop a whole column silently);
    optional columns may be left out.
  - A cell over 500 characters is an Erreur, never cut short. A line split
    by an unquoted `85,000` in a comma-separated file is an Erreur that says
    so.
  - The template holds the columns only, `;`-separated with a byte-order
    mark, so a French Excel opens it with its accents; no example row that
    could be imported by mistake.
  - The API accepts JSON bodies up to 5 MB (500 rows); the default was
    100 kB.
  - "Imprimer toutes les étiquettes" after an import comes with the labels
    (step 4); the result screen lists each line with its code.

- 2026-09-24 — **Phase 4, step 4 (labels).** Choices made while building:
  - **GET, opened by a plain link** in a new tab: nothing is written, and a
    link is never caught by a pop-up blocker. `Cache-Control: no-store`, as
    the label carries the customer's name, phone and address.
  - **Seller only** for now; the depot's Réimprimer l'étiquette (A-9) comes
    with the Colis screen in phase 5.
  - **Printed**: what Vendeur 4.4 lists, with **both phones** when there are
    two. Landmark and courier note are not printed (4.4 does not list them;
    the courier app shows them).
  - **Any status** can be printed ("reprint anytime").
  - The Code128 is 76 mm wide, centred, so it keeps its white margins for
    the scanner. The QR is error-correction level M.
  - A batch with one code that is not the seller's is refused as a whole,
    as "Code inconnu" (D-26).

- 2026-09-24 — **Arabic on labels (D-45).** How it is built:
  - pdfkit shapes an Arabic word correctly but misplaces the spaces of a
    right-to-left line, so **each word is shaped on its own** and placed by
    our layout (`apps/api/src/labels/text-layout.ts`). Arabic letters never
    join across a space, so nothing is lost.
  - Runs holding Arabic letters go to the font engine in reading order (it
    shapes and draws them right to left); other right-to-left runs, such as
    brackets, go in visual order, mirrored.
  - Every run sits on one baseline: Noto Sans Arabic is taller and deeper
    than Noto Sans. Lines are 1.55 × the type size.
  - The text a PDF reader extracts from an Arabic label is scrambled (as
    usual with shaped Arabic in PDFs). Printing is not affected; nothing
    reads the text back.
  - Sample labels were rendered in both formats and checked: a pure Arabic
    label, the mixed address, a long Arabic address ending in "…", a French
    label with its landmark.

- 2026-09-24 — **Phase 4, step 5 (Mes colis, Détail du colis).** The
  choices made while building were approved and recorded as **D-46**, with
  one change: À vérifier comes first after Tous and is highlighted while
  its count is above 0; Payés and Non payés are the two sub-groups of
  Livrés. The courier's free-text note stays hidden until phase 7. Also:
  - **`parcel_events.sequence`** (new migration): events written by one
    action share their server time, and the timeline needs their order.
  - Dates on these screens are drawn in Tunis time (`Africa/Tunis`), also
    when the page is rendered on the server.
  - Appels Faffa Go (phase 7) and the chat (phase 10) join the parcel page
    with their phases.

- 2026-09-24 — **Phase 4, step 6 (Ramassages, Profil).** The choices made
  while building were approved as built and recorded as **D-47**: one open
  request per parcel, Créé parcels only, a list or a number; the first
  address becomes the default; a used address is replaced, not edited; the
  ramasseur's first name and the planned day shown once planned; a window,
  no date; a suspended seller cannot request; no `audit_log` entry; the
  pickup fee rule kept in Profil. Profil was built with this step, since the
  pickup addresses live there. D-47 also settles, for phase 6, the extra
  parcels scanned at a pickup.

- 2026-09-24 — **Phase 4, step 7 (Tableau de bord).** Plan approved with
  option A and a period selector, recorded as **D-48**. Also:
  - **Which day an event belongs to**: the phone's clock for a scan (as
    A-12 does for the Caisse), the server's clock otherwise. The Détail du
    colis timeline still shows the server time; see Open questions.
  - **Indexes**: none added. The query goes through the seller's parcels
    and the `parcelId` part of `parcel_events (parcelId, serverTime)`. If long periods get slow
    for a large seller, the index to propose is on `parcel_events`
    `(parcelId, COALESCE(deviceTime, serverTime))` or a per-seller rollup;
    to measure on real volumes first.
  - The Mes colis date filter now uses the same shared Tunis-day helpers
    (`tunisDayStart`, `addTunisDays`).
  - The placeholder "Bienvenue, {boutique}." is gone: the shop name is in
    the header.

- 2026-09-24 — **Phase 4, step 8 (Playwright).** Plan approved with
  PGlite and `pnpm e2e` as a merge gate, recorded as **D-49**. Also:
  - Chromium runs in its **new headless mode** (`channel: 'chromium'`,
    installed with `--no-shell`), so only one browser is downloaded.
  - On this machine Playwright's downloader timed out; the archives were
    fetched with `curl` and installed through `PLAYWRIGHT_DOWNLOAD_HOST`
    (README).
  - The Windows clipboard gives "
    " back for "
    ": the test compares
    the copied credentials line by line, ignoring that.
  - The tests build the web app into `apps/web/.next`, the folder
    `pnpm dev` also uses: stop the web app's `pnpm dev` before `pnpm e2e`.
    A separate build folder was tried and dropped: Next.js then rewrites
    `next-env.d.ts` and `tsconfig.json` on every run.

- 2026-09-24 — **Phase 4 merged into `main`** (fast-forward, as phase 3),
  after lint, typecheck, test and the 14 browser tests passed.

- 2026-09-24 — **Phase 5 plan approved**, answers recorded as **D-50 to
  D-58** in `docs/decisions.md`: the scan station ships with three modes,
  the ramassage scan stays in phase 6, a first Exceptions screen in phase 5,
  Aujourd'hui later.

- 2026-09-24 — **Phase 5, step 1 (zones, géographie, absences).** Choices
  made while building:
  - **Couriers are named by their account id** in every zone and absence
    route, as the rest of the back office does; the API maps them to the
    courier row.
  - **A courier already in his slot stays** when the admin saves a zone,
    even after he stopped taking new work (D-12): only a courier newly placed
    must be able to work. Tournées and pickups skip him anyway, since
    "who covers the zone" treats him as unavailable.
  - **An absence is for today or a later day.** A past day is refused, when
    marking and when removing: it can no longer change any plan.
  - **Pickups moved by an absence stay moved** if the absence is removed; the
    team re-plans if it wants. A pickup whose zone has nobody else able to
    work keeps its ramasseur and is listed "à replanifier" in the result.
  - **A deactivated zone keeps its assignments** and cannot be edited until
    it is reactivated; nothing reads them meanwhile.
  - **Délégation → zone** is changed from Paramètres › Géographie (a list per
    délégation); Paramètres › Zones shows the délégations read-only.
  - The BFF allowlist gains `zones`, `geo`, `gouvernorats`, `delegations`,
    `localites` and `couriers`, and forwards PUT and DELETE.
  - Housekeeping (D-50): the back office home comment no longer says
    Aujourd'hui is phase 5; `apps/courier` now says phase 6.

- 2026-09-24 — **Phase 5, step 2 (scan station).** Choices made while
  building:
  - **Gun or hand, told by the keys' timing**: one field takes both. A burst
    (35 ms or less between keys on average) is the gun; anything slower, or
    pasted, is manual entry and flagged (A-22), so typing into the gun's
    field cannot avoid the flag. The threshold is
    `GUN_MAX_MEAN_KEY_INTERVAL_MS` in shared.
  - **The camera** takes the same code once in 3 seconds
    (`CAMERA_REPEAT_WINDOW_MS`): it keeps reading the label in front of it.
    Each read is a new scan with its own UUID; the server refuses a second
    Entrée dépôt of the same parcel anyway.
  - **Modes on F1, F2, F3**: a gun types letters, digits and Enter.
  - **The courier is checked before the code**: no courier chosen is refused
    on the page without calling the API; the server refuses it too.
  - **Retour de tournée takes back from any livreur**, even one who no
    longer takes work (D-12): what he carries must still come back.
  - **"Prévu pour"** is the manual move of Tournées, else the zone's livreur
    today. It is written on the Sortie coursier event (`prevuPour` in its
    metadata, never shown to the seller), so a replay answers the same. The
    manual move is cleared once the parcel is out.
  - **A refused scan keeps `parcelBefore` too**, to show the parcel as it
    was when refused; null only when the code matched no parcel. The CHECK
    requiring it on accepted scans covers the three depot modes only; the
    courier app's scans (phase 6) decide their own rule.
  - **`scans.targetCourierId`** (not in the plan): the courier chosen on the
    station, kept for the history and the replay.
  - **A green result clears itself after 1.5 s**, a red one stays until the
    next scan or a tap. White text on green-700 and red-700 passes WCAG AA.
  - **Dependency**: `@zxing/browser` and `@zxing/library` (web), loaded only
    when the browser has no `BarcodeDetector`.
  - Not yet: the reprint warning on a depot scan comes with
    `labelReprintNeeded` (step 7, D-57); cancelling a scan is step 3. The
    station is not browser-tested yet (step 10), and the camera has only
    been typechecked: to try on a phone.

- 2026-09-24 — **Phase 5, step 3 (Annuler le dernier scan).** Choices made
  while building:
  - **The button names the scan** (`/scans/depot/:scanId/cancel`) rather
    than "my last scan": a double tap cancels once, and asked again the
    endpoint answers the same result.
  - **"Last" follows the order of the scans' events** (`parcel_events.sequence`),
    not the clock, so two scans in the same second are still ordered. A
    refused scan is never "the last scan"; once the last one is cancelled,
    the one before becomes the last, within its own window.
  - **The button disappears when the window closes** (changed at review):
    each accepted scan's result carries `cancellableUntil` and `serverTime`,
    both on the server clock; the page counts down their difference, so a
    browser clock that is off does not matter. The server still enforces the
    window and answers "Délai d'annulation dépassé : seul l'admin peut
    corriger" after it.
  - **Nobody else cancels through this route, the admin included**: his
    correction is Forcer un statut (step 8, D-56).
  - **A-11's caisse rule** does not apply to depot scans, which move no
    cash; it comes with the courier's scans (phases 6 and 8).
  - The cancelled result is shown in navy, apart from green and red.

- 2026-09-24 — **Phase 5, step 4 (Tournées).** Choices made while building:
  - **Admin and Dépôt only**, like the other planning (Admin 2 "Plan pickups
    and tours"); Service client does not see Tournées.
  - **Only zones with parcels to go out** are shown, by name; "Sans zone"
    first, highlighted, and a zone nobody covers reads "Sans coursier",
    highlighted.
  - **A moved parcel stays in its zone's column**, marked "→ {livreur}", and
    counts in that livreur's load.
  - **A move to a livreur who cannot go out today** (absent, no longer
    taking work) is set aside for the day: the parcel falls back to its
    zone's livreur, and the move applies again once he can. Moving is only
    offered, and accepted, to a livreur able to go out today.
  - **A move is all or nothing**: one parcel that is not waiting for today's
    tour refuses the whole selection, with its code. Moving a parcel to the
    courier it is already planned for writes nothing.
  - **"Today's parcels" on Coursiers** (D-11): for a livreur, the parcels he
    carries now and those Tournées plans for him. A ramasseur's work comes
    with the pickups (step 5).
  - A move written after an Entrée dépôt means the parcel changed since that
    scan, so the scan can no longer be cancelled (D-54): the team planned it.
  - **Route order**: the Coursiers list now reads Tournées, which brought the
    parcels module in before the labels module, and `/parcels/labels` was
    taken for a parcel code (the labels tests caught it). `LabelsModule` now
    comes first in `AppModule`, with the reason beside it.

- 2026-09-24 — **Phase 5, step 5 (Ramassages).** Choices made while
  building:
  - **The team's routes are `/ramassages`**; the seller keeps `/pickups`.
    Admin and Dépôt only, like Tournées; Service client does not see them.
  - **A day from today on, no upper bound**; the window defaults to the one
    the seller asked for.
  - **Re-planning** keeps only the last plan (who and when on the pickup);
    no history, and no `audit_log` entry, as for the requests (D-47).
  - **The pre-fill**: the list shows the ramasseur covering the zone today;
    the dialog asks again for the day chosen and fills it in. Nobody able to
    work that day reads "Aucun ramasseur de la zone ce jour-là".
  - **A planned pickup always has its day, window and ramasseur**, now a
    CHECK; three test fixtures that set Planifié without them were fixed.
  - **À emporter** lists every bon Préparé of that seller, not cancelled.
    Attaching a bon to one pickup comes with the bons (phase 8).
  - **Done and cancelled pickups**: the 200 newest.

- 2026-09-24 — **Phase 5, step 6 (Colis).** Choices made while building:
  - **The team's routes are `/colis`**; the seller keeps `/parcels`.
    Reading and exporting are open to the three staff roles
    (`COLIS_LECTURE`), reprinting to Admin and Dépôt.
  - **The search also takes the shop name**; the courier filter is the
    livreur the parcel was last given to, kept once delivered, so a
    livreur's delivered parcels can be found.
  - **The detail shows what the seller never sees** (D-38): GPS
    coordinates, the phone's time, staff by full name, the scan flags. The
    Tournées planning events are shown here with "Prévu pour".
  - **A filter the API refuses** (an address edited by hand) shows the list
    without filters rather than an error page.
  - Joining the detail with their steps: the change requests (step 7),
    Forcer un statut (step 8); the calls (phase 7) and the chat (phase 10).
  - Labels added to shared: `CHARGE_STATUS_LABELS_FR`,
    `SCAN_SOURCE_LABELS_FR` (in `docs/ui-texts.md`).

- 2026-09-24 — **Phase 5, step 7 (change requests).** Choices made while
  building:
  - **Where the team acts**: on the parcel's Colis page (every staff role
    reads the requests there; Service client and Admin act). The list of
    waiting requests reaches the screen with Exceptions (step 9); no new
    menu item.
  - **A request applies as a whole**; a field already equal to the parcel's
    value is not a change. A request that changes nothing is still marked
    Appliquée, with its event.
  - **A localité deactivated since the request** refuses the apply; the
    team refuses the request with a reason.
  - **The label fields corrected (D-45)**: phone 2 and the landmark are
    printed, so changing them now asks for a reprint, here and after the
    seller's own Modifier. The phase 4 test that said the landmark was not
    printed was updated.
  - **The reprint flag is cleared only by the team's reprint**
    (`GET /colis/:code/label`), never by the seller printing his own copy:
    the depot holds the parcel whose label is wrong.
  - **No `audit_log` entry**: the MODIFICATION_APPLIQUEE event is the record,
    like every change to a parcel.
  - **`refusalReason`** is a new column the seller reads; `staffNote` stays
    internal.

- 2026-09-24 — **Phase 5, step 8 (Forcer un statut).** Choices made while
  building:
  - **The screen offers only the moves allowed** (`forcedTargets` in
    shared); the API checks them again. A parcel with none reads "Aucune
    correction de statut possible pour ce colis."
  - **The livreur named** must be a livreur's account, whatever its state:
    the admin records where the parcel really is.
  - **Columns that follow**: put with a livreur, the parcel is his; taken
    from En livraison, it is nobody's (as A-8); out with a livreur, the
    Tournées move is cleared. A place-only fix keeps the livreur, as
    Retour de tournée does.
  - **The admin's late cancellation** takes any scanner's depot scan, at
    any time, while its event is still the parcel's last; beyond that,
    Forcer un statut. Asked again, it answers the same.
  - **Audit**: `FORCAGE_STATUT` (status, place and livreur before and
    after) and `ANNULATION_SCAN_ADMIN`, each with the reason. The event
    carries the reason too; the seller reads "Statut corrigé par Faffa Go"
    or "Scan annulé", never the reason.
  - Phase 6 adds the courier's scans and phase 8 the moves touching money.

- 2026-09-24 — **Phase 5, step 9 (Exceptions).** Choices made while
  building:
  - **Manual entries: the last 7 days**, newest first
    (`MANUAL_ENTRY_EXCEPTION_DAYS`). The spec names no "seen" action, so
    none was added; see Open questions.
  - **"At the depot since"** is the parcel's latest arrival at the depot
    (its latest event placing it there); a Relancé parcel counts from the
    start of its planned day, since it was meant to wait until then.
    `DEPOT_WAIT_EXCEPTION_HOURS` = 48 (Admin 4.7).
  - **Each row leads to where it is dealt with** rather than acting on the
    queue itself: Assigner → Tournées, Replanifier → the pickup, Appliquer /
    refuser → the parcel's Colis page. The link to act shows only to the
    roles that may; the depot, which reads change requests but does not
    apply them, gets "Voir la demande".
  - **Pickups late**: planned for a Tunis day before today and still
    Planifié.

- 2026-09-25 — **Phase 5, step 10 (demo data, browser tests).** Choices made
  while building:
  - **The demo parcels go through the shared state machine**
    (`applyParcelAction`, `parcelWriteFor`) inside the demo seed rather than
    through the Nest service, which the seed script does not start; the
    events are the same, and the D-21 trigger checks them.
  - **The test API seeds the demo data** on every run, beside the normal
    seed: the phase 5 screens need picked-up parcels, and only phase 6's
    app can pick them up for real.
  - **The flow runs as the admin**, who holds every right of the back
    office; the role checks are in the API and unit tests of each step.
  - **The browser types the codes as a gun would** (one burst, then Enter);
    the camera is not exercised: see the pre-launch test in phase 11.
  - **A phase 4 test fixed**: "filters by the Tunisian calendar day" set one
    parcel on 2026-09-25 while the file's other parcels take the
    database's real clock; on 25 September 2026 they all matched. It now
    uses a day in 2025, far from any real clock.

- 2026-09-25 — **Phase 5 merged into `main`** (fast-forward) after lint,
  typecheck, test and the 23 browser tests passed.

- 2026-09-25 — **New `CLAUDE.md`**: working rules and launch scope restated
  for every phase from now on. `docs/PROGRESS.md` gains a **Post-lancement**
  section (chat, notifications, reports, the full Exceptions queue, the rest
  of the public site); the launch path is courier app, À vérifier, money,
  public tracking page, deployment.
- 2026-09-25 — **Phase 5 leftovers, on `main`**: two open questions closed
  and recorded as **D-59** and **D-60**. Marquer comme traité on Saisie
  manuelle (Admin, Dépôt), and the seller's timeline shows the phone's time,
  the server's time only once a scan is flagged for clock skew; staff keep
  both, unchanged.

- 2026-09-25 — **Phase 6 plan**: answers recorded as **D-61 to D-63**
  (Terminer now, the bon steps with phase 8; Mes gains with phase 8; location
  required to open the app, a missing fix never blocks a scan).
- 2026-09-25 — **Phase 6, the courier app.** Choices made while building,
  recorded as **D-64 to D-69**: one queue and one route for every operation;
  a cancelled courier scan cancels its charges; Livré confirms the exact COD
  and the échange item; Terminer at zero parcels is Annulé at no cost; one
  address memory per phone; \`expo-camera\` instead of vision-camera (v5 scans
  codes on iOS only); Monter / Descendre instead of drag; RTL per component;
  PIN again after 5 minutes away; APK, signing and OTA moved to phase 11. Also:
  - **Older test fixtures** that inserted accepted courier scans by hand now
    carry what the new CHECKs require (\`parcelBefore\`, the amount of a Livré).
  - **The API's courier tests log in once per file**: argon2 on PGlite in
    parallel workers ran out of memory once (the phase 2 note), and a failed
    hash reads as a wrong password.
  - **\`node-linker=hoisted\`** already in \`.npmrc\` lets Metro and Jest find the
    React Native packages; React 19.2 for the app beside the web's 19.1.

- 2026-09-25 — **Phase 6 merged into `main`** (fast-forward) after lint,
  typecheck, test and the 23 browser tests passed.

- 2026-09-25 — **Phase 7, À vérifier** (D-70 to D-77): Relancer corrects the
  phone, address, landmark and note directly; the seller reads the courier's
  note; Changer de client withdraws a waiting request and keeps the old
  customer whole for staff; the 48-hour job runs every minute on the server
  clock; calls are Admin and Service client's, never edited; the badge and the
  banner stand in for notifications until after launch.

- 2026-09-25 — **Phase 7 merged into `main`** (fast-forward) after lint,
  typecheck, test and the 29 browser tests passed.

- 2026-09-25 — **Launch scope widened**: everything that was Post-lancement
  is now built before launch. Phase 9 is the whole public site (tracking,
  landing FR + AR, Tarifs and Zones couvertes, SEO, Meta Pixel, Next.js 16
  evaluation); phase 10 is communication and reports (notifications, chat,
  the full Exceptions queue, reports, retenue certificates); phase 11,
  deployment, unchanged. The Post-lancement section is removed; CLAUDE.md,
  Launch scope, updated.

## Open questions

- Retenue à la source: base and rounding confirmed as "after every Faffa Go fee,
  half-up at the millime" (A-3), still to be signed off by the accountant.
- Back office scanning: browser camera enough, or add a Dépôt mode to the
  courier app?
- ~~Seed: the Arabic names of the gouvernorats and délégations have not been
  read by a native speaker.~~ **Closed 2026-09-24 (D-51)**: the admin reads
  and corrects them, and fills the localités' Arabic names, in Paramètres ›
  Géographie; the seed no longer overwrites them.
- **UI texts**: approved for now; the full review before launch works from
  `docs/ui-texts.md`.
- ~~Q12: the courier app must keep its SQLite `scan_queue` across a forced logout.
  Nothing enforces that yet — it is a rule for the phase 6 implementation.~~
  **Closed 2026-09-25 (phase 6)**: each row carries its courier; a logout clears
  the session and the PIN, never the queue; tested through the app's provider.
- ~~**Relancer without a date** (D-29): the message is neutral for now; the
  wording the seller reads comes with the phase 7 screen.~~ **Closed
  2026-09-25 (D-76)**: "Choisissez le jour de la nouvelle tentative de
  livraison".
- **Off-server backup destination** (D-32): open until phase 11, pending a
  legal check on hosting personal data outside Tunisia (loi organique
  2004-63). This applies to **the whole database**, not only the seller
  documents: it holds every customer's name, phone and address.
- **Seller document retention** after a seller leaves (D-32): open, to decide
  with the accountant. Nothing is ever deleted automatically.
- ~~**Scan time on the timeline**: Détail du colis shows each event at the
  server time, so a scan synced the next morning reads as made then, while
  the Tableau de bord files it under the day the phone made it (D-48, A-12).
  Show the phone's time on the timeline too? To decide before phase 6.~~
  **Closed 2026-09-25 (D-60)**: yes, the phone's time, unless the scan is
  flagged for clock skew, then the server's time; staff keep both.
- ~~**Exceptions › Saisie manuelle** (A-22): the queue shows the last 7 days.
  Should the admin mark a manual entry as seen, so it leaves the queue?
  That would need a column (who saw it, when). Not built: not in the specs.~~
  **Closed 2026-09-25 (D-59)**: Marquer comme traité, Admin and Dépôt,
  `Scan.treatedAt` / `treatedByUserId`.
- **Suggestion (not in the specs): a downloadable list of localités** beside
  the délégation list, for sellers filling the `localite` column. Q5 offers
  the délégation list only.
