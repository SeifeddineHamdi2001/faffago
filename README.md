# Faffa Go

COD express delivery in Grand Tunis. Seller space, back office and courier app
in one monorepo.

The specs in [`docs/`](docs/) are the source of truth;
[`docs/PROGRESS.md`](docs/PROGRESS.md) says what is built.

## What exists today

Phase 0 is partly done: the monorepo, the shared money and status layer, the
full database schema and its first migration.

**Authentication is not built.** The last two items of phase 0 — the login and
the role guards, and the courier login with its role choice — are still open,
so there is no way to sign in to anything yet. The database enforces which
identifier each role uses; nothing checks a password.

**There is no user interface yet.** The seller space and back office
(`apps/web`) and the courier app (`apps/courier`) are placeholders, built in
phases 2 to 4. The API boots but serves no endpoints. What you can look at
today is the database, through Prisma Studio, and the test suite.

## Requirements

- **Node 22+** and **pnpm 9** — `corepack enable pnpm`
- **PostgreSQL 16**, either through Docker or installed on the machine

## Setup

```bash
pnpm install
cp .env.example .env
```

### The database

With Docker — this also creates both roles the migration expects:

```bash
docker compose up -d
```

Without Docker, install PostgreSQL 16, then in `psql` as a superuser:

```sql
CREATE ROLE faffago_owner LOGIN PASSWORD 'faffago_dev';
CREATE ROLE faffago_app   LOGIN PASSWORD 'faffago_dev';
CREATE DATABASE faffago OWNER faffago_owner;
GRANT CONNECT ON DATABASE faffago TO faffago_app;
```

Either way, `.env` as shipped already points at `localhost:5432` with those
credentials. Change the passwords before doing anything that is not local.

### Create the tables

```bash
pnpm --filter @faffago/api prisma:deploy   # applies the first migration
pnpm --filter @faffago/api db:seed         # geography, settings, first admin
```

The seed prints the admin password once. It is never readable again; only the
admin can regenerate a password, and if the last admin loses his:

```bash
pnpm --filter @faffago/api admin:reset <username>
```

## Seeing it

```bash
pnpm --filter @faffago/api prisma:studio
```

Opens <http://localhost:5555> with the 40 tables. `gouvernorats` and
`delegations` hold the four gouvernorats of Grand Tunis and their délégations in
French and Arabic, `settings` holds the rates, and `users` holds the admin.

Try the append-only rule by hand: edit a row of `parcel_events` in Studio and
the database refuses it, because that is enforced by a trigger and by revoked
privileges, not by application code.

```bash
pnpm --filter @faffago/api dev
```

Starts the API on <http://localhost:3001>. It connects to PostgreSQL and logs
`Connecté à PostgreSQL`; every route is still to be written, so it answers 404
to everything. Auth is the next task.

## Tests

```bash
pnpm test        # 175 tests
pnpm lint
pnpm typecheck
```

No database is needed. `packages/shared` runs under Vitest; the API schema tests
run the real migration against PGlite, which is PostgreSQL compiled to
WebAssembly, so the triggers and CHECK constraints are genuinely exercised.

## Layout

| Path              | What                                                              |
| ----------------- | ----------------------------------------------------------------- |
| `apps/api`        | NestJS, Prisma, PostgreSQL                                        |
| `apps/web`        | Next.js: public site, seller space, back office (phase 2)         |
| `apps/courier`    | React Native / Expo, Android (phase 4)                            |
| `packages/shared` | Statuses, money, the parcel state machine — imported by all three |
| `packages/config` | Shared TypeScript and ESLint configuration                        |

Money is integer millimes in `bigint`, everywhere, and every status change goes
through the state machine in `packages/shared`. See `CLAUDE.md` for the rules
that are not negotiable.
