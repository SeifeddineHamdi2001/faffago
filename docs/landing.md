# Faffa Go — Site public : landing page & suivi de colis (spécification v1.3)

> **How to read this document.** Page text and labels are shown in French, as they will appear on the site; each has an Arabic version. Explanations are in English. This document completes the seller (v1.5), admin (v1.9) and courier (v1.7) specifications and uses the same statuses and rules.

## 1. Purpose and core principles

The public site has two audiences: e-commerce sellers who might become partners, and end customers waiting for a parcel. It must convince the first and reassure the second, fast, on a phone.

| Principle                                 | What it means                                                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Speak to the seller's pain.**           | Returns that cost money, unclear fees, cash that arrives late or not at all. The page answers these problems, not a list of features. |
| **Promise only what operations deliver.** | Every claim (payment speed, zones, prices) must be true every day. No "paiement le jour même" unless the ramasseur runs make it true. |
| **Prices are public and always right.**   | The prices shown come from the same settings the platform uses, so the page can never show an old price.                              |
| **No sign-up form.**                      | Devenir partenaire opens direct contact. Accounts are created by the admin.                                                           |
| **Tracking protects privacy.**            | Anyone with a parcel code sees its progress, never the customer's personal data.                                                      |
| **Mobile first, French and Arabic.**      | Most visitors arrive from Facebook or Instagram on a phone. The site loads fast and switches language in one tap.                     |

## 2. Page structure

One long page, in this order. A sticky top bar keeps the essentials always visible.

### 2.1 Top bar (sticky)

- Logo · **Suivre un colis** · **Tarifs** · **FR / AR** language switch · **Se connecter** · **Devenir partenaire** (orange, main action).
- On phone: logo, language switch, Devenir partenaire, and a menu for the rest.

### 2.2 Hero

- A headline about the seller's problem, one line of explanation, the two actions **Devenir partenaire** and **Se connecter**, and a visual of the Faffa Go courier and motorcycle.
- Directly under the hero: the **Suivre mon colis** box (section 4), so customers find it without scrolling.

#### Headline directions (final copy to be written in both languages):

| Angle        | Example (French)                                                                  |
| ------------ | --------------------------------------------------------------------------------- |
| Returns      | Un échec de livraison n'est pas un retour. Chez Faffa Go, c'est vous qui décidez. |
| Cash         | Votre argent vous est apporté, avec un bon signé qui liste chaque colis.          |
| Transparency | Un seul tarif pour tous les vendeurs. Pas de surprise.                            |

### 2.3 Comment ça marche

Flow: 1 · Vous créez vos colis › 2 · On ramasse › 3 · On livre › 4 · Votre cash + bon signé

Four steps with one short sentence each, drawn as the brand chevron line.

### 2.4 Pourquoi Faffa Go

| Advantage                        | What the page says                                                                                                            |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Un échec n'est pas un retour** | A failed delivery is verified first. You choose: relancer (free), changer de client, or retourner. Fewer returns, more sales. |
| **Cash apporté chez vous**       | The ramasseur brings your money with a bon de versement listing every parcel. You count, you sign.                            |
| **Un tarif pour tous**           | The same public prices for every seller, big or small.                                                                        |
| **Tout est traçable**            | Your seller space shows every parcel, every scan, every dinar.                                                                |
| **Livreurs de votre zone**       | Each zone has its own livreur who knows its streets.                                                                          |

### 2.5 Tarifs

See section 3.

### 2.6 Zones couvertes

- The gouvernorats and délégations served, grouped by gouvernorat, taken from the platform's délégation list so they are always up to date.

### 2.7 FAQ

| Question                                       | Answer covers                                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Quand et comment suis-je payé ?                | Cash only, brought by the ramasseur with a bon de versement; parcels paid once their cash reaches the depot. |
| Que se passe-t-il si le client ne répond pas ? | À vérifier, the seller's 3 choices, 48-hour rule, maximum 3 attempts.                                        |
| Quels documents faut-il ?                      | CIN always; patente or auto-entrepreneur card; otherwise 3% retenue à la source.                             |
| Comment commencer ?                            | Contact us; we create your account and plan your first pickup.                                               |
| Où livrez-vous ?                               | Link to Zones couvertes.                                                                                     |

### 2.8 Contact and footer

- **Devenir partenaire** block: WhatsApp, phone, Facebook, Instagram, TikTok (the same contact links as in Paramètres; TikTok added in v1.3, D-20).
- Footer: logo, contact, social links, legal information of the company, language switch.

## 3. Tarifs

A clear price card. Values come from Paramètres; the page never has prices typed in by hand.

| Service                 | Price shown                                              |
| ----------------------- | -------------------------------------------------------- |
| Livraison (Grand Tunis) | Delivery fee from Paramètres                             |
| Retour                  | Return fee from Paramètres                               |
| Relance                 | **Gratuite**                                             |
| Changer de client       | 1,000 DT                                                 |
| Ramassage chez vous     | **Gratuit dès 5 colis** · 2,000 DT en dessous de 5 colis |

- Note under the card: "Vendeurs sans patente ni carte auto-entrepreneur : retenue à la source de 3 % sur les paiements." Short, factual, with a link to the FAQ.
- Prices are shown in DT with millimes, e.g. **7,000 DT**.

## 4. Suivre mon colis (public tracking)

End customers enter the code printed on their parcel and see where it is. Same page for sellers who want to share a link with their customer.

### 4.1 How it works

- A box with one field: **Code du colis** (FG-XXXXXX), button **Suivre**. Also reachable at a direct link, e.g. `faffago.tn/suivi/FG-8K2QX7`, that sellers can send to their customers.
- The result page shows a chevron track line, the public status, the date of the last update, the seller's shop name, the délégation, and the amount to prepare in cash.

### 4.2 Public statuses

The customer sees simple labels, not internal ones:

| Internal status                             | Public label                                            |
| ------------------------------------------- | ------------------------------------------------------- |
| Créé                                        | Commande enregistrée                                    |
| Ramassé, Au dépôt                           | Chez Faffa Go                                           |
| En livraison                                | En cours de livraison (with the livreur's first name)   |
| Livré                                       | Livré                                                   |
| À vérifier, Relancé (décidé par le vendeur) | Livraison reportée — le vendeur va vous contacter       |
| Relancé (reporté par le client)             | Livraison reportée, avec la date demandée par le client |
| Retour (all stages)                         | Retourné au vendeur                                     |
| Annulé                                      | Commande annulée                                        |

### 4.3 What is never shown

> **Privacy.** The public page never shows the customer's name, phone number or address, the failure reason, the livreur's phone number, or any internal note. Only the livreur's first name, as on the seller side.

_When the customer himself asked to postpone, the page shows the date he chose. He named it, so repeating it back to him reveals nothing (D-9)._

### 4.4 Protection

- Parcel codes are random (not sequential), so they cannot be guessed one after the other.
- Requests are rate-limited per visitor; repeated wrong codes are slowed down.
- Unknown code: "Aucun colis trouvé avec ce code. Vérifiez le code sur l'étiquette."

## 5. Languages: French and Arabic

- The whole public site exists in **French** and **Arabic**, including the tracking page and public statuses. A one-tap switch (FR / AR) in the top bar; the choice is remembered.
- Language is detected from the browser on the first visit; each language has its own address (e.g. `/fr` and `/ar`) so each can be shared and found on Google.
- **Arabic is right-to-left**: the layout mirrors (text alignment, chevron direction, icons). This must be built in from the start, not added later.
- Arabic font: Manrope and Space Grotesk do not contain Arabic letters; pair them with an Arabic typeface of similar weight (e.g. IBM Plex Sans Arabic or Noto Kufi Arabic). Numbers and tracking codes stay in Latin digits in both languages.
- The Arabic text is written for Tunisian readers and reviewed by a native speaker, not machine-translated.

## 6. Technical requirements

| Topic            | Requirement                                                                                                                               |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Where            | Public routes of the Next.js web app (same app as the seller space and back office), rendered on the server for speed and search engines. |
| Prices and zones | Read from the API (Paramètres, délégation list), cached for a few minutes.                                                                |
| Tracking         | Public API endpoint returning only the public fields of section 4, with rate limiting.                                                    |
| Speed            | Fast on a mid-range phone over 4G: optimised images, minimal scripts.                                                                     |
| Sharing          | Open Graph image and text for Facebook, Instagram and WhatsApp previews, in both languages.                                               |
| Search           | Page titles and descriptions in both languages, language alternates between /fr and /ar, sitemap.                                         |
| Ads tracking     | Meta Pixel and events on "Devenir partenaire" clicks (WhatsApp, phone), to measure the Facebook and Instagram campaigns. **TO CONFIRM**   |
| Design           | Faffa Go brand: orange #FF6B35, navy #1A1B2E, chevron motif, same design system as the platform.                                          |

## 7. Business rules

1.  There is no public sign-up. Devenir partenaire opens WhatsApp, phone or social contact.
2.  Prices and zones shown on the site always come from the platform settings.
3.  Every promise on the page must be true in daily operations.
4.  Anyone with a parcel code can see its public status; no personal data is ever shown.
5.  Public statuses are the simplified labels of section 4.2.
6.  The site is fully available in French and Arabic, with right-to-left layout for Arabic.

## 8. Out of scope for version 1

| Item                                                       | Reason                                         |
| ---------------------------------------------------------- | ---------------------------------------------- |
| Sign-up form                                               | Accounts are created by the admin              |
| Live chat widget                                           | Contact goes through WhatsApp and phone        |
| Blog                                                       | Later, if useful for search                    |
| Customer notifications (SMS / WhatsApp) about their parcel | Not in the platform scope; tracking is by code |
| English version                                            | French and Arabic only                         |

## 9. Decisions log

| #   | Question                                  | Decision                                                                                                                                                                         |
| --- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Show prices publicly?                     | Yes, from Paramètres.                                                                                                                                                            |
| 2   | Public parcel tracking?                   | Yes, by parcel code, without personal data.                                                                                                                                      |
| 3   | Languages                                 | French and Arabic.                                                                                                                                                               |
| 4   | Are pickups free for sellers?             | Free from 5 parcels; 2,000 DT below 5.                                                                                                                                           |
| 5   | Meta Pixel on the site?                   | **TO CONFIRM** Yes, to measure the ads.                                                                                                                                          |
| 6   | A delivery the customer himself postponed | Shown as **Livraison reportée** with the date he asked for, not as "le vendeur va vous contacter": he is expecting his parcel, not a call. The reason text is never shown (D-9). |
