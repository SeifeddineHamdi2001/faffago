'use client';

import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { bff } from '@/lib/client/call';
import type { ApiError } from '@/lib/types';
import { CredentialsDialog } from './credentials-dialog';
import { ConfirmDialog } from './dialog';

export interface CredentialsTarget {
  identifierLabel: string;
  identifier: string;
  extraLines?: string[];
}

export interface RegenerateTarget extends CredentialsTarget {
  userId: string;
  name: string;
}

/**
 * Régénérer le mot de passe, and the one-time "Copier les identifiants" box
 * it ends with (A-20). The password lives only in this state while the box is
 * open; closing it drops it.
 */
export function useAccountActions() {
  const router = useRouter();
  const [confirming, setConfirming] = useState<RegenerateTarget | null>(null);
  const [credentials, setCredentials] = useState<(CredentialsTarget & { password: string }) | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function regenerate(target: RegenerateTarget) {
    setBusy(true);
    const result = await bff<{ password: string }>(
      'POST',
      `accounts/${target.userId}/regenerate-password`,
    );
    setBusy(false);
    setConfirming(null);
    if (result.ok) {
      setCredentials({ ...target, password: result.data.password });
    } else {
      setError(result.error);
    }
  }

  const element: ReactNode = (
    <>
      {confirming && (
        <ConfirmDialog
          title="Régénérer le mot de passe"
          message={`Un nouveau mot de passe sera généré pour ${confirming.name}. Toutes ses sessions seront fermées immédiatement.`}
          confirmLabel="Régénérer"
          busy={busy}
          onConfirm={() => regenerate(confirming)}
          onCancel={() => setConfirming(null)}
        />
      )}
      {credentials && (
        <CredentialsDialog
          identifierLabel={credentials.identifierLabel}
          identifier={credentials.identifier}
          password={credentials.password}
          extraLines={credentials.extraLines}
          onClose={() => {
            setCredentials(null);
            router.refresh();
          }}
        />
      )}
    </>
  );

  return {
    askRegenerate: (target: RegenerateTarget) => {
      setError(null);
      setConfirming(target);
    },
    showCredentials: (target: CredentialsTarget, password: string) =>
      setCredentials({ ...target, password }),
    error,
    setError,
    element,
  };
}

export function ErrorAlert({ error, children }: { error: ApiError; children?: ReactNode }) {
  return (
    <div role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-900">
      <p className="font-semibold">{error.message}</p>
      {error.blockers && error.blockers.length > 0 && (
        <ul className="mt-2 list-disc pl-5">
          {error.blockers.map((blocker) => (
            <li key={blocker.type}>{blocker.label}</li>
          ))}
        </ul>
      )}
      {children}
    </div>
  );
}

/** Maps zod issues to the field they belong to, for the forms. */
export function fieldErrors(issues: { path: (string | number)[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? '');
    out[key] ??= issue.message;
  }
  return out;
}
