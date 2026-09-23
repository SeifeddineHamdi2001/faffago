# Faffa Go — décisions

Business rules decided after the specs were written. Each one either settles
something the specs left open, or changes them. The specs remain the source of
truth; where a decision here contradicts one, the spec has been amended and its
version bumped.

Entries are numbered in the order they were taken and never renumbered.

---

## D-1 · Relancer, Retourner and Changer de client are the seller's alone

**Decided** 24 September 2026.

Service client follows up — calls the customer, writes in the parcel chat,
chases the seller — but never decides **Relancer**, **Retourner** or **Changer
de client**. If a seller asks by phone, service client tells him to do it in his
space.

**Why.** Faffa Go never decides a return (CLAUDE.md; Admin rule 13; Vendeur
decision 13). A team member pressing Relancer is a smaller version of the same
mistake: it commits the seller's money and his customer relationship.

**Where.** `ALLOWED_ACTORS` in `packages/shared/src/parcel-state-machine.ts`
lists only `VENDEUR` for the three decisions, and a test asserts every other
role is refused.

---

## D-2 · "Voir comme le vendeur" is read-only impersonation

**Decided** 24 September 2026. Built as part of the auth work.

| Rule     | Detail                                                                                      |
| -------- | ------------------------------------------------------------------------------------------- |
| Who      | **ADMIN only**                                                                              |
| What     | **Read-only.** Any write or action is refused while impersonating                           |
| Token    | Its own token type, 30 minutes, **no refresh**                                              |
| Visible  | Banner in the seller space: _"Vous consultez le compte de [shop name]"_ with an exit button |
| Recorded | Start **and** end written to `audit_log`: admin, seller, time                               |

**Why.** The admin needs to see exactly what a seller sees to answer him
(Admin 4.14). He does not need to act as him, and an unbounded impersonation
token is the single most dangerous credential the platform could issue.

---

## D-3 · Login throttling is held in memory

**Decided** 24 September 2026.

Rate limiting per identifier and per IP, exponential backoff, **no permanent
lockout**, state held in the API process.

**Why.** One VPS, one process. A restart clearing a backoff is not a hole when
there is no lockout to bypass. A `login_attempt` table can be added later if the
Exceptions queue needs the history.

---

## D-4 · The courier PIN never reaches the server

**Decided** 24 September 2026.

The 4-digit PIN that protects the app when it is reopened (Coursier 4.12) is set
by the courier on his own phone and stored only there. `Courier.pinHash` has
been dropped.

A courier who forgets his PIN logs out and logs back in with his password; the
admin regenerates that password if he has forgotten it too.

**Why.** An unused credential column is a liability, and a PIN the server can
check is a second password to protect for no gain.

**Where.** Migration `20260924000000_postponement_and_drop_pin`.

---

## D-5 · A parcel is attempted at most five times

**Decided** 24 September 2026. Confirms A-6.

Three attempts, and **Changer de client** resets the counter for a fresh three.
In practice that caps a parcel at **five**: the third failure returns the parcel
automatically, and Changer de client needs the status À vérifier, so the seller
has to change customer after the second failure at the latest. 2 + 3.

Changer de client stays limited to **once per parcel**.

**Where.** `maxClientChangesPerParcel: 1` in
`packages/shared/src/settings.ts`; the cap is exercised end to end by the test
_"caps a parcel at five attempts in practice, not six"_.

---

## D-6 · "Reporté par le client" is planned, not verified

**Decided** 24 September 2026. **This changes a rule in the specs.**

> A failed delivery always goes to À vérifier — CLAUDE.md

A customer postponement is the exception. When the customer himself asks for
another day, nothing needs verifying and nobody needs to decide: the courier
plans it and the parcel waits for that day.

### The courier

- In the **Échec** flow, the reason **Reporté par le client** requires a date.
  Date picker, default tomorrow, allowed from **tomorrow up to 7 days ahead**.
- Optional slot — **Matin / Après-midi / Soir** — and an optional note.
- Also usable **before any visit**, when the customer asks by phone in the
  morning.
- It **counts as a delivery attempt**.

### What happens

- Status → **Relancé**, with the date and the slot recorded.
- Event `ECHEC_LIVRAISON`, reason `REPORTE_PAR_LE_CLIENT`, date in the metadata.
- **Not** À vérifier. No 48-hour deadline: `verifyDeadlineAt` stays null.
- The livreur brings it back with **Retour de tournée**: the parcel moves to the
  depot, the status stays Relancé.
- On the chosen day it appears in **Tournées** for the zone's livreur like any
  relancé parcel, and the courier is notified (`COLIS_RELANCE_AUJOURDHUI`).
- **If it was the third attempt the three-attempt rule wins**: automatic return,
  no postponement.

### The seller

- Notified: _"Livraison reportée au [date] à la demande du client"_.
- His parcel shows **Reporté au [date]** with the slot and the courier's note.
- Until the parcel goes out again he can **change the date** — same 7-day
  window — or choose **Retourner**. **Changer de client** becomes possible once
  the parcel is back at the depot.

### The customer

Public tracking reads **Livraison reportée** with the new date. No reason text,
and the failure event itself never appears in the public timeline.

### Where

`packages/shared/src/parcel-state-machine.ts` (the `SCAN_ECHEC` branch,
`DECISION_CHANGER_DATE`, `isValidPostponementDate`, `isDueForTour`),
`packages/shared/src/public-tracking.ts` (`publicStatusFor`), and migration
`20260924000000_postponement_and_drop_pin`. Tests in
`packages/shared/src/__tests__/postponement.test.ts`.

### Consequences that follow from this decision

Recorded because they were not spelled out in the request and are worth
challenging:

1. **A new field, `Parcel.relaunchOrigin`** (`VENDEUR` | `CLIENT`). The seller's
   own Relancer and a customer postponement both land on Relancé but are shown
   differently — _"Relancé"_ against _"Reporté au [date]"_, and two different
   public labels — so the origin has to be stored rather than guessed.
2. **A new public status, `LIVRAISON_REPORTEE_CLIENT`.** Landing 4.2 maps
   Relancé to _"Livraison reportée — le vendeur va vous contacter"_, which is
   wrong here: the customer is expecting his parcel, not a call. `docs/landing.md`
   needs that row split.
3. **`Retourner` now also works from Relancé**, not only from À vérifier, which
   is what lets the seller refuse a postponement he does not believe in. This
   also applies to a parcel he relaunched himself.
4. **`Changer de client` now also works from Relancé**, at the depot, on the
   same reasoning.
5. **The seller's own Relancer now carries a date too**, validated in the same
   1–7 day window. Vendeur 4.9 already says he picks a date and slot; without
   this the two paths would validate differently.
6. **The slot is a closed list.** It was free text in the first migration and is
   now the enum `RelaunchSlot`.

---

## D-7 · Auth is phase 1, not phase 0

**Decided** 24 September 2026.

`docs/PROGRESS.md` had the login and the role guards under phase 0 alongside the
monorepo and the schema. They are their own piece of work and are now phase 1;
everything after has shifted by one.
