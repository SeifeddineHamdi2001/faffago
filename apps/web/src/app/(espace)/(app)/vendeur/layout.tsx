import type { ReactNode } from 'react';
import { ImpersonationBanner } from '@/components/impersonation-banner';
import { LogoutButton } from '@/components/logout-button';
import { NotificationBell } from '@/components/notification-bell';
import { SellerNav } from '@/components/seller-nav';
import { requireMe, serverGetOrNull } from '@/lib/server/session';
import type { SellerMoneyBadges, SellerVerifySummary } from '@/lib/types';

/**
 * The seller space (Vendeur 3). The shop name is always visible. While an
 * admin uses "Voir comme le vendeur", the banner sits on top and there is
 * nothing to log out of: the exit is the banner's Quitter (D-5).
 */
export default async function VendeurLayout({ children }: { children: ReactNode }) {
  const me = await requireMe('vendeur');
  // The À vérifier badge (Vendeur 3). A failed count never blocks the page.
  const summary = await serverGetOrNull<SellerVerifySummary>('vendeur', '/a-verifier/resume');
  const money = await serverGetOrNull<SellerMoneyBadges>('vendeur', '/paiements/resume');
  // The bell (Vendeur 3): always visible, with the unread count.
  const bell = await serverGetOrNull<{ unreadCount: number }>(
    'vendeur',
    '/notifications/unread-count',
  );

  return (
    <div className="min-h-screen">
      {me.impersonation && <ImpersonationBanner banner={me.impersonation.banner} />}
      <header className="flex items-center justify-between bg-navy px-4 py-3 text-white">
        <p className="font-display text-lg font-bold">
          Faffa <span className="text-orange">Go</span>
        </p>
        <div className="flex items-center gap-2">
          <p className="font-semibold">{me.seller?.shopName}</p>
          <NotificationBell
            initialCount={bell?.unreadCount ?? 0}
            href="/vendeur/notifications"
            live={!me.impersonation}
          />
        </div>
      </header>
      <SellerNav
        aVerifierCount={summary?.count ?? 0}
        paiementsCount={money?.bonsVersementEnRoute ?? 0}
        retoursCount={money?.bonsRetourEnRoute ?? 0}
      />
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
