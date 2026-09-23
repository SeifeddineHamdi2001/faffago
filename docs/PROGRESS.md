# Faffa Go — build progress

Claude Code updates this file at the end of every task.
Business rules decided after the specs are recorded in `docs/decisions.md`.
Legend: [ ] not started · [~] in progress · [x] done

## Phase 0 — Foundation (done)

- [x] Monorepo (pnpm workspaces + Turborepo): apps/api, apps/web, apps/courier, packages/shared, packages/config
- [x] packages/shared: status enums, money helpers (millimes), state machine, geo/CSV matching, chat lifecycle, zod schemas — 152 tests
- [x] Full Prisma schema reviewed and approved (40 tables) + first migration, with append-only enforcement proved from the `faffago_app` role

## Phase 1 — Auth and permissions

The API side is done. The screens come with the web and courier app scaffolding.

- [x] Permission matrix from Admin 2, encoded in packages/shared and tested
      (`permissions.ts`: the test copies the spec table row by row)
- [x] Login: vendeur = email, staff = username, coursier = téléphone + role choice (A-20)
- [x] Admin-generated passwords (argon2id), shown once, no self-service reset (A-20, Q7).
      Staff and courier creation; seller creation comes in phase 3 with the documents
- [x] Role guards on every endpoint, deny by default; seller scoped to his own data
- [x] Régénérer le mot de passe; last active admin protected; admin:reset CLI (Q9)
- [x] Login throttling, no permanent lockout (D-6); session lifetimes (Q11)
- [x] Voir comme le vendeur: read-only, 30 min, audited (D-5)
- [x] Minimum courier app version enforced by the API; outdated apps reach the
      scan upload only (D-14)
- [x] Screen access for Dépôt and Service client in the matrix (D-11, Admin v1.11)
- [x] Désactiver un coursier: new work stops at once, refused while work is open
      (D-12). The caisse, payslip and debt checks are `it.todo` until phase 7
- [x] Refresh token grace window, 10 s (D-13, server side)
- [ ] Web screens: the three login pages, account creation with "Copier les
      identifiants", Régénérer le mot de passe, deactivation screens,
      impersonation banner; one refresh shared across tabs (D-13, web side)
- [ ] Courier login screen with role choice — phase 5

## Phase 2 — Parcel core

- [ ] Parcel model with fees frozen at creation (columns in place, service to write)
- [~] Parcel event service (immutable events) + state machine with tests
  — the state machine and its 48 tests are done in `packages/shared`;
  the NestJS service that writes the events is not
- [x] Append-only audit log (trigger + revoked privileges + tests)

## Phase 3 — Seller space

- [ ] Seller accounts created by admin (statut, documents in private storage)
- [ ] Créer un colis + validation
- [ ] Import CSV (client preview + server validation)
- [ ] Labels PDF (Code128 + QR; thermal and A4)
- [ ] Mes colis + Détail du colis
- [ ] Ramassage requests + pickup address at first request

## Phase 4 — Back office operations

- [ ] Web scan station (camera + USB gun), 5 modes, scan deduplication
- [ ] Zones (livreur + ramasseur, titular + backup) and absence switch
- [ ] Tournées (parcels grouped by zone, manual moves)
- [ ] Ramassages planning + À emporter
- [ ] Colis search + admin status override (with reason, audited)

## Phase 5 — Courier app

- [ ] Expo dev build, login with role choice, PIN
- [ ] Livreur: Ma journée, Ma tournée, Trouver le client, Livrer / Échec
- [ ] Mémoire d'adresse (linked to customer phone)
- [ ] Ramasseur: pickups, parcel scans, bon Remis scan, Retour reçu scans
- [ ] SQLite scan queue + sync + no double scan + conflict handling
- [ ] Ma caisse, notifications, profile
- [ ] APK distribution, forced update (only with empty queue), OTA updates

## Phase 6 — À vérifier

- [ ] Failure reasons (courier only), seller decisions (Relancer / Retourner / Changer de client)
- [ ] Changer de client only at depot, 1,000 DT fee, attempt counter reset
- [ ] 48-hour automatic return job, 3rd attempt rule
- [ ] Service client call log (Appels Faffa Go)

## Phase 7 — Money

- [ ] Caisse sessions (attendu / compté / écart), courier debts
- [ ] Bons de versement (selection, fees, retenue, PDF + QR, Préparé › En route › Remis › Archivé)
- [ ] Bons de retour
- [ ] Retenue à la source certificates + monthly report
- [ ] Livreur pay (per parcel, pay plans, fiches de paie); ramasseur écarts report for HR

## Phase 8 — Public site

- [ ] Landing page (FR + AR, RTL), sections as in docs/landing.md
- [ ] Tarifs and Zones couvertes read from Paramètres
- [ ] Suivre mon colis: public endpoint (public fields only), rate limiting, /suivi/FG-XXXXXX links
- [ ] Open Graph, SEO (/fr, /ar), Meta Pixel (TO CONFIRM)

## Phase 9 — Communication and reporting

- [ ] Chat per parcel (seller ↔ livreur, staff can join)
- [ ] In-app notifications (all roles)
- [ ] Exceptions queue
- [ ] Reports (retenue, revenue, activity, cash, pay) + CSV/Excel export

## Phase 10 — Deployment

- [ ] VPS setup, HTTPS, environment variables
- [ ] Verify the API connects as `faffago_app` with its password, and that an
      UPDATE on `parcel_events` fails on the production database.
      The tests prove the grants with `SET ROLE`; PGlite has no connection
      layer, so the authentication path is only ever exercised here.
- [ ] Daily off-server backups + tested restore
- [ ] Monitoring and logs
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
  this; the web app must serialise its refreshes (phase 3).
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

## Open questions

- Retenue à la source: base and rounding confirmed as "after every Faffa Go fee,
  half-up at the millime" (A-3), still to be signed off by the accountant.
- Back office scanning: browser camera enough, or add a Dépôt mode to the
  courier app?
- Seed: the Arabic names of the gouvernorats and délégations are the standard
  official spellings but have not been read by a native speaker; the public site
  shows them to customers.
- Delivery fee, return fee and courier rate are seeded at 0 because no spec
  gives a value. They must be set in Paramètres before the first parcel.
- **Courier deactivation texts** (TO CONFIRM): the refusal message and the
  blocker labels ("2 colis en main", "1 bon de retour en route"…) in
  `packages/shared/src/accounts.ts`.
- Q12: the courier app must keep its SQLite `scan_queue` across a forced logout.
  Nothing enforces that yet — it is a rule for the phase 5 implementation.
- D-6 splits a row of `docs/landing.md` 4.2: Relancé now maps to two public
  labels depending on who asked for the delay. The spec has not been amended
  yet — say the word and I will bump it to v1.2.
