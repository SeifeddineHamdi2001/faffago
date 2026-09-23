# Faffa Go — géographie : draft for review

Status: **draft, not approved.** Nothing in this file goes into the seed until
it is approved. Written 2026-09-23 on branch `phase-2-seed`.

> **Already in the seed.** `apps/api/prisma/seed.ts` on `main` has carried a
> Grand Tunis list since phase 0: the same 49 délégations and the same codes as
> below, with some of the spellings this review questions. It is left untouched
> until this table is approved; the corrections are then applied in one commit.
> The seed upserts by code, so a corrected name replaces the old one in place.

## 1. How to read the table

- **Scope**: the four gouvernorats of Grand Tunis — Tunis, Ariana, Ben Arous,
  Manouba. Others are added later from Paramètres.
- **Codes are ours, not INS.** I do not know the INS délégation codes with
  certainty, so every code below is a stable code of our own:
  `<gouvernorat>-<short name>`. It is what a seller can type in the CSV instead
  of a name (Q5), so it is readable on purpose. It never changes, even if a
  name is corrected.
- **Official gouvernorat codes, for reference only (not stored).** I believe
  the INS and ISO 3166-2:TN codes are Tunis **11** (TN-11), Ariana **12**
  (TN-12), Ben Arous **13** (TN-13), Manouba **14** (TN-14). High confidence,
  but please check before we rely on them anywhere.
- **À vérifier** marks every name or code I am not fully sure of; the note says
  what exactly. An empty cell means I am confident.
- **Arabic**: the standard administrative spellings as I know them. None has
  been read by a native speaker yet, and the public site shows them to
  customers (landing 2.6).

## 2. Gouvernorats

| Gouvernorat | Code | Nom FR    | Nom AR  | À vérifier | Note                                |
| ----------- | ---- | --------- | ------- | ---------- | ----------------------------------- |
| Tunis       | TUN  | Tunis     | تونس    |            |                                     |
| Ariana      | ARI  | Ariana    | أريانة  | FR         | Official form may be « L'Ariana »   |
| Ben Arous   | BEN  | Ben Arous | بن عروس |            |                                     |
| Manouba     | MAN  | Manouba   | منوبة   | FR         | Official form may be « La Manouba » |

## 3. Délégations — 49 in total

### Tunis — 21

| Gouvernorat | Code             | Nom FR              | Nom AR         | À vérifier | Note                                                                       |
| ----------- | ---------------- | ------------------- | -------------- | ---------- | -------------------------------------------------------------------------- |
| Tunis       | TUN-MEDINA       | La Médina           | المدينة        | FR         | Seed has « Médina »; official form likely « La Médina »                    |
| Tunis       | TUN-BABBHAR      | Bab El Bhar         | باب بحر        | FR, AR     | Seed has « Bab Bhar ». AR seen as باب بحر and باب البحر                    |
| Tunis       | TUN-BABSOUIKA    | Bab Souika          | باب سويقة      |            |                                                                            |
| Tunis       | TUN-SIDIBECHIR   | Sidi El Béchir      | سيدي البشير    |            |                                                                            |
| Tunis       | TUN-JEBELJELLOUD | Djebel Jelloud      | جبل الجلود     | FR         | Also written « Jebel Jelloud »                                             |
| Tunis       | TUN-OUARDIA      | El Ouardia          | الوردية        |            |                                                                            |
| Tunis       | TUN-KABARIA      | El Kabaria          | الكبارية       | AR         | **Correction**: seed has القبارية; I believe the official form is الكبارية |
| Tunis       | TUN-SIJOUMI      | Séjoumi             | السيجومي       | FR         | Seed has « Essijoumi »; also « Sijoumi »                                   |
| Tunis       | TUN-HRAIRIA      | El Hrairia          | الحرايرية      |            |                                                                            |
| Tunis       | TUN-SIDIHASSINE  | Sidi Hassine        | سيدي حسين      |            |                                                                            |
| Tunis       | TUN-ZOUHOUR      | Ezzouhour           | الزهور         |            |                                                                            |
| Tunis       | TUN-TAHRIR       | Ettahrir            | التحرير        |            |                                                                            |
| Tunis       | TUN-BARDO        | Le Bardo            | باردو          |            |                                                                            |
| Tunis       | TUN-OMRANE       | El Omrane           | العمران        |            |                                                                            |
| Tunis       | TUN-OMRANESUP    | El Omrane Supérieur | العمران الأعلى |            |                                                                            |
| Tunis       | TUN-ELKHADRA     | Cité El Khadra      | حي الخضراء     |            |                                                                            |
| Tunis       | TUN-MENZAH       | El Menzah           | المنزه         |            |                                                                            |
| Tunis       | TUN-GOULETTE     | La Goulette         | حلق الوادي     |            |                                                                            |
| Tunis       | TUN-KRAM         | Le Kram             | الكرم          |            |                                                                            |
| Tunis       | TUN-CARTHAGE     | Carthage            | قرطاج          |            |                                                                            |
| Tunis       | TUN-MARSA        | La Marsa            | المرسى         |            |                                                                            |

### Ariana — 7

| Gouvernorat | Code           | Nom FR             | Nom AR         | À vérifier | Note                                                     |
| ----------- | -------------- | ------------------ | -------------- | ---------- | -------------------------------------------------------- |
| Ariana      | ARI-VILLE      | Ariana Ville       | أريانة المدينة |            |                                                          |
| Ariana      | ARI-SOUKRA     | La Soukra          | سكرة           | AR         | Seen as سكرة and السكرة                                  |
| Ariana      | ARI-RAOUED     | Raoued             | رواد           |            |                                                          |
| Ariana      | ARI-KALAAT     | Kalâat el-Andalous | قلعة الأندلس   | FR         | Also « Kalaat El Andalous », « Qalaat al-Andalus »       |
| Ariana      | ARI-SIDITHABET | Sidi Thabet        | سيدي ثابت      |            |                                                          |
| Ariana      | ARI-TADHAMEN   | Cité Ettadhamen    | حي التضامن     | FR, AR     | Seed has « Ettadhamen » / التضامن, without « Cité » / حي |
| Ariana      | ARI-MNIHLA     | Mnihla             | المنيهلة       | AR         | Seed has منيهلة, without the article                     |

### Ben Arous — 12

| Gouvernorat | Code             | Nom FR                | Nom AR          | À vérifier | Note                                              |
| ----------- | ---------------- | --------------------- | --------------- | ---------- | ------------------------------------------------- |
| Ben Arous   | BEN-VILLE        | Ben Arous             | بن عروس         |            | Same name as its gouvernorat                      |
| Ben Arous   | BEN-MEDINAJEDIDA | La Nouvelle Médina    | المدينة الجديدة | FR         | Seed has « Nouvelle Médina », without the article |
| Ben Arous   | BEN-MOUROUJ      | El Mourouj            | المروج          |            |                                                   |
| Ben Arous   | BEN-BOUMHEL      | Bou Mhel el-Bassatine | بومهل البساتين  | FR         | Also « Boumhel El Bassatine »                     |
| Ben Arous   | BEN-EZZAHRA      | Ezzahra               | الزهراء         |            |                                                   |
| Ben Arous   | BEN-HAMMAMLIF    | Hammam Lif            | حمام الأنف      |            |                                                   |
| Ben Arous   | BEN-HAMMAMCHOTT  | Hammam Chott          | حمام الشط       |            |                                                   |
| Ben Arous   | BEN-RADES        | Radès                 | رادس            |            |                                                   |
| Ben Arous   | BEN-MEGRINE      | Mégrine               | مقرين           |            |                                                   |
| Ben Arous   | BEN-MOHAMEDIA    | Mohamedia             | المحمدية        |            |                                                   |
| Ben Arous   | BEN-FOUCHANA     | Fouchana              | فوشانة          |            |                                                   |
| Ben Arous   | BEN-MORNAG       | Mornag                | مرناق           |            |                                                   |

### Manouba — 9

| Gouvernorat | Code            | Nom FR       | Nom AR      | À vérifier | Note                          |
| ----------- | --------------- | ------------ | ----------- | ---------- | ----------------------------- |
| Manouba     | MAN-VILLE       | La Manouba   | منوبة       | FR         | « Manouba » or « La Manouba » |
| Manouba     | MAN-DENDEN      | Den Den      | دندان       |            |                               |
| Manouba     | MAN-DOUARHICHER | Douar Hicher | دوار هيشر   |            |                               |
| Manouba     | MAN-OUEDELLIL   | Oued Ellil   | وادي الليل  |            |                               |
| Manouba     | MAN-MORNAGUIA   | Mornaguia    | المرناقية   |            |                               |
| Manouba     | MAN-BORJAMRI    | Borj El Amri | برج العامري |            |                               |
| Manouba     | MAN-DJEDEIDA    | Djedeida     | الجديدة     | FR         | Also « Jedeida »              |
| Manouba     | MAN-TEBOURBA    | Tebourba     | طبربة       |            |                               |
| Manouba     | MAN-BATTAN      | El Battan    | البطان      |            |                               |

## 4. Is the list current?

- **The count, 21 + 7 + 12 + 9 = 49, is the one I am confident of.** The
  délégations created by splitting older ones (Sidi Hassine, Ettahrir,
  Ezzouhour, El Omrane Supérieur, Cité Ettadhamen, Mnihla, El Mourouj, Bou Mhel
  el-Bassatine and others) all appear above.
- **I don't know of any change after about 2020 in these four gouvernorats**, but
  new délégations are created by decree and my information may be out of date.
  Please check against the latest INS list or the Journal Officiel. If one was
  split, the admin adds the new délégation from Paramètres; the existing code
  stays for the part that keeps the name.
- **Communes are not délégations.** The communes created from 2015 onwards
  (and neighbourhoods such as Ennasr, El Manar, Les Berges du Lac, L'Aouina)
  are not in this list. A seller who types one will get a row error in the CSV
  preview (Q5); this is how the spec wants it, but expect it to come up.

## 5. Zones — proposal, for you to decide

**The schema already allows one courier to hold several zones** (a zone has one
titular and one backup per role, but a courier can be titular of several
zones). So I propose drawing **small zones once**, sized for one livreur each
at full volume, and at launch giving one livreur several neighbouring zones.
As the team grows, you re-assign zones instead of redrawing them — and the
Activité report per zone keeps meaning the same thing over time.

**What the grouping is based on.** Neighbouring délégations and the road links
between them, and how dense each area is. I have **no parcel volumes** and I
have not used population figures (I don't know them precisely enough to cite).
"Balanced" here is my judgement of density and distance, to be corrected by
the Activité report after the first weeks.

Zones may cross a gouvernorat border when the délégations are neighbours; the
spec groups délégations, not gouvernorats.

| #   | Zone (proposed name)      | Délégations                                               | Why                                                                                                                                     |
| --- | ------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Tunis Centre              | La Médina, Bab El Bhar, Bab Souika, Sidi El Béchir        | Compact, very dense, short distances but slow traffic and parking; four small délégations make one day's work                           |
| 2   | Banlieue Nord             | La Goulette, Le Kram, Carthage, La Marsa                  | One coastal line along the TGM; Carthage alone is light, so it rides with its neighbours                                                |
| 3   | Tunis Nord                | El Menzah, Cité El Khadra, El Omrane, El Omrane Supérieur | Contiguous north of the centre, dense residential                                                                                       |
| 4   | Tunis Ouest               | Le Bardo, Ettahrir, Ezzouhour                             | Contiguous west side; Le Bardo is the busy one                                                                                          |
| 5   | Tunis Sud-Ouest           | Séjoumi, El Hrairia, Sidi Hassine                         | Large and very populous; **may need two livreurs** on its own                                                                           |
| 6   | Tunis Sud                 | El Ouardia, El Kabaria, Djebel Jelloud                    | Contiguous south of the centre, towards Ben Arous                                                                                       |
| 7   | Ariana Centre             | Ariana Ville, La Soukra                                   | Dense and growing, many online shoppers; La Soukra is large                                                                             |
| 8   | Ettadhamen – Douar Hicher | Cité Ettadhamen, Mnihla, Douar Hicher                     | Three very dense popular délégations side by side across the Ariana / Manouba border; one livreur covers them without crossing the city |
| 9   | Ariana Nord               | Raoued, Kalâat el-Andalous, Sidi Thabet                   | Spread out, lighter volume, long distances                                                                                              |
| 10  | Ben Arous Centre          | Ben Arous, La Nouvelle Médina, Mégrine, Radès             | Contiguous, dense, on the main southern axis                                                                                            |
| 11  | El Mourouj                | El Mourouj, Bou Mhel el-Bassatine                         | El Mourouj is one of the largest cities of Grand Tunis; Bou Mhel sits between it and the coast                                          |
| 12  | Ben Arous Côte            | Ezzahra, Hammam Lif, Hammam Chott                         | One coastal line south of Radès                                                                                                         |
| 13  | Ben Arous Sud             | Fouchana, Mohamedia, Mornag                               | Semi-rural, spread out, lighter volume                                                                                                  |
| 14  | Manouba Est               | La Manouba, Den Den, Oued Ellil                           | Contiguous, next to Le Bardo; urban                                                                                                     |
| 15  | Manouba Ouest             | Mornaguia, Borj El Amri, Djedeida, Tebourba, El Battan    | Rural and far apart; low volume but long runs — the hardest zone to staff                                                               |

All 49 délégations appear exactly once.

**At launch, with few livreurs** — an example, not a decision. Each livreur
holds neighbouring zones:

| Livreur | Zones                                                                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| A       | 1 Tunis Centre + 6 Tunis Sud                                                                                                         |
| B       | 3 Tunis Nord + 4 Tunis Ouest                                                                                                         |
| C       | 5 Tunis Sud-Ouest                                                                                                                    |
| D       | 2 Banlieue Nord + 7 Ariana Centre                                                                                                    |
| E       | 8 Ettadhamen – Douar Hicher + 14 Manouba Est                                                                                         |
| F       | 10 Ben Arous Centre + 11 El Mourouj + 12 Ben Arous Côte                                                                              |
| —       | 9, 13, 15: the outer zones, each held by the livreur of the nearest dense zone (9 → D, 13 → F, 15 → E) on the days they have parcels |

Ramasseurs work from sellers' pickup addresses, far fewer stops, so one
ramasseur will likely hold many zones at first — the same zones serve both
roles (Admin 4.5).

**Questions for you on zones**

1. Small zones re-assigned as the team grows (above), or larger zones that
   are redrawn later?
2. Should zones stay inside one gouvernorat? Zone 8 is the only one crossing a
   border.
3. The zone names are placeholders; they appear in the back office only.

## 6. Decisions requested

- [ ] Every row marked **À vérifier** checked, with the correct spelling.
- [ ] Our own codes accepted (`TUN-MARSA` style), or a different scheme.
- [ ] The list of 49 confirmed as current.
- [ ] The zones: grouping, and whether the seed creates them (the seed today
      creates none, on purpose — Admin 4.16 says the admin sets them).
