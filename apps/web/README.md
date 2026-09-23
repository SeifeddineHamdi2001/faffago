# apps/web

Next.js application with three areas, all in one app (tech-stack 3):

- **Public site** — landing page, tarifs, zones couvertes and `Suivre mon colis`,
  server-rendered, French and Arabic with a right-to-left layout for Arabic.
- **Espace vendeur** — the seller interface of `docs/vendeur.md`.
- **Back office** — Admin, Dépôt and Service client, from `docs/admin.md`.

Not scaffolded yet. It is built in phase 2 and phase 6b of `docs/PROGRESS.md`,
after the API has the endpoints it needs.

Two things must be in place from its very first commit, because retrofitting
them is expensive:

- the Arabic right-to-left layout (`docs/landing.md` 5), and
- role-protected routes, checked again on every API call and never only in the
  browser (`docs/tech-stack.md` 2).
