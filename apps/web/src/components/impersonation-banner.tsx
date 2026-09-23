'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Voir comme le vendeur (D-5): always on top of the seller space while an
 * admin is looking, with the exit. The API refuses every write meanwhile.
 */
export function ImpersonationBanner({ banner }: { banner: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function exit() {
    setBusy(true);
    await fetch('/api/impersonation', { method: 'DELETE' });
    router.replace('/admin/vendeurs');
  }

  return (
    <section
      aria-label="Consultation"
      className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-2 bg-orange px-4 py-3 text-navy"
    >
      <div>
        <p className="font-semibold">{banner}</p>
        <p className="text-sm text-navy/80">
          Consultation en lecture seule : aucune action possible.
        </p>
      </div>
      <button
        type="button"
        onClick={exit}
        disabled={busy}
        className="rounded-lg bg-white px-4 py-2 font-semibold text-orange-dark"
      >
        Quitter
      </button>
    </section>
  );
}
