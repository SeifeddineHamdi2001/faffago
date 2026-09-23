import { normalizeForMatch, resolveDelegation, type DelegationRecord } from './geo.js';
import { Langue } from './statuses.js';

/**
 * Localités, the third level under the délégation (D-17): which name to show,
 * the search box of the parcel form, and the CSV import.
 *
 * The browser and the server run exactly these functions, so the import
 * preview and the server never disagree about a row.
 */

export interface LocaliteRecord {
  id: string;
  nameFr: string;
  /** Optional: empty means every screen shows the French name. */
  nameAr: string | null;
  postalCode: string | null;
  /** Other spellings and postal codes a seller or a customer may use. */
  aliases: readonly string[];
  /** The "Autre" row of its délégation, for places not in the list yet. */
  isOther: boolean;
  delegation: DelegationRecord;
}

/** The courier app and the public site follow the language; Arabic falls back to French. */
export function localiteNameFor(localite: LocaliteRecord, langue: Langue): string {
  return langue === Langue.AR && localite.nameAr ? localite.nameAr : localite.nameFr;
}

function namesOf(localite: LocaliteRecord): string[] {
  return [localite.nameFr, ...localite.aliases];
}

/**
 * The names (and aliases) found in more than one délégation, normalized.
 * Computed from the list rather than stored, so a localité the admin adds
 * makes a name ambiguous at once (D-17).
 */
export function ambiguousLocaliteNames(localites: readonly LocaliteRecord[]): ReadonlySet<string> {
  const delegationsByName = new Map<string, Set<string>>();
  for (const localite of localites) {
    if (localite.isOther) continue;
    for (const name of namesOf(localite)) {
      const key = normalizeForMatch(name);
      let delegations = delegationsByName.get(key);
      if (!delegations) {
        delegations = new Set();
        delegationsByName.set(key, delegations);
      }
      delegations.add(localite.delegation.id);
    }
  }
  return new Set(
    [...delegationsByName].filter(([, delegations]) => delegations.size > 1).map(([name]) => name),
  );
}

/** A name found in two délégations always carries its délégation (D-17). */
export function localiteLabel(
  localite: LocaliteRecord,
  ambiguousNames: ReadonlySet<string>,
): string {
  return ambiguousNames.has(normalizeForMatch(localite.nameFr))
    ? `${localite.nameFr} — ${localite.delegation.nameFr}`
    : localite.nameFr;
}

/** "Cité Ennasr 1 — Ariana Ville, Ariana": a search result fills all three fields. */
export function localiteFullLabel(localite: LocaliteRecord): string {
  return `${localite.nameFr} — ${localite.delegation.nameFr}, ${localite.delegation.gouvernoratNameFr}`;
}

function compareLocalites(a: LocaliteRecord, b: LocaliteRecord): number {
  if (a.isOther !== b.isOther) return a.isOther ? 1 : -1;
  return (
    a.nameFr.localeCompare(b.nameFr, 'fr') ||
    a.delegation.nameFr.localeCompare(b.delegation.nameFr, 'fr')
  );
}

// ── Search ──────────────────────────────────────────────────

export interface LocaliteSearchHit {
  localite: LocaliteRecord;
  label: string;
  /** Set when the hit came from an alias rather than the name itself. */
  matchedAlias?: string;
}

/** 0 exact, 1 starts with, 2 a word starts with, 3 contains; null when no match. */
function matchScore(candidate: string, needle: string): number | null {
  const value = normalizeForMatch(candidate);
  if (value === needle) return 0;
  if (value.startsWith(needle)) return 1;
  if (value.includes(` ${needle}`)) return 2;
  if (value.includes(needle)) return 3;
  return null;
}

/**
 * The search box of the parcel form and the pickup address: one field across
 * every localité, its Arabic name, its aliases and its postal code.
 *
 * The Autre rows stay out of the results: a seller reaches them through the
 * gouvernorat → délégation → localité lists, where they are last.
 */
export function searchLocalites(
  query: string,
  localites: readonly LocaliteRecord[],
  options: { limit?: number } = {},
): LocaliteSearchHit[] {
  const needle = normalizeForMatch(query);
  if (needle.length < 2) return [];

  const scored: Array<{ hit: LocaliteSearchHit; score: number }> = [];
  for (const localite of localites) {
    if (localite.isOther) continue;

    let best: { score: number; alias?: string } | null = null;
    const consider = (candidate: string | null, alias?: string) => {
      if (!candidate) return;
      const score = matchScore(candidate, needle);
      if (score !== null && (best === null || score < best.score)) best = { score, alias };
    };
    consider(localite.nameFr);
    consider(localite.nameAr);
    if (localite.postalCode === query.trim()) consider(localite.postalCode);
    for (const alias of localite.aliases) consider(alias, alias);

    const found = best as { score: number; alias?: string } | null;
    if (found) {
      const hit: LocaliteSearchHit = { localite, label: localiteFullLabel(localite) };
      if (found.alias !== undefined) hit.matchedAlias = found.alias;
      scored.push({ hit, score: found.score });
    }
  }

  scored.sort((a, b) => a.score - b.score || compareLocalites(a.hit.localite, b.hit.localite));
  return scored.slice(0, options.limit ?? 20).map(({ hit }) => hit);
}

// ── CSV import ──────────────────────────────────────────────

export const LocaliteLookupError = {
  LOCALITE_MANQUANTE: 'LOCALITE_MANQUANTE',
  LOCALITE_INCONNUE: 'LOCALITE_INCONNUE',
  LOCALITE_AMBIGUE: 'LOCALITE_AMBIGUE',
  DELEGATION_INCONNUE: 'DELEGATION_INCONNUE',
  DELEGATION_AMBIGUE: 'DELEGATION_AMBIGUE',
} as const;
export type LocaliteLookupError = (typeof LocaliteLookupError)[keyof typeof LocaliteLookupError];

export type LocaliteLookup =
  | { ok: true; localite: LocaliteRecord }
  | {
      ok: false;
      error: LocaliteLookupError;
      message: string;
      /** The délégation, when the row settled it. */
      delegation?: DelegationRecord;
      /**
       * What the preview's dropdown offers so the seller fixes the row on the
       * spot instead of re-uploading the file (D-17): the candidates of an
       * ambiguous name, or every localité of the délégation, Autre last.
       */
      options: LocaliteRecord[];
    };

export interface LocaliteQuery {
  localite?: string | null;
  /** A code, a French or an Arabic name. Required only to settle an ambiguous name. */
  delegation?: string | null;
  gouvernorat?: string | null;
}

function delegationsOf(localites: readonly LocaliteRecord[]): DelegationRecord[] {
  const byId = new Map<string, DelegationRecord>();
  for (const localite of localites) byId.set(localite.delegation.id, localite.delegation);
  return [...byId.values()];
}

function matchesGouvernorat(delegation: DelegationRecord, gouvernorat: string): boolean {
  const needle = normalizeForMatch(gouvernorat);
  return (
    delegation.gouvernoratCode.toLowerCase() === gouvernorat.trim().toLowerCase() ||
    normalizeForMatch(delegation.gouvernoratNameFr) === needle ||
    normalizeForMatch(delegation.gouvernoratNameAr) === needle
  );
}

/**
 * Resolves the localité of a CSV row (D-17, refining Q5).
 *
 * A name or an alias that exists once is enough. A name found in several
 * places needs the délégation (or a gouvernorat that settles it). Unknown,
 * ambiguous or missing is a row error, never a guess, and the error carries
 * the list the preview offers in its dropdown.
 */
export function resolveLocalite(
  query: LocaliteQuery,
  localites: readonly LocaliteRecord[],
): LocaliteLookup {
  let delegation: DelegationRecord | undefined;
  const delegationText = query.delegation?.trim();
  if (delegationText) {
    const found = resolveDelegation(
      { delegation: delegationText, gouvernorat: query.gouvernorat },
      delegationsOf(localites),
    );
    if (!found.ok) {
      return {
        ok: false,
        error:
          found.error === 'AMBIGU'
            ? LocaliteLookupError.DELEGATION_AMBIGUE
            : LocaliteLookupError.DELEGATION_INCONNUE,
        message: found.message,
        options: [],
      };
    }
    delegation = found.delegation;
  }

  const inDelegation = (id: string) =>
    localites.filter((localite) => localite.delegation.id === id).sort(compareLocalites);
  const withDelegation = (
    error: LocaliteLookupError,
    message: string,
    options: LocaliteRecord[],
  ): LocaliteLookup =>
    delegation
      ? { ok: false, error, message, delegation, options }
      : { ok: false, error, message, options };

  const raw = query.localite?.trim() ?? '';
  if (raw === '') {
    return withDelegation(
      LocaliteLookupError.LOCALITE_MANQUANTE,
      'Localité obligatoire',
      delegation ? inDelegation(delegation.id) : [],
    );
  }

  const needle = normalizeForMatch(raw);
  let matches = localites.filter((localite) =>
    [...namesOf(localite), localite.nameAr ?? ''].some(
      (name) => normalizeForMatch(name) === needle,
    ),
  );
  if (delegation) {
    const id = delegation.id;
    matches = matches.filter((localite) => localite.delegation.id === id);
  } else if (query.gouvernorat?.trim()) {
    const gouvernorat = query.gouvernorat;
    matches = matches.filter((localite) => matchesGouvernorat(localite.delegation, gouvernorat));
  }
  matches.sort(compareLocalites);

  if (matches.length === 1) return { ok: true, localite: matches[0]! };

  if (matches.length === 0) {
    return withDelegation(
      LocaliteLookupError.LOCALITE_INCONNUE,
      delegation
        ? `Localité inconnue à ${delegation.nameFr} : « ${raw} »`
        : `Localité inconnue : « ${raw} »`,
      delegation ? inDelegation(delegation.id) : [],
    );
  }

  const delegationNames = [...new Set(matches.map((localite) => localite.delegation.nameFr))];
  const message =
    delegationNames.length > 1
      ? `« ${raw} » existe dans plusieurs délégations (${delegationNames.join(', ')}). ` +
        'Précisez la délégation.'
      : `« ${raw} » correspond à plusieurs localités ` +
        `(${matches.map((localite) => localite.nameFr).join(', ')}). Choisissez la bonne.`;
  return withDelegation(LocaliteLookupError.LOCALITE_AMBIGUE, message, matches);
}
