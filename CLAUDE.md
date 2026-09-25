# Faffa Go — instructions for Claude Code

Faffa Go is a COD (cash on delivery) express delivery company in Grand Tunis, Tunisia, serving e-commerce sellers. This monorepo contains the whole platform: seller space, back office, and courier app.

## Source of truth

- Specs live in `docs/`:
  - `docs/vendeur.md` — seller interface
  - `docs/admin.md` — back office (Admin, Dépôt, Service client)
  - `docs/coursier.md` — courier app (Livreur, Ramasseur)
  - `docs/landing.md` — public site: landing page, prices, public parcel tracking (French + Arabic)
  - `docs/tech-stack.md` — architecture and technical rules
  - `docs/decisions.md` — every decision taken during the build
  - `docs/PROGRESS.md` — what is built, what is next, launch scope
- **`docs/decisions.md` is binding.** Read it before any work. Where it differs from a spec, decisions.md wins.
- Before any task, read the relevant spec sections and decisions. They win over your assumptions.
- Never invent a business rule, status, fee, or permission. If a spec and decisions.md are silent on one, stop and ask (see "When to stop").
- Items marked "TO CONFIRM" in the specs are defaults: implement them, but keep them easy to change (settings or one constant).
- Do not add features that are not in the specs or decisions, even if they seem useful. Suggest them in the end-of-phase report instead.

## Launch scope

Build in this order: finish phase 8 (money: caisse, bons de versement, bons de retour, courier pay), phase 9 (public site: tracking page, landing page FR + AR, Tarifs and Zones couvertes, SEO, Meta Pixel), phase 10 (communication and reports: notifications, chat, the full Exceptions queue, reports, retenue certificates), phase 11 (deployment). Everything is built before launch; PROGRESS.md lists each phase's items.

## Structure

- `apps/api` — NestJS + Prisma + PostgreSQL
- `apps/web` — Next.js (public site + seller space + back office)
- `apps/courier` — React Native (Expo, TypeScript)
- `packages/shared` — status enums, money helpers, shared types and validation. Every app imports statuses and money logic from here; never redefine them.

## Non-negotiable rules

### Money

- Always integer **millimes** (`BIGINT` / `bigint`). 85,000 DT = `85000`. Change-client fee = `1000`.
- No floating-point math on money, ever. Format to `85,000 DT` only in the UI via the shared helper.
- Retenue à la source: 3% of (total COD − Faffa Go fees), rounded to the millime, only for sellers with statut `CIN_UNIQUEMENT`. Computed once per bon and stored.
- Fees are frozen on each parcel at creation; a rate change only affects new parcels.
- Pickup fee: 2,000 DT (2000 millimes) when fewer than 5 parcels are scanned at a pickup; free from 5. Deducted in the next bon de versement.
- Every financial operation (Caisse closing, bon de versement, bon de retour, pay slip) runs in one database transaction.

### Parcels and statuses

- Use only the statuses defined in `packages/shared`. Never add, rename or reuse a status without asking.
- Every status change goes through the parcel event service, which writes an immutable event (who, when, GPS if any, previous → new, reason). Never update a status column directly.
- `parcel_events` and `audit_log` are append-only.
- A failed delivery goes to À vérifier, except a customer postponement, which is planned automatically (D-9). Returns only come from: the seller's choice, 48 hours without decision, or the 3rd failed attempt. The Faffa Go team never decides a return.
- Changer de client is only possible when the parcel is at the depot.

### Scans

- Every scan carries a client-generated UUID with a UNIQUE constraint. Handle duplicates idempotently.
- A parcel can only be marked Livré by scanning (manual code entry allowed but flagged).
- Validate every scan server-side against the current parcel state and return a clear reason when refused.

### Security and privacy

- Role check on every endpoint (NestJS guards). Roles: ADMIN, DEPOT, SERVICE_CLIENT, VENDEUR, LIVREUR, RAMASSEUR.
- A seller only ever sees his own data. A seller sees only the courier's first name.
- CIN / patente documents: private encrypted storage, admin-only access, never a public URL.
- Never commit secrets. Use `.env` files (git-ignored) and document variables in `.env.example`.

### UI

- All user-facing text in French, using the exact labels from the specs. The public site is French + Arabic (right-to-left layout for Arabic). The courier app supports French and Arabic.
- Orange buttons and surfaces carry **navy text**, never white: white on #FF6B35 fails WCAG AA contrast. Orange text on white uses `orange-dark`.
- Any user-facing text the specs do not word goes into `docs/ui-texts.md` (screen, key, French text), for review before launch.
- Public tracking never exposes customer name, phone, address, failure reason or internal notes.
- Courier app: large touch targets (≥ 56 px), main actions at the bottom, works offline.

## How to work

These rules keep the cost of the build down. Follow them.

1. **Run a whole phase without stopping between steps.** At the start of a phase, write a short plan (a list of steps, one line each) into PROGRESS.md and start working. Don't wait for approval of the plan unless it contains a decision covered by "When to stop".
2. **Decide the small things yourself.** Screen layout, wording, naming, validation limits, UI behaviour, internal structure: choose, record the choice in decisions.md (one or two lines), and list it in the end-of-phase report.
3. **Reports are short.** Ten lines maximum: what was built, what's left, and the list of choices you made alone. No detailed explanations unless asked.
4. **Tests.** Tests first for money calculations, the status state machine, scans and permissions. For screens, one test per screen for its main path is enough. No mutation checks or extra verification passes unless the code touches money.
5. Run the tests, lint and type checks before saying work is done.
6. Update `docs/PROGRESS.md` at the end of each phase (what was done, decisions made, open questions).
7. Database changes only through Prisma migrations. Never edit a migration that has already been applied.
8. One branch per phase (`phase-5`, `phase-6`, …). Commit on it as the work goes; merge into `main` only when the phase is complete and `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm e2e` pass through turbo from the root. After every merge into `main`, push `main` to `origin`.
9. Never commit when lint, typecheck or tests fail. Chain the checks with `&&` so a failure stops before `git commit`.

## When to stop and ask

Stop only for a decision that decisions.md and the specs don't answer and that touches:

- **money**: a fee, a charge, a payout, the retenue, the caisse, courier pay;
- **statuses**: a new transition, a new status, a new effect of a transition;
- **permissions**: who can see or do something.

Ask all your open questions for a phase **in one message**, each with your recommendation, so they can be answered at once. Everything else: decide, record, continue.

## Commands

Node 22+ and pnpm 9 (`corepack enable pnpm`). Run from the repository root.

- Install: `pnpm install`
- Dev: `pnpm dev`
- Tests: `pnpm test`
- Lint / types: `pnpm lint && pnpm typecheck`
- Format: `pnpm format`
- Build: `pnpm build`
- Browser tests (Playwright, D-49): `pnpm e2e`. Needs Chromium once: `pnpm --filter @faffago/web exec playwright install --no-shell chromium`

Per workspace:

- One package: `pnpm --filter @faffago/shared test`
- DB migration: `pnpm --filter @faffago/api prisma migrate dev --name <nom>`
- Apply migrations: `pnpm --filter @faffago/api prisma:deploy`
- Prisma client: `pnpm --filter @faffago/api prisma:generate`
- Seed (idempotent): `pnpm --filter @faffago/api db:seed`
- Demo accounts and demo work (zones, picked-up parcels, a pickup request), development only (never in production, never by the normal seed; run `db:seed` first): `pnpm --filter @faffago/api db:seed:demo`

Notes:

- `packages/shared` must be built before the apps typecheck; `turbo` handles
  that through `dependsOn: ["^build"]`.
- The API tests need no Docker: the schema tests run against PGlite, which is
  PostgreSQL compiled to WebAssembly.
- `pnpm e2e` needs no database either: Playwright starts the API on PGlite
  (fresh, in memory) on port 3101 and a production build of the web app on
  port 3100. The build replaces `apps/web/.next`: stop the web app's
  `pnpm dev` first.
- Database work needs `DATABASE_URL`; copy `.env.example` to `.env` first.
