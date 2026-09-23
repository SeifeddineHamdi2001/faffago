import { Langue } from './statuses.js';

/**
 * Gouvernorats and délégations: which name to show, and how to find one from
 * what a seller typed into a CSV cell.
 */

export interface NamedPlace {
  code: string;
  nameFr: string;
  nameAr: string;
}

export interface DelegationRecord extends NamedPlace {
  id: string;
  gouvernoratCode: string;
  gouvernoratNameFr: string;
  gouvernoratNameAr: string;
}

/**
 * Where each interface takes its place names from (Q4).
 *
 * The seller space, the back office, the CSV template and every PDF are French
 * only, so they always read `nameFr`. Only the public site and the courier app
 * ever show Arabic: the public site follows the locale in the URL, the courier
 * app follows the language on his account.
 */
export function delegationNameFor(place: NamedPlace, langue: Langue): string {
  return langue === Langue.AR ? place.nameAr : place.nameFr;
}

/** The seller space, the back office, the labels and the PDFs (Q6). */
export function delegationNameFrench(place: NamedPlace): string {
  return place.nameFr;
}

/**
 * Folds a name down to something two spellings of it agree on: no case, no
 * accents, no Arabic diacritics, single spaces, no leading article.
 *
 * "LE BARDO", "le bardo" and "Le  Bardo" all match, and so do "أريانة" and
 * "اريانة", which differ only by the hamza a phone keyboard may or may not
 * produce.
 */
export function normalizeForMatch(input: string): string {
  return (
    String(input)
      .trim()
      .toLowerCase()
      // Split accented Latin letters into letter + accent, then drop the accent.
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      // Arabic short vowels, tatweel, and the hamza marks that NFD has just
      // split off an alef: أ becomes bare alef plus U+0654, so the range has to
      // reach past U+0652 or the two spellings of أريانة stay different.
      .replace(/[ً-ٕـ]/g, '')
      // Any alef form NFD left composed, plus the two spellings of the final ya.
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/[-_']/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^(le |la |les |el |al )/, '')
      .trim()
  );
}

export const DelegationLookupError = {
  INTROUVABLE: 'INTROUVABLE',
  AMBIGU: 'AMBIGU',
} as const;
export type DelegationLookupError =
  (typeof DelegationLookupError)[keyof typeof DelegationLookupError];

export type DelegationLookup =
  | { ok: true; delegation: DelegationRecord }
  | { ok: false; error: DelegationLookupError; message: string; candidates: string[] };

export interface DelegationQuery {
  /** What the CSV cell held: a code, a French name or an Arabic name. */
  delegation: string;
  /** Optional, but required to disambiguate a name shared by two gouvernorats. */
  gouvernorat?: string | null;
}

/**
 * Resolves the délégation of a CSV row (Q5).
 *
 * A code alone is enough. A name is matched case- and accent-insensitively, in
 * French or in Arabic; because names repeat across gouvernorats, a name that
 * matches more than one délégation is an error on that row rather than a guess,
 * and the preview shows which gouvernorats it could have meant.
 */
export function resolveDelegation(
  query: DelegationQuery,
  delegations: readonly DelegationRecord[],
): DelegationLookup {
  const raw = String(query.delegation ?? '').trim();
  if (raw === '') {
    return {
      ok: false,
      error: DelegationLookupError.INTROUVABLE,
      message: 'Délégation obligatoire',
      candidates: [],
    };
  }

  const byCode = delegations.find(
    (delegation) => delegation.code.toLowerCase() === raw.toLowerCase(),
  );
  if (byCode) return { ok: true, delegation: byCode };

  const needle = normalizeForMatch(raw);
  let matches = delegations.filter(
    (delegation) =>
      normalizeForMatch(delegation.nameFr) === needle ||
      normalizeForMatch(delegation.nameAr) === needle,
  );

  const gouvernorat = query.gouvernorat?.trim();
  if (gouvernorat) {
    const gouvernoratNeedle = normalizeForMatch(gouvernorat);
    matches = matches.filter(
      (delegation) =>
        delegation.gouvernoratCode.toLowerCase() === gouvernorat.toLowerCase() ||
        normalizeForMatch(delegation.gouvernoratNameFr) === gouvernoratNeedle ||
        normalizeForMatch(delegation.gouvernoratNameAr) === gouvernoratNeedle,
    );
  }

  if (matches.length === 1) return { ok: true, delegation: matches[0]! };

  if (matches.length === 0) {
    return {
      ok: false,
      error: DelegationLookupError.INTROUVABLE,
      message: `Délégation inconnue : « ${raw} »`,
      candidates: [],
    };
  }

  const candidates = matches.map((delegation) => delegation.gouvernoratNameFr);
  return {
    ok: false,
    error: DelegationLookupError.AMBIGU,
    message:
      `« ${raw} » existe dans plusieurs gouvernorats (${candidates.join(', ')}). ` +
      'Ajoutez le gouvernorat ou utilisez le code de la délégation.',
    candidates,
  };
}
