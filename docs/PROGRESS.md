# Faffa Go — build progress

Claude Code updates this file at the end of every task.
Legend: [ ] not started · [~] in progress · [x] done

## Phase 0 — Foundation

- [x] Monorepo (pnpm workspaces + Turborepo): apps/api, apps/web, apps/courier, packages/shared, packages/config
- [x] packages/shared: status enums, money helpers (millimes), state machine, geo/CSV matching, chat lifecycle, zod schemas — 152 tests
- [x] Full Prisma schema reviewed and approved (40 tables) + first migration, with append-only enforcement
- [ ] Auth and role guards (ADMIN, DEPOT, SERVICE_CLIENT, VENDEUR, LIVREUR, RAMASSEUR).
      Vendeur = email, staff = username, coursier = téléphone + choix du rôle (A-20).
      Admin-generated passwords (argon2id), shown once, no self-service reset.
- [ ] Courier login with role choice (Livreur / Ramasseur)

## Phase 1 — Parcel core

- [ ] Parcel model with fees frozen at creation (columns in place, service to write)
- [~] Parcel event service (immutable events) + state machine with tests
  — the state machine and its 48 tests are done in `packages/shared`;
  the NestJS service that writes the events is not
- [x] Append-only audit log (trigger + revoked privileges + tests)

## Phase 2 — Seller space

- [ ] Seller accounts created by admin (statut, documents in private storage)
- [ ] Créer un colis + validation
- [ ] Import CSV (client preview + server validation)
- [ ] Labels PDF (Code128 + QR; thermal and A4)
- [ ] Mes colis + Détail du colis
- [ ] Ramassage requests + pickup address at first request

## Phase 3 — Back office operations

- [ ] Web scan station (camera + USB gun), 5 modes, scan deduplication
- [ ] Zones (livreur + ramasseur, titular + backup) and absence switch
- [ ] Tournées (parcels grouped by zone, manual moves)
- [ ] Ramassages planning + À emporter
- [ ] Colis search + admin status override (with reason, audited)

## Phase 4 — Courier app

- [ ] Expo dev build, login with role choice, PIN
- [ ] Livreur: Ma journée, Ma tournée, Trouver le client, Livrer / Échec
- [ ] Mémoire d'adresse (linked to customer phone)
- [ ] Ramasseur: pickups, parcel scans, bon Remis scan, Retour reçu scans
- [ ] SQLite scan queue + sync + no double scan + conflict handling
- [ ] Ma caisse, notifications, profile
- [ ] APK distribution, forced update (only with empty queue), OTA updates

## Phase 5 — À vérifier

- [ ] Failure reasons (courier only), seller decisions (Relancer / Retourner / Changer de client)
- [ ] Changer de client only at depot, 1,000 DT fee, attempt counter reset
- [ ] 48-hour automatic return job, 3rd attempt rule
- [ ] Service client call log (Appels Faffa Go)

## Phase 6 — Money

- [ ] Caisse sessions (attendu / compté / écart), courier debts
- [ ] Bons de versement (selection, fees, retenue, PDF + QR, Préparé › En route › Remis › Archivé)
- [ ] Bons de retour
- [ ] Retenue à la source certificates + monthly report
- [ ] Livreur pay (per parcel, pay plans, fiches de paie); ramasseur écarts report for HR

## Phase 6b — Public site

- [ ] Landing page (FR + AR, RTL), sections as in docs/landing.md
- [ ] Tarifs and Zones couvertes read from Paramètres
- [ ] Suivre mon colis: public endpoint (public fields only), rate limiting, /suivi/FG-XXXXXX links
- [ ] Open Graph, SEO (/fr, /ar), Meta Pixel (TO CONFIRM)

## Phase 7 — Communication and reporting

- [ ] Chat per parcel (seller ↔ livreur, staff can join)
- [ ] In-app notifications (all roles)
- [ ] Exceptions queue
- [ ] Reports (retenue, revenue, activity, cash, pay) + CSV/Excel export

## Phase 8 — Deployment

- [ ] VPS setup, HTTPS, environment variables
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
- 2026-09-23 — **The public timeline is a whitelist**, not a filter. Only the
  events in `PUBLIC_TIMELINE_EVENT_TYPES` are ever exposed, so a new event type
  is private until someone deliberately adds it.

## Open questions

- Retenue à la source: base and rounding confirmed as "after every Faffa Go fee,
  half-up at the millime" (A-3), still to be signed off by the accountant.
- Back office scanning: browser camera enough, or add a Dépôt mode to the
  courier app?
- **A-6 gives 5 attempts in practice, not 6.** Changer de client resets the
  counter, but it needs the status À vérifier, and the third failure returns the
  parcel automatically. So the seller must change customer after the second
  failure at the latest: 2 + 3. To reach 6, Changer de client would also have to
  be allowed from Retour au dépôt, before the return ships.
- Seed: the Arabic names of the gouvernorats and délégations are the standard
  official spellings but have not been read by a native speaker; the public site
  shows them to customers.
- Delivery fee, return fee and courier rate are seeded at 0 because no spec
  gives a value. They must be set in Paramètres before the first parcel.
- Q9–Q13 are answered and recorded in `docs/admin.md`, but only the CLI escape
  hatch (`admin:reset`) and the database constraints are built. The throttling,
  the session lifetimes and the last-admin guard belong to the auth task.
- Q12: the courier app must keep its SQLite `scan_queue` across a forced logout.
  Nothing enforces that yet — it is a rule for the phase 4 implementation.
