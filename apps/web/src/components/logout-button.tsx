'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Se déconnecter: this device only; other devices stay logged in. */
export function LogoutButton({ loginPath, className }: { loginPath: string; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      className={className}
      onClick={async () => {
        setBusy(true);
        await fetch('/api/session/logout', { method: 'POST' });
        router.replace(loginPath);
      }}
    >
      Se déconnecter
    </button>
  );
}
