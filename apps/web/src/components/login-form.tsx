'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { AUTH_MESSAGES } from '@faffago/shared';
import type { ApiError } from '@/lib/types';

/**
 * The two web logins (A-20): the seller with his email, the staff with a
 * username. The password is sent exactly as typed, never trimmed.
 */
export function LoginForm({
  kind,
  sessionExpired = false,
}: {
  kind: 'vendeur' | 'staff';
  sessionExpired?: boolean;
}) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Epoch ms until which the API asked to wait (429, D-6). */
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const waitSeconds = retryAt ? Math.max(0, Math.ceil((retryAt - now) / 1000)) : 0;

  useEffect(() => {
    if (!retryAt) return;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= retryAt) {
        setRetryAt(null);
        setError(null);
      }
    }, 250);
    return () => clearInterval(timer);
  }, [retryAt]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const body =
      kind === 'vendeur' ? { email: identifier, password } : { username: identifier, password };
    try {
      const response = await fetch(`/api/session/login/${kind}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        router.replace(kind === 'vendeur' ? '/vendeur' : '/admin');
        return;
      }
      const data = (await response.json().catch(() => null)) as ApiError | null;
      if (response.status === 429 && data?.retryAfterSeconds) {
        const at = Date.now() + data.retryAfterSeconds * 1000;
        setNow(Date.now());
        setRetryAt(at);
      } else if (response.status === 400) {
        setError('Remplissez les deux champs.');
      } else {
        setError(data?.message ?? 'Connexion impossible. Réessayez.');
      }
    } catch {
      setError('Connexion impossible. Vérifiez votre connexion internet.');
    } finally {
      setBusy(false);
    }
  }

  const message = retryAt ? AUTH_MESSAGES.tropDeTentatives(waitSeconds) : error;

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {sessionExpired && !message && (
        <p role="status" className="rounded-lg bg-navy/5 p-3 text-sm text-navy">
          {AUTH_MESSAGES.sessionExpiree}
        </p>
      )}
      {message && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {message}
        </p>
      )}
      <div>
        <label htmlFor="identifier" className="field-label">
          {kind === 'vendeur' ? 'Email' : 'Identifiant'}
        </label>
        <input
          id="identifier"
          className="field"
          type={kind === 'vendeur' ? 'email' : 'text'}
          autoComplete="username"
          autoCapitalize="none"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
        />
      </div>
      <div>
        <label htmlFor="password" className="field-label">
          Mot de passe
        </label>
        <input
          id="password"
          className="field"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      <button type="submit" className="btn-primary w-full" disabled={busy || waitSeconds > 0}>
        Se connecter
      </button>
      {kind === 'vendeur' && (
        <p className="text-sm text-navy/70">
          Mot de passe oublié ? Contactez Faffa Go : l&apos;équipe vous remet un nouveau mot de
          passe.
        </p>
      )}
    </form>
  );
}
