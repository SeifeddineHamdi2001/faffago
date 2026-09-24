import type { ReactNode } from 'react';
import { ImpersonationBanner } from '@/components/impersonation-banner';
import { LogoutButton } from '@/components/logout-button';
import { SellerNav } from '@/components/seller-nav';
import { requireMe } from '@/lib/server/session';

/**
 * The seller space (Vendeur 3). The shop name is always visible. While an
 * admin uses "Voir comme le vendeur", the banner sits on top and there is
 * nothing to log out of: the exit is the banner's Quitter (D-5).
 */
export default async function VendeurLayout({ children }: { children: ReactNode }) {
  const me = await requireMe('vendeur');

  return (
    <div className="min-h-screen">
      {me.impersonation && <ImpersonationBanner banner={me.impersonation.banner} />}
      <header className="flex items-center justify-between bg-navy px-4 py-3 text-white">
        <p className="font-display text-lg font-bold">
          Faffa <span className="text-orange">Go</span>
        </p>
        <p className="font-semibold">{me.seller?.shopName}</p>
      </header>
      <SellerNav />
      <main className="mx-auto max-w-4xl p-4">
        {children}
        {!me.impersonation && (
          <div className="mt-8">
            <LogoutButton loginPath="/vendeur/connexion" className="btn-secondary" />
          </div>
        )}
      </main>
    </div>
  );
}
