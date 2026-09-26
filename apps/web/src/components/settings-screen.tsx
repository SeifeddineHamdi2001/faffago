'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import {
  SettingKey,
  formatDT,
  formatRatePercent,
  millimesFromJson,
  parseRatePercent,
  parseWholeNumber,
  tryParseDT,
  type ContactLinks,
  type SettingJsonValue,
} from '@faffago/shared';
import { bff } from '@/lib/client/call';
import { Field } from './create-courier-form';

/** `optional`: free text that may be left empty, e.g. the Meta Pixel id (empty = off). */
type Kind = 'money' | 'integer' | 'percent' | 'text' | 'optional';

interface FieldDef {
  key: SettingKey;
  label: string;
  kind: Kind;
}

const FEES: FieldDef[] = [
  { key: SettingKey.DELIVERY_FEE_MILLIMES, label: 'Frais de livraison (DT)', kind: 'money' },
  { key: SettingKey.RETURN_FEE_MILLIMES, label: 'Frais de retour (DT)', kind: 'money' },
  {
    key: SettingKey.CHANGE_CLIENT_FEE_MILLIMES,
    label: 'Frais de changement de client (DT)',
    kind: 'money',
  },
  { key: SettingKey.PICKUP_FEE_MILLIMES, label: 'Frais de ramassage (DT)', kind: 'money' },
  {
    key: SettingKey.PICKUP_FREE_THRESHOLD,
    label: 'Ramassage gratuit à partir de (colis)',
    kind: 'integer',
  },
  {
    key: SettingKey.COURIER_RATE_PER_PARCEL_MILLIMES,
    label: 'Tarif coursier par colis livré (DT)',
    kind: 'money',
  },
];

const RETENUE: FieldDef[] = [
  {
    key: SettingKey.RETENUE_RATE_BPS,
    label: 'Retenue à la source, CIN uniquement (%)',
    kind: 'percent',
  },
];

const RULES: FieldDef[] = [
  { key: SettingKey.VERIFY_DEADLINE_HOURS, label: 'Délai À vérifier (heures)', kind: 'integer' },
  {
    key: SettingKey.MAX_DELIVERY_ATTEMPTS,
    label: 'Tentatives de livraison maximum',
    kind: 'integer',
  },
  {
    key: SettingKey.MAX_CLIENT_CHANGES_PER_PARCEL,
    label: 'Changements de client par colis',
    kind: 'integer',
  },
  {
    key: SettingKey.SCAN_CANCEL_WINDOW_SECONDS,
    label: 'Annulation d’un scan (secondes)',
    kind: 'integer',
  },
  {
    key: SettingKey.CLOCK_SKEW_FLAG_MINUTES,
    label: 'Écart d’horloge signalé (minutes)',
    kind: 'integer',
  },
  {
    key: SettingKey.COURIER_MIN_APP_VERSION,
    label: 'Version minimale de l’application coursier',
    kind: 'text',
  },
];

const ADS: FieldDef[] = [
  { key: SettingKey.META_PIXEL_ID, label: 'Identifiant Meta Pixel', kind: 'optional' },
];

/** Printed on the retenue certificates (D-89); none is generated while one is empty. */
const SOCIETE: FieldDef[] = [
  { key: SettingKey.SOCIETE_RAISON_SOCIALE, label: 'Raison sociale', kind: 'optional' },
  { key: SettingKey.SOCIETE_MATRICULE_FISCAL, label: 'Matricule fiscal', kind: 'optional' },
  { key: SettingKey.SOCIETE_ADRESSE, label: 'Adresse', kind: 'optional' },
];

const CONTACT_FIELDS: Array<{ key: keyof ContactLinks; label: string }> = [
  { key: 'phone', label: 'Téléphone' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'tiktok', label: 'TikTok' },
];

const INVALID: Record<Kind, string> = {
  money: 'Montant invalide. Format : 5,500',
  integer: 'Nombre entier attendu',
  percent: 'Pourcentage invalide. Format : 3 ou 2,5',
  text: 'Valeur obligatoire',
  optional: 'Valeur invalide',
};

/** The stored value as the admin reads it: DT for money, percent for the retenue. */
function toText(kind: Kind, value: SettingJsonValue): string {
  if (kind === 'money') return formatDT(millimesFromJson(value as string), { suffix: false });
  if (kind === 'percent') return formatRatePercent(value as number);
  return String(value);
}

/** Back to the stored form, or null when the text cannot be read. */
function fromText(kind: Kind, text: string): SettingJsonValue | null {
  const trimmed = text.trim();
  if (kind === 'money') {
    const millimes = tryParseDT(trimmed);
    return millimes === null || millimes < 0n ? null : millimes.toString();
  }
  if (kind === 'percent') return parseRatePercent(trimmed);
  if (kind === 'integer') return parseWholeNumber(trimmed);
  if (kind === 'optional') return trimmed;
  return trimmed === '' ? null : trimmed;
}

type Status = { kind: 'saved' } | { kind: 'error'; message: string } | null;

/**
 * Saves the settings of one section that changed, one call per setting: the
 * API validates and audits each of them on its own (D-20).
 */
function useSectionSave() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  async function save(changes: Array<{ key: SettingKey; value: SettingJsonValue }>) {
    setStatus(null);
    if (changes.length === 0) {
      setStatus({ kind: 'saved' });
      return;
    }
    setBusy(true);
    for (const change of changes) {
      const result = await bff('PATCH', `settings/${change.key}`, { value: change.value });
      if (!result.ok) {
        setBusy(false);
        setStatus({ kind: 'error', message: result.error.message });
        return;
      }
    }
    setBusy(false);
    setStatus({ kind: 'saved' });
    router.refresh();
  }

  return { busy, status, setStatus, save };
}

function Section({
  title,
  children,
  note,
  onSubmit,
  busy,
  status,
}: {
  title: string;
  children: React.ReactNode;
  note?: string;
  onSubmit?: () => void;
  busy?: boolean;
  status?: Status;
}) {
  const id = useId();
  const body = (
    <>
      <h2 id={id} className="font-display text-lg font-bold text-navy">
        {title}
      </h2>
      {note && <p className="mt-1 text-sm text-navy/70">{note}</p>}
      <div className="mt-4 grid gap-4 md:grid-cols-2">{children}</div>
      {onSubmit && (
        <div className="mt-4 flex items-center gap-3">
          <button type="submit" className="btn-primary" disabled={busy}>
            Enregistrer
          </button>
          {status?.kind === 'saved' && (
            <p role="status" className="text-sm text-green-800">
              Enregistré
            </p>
          )}
          {status?.kind === 'error' && (
            <p role="alert" className="text-sm text-red-700">
              {status.message}
            </p>
          )}
        </div>
      )}
    </>
  );

  return (
    <section aria-labelledby={id} className="card">
      {onSubmit ? (
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          {body}
        </form>
      ) : (
        body
      )}
    </section>
  );
}

function SettingsSection({
  title,
  note,
  fields,
  values,
}: {
  title: string;
  note?: string;
  fields: FieldDef[];
  values: Record<SettingKey, SettingJsonValue>;
}) {
  const [texts, setTexts] = useState(() =>
    Object.fromEntries(fields.map((f) => [f.key, toText(f.kind, values[f.key])])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { busy, status, save } = useSectionSave();

  function submit() {
    const nextErrors: Record<string, string> = {};
    const changes: Array<{ key: SettingKey; value: SettingJsonValue }> = [];
    for (const field of fields) {
      const value = fromText(field.kind, texts[field.key] ?? '');
      if (value === null) {
        nextErrors[field.key] = INVALID[field.kind];
      } else if (JSON.stringify(value) !== JSON.stringify(values[field.key])) {
        changes.push({ key: field.key, value });
      }
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) void save(changes);
  }

  return (
    <Section title={title} note={note} onSubmit={submit} busy={busy} status={status}>
      {fields.map((field) => (
        <Field
          key={field.key}
          id={`parametre-${field.key}`}
          label={field.label}
          value={texts[field.key] ?? ''}
          inputMode={field.kind === 'text' ? 'text' : 'decimal'}
          error={errors[field.key]}
          onChange={(text) => setTexts((current) => ({ ...current, [field.key]: text }))}
        />
      ))}
    </Section>
  );
}

function ContactLinksSection({ links }: { links: ContactLinks }) {
  const [values, setValues] = useState<ContactLinks>(links);
  const { busy, status, save } = useSectionSave();

  function submit() {
    const trimmed = Object.fromEntries(
      Object.entries(values).map(([key, value]) => [key, value.trim()]),
    ) as unknown as ContactLinks;
    const changed = JSON.stringify(trimmed) !== JSON.stringify(links);
    void save(changed ? [{ key: SettingKey.CONTACT_LINKS, value: trimmed }] : []);
  }

  return (
    <Section
      title="Liens de contact"
      note="Affichés sur le site public, dans Devenir partenaire."
      onSubmit={submit}
      busy={busy}
      status={status}
    >
      {CONTACT_FIELDS.map((field) => (
        <Field
          key={field.key}
          id={`contact-${field.key}`}
          label={field.label}
          value={values[field.key]}
          inputMode={field.key === 'phone' ? 'tel' : 'url'}
          onChange={(text) => setValues((current) => ({ ...current, [field.key]: text }))}
        />
      ))}
    </Section>
  );
}

/**
 * Paramètres › Tarifs et règles (Admin 4.16, D-20). The admin alone reaches
 * it; each change is audited by the API. Failure reasons are shown, never
 * edited: the list is fixed in packages/shared.
 */
export function SettingsScreen({
  values,
  failureReasons,
}: {
  values: Record<SettingKey, SettingJsonValue>;
  failureReasons: Array<{ code: string; label: string }>;
}) {
  return (
    <div className="space-y-6">
      <SettingsSection
        title="Frais"
        note="Les mêmes pour tous les vendeurs. Un nouveau tarif s’applique aux colis créés après la modification ; les colis existants gardent leurs frais."
        fields={FEES}
        values={values}
      />
      <SettingsSection title="Retenue à la source" fields={RETENUE} values={values} />
      <SettingsSection
        title="Société"
        note="Imprimé sur les certificats de retenue à la source. Aucun certificat n’est généré tant qu’un champ est vide."
        fields={SOCIETE}
        values={values}
      />
      <SettingsSection title="Règles" fields={RULES} values={values} />
      <ContactLinksSection links={values[SettingKey.CONTACT_LINKS] as ContactLinks} />
      <SettingsSection
        title="Suivi publicitaire"
        note="Meta Pixel sur le site public, pour mesurer les campagnes Facebook et Instagram. Laissez vide pour le désactiver."
        fields={ADS}
        values={values}
      />
      <Section title="Raisons d'échec" note="Liste fixe, choisie par le livreur. Non modifiable.">
        <ul className="list-disc pl-5 text-navy md:col-span-2">
          {failureReasons.map((reason) => (
            <li key={reason.code}>{reason.label}</li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
