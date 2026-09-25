import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  FAILURE_REASON_LABELS_FR,
  PARCEL_STATUS_LABELS_FR,
  PAY_PLAN_LABELS_FR,
  RELAUNCH_SLOT_LABELS_FR,
  SCAN_ACTION_LABELS_FR,
  ZONE_ASSIGNMENT_KIND_LABELS_FR,
  formatDT,
} from '@faffago/shared';
import {
  FAILURE_REASON_AR,
  PAY_PLAN_AR,
  REFUSAL_AR,
  SCAN_ACTION_AR,
  SLOT_AR,
  STATUS_AR,
  ZONE_KIND_AR,
  ar,
  fr,
  type MessageKey,
} from './messages';

export type Lang = 'FR' | 'AR';

type Params = Record<string, string | number>;

export function translate(lang: Lang, key: MessageKey, params: Params = {}): string {
  const text = (lang === 'AR' ? ar : fr)[key];
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}

function pick(lang: Lang, frLabels: Record<string, string>, arLabels: Record<string, string>) {
  return (value: string | null | undefined): string =>
    value ? ((lang === 'AR' ? arLabels[value] : frLabels[value]) ?? frLabels[value] ?? value) : '';
}

/** Tunis time, as the courier's phone shows it. */
const timeFormat = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Africa/Tunis',
  hour: '2-digit',
  minute: '2-digit',
});

export interface I18n {
  lang: Lang;
  rtl: boolean;
  t: (key: MessageKey, params?: Params) => string;
  status: (value: string | null | undefined) => string;
  reason: (value: string | null | undefined) => string;
  slot: (value: string | null | undefined) => string;
  payPlan: (value: string | null | undefined) => string;
  zoneKind: (value: string | null | undefined) => string;
  scanAction: (value: string | null | undefined) => string;
  /** A refusal from the API: its message in French, translated by code in Arabic. */
  refusal: (code: string | null | undefined, message: string) => string;
  /** Money in DT: digits and comma stay Latin in both languages (tech-stack 3). */
  money: (millimes: bigint | string) => string;
  time: (iso: string | Date) => string;
  /** `AAAA-MM-JJ` as JJ/MM. */
  day: (key: string) => string;
}

export function makeI18n(lang: Lang): I18n {
  return {
    lang,
    rtl: lang === 'AR',
    t: (key, params) => translate(lang, key, params),
    status: pick(lang, PARCEL_STATUS_LABELS_FR, STATUS_AR),
    reason: pick(lang, FAILURE_REASON_LABELS_FR, FAILURE_REASON_AR),
    slot: pick(lang, RELAUNCH_SLOT_LABELS_FR, SLOT_AR),
    payPlan: pick(lang, PAY_PLAN_LABELS_FR, PAY_PLAN_AR),
    zoneKind: pick(lang, ZONE_ASSIGNMENT_KIND_LABELS_FR, ZONE_KIND_AR),
    scanAction: pick(lang, SCAN_ACTION_LABELS_FR, SCAN_ACTION_AR),
    refusal: (code, message) => (lang === 'AR' && code ? (REFUSAL_AR[code] ?? message) : message),
    money: (millimes) => formatDT(typeof millimes === 'bigint' ? millimes : BigInt(millimes)),
    time: (iso) => timeFormat.format(typeof iso === 'string' ? new Date(iso) : iso),
    day: (key) => `${key.slice(8, 10)}/${key.slice(5, 7)}`,
  };
}

const I18nContext = createContext<I18n>(makeI18n('FR'));

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const value = useMemo(() => makeI18n(lang), [lang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  return useContext(I18nContext);
}
