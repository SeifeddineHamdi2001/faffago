# Faffa Go — instructions for Claude Code

Faffa Go is a COD (cash on delivery) express delivery company in Grand Tunis, Tunisia, serving e-commerce sellers. This monorepo contains the whole platform: seller space, back office, and courier app.

## Source of truth

- Specs live in `docs/`:
  - `docs/vendeur.md` — seller interface
  - `docs/admin.md` — back office (Admin, Dépôt, Service client)
  - `docs/coursier.md` — courier app (Livreur, Ramasseur)
  - `docs/landing.md` — public site: landing page, prices, public parcel tracking (French + Arabic)
  - `docs/tech-stack.md` — architecture and technical rules
  - `docs/PROGRESS.md` — what is built, what is next
- Before any task, read the relevant spec sections. The specs win over your assumptions.
- If a spec is unclear, contradictory, or silent on something you need, **stop and ask**. Never invent a business rule, status, fee, or permission.
- Items marked "TO CONFIRM" in the specs are defaults: implement them, but keep them easy to change (settings or one constant).
- Do not add features that are not in the specs, even if they seem useful. Suggest them instead.

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
- A failed delivery always goes to À vérifier. Returns only come from: the seller's choice, 48 hours without decision, or the 3rd failed attempt. The Faffa Go team never decides a return.
- Changer de client is only possible when the parcel is at the depot.

### Scans
- Every scan carries a client-generated UUID with a UNIQUE constraint. Handle duplicates idempotently.
- A parcel can only be marked Livré by scanning (manual code entry allowed but flagged).
- Validate every scan server-side against the current parcel state and return a clear reason when refused.

### Security and privacy
- Role check on every endpoint (NestJS guards). Roles: ADMIN, DEPOT, SERVICE_CLIENT, VENDEUR, LIVREUR, RAMASSEUR.
- A seller only ever sees his own data. A seller sees only the courier's first name.
- CIN / patente documents: private storage, admin-only access, never a public URL.
- Never commit secrets. Use `.env` files (git-ignored) and document variables in `.env.example`.

### UI
- All user-facing text in French, using the exact labels from the specs. The public site is French + Arabic (right-to-left layout for Arabic). The courier app also supports Arabic (TO CONFIRM).
- Public tracking never exposes customer name, phone, address, failure reason or internal notes.
- Courier app: large touch targets (≥ 56 px), main actions at the bottom, works offline.

## How to work

1. For each task: read the specs, then propose a short plan (data model changes, endpoints, screens, tests) **before writing code**. Wait for approval on anything touching money, statuses or permissions.
2. Write tests first for money calculations, the status state machine, scan deduplication and permissions.
3. Keep changes small and focused on the current task. One feature at a time.
4. Run the tests, lint and type checks before saying a task is done.
5. At the end of each task, update `docs/PROGRESS.md` (what was done, decisions made, open questions).
6. Database changes only through Prisma migrations. Never edit a migration that has already been applied.

## Commands

Node 22+ and pnpm 9 (`corepack enable pnpm`). Run from the repository root.

- Install: `pnpm install`
- Dev: `pnpm dev`
- Tests: `pnpm test`
- Lint / types: `pnpm lint && pnpm typecheck`
- Format: `pnpm format`
- Build: `pnpm build`

Per workspace:

- One package: `pnpm --filter @faffago/shared test`
- DB migration: `pnpm --filter @faffago/api prisma migrate dev --name <nom>`
- Apply migrations: `pnpm --filter @faffago/api prisma:deploy`
- Prisma client: `pnpm --filter @faffago/api prisma:generate`
- Seed (idempotent): `pnpm --filter @faffago/api db:seed`

Notes:

- `packages/shared` must be built before the apps typecheck; `turbo` handles
  that through `dependsOn: ["^build"]`.
- The API tests need no Docker: the schema tests run against PGlite, which is
  PostgreSQL compiled to WebAssembly.
- Database work needs `DATABASE_URL`; copy `.env.example` to `.env` first.
