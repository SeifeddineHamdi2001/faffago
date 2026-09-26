import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { ImpersonationBanner } from '@/components/impersonation-banner';
import { LogoutButton } from '@/components/logout-button';
import { NotificationBell } from '@/components/notification-bell';
import { SellerNav } from '@/components/seller-nav';
import { requireMe, serverGetOrNull } from '@/lib/server/session';
import type { SellerMoneyBadges, SellerVerifySummary } from '@/lib/types';

/**
 * The seller space (Vendeur 3): sidebar on a computer, burger menu on a
 * phone (D-94). The shop name and the bell are always visible. While an
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
    <AppShell
      banner={me.impersonation && <ImpersonationBanner banner={me.impersonation.banner} />}
      brand={
        <p className="font-display text-xl font-bold">
          Faffa <span className="text-orange">Go</span>
        </p>
      }
      nav={
        <SellerNav
          aVerifierCount={summary?.count ?? 0}
          paiementsCount={money?.bonsVersementEnRoute ?? 0}
          retoursCount={money?.bonsRetourEnRoute ?? 0}
        />
      }
      sidebarFooter={
        !me.impersonation && (
          <LogoutButton
            loginPath="/vendeur/connexion"
            className="text-sm text-white/80 underline"
          />
        )
      }
      topBar={
        <>
          <p className="truncate font-semibold">{me.seller?.shopName}</p>
          <NotificationBell
            initialCount={bell?.unreadCount ?? 0}
            href="/vendeur/notifications"
            live={!me.impersonation}
          />
        </>
      }
    >
      <div className="mx-auto max-w-4xl">{children}</div>
    </AppShell>
  );
}
