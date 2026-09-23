# Faffa Go — Technical Architecture & Stack

Version 1.1 — targets Vendeur v1.5, Admin v1.9, Coursier v1.7, Site public v1.1.
This is the original stack document (v1.0) with the corrections agreed during review.

## 1. Monorepo layout

```
faffago/
├── CLAUDE.md
├── apps/
│   ├── api/        NestJS + Prisma + PostgreSQL
│   ├── web/        Next.js — public site + seller space + back office (Admin, Dépôt, Service client)
│   └── courier/    React Native (Expo, TypeScript) — Livreur and Ramasseur
├── packages/
│   └── shared/     status enums, money helpers, shared types, validation schemas
└── docs/
```

Package manager: pnpm workspaces (Turborepo optional).

## 2. Backend — NestJS + PostgreSQL

- **NestJS**, one module per domain: auth, users, sellers, couriers, zones, parcels, scans, pickups, verification, caisse, payouts (bons de versement), returns (bons de retour), courier-pay, retenue, chat, notifications, reports, audit, settings.
- **PostgreSQL** with **Prisma** as ORM.
- **Authorization**: role-based. The role is stored in the signed JWT and checked by a NestJS guard on every endpoint. Roles: `ADMIN`, `DEPOT`, `SERVICE_CLIENT`, `VENDEUR`, `LIVREUR`, `RAMASSEUR`. Never trust a role sent by the frontend.
- **Transactions**: every financial operation (Caisse closing, bon preparation, bon Remis, pay slip) runs in a single database transaction. It commits entirely or rolls back.

### Money

- All money is stored as **integer millimes** in `BIGINT` columns. 85,000 DT = `85000`. The change-client fee is `1000` (one dinar).
- All arithmetic uses integers. Formatting to `85,000 DT` happens only in the UI, with one shared helper in `packages/shared`.
- Prisma maps `BigInt`; convert to string in JSON responses to avoid precision loss in JavaScript.
- **Retenue à la source rule**: `retenue = round(3% × (total COD − fees))` to the nearest millime, computed once, stored on the bon, reused by the certificate and the monthly report. (Base and rounding to be confirmed by the accountant; change it in one place only.)

### Parcel events and audit

- Every parcel status change goes through one service that writes an **immutable event** (who, when, GPS if any, device, previous status, new status, reason).
- The `parcel_events` and `audit_log` tables are **append-only**: `UPDATE` and `DELETE` are revoked for the application database user (or blocked by trigger).

### Scans and offline sync

- Each scan carries a **UUID generated on the phone** (`client_scan_id`) with a `UNIQUE` constraint. A scan received twice is stored once and the second request returns the first result (idempotent).
- The server validates every scan against the current parcel state and returns a clear refusal reason when it conflicts (reassigned, cancelled, already delivered).
- Store both the device timestamp and the server reception time.
- The API rejects requests from courier app versions below the minimum version.

### Other backend services

- **Scheduled jobs** (e.g. `@nestjs/schedule` or BullMQ + Redis): 48-hour À vérifier automatic return, exception detection, daily reminders.
- **Real-time**: WebSockets (NestJS gateways) for chat and in-app notifications.
- **PDF generation** on the server: labels (Code128 + QR), bons de versement, bons de retour, fiches de paie, certificats de retenue à la source.
- **Private file storage** for CIN / patente / auto-entrepreneur documents: never a public URL; served only to admins through the API.
- **CSV import**: validated in the browser for the preview, and **validated again on the server** for every row.

## 3. Web — Next.js

- One Next.js app with three areas: public site (landing + tracking, French/Arabic, server-rendered), seller space, and back office. Private routes protected by role.
- Public site i18n: `/fr` and `/ar` routes, `dir="rtl"` for Arabic, an Arabic font paired with Manrope/Space Grotesk (e.g. IBM Plex Sans Arabic), Latin digits for codes and amounts.
- Public tracking endpoint returns only public fields and is rate-limited; parcel codes are random, never sequential.
- French UI, labels exactly as in the specs.
- **Back office scanning**: phone camera in the browser (Chrome on Android, `BarcodeDetector` API with a zxing fallback). A USB barcode gun works as keyboard input on the same screen.
  - Open decision: if browser scanning is too slow at the depot, add a "Dépôt" mode to the React Native app instead.

## 4. Courier app — React Native (Expo)

- **Expo with a development build** (prebuild / EAS Build). Expo Go is not enough because of native modules.
- **Scanning**: `react-native-vision-camera` with its built-in code scanner (ML Kit on Android).
- **Offline**: `expo-sqlite`. Table `scan_queue` (client_scan_id, parcel_code, action, payload, device_time, gps, status). The app blocks a second scan of the same parcel for the same action locally, and syncs the queue automatically when online.
- **Location**: foreground only, captured at the moment of each scan. No background location.
- **Login**: role choice (Livreur / Ramasseur) + phone + password. One account per role; the same phone number can have one of each.
- Android only for v1.

## 5. Distribution and updates (sideloaded APK)

- The signed APK is hosted by Faffa Go (HTTPS, with a checksum). The depot installs it on each courier's phone at onboarding and grants camera and location permissions.
- **Signing key**: back it up in two safe places. An APK only updates over the old one if it is signed with the same key; losing it forces uninstalls, which erase unsent offline scans.
- **Forced update**: the app checks the minimum version at launch. It first syncs the scan queue and only blocks once the queue is empty. The API also enforces the minimum version.
- **OTA updates** (EAS Update or equivalent) for JavaScript-only changes; a new APK only when native code changes.

## 6. Hosting and operations

- VPS: size memory for PostgreSQL + NestJS + Next.js together, separate from other projects if possible. Reverse proxy (Nginx or Caddy) with HTTPS.
- **Backups**: automatic daily PostgreSQL backups stored off the server, plus the documents storage. Test a full restore before launch.
- Environment variables in `.env` files that are never committed.
- Error monitoring and logs for the API and the courier app (e.g. Sentry).
