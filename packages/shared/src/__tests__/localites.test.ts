import { describe, expect, it } from 'vitest';
import type { DelegationRecord } from '../geo.js';
import {
  LocaliteLookupError,
  ambiguousLocaliteNames,
  localiteFullLabel,
  localiteLabel,
  localiteNameFor,
  resolveLocalite,
  searchLocalites,
  type LocaliteRecord,
} from '../localites.js';
import { Langue } from '../statuses.js';

/**
 * Localités, the third level under the délégation (D-17): which name to show,
 * the search box of the parcel form, and the CSV import.
 */

const ARIANA_VILLE: DelegationRecord = {
  id: 'd-ari',
  code: 'ARI-VILLE',
  nameFr: 'Ariana Ville',
  nameAr: 'أريانة المدينة',
  gouvernoratCode: 'ARI',
  gouvernoratNameFr: 'Ariana',
  gouvernoratNameAr: 'أريانة',
};
const MOUROUJ: DelegationRecord = {
  id: 'd-mou',
  code: 'BEN-MOUROUJ',
  nameFr: 'El Mourouj',
  nameAr: 'المروج',
  gouvernoratCode: 'BEN',
  gouvernoratNameFr: 'Ben Arous',
  gouvernoratNameAr: 'بن عروس',
};
const MARSA: DelegationRecord = {
  id: 'd-mar',
  code: 'TUN-MARSA',
  nameFr: 'La Marsa',
  nameAr: 'المرسى',
  gouvernoratCode: 'TUN',
  gouvernoratNameFr: 'Tunis',
  gouvernoratNameAr: 'تونس',
};
const SIDI_BECHIR: DelegationRecord = {
  id: 'd-sb',
  code: 'TUN-SIDIBECHIR',
  nameFr: 'Sidi El Béchir',
  nameAr: 'سيدي البشير',
  gouvernoratCode: 'TUN',
  gouvernoratNameFr: 'Tunis',
  gouvernoratNameAr: 'تونس',
};

let n = 0;
function localite(
  delegation: DelegationRecord,
  nameFr: string,
  extra: Partial<Omit<LocaliteRecord, 'delegation' | 'nameFr'>> = {},
): LocaliteRecord {
  n += 1;
  return {
    id: `l-${n}`,
    nameFr,
    nameAr: null,
    postalCode: null,
    aliases: [],
    isOther: false,
    ...extra,
    delegation,
  };
}

const ENNASR_ARIANA = localite(ARIANA_VILLE, 'Cité Ennasr 1', {
  postalCode: '2037',
  aliases: ['Cite Ennasr 1', 'Ennasr 1', 'Nasr 1'],
});
const ENNASR_2_ARIANA = localite(ARIANA_VILLE, 'Cité Ennasr 2', {
  postalCode: '2037',
  aliases: ['Cite Ennasr 2', 'Ennasr 2', 'Nasr 2'],
});
const ENNASR_MOUROUJ = localite(MOUROUJ, 'Cité Ennasr 1', {
  postalCode: '2074',
  aliases: ['Cite Ennasr 1'],
});
const MENZAH_6 = localite(ARIANA_VILLE, 'El Menzah 6', { postalCode: '2091' });
const AIN_ZAGHOUAN_NORD = localite(MARSA, 'Ain Zaghouan Nord', { aliases: ['Ain Zaghouan'] });
const AIN_ZAGHOUAN_SUD = localite(MARSA, 'Ain Zaghouan Sud', { aliases: ['Ain Zaghouan'] });
const MAAKEL = localite(SIDI_BECHIR, 'Maakel Ezzaïm', {
  nameAr: 'معقل الزعيم',
  postalCode: '1008',
});
const AUTRE_ARIANA = localite(ARIANA_VILLE, 'Autre', { nameAr: 'أخرى', isOther: true });
const AUTRE_MOUROUJ = localite(MOUROUJ, 'Autre', { nameAr: 'أخرى', isOther: true });
const AUTRE_MARSA = localite(MARSA, 'Autre', { nameAr: 'أخرى', isOther: true });

const LOCALITES: LocaliteRecord[] = [
  ENNASR_ARIANA,
  ENNASR_2_ARIANA,
  ENNASR_MOUROUJ,
  MENZAH_6,
  AIN_ZAGHOUAN_NORD,
  AIN_ZAGHOUAN_SUD,
  MAAKEL,
  AUTRE_ARIANA,
  AUTRE_MOUROUJ,
  AUTRE_MARSA,
];

describe('localiteNameFor (D-17, Q4)', () => {
  it('shows the Arabic name when there is one', () => {
    expect(localiteNameFor(MAAKEL, Langue.AR)).toBe('معقل الزعيم');
  });

  it('falls back to the French name when the Arabic one is empty', () => {
    expect(localiteNameFor(MENZAH_6, Langue.AR)).toBe('El Menzah 6');
  });

  it('shows the French name to a French interface', () => {
    expect(localiteNameFor(MAAKEL, Langue.FR)).toBe('Maakel Ezzaïm');
  });
});

describe('ambiguity is computed, not stored', () => {
  const ambiguous = ambiguousLocaliteNames(LOCALITES);

  it('marks a name found in two délégations', () => {
    expect(localiteLabel(ENNASR_ARIANA, ambiguous)).toBe('Cité Ennasr 1 — Ariana Ville');
    expect(localiteLabel(ENNASR_MOUROUJ, ambiguous)).toBe('Cité Ennasr 1 — El Mourouj');
  });

  it('shows a name unique to its délégation on its own', () => {
    expect(localiteLabel(MENZAH_6, ambiguous)).toBe('El Menzah 6');
    // Two localités of the same délégation share an alias: not ambiguous
    // across délégations, so their own names are enough.
    expect(localiteLabel(AIN_ZAGHOUAN_NORD, ambiguous)).toBe('Ain Zaghouan Nord');
  });

  it('never counts the Autre rows, which every délégation has', () => {
    expect(localiteLabel(AUTRE_ARIANA, ambiguous)).toBe('Autre');
  });

  it('gives search results their délégation and gouvernorat', () => {
    expect(localiteFullLabel(ENNASR_ARIANA)).toBe('Cité Ennasr 1 — Ariana Ville, Ariana');
  });
});

describe('searchLocalites: one box across localités and aliases', () => {
  it('proposes Cité Ennasr 1 for "Ennasr", with its délégation and gouvernorat', () => {
    const hits = searchLocalites('Ennasr', LOCALITES);
    // Ariana's two start with an alias ("Ennasr 1", "Ennasr 2"); El Mourouj's
    // only has the word inside its name, so it comes after them.
    expect(hits.map((hit) => hit.label)).toEqual([
      'Cité Ennasr 1 — Ariana Ville, Ariana',
      'Cité Ennasr 2 — Ariana Ville, Ariana',
      'Cité Ennasr 1 — El Mourouj, Ben Arous',
    ]);
    expect(hits[0]!.localite).toBe(ENNASR_ARIANA);
  });

  it('finds a localité by an alias, and says which one matched', () => {
    const [hit] = searchLocalites('nasr 2', LOCALITES);
    expect(hit!.localite).toBe(ENNASR_2_ARIANA);
    expect(hit!.matchedAlias).toBe('Nasr 2');
  });

  it('puts exact matches first', () => {
    const hits = searchLocalites('Ennasr 1', LOCALITES);
    expect(hits.slice(0, 2).map((hit) => hit.localite)).toEqual([ENNASR_ARIANA, ENNASR_MOUROUJ]);
  });

  it('ignores case and accents, and reads Arabic', () => {
    expect(searchLocalites('MAAKEL EZZAIM', LOCALITES)[0]!.localite).toBe(MAAKEL);
    expect(searchLocalites('معقل', LOCALITES)[0]!.localite).toBe(MAAKEL);
  });

  it('finds every localité of a postal code', () => {
    expect(searchLocalites('2037', LOCALITES).map((hit) => hit.localite)).toEqual([
      ENNASR_ARIANA,
      ENNASR_2_ARIANA,
    ]);
  });

  it('shows both localités that share the alias "Ain Zaghouan"', () => {
    expect(searchLocalites('Ain Zaghouan', LOCALITES).map((hit) => hit.localite)).toEqual([
      AIN_ZAGHOUAN_NORD,
      AIN_ZAGHOUAN_SUD,
    ]);
  });

  it('leaves the Autre rows out: they are chosen from the lists', () => {
    expect(searchLocalites('autre', LOCALITES)).toEqual([]);
  });

  it('waits for two characters', () => {
    expect(searchLocalites('e', LOCALITES)).toEqual([]);
  });

  it('stops at the limit', () => {
    expect(searchLocalites('cite', LOCALITES, { limit: 2 })).toHaveLength(2);
  });
});

describe('resolveLocalite: the CSV import (D-17, Q5)', () => {
  it('resolves a localité name that exists once', () => {
    const result = resolveLocalite({ localite: 'el menzah 6' }, LOCALITES);
    expect(result).toEqual({ ok: true, localite: MENZAH_6 });
  });

  it('resolves an alias', () => {
    expect(resolveLocalite({ localite: 'Nasr 2' }, LOCALITES)).toEqual({
      ok: true,
      localite: ENNASR_2_ARIANA,
    });
  });

  it('refuses an ambiguous name, naming the délégations it could be', () => {
    const result = resolveLocalite({ localite: 'Cité Ennasr 1' }, LOCALITES);
    expect(result).toMatchObject({
      ok: false,
      error: LocaliteLookupError.LOCALITE_AMBIGUE,
      options: [ENNASR_ARIANA, ENNASR_MOUROUJ],
    });
    expect(!result.ok && result.message).toContain('Ariana Ville');
    expect(!result.ok && result.message).toContain('El Mourouj');
  });

  it('accepts the ambiguous name once the délégation is given', () => {
    expect(
      resolveLocalite({ localite: 'Cité Ennasr 1', delegation: 'BEN-MOUROUJ' }, LOCALITES),
    ).toEqual({ ok: true, localite: ENNASR_MOUROUJ });
    expect(
      resolveLocalite({ localite: 'Cité Ennasr 1', delegation: 'Ariana Ville' }, LOCALITES),
    ).toEqual({ ok: true, localite: ENNASR_ARIANA });
  });

  it('accepts the ambiguous name with the gouvernorat alone when that settles it', () => {
    expect(
      resolveLocalite({ localite: 'Cité Ennasr 1', gouvernorat: 'Ben Arous' }, LOCALITES),
    ).toEqual({ ok: true, localite: ENNASR_MOUROUJ });
  });

  it('refuses an alias shared inside one délégation, offering both', () => {
    const result = resolveLocalite(
      { localite: 'Ain Zaghouan', delegation: 'TUN-MARSA' },
      LOCALITES,
    );
    expect(result).toMatchObject({
      ok: false,
      error: LocaliteLookupError.LOCALITE_AMBIGUE,
      options: [AIN_ZAGHOUAN_NORD, AIN_ZAGHOUAN_SUD],
    });
  });

  it('refuses an unknown localité, offering the délégation list to fix it on the spot', () => {
    const result = resolveLocalite(
      { localite: 'Quartier Inconnu', delegation: 'ARI-VILLE' },
      LOCALITES,
    );
    expect(result).toMatchObject({
      ok: false,
      error: LocaliteLookupError.LOCALITE_INCONNUE,
      delegation: ARIANA_VILLE,
    });
    // Every localité of Ariana Ville, Autre included and last.
    expect(!result.ok && result.options).toEqual([
      ENNASR_ARIANA,
      ENNASR_2_ARIANA,
      MENZAH_6,
      AUTRE_ARIANA,
    ]);
  });

  it('refuses a row with a délégation but no localité, with the dropdown list (D-17)', () => {
    const result = resolveLocalite({ localite: '', delegation: 'BEN-MOUROUJ' }, LOCALITES);
    expect(result).toMatchObject({
      ok: false,
      error: LocaliteLookupError.LOCALITE_MANQUANTE,
      message: 'Localité obligatoire',
      delegation: MOUROUJ,
      options: [ENNASR_MOUROUJ, AUTRE_MOUROUJ],
    });
  });

  it('refuses a row with neither', () => {
    expect(resolveLocalite({}, LOCALITES)).toMatchObject({
      ok: false,
      error: LocaliteLookupError.LOCALITE_MANQUANTE,
      options: [],
    });
  });

  it('refuses a localité that is not in the délégation given', () => {
    const result = resolveLocalite({ localite: 'El Menzah 6', delegation: 'TUN-MARSA' }, LOCALITES);
    expect(result).toMatchObject({ ok: false, error: LocaliteLookupError.LOCALITE_INCONNUE });
    expect(!result.ok && result.message).toBe('Localité inconnue à La Marsa : « El Menzah 6 »');
  });

  it('refuses an unknown délégation before looking at the localité', () => {
    const result = resolveLocalite(
      { localite: 'El Menzah 6', delegation: 'Nulle Part' },
      LOCALITES,
    );
    expect(result).toMatchObject({ ok: false, error: LocaliteLookupError.DELEGATION_INCONNUE });
  });

  it('accepts "Autre" when the délégation is given, and only then', () => {
    expect(resolveLocalite({ localite: 'Autre', delegation: 'TUN-MARSA' }, LOCALITES)).toEqual({
      ok: true,
      localite: AUTRE_MARSA,
    });
    expect(resolveLocalite({ localite: 'Autre' }, LOCALITES)).toMatchObject({
      ok: false,
      error: LocaliteLookupError.LOCALITE_AMBIGUE,
    });
  });
});
