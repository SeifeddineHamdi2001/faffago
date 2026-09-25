import type { Stop } from '../../api/types';

/**
 * The order of Ma tournée (Coursier 4.2): grouped by délégation by default,
 * as the API sends it; once the courier moves a stop, his order is kept on
 * the phone. New stops go last, parcels no longer his drop out.
 */
export function orderStops(stops: readonly Stop[], savedOrder: readonly string[]): Stop[] {
  const byCode = new Map(stops.map((s) => [s.code, s]));
  const ordered: Stop[] = [];
  for (const code of savedOrder) {
    const stop = byCode.get(code);
    if (stop) {
      ordered.push(stop);
      byCode.delete(code);
    }
  }
  return [...ordered, ...stops.filter((s) => byCode.has(s.code))];
}

/** Moves one stop up or down; the new order of codes. */
export function moveStop(codes: readonly string[], code: string, delta: -1 | 1): string[] {
  const next = [...codes];
  const from = next.indexOf(code);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= next.length) return next;
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}

/** The place, in the courier's language; the localité's Arabic name is optional (D-17). */
export function placeOf(stop: Stop, rtl: boolean): string {
  return rtl
    ? `${stop.localiteNameAr ?? stop.localiteNameFr}، ${stop.delegationNameAr}`
    : `${stop.localiteNameFr}, ${stop.delegationNameFr}`;
}
