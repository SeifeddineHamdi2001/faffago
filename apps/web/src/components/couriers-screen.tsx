'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  COURIER_ACCOUNT_STATE_LABELS_FR,
  PAY_PLAN_LABELS_FR,
  Permission,
  ROLE_LABELS_FR,
  type PayPlan,
} from '@faffago/shared';
import { bff } from '@/lib/client/call';
import type { CourierRow } from '@/lib/types';
import { ErrorAlert, useAccountActions } from './account-actions';
import { CourierAbsencesDialog } from './courier-absences-dialog';
import { CreateCourierForm } from './create-courier-form';
import { ConfirmDialog } from './dialog';

/**
 * Coursiers (Admin 4.15, D-11, D-12). Dépôt and Service client read the list;
 * the admin also creates, regenerates, deactivates and reactivates. Admin and
 * Dépôt mark a courier absent for a day (D-52).
 */
export function CouriersScreen({
  rows,
  permissions,
}: {
  rows: CourierRow[];
  permissions: Permission[];
}) {
  const router = useRouter();
  const actions = useAccountActions();
  const [creating, setCreating] = useState(false);
  const [deactivating, setDeactivating] = useState<CourierRow | null>(null);
  const [absences, setAbsences] = useState<CourierRow | null>(null);
  const [busy, setBusy] = useState(false);

  const canManage = permissions.includes(Permission.GERER_VENDEURS_COURSIERS);
  const canRegenerate = permissions.includes(Permission.REGENERER_MOT_DE_PASSE);
  const canPlan = permissions.includes(Permission.PLANIFIER_RAMASSAGES_TOURNEES);

  async function deactivate(courier: CourierRow) {
    setBusy(true);
    const result = await bff('POST', `accounts/couriers/${courier.id}/deactivate`);
    setBusy(false);
    setDeactivating(null);
    actions.setError(result.ok ? null : result.error);
    // Even a refused deactivation has already stopped new work (D-12).
    router.refresh();
  }

  async function activate(courier: CourierRow) {
    actions.setError(null);
    const result = await bff('POST', `accounts/couriers/${courier.id}/activate`);
    if (!result.ok) actions.setError(result.error);
    router.refresh();
  }

  return (
    <section>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold text-navy">Coursiers</h1>
        {canManage && (
          <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
            Créer un coursier
          </button>
        )}
      </div>

      {actions.error && (
        <ErrorAlert error={actions.error}>
          {actions.error.code === 'COURSIER_ENGAGEMENTS_OUVERTS' && (
            <p className="mt-2">
              Le coursier ne reçoit plus de nouveau travail. Relancez la désactivation une fois tout
              remis.
            </p>
          )}
        </ErrorAlert>
      )}

      <ul className="space-y-3">
        {rows.map((courier) => {
          const name = `${courier.firstName} ${courier.lastName}`;
          const inactive = courier.isActive === false;
          return (
            <li key={courier.id} className="card flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-semibold text-navy">{name}</p>
                <p className="text-sm text-navy/70">
                  {ROLE_LABELS_FR[courier.role]} · {courier.phone}
                </p>
                <p className="text-sm text-navy/70">
                  {courier.zones.length > 0
                    ? courier.zones
                        .map(
                          (z) => `${z.name} (${z.kind === 'TITULAIRE' ? 'titulaire' : 'backup'})`,
                        )
                        .join(', ')
                    : 'Aucune zone'}
                </p>
                {courier.parcelsToday && (
                  <p className="text-sm text-navy/70">
                    Aujourd’hui : {courier.parcelsToday.withHim} en main ·{' '}
                    {courier.parcelsToday.planned} prévus en tournée
                  </p>
                )}
                {courier.absentToday && (
                  <p className="mt-1 text-sm">
                    <span className="badge-warn">Absent aujourd’hui</span>
                  </p>
                )}
                {courier.accountState && (
                  <p className="mt-1 text-sm">
                    <span className={inactive ? 'badge-muted' : 'badge-ok'}>
                      {COURIER_ACCOUNT_STATE_LABELS_FR[courier.accountState]}
                    </span>
                    {!inactive && courier.acceptsWork === false && (
                      <span className="badge-warn ml-2">Ne reçoit plus de travail</span>
                    )}
                    {courier.payPlan && (
                      <span className="ml-2 text-navy/70">
                        {PAY_PLAN_LABELS_FR[courier.payPlan as PayPlan]}
                      </span>
                    )}
                  </p>
                )}
              </div>
              {(canManage || canRegenerate || (canPlan && !inactive)) && (
                <div className="flex flex-wrap gap-2">
                  {canPlan && !inactive && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setAbsences(courier)}
                    >
                      Absences
                    </button>
                  )}
                  {canRegenerate && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() =>
                        actions.askRegenerate({
                          userId: courier.id,
                          name,
                          identifierLabel: 'Téléphone',
                          identifier: courier.phone,
                          extraLines: [`Rôle : ${ROLE_LABELS_FR[courier.role]}`],
                        })
                      }
                    >
                      Régénérer le mot de passe
                    </button>
                  )}
                  {canManage &&
                    (inactive ? (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => activate(courier)}
                      >
                        Réactiver
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn-danger"
                        onClick={() => {
                          actions.setError(null);
                          setDeactivating(courier);
                        }}
                      >
                        Désactiver
                      </button>
                    ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {creating && (
        <CreateCourierForm
          onCancel={() => setCreating(false)}
          onCreated={(created) => {
            setCreating(false);
            actions.showCredentials(
              {
                identifierLabel: 'Téléphone',
                identifier: created.user.phone,
                extraLines: [`Rôle : ${ROLE_LABELS_FR[created.user.role]}`],
              },
              created.password,
            );
          }}
        />
      )}
      {deactivating && (
        <ConfirmDialog
          title="Désactiver le coursier"
          message={`${deactivating.firstName} ${deactivating.lastName} ne recevra plus de nouveau travail. Le compte sera désactivé si rien n'est encore en cours : colis, argent ou bon.`}
          confirmLabel="Désactiver"
          busy={busy}
          onConfirm={() => deactivate(deactivating)}
          onCancel={() => setDeactivating(null)}
        />
      )}
      {absences && <CourierAbsencesDialog courier={absences} onClose={() => setAbsences(null)} />}
      {actions.element}
    </section>
  );
}
