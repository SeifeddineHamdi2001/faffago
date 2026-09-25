'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';
import {
  RELAUNCH_SLOT_LABELS_FR,
  RELAUNCH_WINDOW_DAYS,
  RelaunchSlot,
  addTunisDays,
  changerClientSchema,
  formatDT,
  localitesOfTree,
  millimesFromJson,
  relancerSchema,
  tunisDayKey,
  type GeoTreeView,
} from '@faffago/shared';
import { bff } from '@/lib/client/call';
import type { ApiError, DecisionResult, SellerParcelDetail } from '@/lib/types';
import { ErrorAlert, fieldErrors } from './account-actions';
import { Field } from './create-courier-form';
import { ConfirmDialog, Dialog } from './dialog';
import { LocalitePicker } from './localite-picker';

type Open = 'relancer' | 'date' | 'retourner' | 'client' | null;

/** "samedi 26/09": a day key, read as the calendar day it names. */
export function dayLabel(key: string): string {
  return new Intl.DateTimeFormat('fr-TN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(`${key}T00:00:00.000Z`));
}

/** Tomorrow to seven days ahead, in Tunis days, from the server's clock (D-9). */
function dateWindow(serverNow: string) {
  const today = tunisDayKey(new Date(serverNow));
  return {
    min: addTunisDays(today, RELAUNCH_WINDOW_DAYS.min),
    max: addTunisDays(today, RELAUNCH_WINDOW_DAYS.max),
  };
}

/**
 * The seller's decisions on Détail du colis (Vendeur 4.9): Relancer,
 * Changer la date, Retourner, Changer de client. The API checks everything
 * again; the buttons only follow what it says is possible now.
 */
export function SellerDecisions({
  parcel,
  tree,
  onReprint,
}: {
  parcel: SellerParcelDetail;
  tree: GeoTreeView;
  /** A printed field changed: the page shows the reprint warning. */
  onReprint: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<Open>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const { decisions } = parcel;
  const any =
    decisions.relancer ||
    decisions.retourner ||
    decisions.changerDate ||
    decisions.changerClient !== 'NON';
  if (!any) return null;

  function done(result: DecisionResult) {
    setOpen(null);
    if (result.reprintLabel) onReprint();
    router.refresh();
  }

  async function retourner() {
    setBusy(true);
    const result = await bff<DecisionResult>('POST', `parcels/${parcel.code}/retourner`);
    setBusy(false);
    setOpen(null);
    if (result.ok) done(result.data);
    else setError(result.error);
  }

  return (
    <section aria-labelledby="decision-title" id="decision" className="card mb-6">
      <h2 id="decision-title" className="mb-3 font-display text-lg font-bold text-navy">
        Votre décision
      </h2>
      {error && <ErrorAlert error={error} />}
      <div className="flex flex-wrap gap-2">
        {decisions.relancer && (
          <button type="button" className="btn-primary" onClick={() => setOpen('relancer')}>
            Relancer
          </button>
        )}
        {decisions.changerDate && (
          <button type="button" className="btn-primary" onClick={() => setOpen('date')}>
            Changer la date
          </button>
        )}
        {decisions.changerClient === 'OUI' && (
          <button type="button" className="btn-secondary" onClick={() => setOpen('client')}>
            Changer de client
          </button>
        )}
        {decisions.changerClient === 'AU_RETOUR_DEPOT' && (
          <button type="button" className="btn-secondary" disabled aria-disabled="true">
            Changer de client · Disponible au retour au dépôt
          </button>
        )}
        {decisions.retourner && (
          <button type="button" className="btn-danger" onClick={() => setOpen('retourner')}>
            Retourner
          </button>
        )}
      </div>

      {open === 'relancer' && (
        <RelancerDialog parcel={parcel} onDone={done} onCancel={() => setOpen(null)} />
      )}
      {open === 'date' && (
        <DateDialog parcel={parcel} onDone={done} onCancel={() => setOpen(null)} />
      )}
      {open === 'client' && (
        <ChangerClientDialog
          parcel={parcel}
          tree={tree}
          onDone={done}
          onCancel={() => setOpen(null)}
        />
      )}
      {open === 'retourner' && (
        <ConfirmDialog
          title="Retourner le colis"
          message={`Le colis devient un retour et vous sera rendu par le ramasseur. Frais de retour : ${formatDT(
            millimesFromJson(parcel.returnFeeMillimes),
          )}, déduits de votre prochain paiement.`}
          confirmLabel="Retourner"
          cancelLabel="Garder le colis"
          busy={busy}
          onConfirm={retourner}
          onCancel={() => setOpen(null)}
        />
      )}
    </section>
  );
}

function DateFields({
  serverNow,
  date,
  slot,
  onDate,
  onSlot,
  error,
}: {
  serverNow: string;
  date: string;
  slot: string;
  onDate: (value: string) => void;
  onSlot: (value: string) => void;
  error?: string;
}) {
  const { min, max } = dateWindow(serverNow);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label htmlFor="decision-date" className="field-label">
          Jour de livraison
        </label>
        <input
          id="decision-date"
          type="date"
          className="field"
          min={min}
          max={max}
          value={date}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'decision-date-error' : undefined}
          onChange={(e) => onDate(e.target.value)}
        />
        {error && (
          <p id="decision-date-error" className="mt-1 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
      <div>
        <label htmlFor="decision-slot" className="field-label">
          Créneau (facultatif)
        </label>
        <select
          id="decision-slot"
          className="field"
          value={slot}
          onChange={(e) => onSlot(e.target.value)}
        >
          <option value="">Toute la journée</option>
          {Object.values(RelaunchSlot).map((value) => (
            <option key={value} value={value}>
              {RELAUNCH_SLOT_LABELS_FR[value]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/**
 * Relancer (Vendeur 4.9, D-29, D-70): a day, a slot, and the corrections
 * applied at once. The localité goes through Demander une modification.
 */
function RelancerDialog({
  parcel,
  onDone,
  onCancel,
}: {
  parcel: SellerParcelDetail;
  onDone: (result: DecisionResult) => void;
  onCancel: () => void;
}) {
  const initial = {
    recipientPhone: parcel.recipientPhone,
    recipientPhone2: parcel.recipientPhone2 ?? '',
    address: parcel.address,
    landmark: parcel.landmark ?? '',
    courierNote: parcel.courierNote ?? '',
  };
  const [values, setValues] = useState({ date: '', slot: '', ...initial });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof values) => (value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const body: Record<string, unknown> = { date: values.date };
    if (values.slot) body.slot = values.slot;
    // Only what the seller changed is sent, and written as a correction.
    for (const key of Object.keys(initial) as (keyof typeof initial)[]) {
      if (values[key].trim() !== initial[key].trim()) body[key] = values[key].trim();
    }
    const parsed = relancerSchema.safeParse(body);
    if (!parsed.success) {
      const found = fieldErrors(parsed.error.issues);
      if (found.date) found.date = 'Choisissez le jour de la nouvelle tentative de livraison';
      setErrors(found);
      return;
    }
    setErrors({});
    setBusy(true);
    const result = await bff<DecisionResult>('POST', `parcels/${parcel.code}/relancer`, body);
    setBusy(false);
    if (result.ok) onDone(result.data);
    else setApiError(result.error);
  }

  return (
    <Dialog title="Relancer le colis" onDismiss={onCancel}>
      {apiError && <ErrorAlert error={apiError} />}
      <form onSubmit={submit} className="max-h-[70vh] space-y-3 overflow-y-auto pr-1" noValidate>
        <p className="text-sm text-navy/70">
          Une nouvelle tentative, gratuite, au client actuel. Corrigez ce qui a changé ; pour une
          autre localité, utilisez « Demander une modification ».
        </p>
        <DateFields
          serverNow={parcel.now}
          date={values.date}
          slot={values.slot}
          onDate={set('date')}
          onSlot={set('slot')}
          error={errors.date}
        />
        <Field
          id="rl-phone"
          label="Téléphone"
          value={values.recipientPhone}
          onChange={set('recipientPhone')}
          error={errors.recipientPhone}
          inputMode="tel"
        />
        <Field
          id="rl-phone2"
          label="Téléphone 2 (facultatif)"
          value={values.recipientPhone2}
          onChange={set('recipientPhone2')}
          error={errors.recipientPhone2}
          inputMode="tel"
        />
        <Field
          id="rl-address"
          label="Adresse"
          value={values.address}
          onChange={set('address')}
          error={errors.address}
        />
        <Field
          id="rl-landmark"
          label="Repère (facultatif)"
          value={values.landmark}
          onChange={set('landmark')}
          error={errors.landmark}
        />
        <Field
          id="rl-note"
          label="Note pour le coursier (facultatif)"
          value={values.courierNote}
          onChange={set('courierNote')}
          error={errors.courierNote}
        />
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Annuler
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            Relancer
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** Changer la date of a relance or a customer postponement (D-9). */
function DateDialog({
  parcel,
  onDone,
  onCancel,
}: {
  parcel: SellerParcelDetail;
  onDone: (result: DecisionResult) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(parcel.relaunchDate ?? '');
  const [slot, setSlot] = useState<string>(parcel.relaunchSlot ?? '');
  const [error, setError] = useState<string | undefined>();
  const [apiError, setApiError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('Choisissez le jour de la nouvelle tentative de livraison');
      return;
    }
    setBusy(true);
    const result = await bff<DecisionResult>('POST', `parcels/${parcel.code}/changer-date`, {
      date,
      ...(slot ? { slot } : {}),
    });
    setBusy(false);
    if (result.ok) onDone(result.data);
    else setApiError(result.error);
  }

  return (
    <Dialog title="Changer la date" onDismiss={onCancel}>
      {apiError && <ErrorAlert error={apiError} />}
      <form onSubmit={submit} className="space-y-3" noValidate>
        <DateFields
          serverNow={parcel.now}
          date={date}
          slot={slot}
          onDate={setDate}
          onSlot={setSlot}
          error={error}
        />
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Annuler
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            Enregistrer la date
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * Changer de client (Vendeur 4.9, A-17): the new customer entered like a new
 * parcel, and the COD, which may change. Once per parcel, with its fee.
 */
function ChangerClientDialog({
  parcel,
  tree,
  onDone,
  onCancel,
}: {
  parcel: SellerParcelDetail;
  tree: GeoTreeView;
  onDone: (result: DecisionResult) => void;
  onCancel: () => void;
}) {
  const localites = useMemo(() => localitesOfTree(tree), [tree]);
  const [values, setValues] = useState({
    recipientName: '',
    recipientPhone: '',
    recipientPhone2: '',
    localiteId: '',
    address: '',
    landmark: '',
    codAmountMillimes: formatDT(millimesFromJson(parcel.codAmountMillimes), { suffix: false }),
    isExchange: parcel.isExchange,
    openingAllowed: parcel.openingAllowed,
    courierNote: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const set =
    <K extends keyof typeof values>(key: K) =>
    (value: (typeof values)[K]) =>
      setValues((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const body = {
      ...values,
      recipientPhone2: values.recipientPhone2.trim() || null,
      landmark: values.landmark.trim() || null,
      courierNote: values.courierNote.trim() || null,
    };
    const parsed = changerClientSchema.safeParse(body);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    setBusy(true);
    const result = await bff<DecisionResult>('POST', `parcels/${parcel.code}/changer-client`, body);
    setBusy(false);
    if (result.ok) onDone(result.data);
    else setApiError(result.error);
  }

  return (
    <Dialog title="Changer de client" onDismiss={onCancel}>
      {apiError && <ErrorAlert error={apiError} />}
      <form onSubmit={submit} className="max-h-[70vh] space-y-3 overflow-y-auto pr-1" noValidate>
        <p className="rounded-xl bg-orange/15 p-3 text-sm font-semibold text-navy">
          Frais de changement de client :{' '}
          {formatDT(millimesFromJson(parcel.changeClientFeeMillimes))}, déduits de votre prochain
          paiement. Une seule fois par colis ; les tentatives repartent à zéro.
        </p>
        <Field
          id="cc-name"
          label="Nom du destinataire"
          value={values.recipientName}
          onChange={set('recipientName')}
          error={errors.recipientName}
        />
        <Field
          id="cc-phone"
          label="Téléphone"
          value={values.recipientPhone}
          onChange={set('recipientPhone')}
          error={errors.recipientPhone}
          inputMode="tel"
        />
        <Field
          id="cc-phone2"
          label="Téléphone 2 (facultatif)"
          value={values.recipientPhone2}
          onChange={set('recipientPhone2')}
          error={errors.recipientPhone2}
          inputMode="tel"
        />
        <LocalitePicker
          tree={tree}
          localites={localites}
          value={values.localiteId}
          onChange={set('localiteId')}
          error={errors.localiteId}
        />
        <Field
          id="cc-address"
          label="Adresse"
          value={values.address}
          onChange={set('address')}
          error={errors.address}
        />
        <Field
          id="cc-landmark"
          label="Repère (facultatif)"
          value={values.landmark}
          onChange={set('landmark')}
          error={errors.landmark}
        />
        <Field
          id="cc-cod"
          label="Montant COD (DT)"
          value={values.codAmountMillimes}
          onChange={set('codAmountMillimes')}
          error={errors.codAmountMillimes}
          inputMode="decimal"
        />
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={values.isExchange}
              onChange={(e) => set('isExchange')(e.target.checked)}
            />
            Colis d’échange
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={values.openingAllowed}
              onChange={(e) => set('openingAllowed')(e.target.checked)}
            />
            Ouverture autorisée
          </label>
        </div>
        <Field
          id="cc-note"
          label="Note pour le coursier (facultatif)"
          value={values.courierNote}
          onChange={set('courierNote')}
          error={errors.courierNote}
        />
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Annuler
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            Changer de client
          </button>
        </div>
      </form>
    </Dialog>
  );
}
