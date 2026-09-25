# apps/courier

The Faffa Go courier app (`docs/coursier.md`): React Native with Expo SDK 57,
TypeScript, Android only, for the Livreur and the Ramasseur. Built in phase 6.

## Run it

It needs an Expo **development build**, not Expo Go (native modules:
`expo-camera`'s barcode scanner, `expo-sqlite`, `expo-secure-store`).

```bash
# apps/courier/.env — the API with its /api prefix. The default reaches
# `pnpm dev`'s API from the Android emulator.
EXPO_PUBLIC_API_URL=http://10.0.2.2:3001/api

pnpm --filter @faffago/courier android   # builds and installs the dev client
pnpm --filter @faffago/courier dev       # Metro, for the installed dev client
```

Checks, as for every workspace: `pnpm --filter @faffago/courier test`
(Jest with `jest-expo`), `lint`, `typecheck`. `build` bundles the JavaScript
for Android (`expo export`), which proves the app assembles without a phone.

## How it works

- **One queue, one route.** Every scan and action — Livré, Échec, Ramassage,
  Annuler, Terminer le ramassage, a note d'adresse — is written to the
  `scan_queue` table in SQLite first, with the UUID drawn on the phone, its
  device time and GPS, then sent in order to `POST /scans/courier`. That is the
  one route an outdated app still reaches (D-14), so the queue always empties
  before a forced update blocks the app (tech-stack 5).
- **A forced logout keeps the queue** (Q12). Each row carries the courier who
  made it and is sent after he logs back in, with its own device time and UUID.
- **The PIN never leaves the phone** (D-7): hashed in the Android keystore
  (`expo-secure-store`), asked at start and after 5 minutes in the background.
  Forgotten, the courier logs out and back in with his password.
- **Location is required to open the app, never to scan** (D-63): no fix within
  4 seconds, the scan goes without position and the staff log reads
  "Sans position".
- **Offline screens** show the last answer kept on the phone (`cache` table).
  Ma caisse and Ma tournée count the scans still waiting to be sent.
- **French and Arabic** (`src/i18n/messages.ts`): each component follows the
  language's direction, so switching needs no restart. Amounts and codes stay
  in Latin digits.

Not in the app yet: the bon de versement and Retours scans of the ramasseur
(D-61) and Mes gains (D-62) come with phase 8; chat and notifications after
launch; APK signing, hosting and OTA updates with the deployment (phase 11).
