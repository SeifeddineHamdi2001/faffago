'use client';

import { useState } from 'react';
import { Dialog } from './dialog';

/**
 * "Copier les identifiants" (Admin v1.10, A-20). The generated password is
 * shown once, here, and nowhere else: it is not stored, logged or kept in any
 * state once the dialog closes. The admin must confirm he noted it before the
 * dialog lets him go.
 */
export function CredentialsDialog({
  identifierLabel,
  identifier,
  password,
  extraLines = [],
  onClose,
}: {
  identifierLabel: string;
  identifier: string;
  password: string;
  extraLines?: string[];
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [noted, setNoted] = useState(false);

  async function copy() {
    const text = [
      `${identifierLabel} : ${identifier}`,
      `Mot de passe : ${password}`,
      ...extraLines,
    ];
    await navigator.clipboard.writeText(text.join('\n'));
    setCopied(true);
  }

  return (
    <Dialog title="Mot de passe généré">
      <dl className="mb-4 space-y-2 rounded-xl bg-navy/5 p-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-navy/70">{identifierLabel}</dt>
          <dd className="font-mono font-semibold">{identifier}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-navy/70">Mot de passe</dt>
          <dd className="font-mono text-base font-bold tracking-wider">{password}</dd>
        </div>
        {extraLines.map((line) => (
          <p key={line} className="text-navy/70">
            {line}
          </p>
        ))}
      </dl>
      <p className="mb-4 text-sm font-semibold text-orange-dark">
        Ce mot de passe ne sera plus affiché. Remettez-le à la personne concernée.
      </p>
      <button type="button" className="btn-primary mb-4 w-full" onClick={copy}>
        Copier les identifiants
      </button>
      {copied && (
        <p className="mb-4 text-center text-sm text-green-700" role="status">
          Copié
        </p>
      )}
      <label className="mb-4 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={noted} onChange={(e) => setNoted(e.target.checked)} />
        J&apos;ai noté le mot de passe
      </label>
      <button type="button" className="btn-secondary w-full" disabled={!noted} onClick={onClose}>
        Fermer
      </button>
    </Dialog>
  );
}
