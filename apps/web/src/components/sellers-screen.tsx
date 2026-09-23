'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Permission,
  SELLER_ACCOUNT_STATE_LABELS_FR,
  SELLER_STATUT_LABELS_FR,
  type SellerAccountState,
  type SellerStatut,
} from '@faffago/shared';
import type { ApiError, SellerRow } from '@/lib/types';
import { ErrorAlert, useAccountActions } from './account-actions';

/**
 * Vendeurs (Admin 4.14, D-11). Dépôt and Service client see the shop and the
 * contact; the admin also sees the login email and the statut, regenerates
 * the password and opens "Voir comme le vendeur". Creating a seller comes in
 * phase 3, with the CIN documents.
 */
export function SellersScreen({
  rows,
  permissions,
}: {
  rows: SellerRow[];
  permissions: Permission[];
}) {
  const router = useRouter();
  const actions = useAccountActions();
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const canRegenerate = permissions.includes(Permission.REGENERER_MOT_DE_PASSE);
  const canImpersonate = permissions.includes(Permission.VOIR_COMME_VENDEUR);

  async function viewAs(seller: SellerRow) {
    setOpening(seller.id);
    setError(null);
    const response = await fetch('/api/impersonation', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sellerId: seller.id }),
    });
    setOpening(null);
    if (response.ok) {
      router.push('/vendeur');
      return;
    }
    const data = (await response.json().catch(() => null)) as ApiError | null;
    setError(data ?? { message: 'Consultation impossible. Réessayez.' });
  }

  const shownError = error ?? actions.error;

  return (
    <section>
      <h1 className="mb-6 font-display text-2xl font-bold text-navy">Vendeurs</h1>
      {shownError && <ErrorAlert error={shownError} />}
      {rows.length === 0 && <p className="text-navy/70">Aucun vendeur pour l&apos;instant.</p>}
      <ul className="space-y-3">
        {rows.map((seller) => (
          <li key={seller.id} className="card flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-semibold text-navy">{seller.shopName}</p>
              <p className="text-sm text-navy/70">
                {seller.contactFullName} · {seller.contactPhone}
              </p>
              {seller.email && <p className="text-sm text-navy/70">{seller.email}</p>}
              {seller.statut && (
                <p className="mt-1 text-sm">
                  <span className="text-navy/70">
                    {SELLER_STATUT_LABELS_FR[seller.statut as SellerStatut]}
                  </span>
                  {seller.accountState && (
                    <span
                      className={
                        seller.accountState === 'ACTIF' ? 'badge-ok ml-2' : 'badge-muted ml-2'
                      }
                    >
                      {SELLER_ACCOUNT_STATE_LABELS_FR[seller.accountState as SellerAccountState]}
                    </span>
                  )}
                </p>
              )}
            </div>
            {(canRegenerate || canImpersonate) && (
              <div className="flex flex-wrap gap-2">
                {canImpersonate && (
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={opening === seller.id}
                    onClick={() => viewAs(seller)}
                  >
                    Voir comme le vendeur
                  </button>
                )}
                {canRegenerate && seller.userId && seller.email && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() =>
                      actions.askRegenerate({
                        userId: seller.userId!,
                        name: seller.shopName,
                        identifierLabel: 'Email',
                        identifier: seller.email!,
                      })
                    }
                  >
                    Régénérer le mot de passe
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {actions.element}
    </section>
  );
}
