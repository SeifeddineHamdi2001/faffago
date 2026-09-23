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

- [ ] Seller accounts created by admin (statut, documents in private storage)
- [ ] Créer un colis + validation
- [ ] Import CSV (client preview + server validation)
- [ ] Labels PDF (Code128 + QR; thermal and A4)
- [ ] Mes colis + Détail du colis
- [ ] Ramassage requests + pickup address at first request
- [ ] Playwright end-to-end tests, once a full flow exists: create a seller →
      the seller logs in → creates a parcel. Covers the phase 1 screens too
      (logins, Copier les identifiants, Voir comme le vendeur)

## Phase 5 — Back office operations

- [ ] Web scan station (camera + USB gun), 5 modes, scan deduplication
- [ ] Zones (livreur + ramasseur, titular + backup) and absence switch
- [ ] Screens for zones, délégations and localités, with courier zone
      assignment (D-18); the list of parcels filed under Autre
- [ ] Tournées (parcels grouped by zone, manual moves)
- [ ] Ramassages planning + À emporter
- [ ] Colis search + admin status override (with reason, audited)

## Phase 6 — Courier app

- [ ] Expo dev build, login with role choice, PIN
- [ ] Livreur: Ma journée, Ma tournée, Trouver le client, Livrer / Échec
- [ ] Mémoire d'adresse (linked to customer phone)
- [ ] Ramasseur: pickups, parcel scans, bon Remis scan, Retour reçu scans
- [ ] SQLite scan queue + sync + no double scan + conflict handling
- [ ] Ma caisse, notifications, profile
- [ ] APK distribution, forced update (only with empty queue), OTA updates

## Phase 7 — À vérifier

- [ ] Failure reasons (courier only), seller decisions (Relancer / Retourner / Changer de client)
- [ ] Changer de client only at depot, 1,000 DT fee, attempt counter reset
- [ ] 48-hour automatic return job, 3rd attempt rule
- [ ] Service client call log (Appels Faffa Go)

## Phase 8 — Money

- [ ] Caisse sessions (attendu / compté / écart), courier debts
- [ ] Bons de versement (selection, fees, retenue, PDF + QR, Préparé › En route › Remis › Archivé)
- [ ] Bons de retour
- [ ] Retenue à la source certificates + monthly report
- [ ] Livreur pay (per parcel, pay plans, fiches de paie); ramasseur écarts report for HR

## Phase 9 — Public site

- [ ] Landing page (FR + AR, RTL), sections as in docs/landing.md
- [ ] Tarifs and Zones couvertes read from Paramètres
- [ ] Suivre mon colis: public endpoint (public fields only), rate limiting, /suivi/FG-XXXXXX links
- [ ] A cancelled order's timeline ends at "Commande annulée": hide Départ
      retour and Retour reçu when `cancelledAt` is set (D-31)
- [ ] Open Graph, SEO (/fr, /ar), Meta Pixel (TO CONFIRM)
- [ ] Evaluate upgrading to Next.js 16 (phase 1 stayed on 15, as planned)

## Phase 10 — Communication and reporting

- [ ] Chat per parcel (seller ↔ livreur, staff can join)
- [ ] In-app notifications (all roles)
- [ ] Exceptions queue
- [ ] Reports (retenue, revenue, activity, cash, pay) + CSV/Excel export

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
- [ ] Full real-day test with real scans on a low-cost Android phone

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

## Open questions

- Retenue à la source: base and rounding confirmed as "after every Faffa Go fee,
  half-up at the millime" (A-3), still to be signed off by the accountant.
- Back office scanning: browser camera enough, or add a Dépôt mode to the
  courier app?
- Seed: the Arabic names of the gouvernorats and délégations are the standard
  official spellings but have not been read by a native speaker; the public site
  shows them to customers. Localités have no Arabic name yet except Autre and
  Maakel Ezzaïm; the admin fills them in Paramètres › Localités (phase 5 screen).
- **UI texts**: approved for now; the full review before launch works from
  `docs/ui-texts.md`.
- Q12: the courier app must keep its SQLite `scan_queue` across a forced logout.
  Nothing enforces that yet — it is a rule for the phase 6 implementation.
- **Relancer without a date** (D-29): the message is neutral for now; the
  wording the seller reads comes with the phase 7 screen.
