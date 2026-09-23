'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ROLE_LABELS_FR, createStaffAccountSchema } from '@faffago/shared';
import { bff } from '@/lib/client/call';
import type { ApiError, CreatedAccount, StaffRow } from '@/lib/types';
import { ErrorAlert, fieldErrors, useAccountActions } from './account-actions';
import { Field } from './create-courier-form';
import { ConfirmDialog, Dialog } from './dialog';

const STAFF_ROLES = ['ADMIN', 'DEPOT', 'SERVICE_CLIENT'] as const;

/**
 * Paramètres › Utilisateurs (Admin 4.16, identifiants et mots de passe). The
 * admin creates staff accounts, regenerates their passwords, deactivates and
 * reactivates them. The last active admin is protected by the API (Q9).
 */
export function StaffScreen({ rows }: { rows: StaffRow[] }) {
  const router = useRouter();
  const actions = useAccountActions();
  const [creating, setCreating] = useState(false);
  const [deactivating, setDeactivating] = useState<StaffRow | null>(null);
  const [busy, setBusy] = useState(false);

  async function setActive(account: StaffRow, active: boolean) {
    setBusy(true);
    actions.setError(null);
    const result = await bff(
      'POST',
      `accounts/staff/${account.id}/${active ? 'activate' : 'deactivate'}`,
    );
    setBusy(false);
    setDeactivating(null);
    if (!result.ok) actions.setError(result.error);
    router.refresh();
  }

  return (
    <section>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold text-navy">Utilisateurs</h1>
        <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
          Créer un utilisateur
        </button>
      </div>
      {actions.error && <ErrorAlert error={actions.error} />}
      <ul className="space-y-3">
        {rows.map((account) => (
          <li key={account.id} className="card flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-semibold text-navy">
                {account.firstName} {account.lastName}
              </p>
              <p className="text-sm text-navy/70">
                {ROLE_LABELS_FR[account.role]} · {account.username} · {account.phone}
              </p>
              <p className="mt-1 text-sm">
                <span className={account.isActive ? 'badge-ok' : 'badge-muted'}>
                  {account.isActive ? 'Actif' : 'Inactif'}
                </span>
                {account.lastLoginAt && (
                  <span className="ml-2 text-navy/70">
                    Dernière connexion :{' '}
                    {new Intl.DateTimeFormat('fr-TN', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    }).format(new Date(account.lastLoginAt))}
                  </span>
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() =>
                  actions.askRegenerate({
                    userId: account.id,
                    name: `${account.firstName} ${account.lastName}`,
                    identifierLabel: 'Identifiant',
                    identifier: account.username,
                  })
                }
              >
                Régénérer le mot de passe
              </button>
              {account.isActive ? (
                <button
                  type="button"
                  className="btn-danger"
                  onClick={() => setDeactivating(account)}
                >
                  Désactiver
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setActive(account, true)}
                >
                  Réactiver
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {creating && (
        <CreateStaffForm
          onCancel={() => setCreating(false)}
          onCreated={(created) => {
            setCreating(false);
            actions.showCredentials(
              { identifierLabel: 'Identifiant', identifier: created.user.username ?? '' },
              created.password,
            );
          }}
        />
      )}
      {deactivating && (
        <ConfirmDialog
          title="Désactiver le compte"
          message={`${deactivating.firstName} ${deactivating.lastName} ne pourra plus se connecter, et toutes ses sessions seront fermées.`}
          confirmLabel="Désactiver"
          busy={busy}
          onConfirm={() => setActive(deactivating, false)}
          onCancel={() => setDeactivating(null)}
        />
      )}
      {actions.element}
    </section>
  );
}

function CreateStaffForm({
  onCreated,
  onCancel,
}: {
  onCreated: (created: CreatedAccount) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState({
    role: 'DEPOT' as (typeof STAFF_ROLES)[number],
    username: '',
    firstName: '',
    lastName: '',
    phone: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof values) => (value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = createStaffAccountSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    setBusy(true);
    const result = await bff<CreatedAccount>('POST', 'accounts/staff', values);
    setBusy(false);
    if (result.ok) onCreated(result.data);
    else setApiError(result.error);
  }

  return (
    <Dialog title="Créer un utilisateur" onDismiss={onCancel}>
      {apiError && <ErrorAlert error={apiError} />}
      <form onSubmit={submit} className="space-y-3" noValidate>
        <div>
          <label htmlFor="role" className="field-label">
            Rôle
          </label>
          <select
            id="role"
            className="field"
            value={values.role}
            onChange={(e) => set('role')(e.target.value)}
          >
            {STAFF_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS_FR[role]}
              </option>
            ))}
          </select>
        </div>
        <Field
          id="username"
          label="Identifiant"
          value={values.username}
          onChange={set('username')}
          error={errors.username}
        />
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
