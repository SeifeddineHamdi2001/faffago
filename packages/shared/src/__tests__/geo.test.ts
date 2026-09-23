import { describe, expect, it } from 'vitest';
import {
  DelegationLookupError,
  delegationNameFor,
  normalizeForMatch,
  resolveDelegation,
  type DelegationRecord,
} from '../geo.js';
import { Langue } from '../statuses.js';

function delegation(
  id: string,
  code: string,
  nameFr: string,
  nameAr: string,
  gouvernoratCode: string,
  gouvernoratNameFr: string,
  gouvernoratNameAr: string,
): DelegationRecord {
  return { id, code, nameFr, nameAr, gouvernoratCode, gouvernoratNameFr, gouvernoratNameAr };
}

const DELEGATIONS: DelegationRecord[] = [
  delegation('1', 'TUN-BARDO', 'Le Bardo', 'باردو', 'TUN', 'Tunis', 'تونس'),
  delegation('2', 'TUN-MARSA', 'La Marsa', 'المرسى', 'TUN', 'Tunis', 'تونس'),
  delegation('3', 'ARI-VILLE', 'Ariana Ville', 'أريانة المدينة', 'ARI', 'Ariana', 'أريانة'),
  delegation('4', 'BEN-EZZAHRA', 'Ezzahra', 'الزهراء', 'BEN', 'Ben Arous', 'بن عروس'),
  // A name that genuinely exists in two gouvernorats.
  delegation('5', 'TUN-MEDINA', 'Médina', 'المدينة', 'TUN', 'Tunis', 'تونس'),
  delegation('6', 'BEN-MEDINAJEDIDA', 'Médina', 'المدينة', 'BEN', 'Ben Arous', 'بن عروس'),
];

describe('delegationNameFor (Q4)', () => {
  const bardo = DELEGATIONS[0]!;

  it('gives the French name to a French interface', () => {
    expect(delegationNameFor(bardo, Langue.FR)).toBe('Le Bardo');
  });

  it('gives the Arabic name to an Arabic interface', () => {
    expect(delegationNameFor(bardo, Langue.AR)).toBe('باردو');
  });
});

describe('normalizeForMatch', () => {
  it('ignores case, accents and extra spaces', () => {
    expect(normalizeForMatch('MÉDINA')).toBe(normalizeForMatch('medina'));
    expect(normalizeForMatch('Le  Bardo')).toBe(normalizeForMatch('le bardo'));
    expect(normalizeForMatch('Béja')).toBe('beja');
  });

  it('ignores the article, so "Le Bardo" and "Bardo" match', () => {
    expect(normalizeForMatch('Le Bardo')).toBe(normalizeForMatch('Bardo'));
    expect(normalizeForMatch('La Marsa')).toBe(normalizeForMatch('Marsa'));
  });

  it('ignores the hamza a phone keyboard may not produce', () => {
    expect(normalizeForMatch('أريانة')).toBe(normalizeForMatch('اريانة'));
  });

  it('keeps two different names apart', () => {
    expect(normalizeForMatch('Le Bardo')).not.toBe(normalizeForMatch('La Marsa'));
  });
});

describe('resolveDelegation (Q5)', () => {
  it('accepts the code on its own', () => {
    const result = resolveDelegation({ delegation: 'TUN-BARDO' }, DELEGATIONS);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.delegation.id).toBe('1');
  });

  it('accepts the code whatever its case', () => {
    const result = resolveDelegation({ delegation: 'tun-bardo' }, DELEGATIONS);
    expect(result.ok).toBe(true);
  });

  it('accepts a unique French name without a gouvernorat', () => {
    const result = resolveDelegation({ delegation: 'le bardo' }, DELEGATIONS);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.delegation.id).toBe('1');
  });

  it('accepts an Arabic name', () => {
    const result = resolveDelegation({ delegation: 'الزهراء' }, DELEGATIONS);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.delegation.id).toBe('4');
  });

  it('refuses a name shared by two gouvernorats and says which', () => {
    const result = resolveDelegation({ delegation: 'Médina' }, DELEGATIONS);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe(DelegationLookupError.AMBIGU);
    expect(result.candidates).toEqual(['Tunis', 'Ben Arous']);
    expect(result.message).toContain('Tunis');
  });

  it('resolves that same name once the gouvernorat is given', () => {
    const result = resolveDelegation(
      { delegation: 'Médina', gouvernorat: 'Ben Arous' },
      DELEGATIONS,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.delegation.id).toBe('6');
  });

  it('accepts the gouvernorat by code or in Arabic', () => {
    expect(resolveDelegation({ delegation: 'Médina', gouvernorat: 'TUN' }, DELEGATIONS).ok).toBe(
      true,
    );
    expect(resolveDelegation({ delegation: 'المدينة', gouvernorat: 'تونس' }, DELEGATIONS).ok).toBe(
      true,
    );
  });

  it('refuses an unknown name', () => {
    const result = resolveDelegation({ delegation: 'Sfax Ville' }, DELEGATIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(DelegationLookupError.INTROUVABLE);
  });

  it('refuses a name that does not belong to the gouvernorat given', () => {
    const result = resolveDelegation(
      { delegation: 'Le Bardo', gouvernorat: 'Ben Arous' },
      DELEGATIONS,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(DelegationLookupError.INTROUVABLE);
  });

  it('refuses an empty cell', () => {
    const result = resolveDelegation({ delegation: '   ' }, DELEGATIONS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('obligatoire');
  });
});
