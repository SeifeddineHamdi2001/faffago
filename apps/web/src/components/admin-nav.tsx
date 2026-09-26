'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Permission } from '@faffago/shared';

/**
 * The back office menu (Admin 3): "each role only sees the menu items it can
 * use". Only the screens built so far are listed; each phase adds its own.
 */
const ITEMS: { href: string; label: string; permission: Permission; badge?: 'chats' }[] = [
  { href: '/admin/scan', label: 'Scan', permission: Permission.SCAN_DEPOT },
  { href: '/admin/colis', label: 'Colis', permission: Permission.COLIS_LECTURE },
  {
    href: '/admin/ramassages',
    label: 'Ramassages',
    permission: Permission.PLANIFIER_RAMASSAGES_TOURNEES,
  },
  {
    href: '/admin/tournees',
    label: 'Tournées',
    permission: Permission.PLANIFIER_RAMASSAGES_TOURNEES,
  },
  { href: '/admin/a-verifier', label: 'À vérifier', permission: Permission.SUIVI_A_VERIFIER },
  { href: '/admin/exceptions', label: 'Exceptions', permission: Permission.EXCEPTIONS_LECTURE },
  { href: '/admin/chats', label: 'Chats', permission: Permission.CHATS_STAFF, badge: 'chats' },
  // Argent (Admin 3).
  { href: '/admin/caisse', label: 'Caisse', permission: Permission.CAISSE },
  { href: '/admin/paiements', label: 'Paiements vendeurs', permission: Permission.BONS_VERSEMENT },
  { href: '/admin/retours', label: 'Retours', permission: Permission.RETOURS_LECTURE },
  { href: '/admin/paie', label: 'Paie coursiers', permission: Permission.PAIE_COURSIERS },
  { href: '/admin/rapports', label: 'Rapports', permission: Permission.RAPPORTS },
  { href: '/admin/vendeurs', label: 'Vendeurs', permission: Permission.VENDEURS_LECTURE },
  { href: '/admin/coursiers', label: 'Coursiers', permission: Permission.COURSIERS_LECTURE },
  { href: '/admin/parametres', label: 'Paramètres', permission: Permission.PARAMETRES },
];

export function AdminNav({
  permissions,
  chatsUnread = 0,
}: {
  permissions: Permission[];
  /** Conversations with something new for this person (Admin 4.8). */
  chatsUnread?: number;
}) {
  const pathname = usePathname();
  const items = ITEMS.filter((item) => permissions.includes(item.permission));

  return (
    <nav aria-label="Menu" className="flex gap-1 md:flex-col">
      {items.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`flex-1 rounded-lg px-3 py-3 text-center text-sm font-semibold md:flex-none md:text-left ${
              active ? 'bg-orange text-navy' : 'text-white/80 hover:bg-white/10'
            }`}
          >
            {item.label}
            {item.badge === 'chats' && chatsUnread > 0 && (
              <span
                className="ml-2 inline-flex min-w-6 items-center justify-center rounded-full bg-orange px-1.5 text-xs font-bold text-navy"
                aria-label={`${chatsUnread} chat${chatsUnread > 1 ? 's' : ''} avec du nouveau`}
              >
                {chatsUnread}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
