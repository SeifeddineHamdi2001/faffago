import { formatDT, formatTunisDay, millimesFromJson } from '@faffago/shared';

/** An amount from the API (millimes as digits) as the screens print it: `85,000 DT`. */
export function dt(value: string | null | undefined): string {
  return value === null || value === undefined ? '—' : formatDT(millimesFromJson(value));
}

/** The same amount as the team types it back, without the unit: `85,000`. */
export function dtInput(value: string): string {
  return formatDT(millimesFromJson(value), { suffix: false });
}

const dateTime = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Africa/Tunis',
  dateStyle: 'short',
  timeStyle: 'short',
});

export function when(iso: string | null | undefined): string {
  return iso ? dateTime.format(new Date(iso)) : '—';
}

/** A Tunis day key, `AAAA-MM-JJ`, as `JJ/MM/AAAA`. */
export function day(key: string | null | undefined): string {
  return key ? formatTunisDay(key) : '—';
}

/** A signed écart: `+1,500 DT`, `-5,000 DT`, or Conforme. */
export function ecart(value: string | null): string {
  if (value === null) return '—';
  const millimes = millimesFromJson(value);
  if (millimes === 0n) return 'Conforme';
  return millimes > 0n ? `+${formatDT(millimes)}` : formatDT(millimes);
}
