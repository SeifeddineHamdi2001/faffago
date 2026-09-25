/**
 * The public site's two languages (Landing 5): its own address for each,
 * `/fr` and `/ar`, the browser's language on the first visit, and the choice
 * remembered afterwards.
 */

export const LOCALES = ['fr', 'ar'] as const;
export type Locale = (typeof LOCALES)[number];

/** Written by the middleware on every visit to /fr or /ar: the last language read. */
export const LOCALE_COOKIE = 'fg_locale';
export const LOCALE_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

export function isLocale(value: string | undefined | null): value is Locale {
  return value === 'fr' || value === 'ar';
}

/** An Accept-Language q-value ("0.9", "1", "0.85") in thousandths, never through a float. */
function qThousandths(param: string | undefined): number {
  if (param === undefined) return 1000;
  const match = /^([01])(?:\.(\d{1,3}))?$/.exec(param);
  if (!match) return 0;
  const value =
    Number.parseInt(match[1]!, 10) * 1000 + Number.parseInt((match[2] ?? '').padEnd(3, '0'), 10);
  return Math.min(value, 1000);
}

/**
 * The remembered choice first; otherwise the browser's own preference order
 * (Accept-Language, by q), the first of French or Arabic it names; French when
 * it names neither.
 */
export function preferredLocale(cookie: string | undefined, acceptLanguage: string | null): Locale {
  if (isLocale(cookie)) return cookie;
  const ranked = (acceptLanguage ?? '')
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith('q='))
        ?.slice(2);
      return { lang: tag.toLowerCase().split('-')[0], weight: qThousandths(q), index };
    })
    .filter((entry) => entry.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  for (const entry of ranked) {
    if (isLocale(entry.lang)) return entry.lang;
  }
  return 'fr';
}

const TUNIS_DAY = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Africa/Tunis',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const TUNIS_TIME = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Africa/Tunis',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * "25/09/2026 à 14:32" in Tunis time, whatever the server's time zone. The
 * digits are the same in both languages (Latin, Landing 5), so one numeric
 * format serves both; Arabic's own formatter would slip direction marks
 * between them.
 */
export function formatTunisDateTime(iso: string, locale: Locale): string {
  const date = new Date(iso);
  const day = TUNIS_DAY.format(date);
  const time = TUNIS_TIME.format(date);
  return locale === 'ar' ? `${day} - ${time}` : `${day} à ${time}`;
}

/** A calendar day (`2026-10-01`) as `01/10/2026`, never shifted by a time zone. */
export function formatDayKey(dayKey: string): string {
  const [year, month, day] = dayKey.split('-');
  return `${day}/${month}/${year}`;
}
