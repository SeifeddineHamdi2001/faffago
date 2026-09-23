'use client';

import { useState, type FormEvent } from 'react';
import { PAY_PLAN_LABELS_FR, PayPlan, createCourierAccountSchema } from '@faffago/shared';
import { bff } from '@/lib/client/call';
import type { ApiError, CreatedAccount } from '@/lib/types';
import { ErrorAlert, fieldErrors } from './account-actions';
import { Dialog } from './dialog';

/**
 * Créer un coursier (Admin 4.15): name, phone, CIN, vehicle, the role, and a
 * pay plan for a livreur only. Zones are assigned in phase 4.
 */
export function CreateCourierForm({
  onCreated,
  onCancel,
}: {
  onCreated: (created: CreatedAccount) => void;
  onCancel: () => void;
}) {
  const [role, setRole] = useState<'LIVREUR' | 'RAMASSEUR'>('LIVREUR');
  const [values, setValues] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    cin: '',
    vehicle: '',
    payPlan: PayPlan.HEBDOMADAIRE as string,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof values) => (value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const body = {
      role,
      firstName: values.firstName,
      lastName: values.lastName,
      phone: values.phone,
      cin: values.cin,
      vehicle: values.vehicle.trim() || null,
      ...(role === 'LIVREUR' ? { payPlan: values.payPlan } : {}),
    };
    const parsed = createCourierAccountSchema.safeParse(body);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    setBusy(true);
    const result = await bff<CreatedAccount>('POST', 'accounts/couriers', body);
    setBusy(false);
    if (result.ok) onCreated(result.data);
    else setApiError(result.error);
  }

  return (
    <Dialog title="Créer un coursier" onDismiss={onCancel}>
      {apiError && <ErrorAlert error={apiError} />}
      <form onSubmit={submit} className="space-y-3" noValidate>
        <fieldset>
          <legend className="field-label">Rôle</legend>
          <div className="flex gap-4">
            {(['LIVREUR', 'RAMASSEUR'] as const).map((value) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="role"
                  checked={role === value}
                  onChange={() => setRole(value)}
                />
                {value === 'LIVREUR' ? 'Livreur' : 'Ramasseur'}
              </label>
            ))}
          </div>
        </fieldset>
        <Field
          id="firstName"
          label="Prénom"
          value={values.firstName}
          onChange={set('firstName')}
          error={errors.firstName}
        />
        <Field
          id="lastName"
          label="Nom"
          value={values.lastName}
          onChange={set('lastName')}
          error={errors.lastName}
        />
        <Field
          id="phone"
          label="Téléphone"
          value={values.phone}
          onChange={set('phone')}
          error={errors.phone}
          inputMode="tel"
        />
        <Field id="cin" label="CIN" value={values.cin} onChange={set('cin')} error={errors.cin} />
        <Field
          id="vehicle"
          label="Véhicule (facultatif)"
          value={values.vehicle}
          onChange={set('vehicle')}
          error={errors.vehicle}
        />
        {role === 'LIVREUR' && (
          <div>
            <label htmlFor="payPlan" className="field-label">
              Plan de paie
            </label>
            <select
              id="payPlan"
              className="field"
              value={values.payPlan}
              onChange={(e) => set('payPlan')(e.target.value)}
            >
              {Object.values(PayPlan).map((plan) => (
                <option key={plan} value={plan}>
                  {PAY_PLAN_LABELS_FR[plan]}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Annuler
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            Créer
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function Field({
  id,
  label,
  value,
  onChange,
  error,
  inputMode,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  inputMode?: 'tel' | 'text';
}) {
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <input
        id={id}
        className="field"
        value={value}
        inputMode={inputMode}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
