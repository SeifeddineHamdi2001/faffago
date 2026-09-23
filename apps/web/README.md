# apps/web

Next.js 15 (App Router) with three areas in one app (tech-stack 3):

| Area           | Routes         | Language                         |
| -------------- | -------------- | -------------------------------- |
| Public site    | `/fr`, `/ar`   | French and Arabic, RTL in Arabic |
| Espace vendeur | `/vendeur/...` | French only (Q4)                 |
| Back office    | `/admin/...`   | French only (Q4)                 |

The public site is a placeholder until phase 8; its `[locale]` layout already
sets `lang` and `dir="rtl"`, so right-to-left is never retrofitted.

## Sessions (D-13, D-15)

The browser never holds a token.

- `app/api/session/*` log in, refresh and log out through the API and keep
  the access and refresh tokens in `httpOnly` cookies. Only `fg_exp`, the
  access token's expiry, is readable by the page.
- `middleware.ts` refreshes the access token before a page or a back office
  call runs, and sends an expired session to the login page of its area.
- `app/api/bff/[...path]` forwards the back office's calls to the API with the
  admin's token, for an allowlist of paths. Every write checks the `Origin`
  header.
- `app/api/impersonation` keeps the "Voir comme le vendeur" token in its own
  cookie; the seller space reads with it, the back office never does.
- In the browser, `lib/client/call.ts` takes a `navigator.locks` lock before
  refreshing, so all tabs share one refresh.

The API checks the role on every call; the web app only routes.

## Commands

```
pnpm --filter @faffago/web dev        # http://localhost:3000, API at API_BASE_URL
pnpm --filter @faffago/web test       # Vitest + Testing Library (jsdom)
pnpm --filter @faffago/web build
```

To try the screens locally: `pnpm --filter @faffago/api db:seed`, then
`pnpm --filter @faffago/api db:seed:demo` for a demo seller, Dépôt, Service
client, livreur and ramasseur. The passwords are printed once.

End-to-end tests (Playwright) come at the end of phase 3, when a full flow
exists.
