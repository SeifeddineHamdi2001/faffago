'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The seller menu (Vendeur 3). Only the screens built so far are listed;
 * Paiements, Retours, Notifications and the rest join it with their steps.
 * À vérifier carries its count (Vendeur 3): with notifications post-launch,
 * the badge is how no seller misses a decision.
 */
const ITEMS: { href: string; label: string; exact?: boolean; badge?: 'aVerifier' }[] = [
  { href: '/vendeur', label: 'Tableau de bord', exact: true },
  { href: '/vendeur/colis', label: 'Mes colis', exact: true },
  { href: '/vendeur/a-verifier', label: 'À vérifier', badge: 'aVerifier' },
  { href: '/vendeur/colis/nouveau', label: 'Créer un colis' },
  { href: '/vendeur/colis/import', label: 'Import CSV' },
  { href: '/vendeur/ramassages', label: 'Ramassages' },
  { href: '/vendeur/profil', label: 'Profil' },
];

export function SellerNav({ aVerifierCount = 0 }: { aVerifierCount?: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Menu" className="flex flex-wrap gap-1 bg-navy px-4 pb-3">
      {ITEMS.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        const count = item.badge === 'aVerifier' ? aVerifierCount : 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${
              active ? 'bg-orange text-navy' : 'text-white/80 hover:bg-white/10'
            }`}
          >
            {item.label}
            {count > 0 && (
              <span
                className="ml-2 inline-flex min-w-6 items-center justify-center rounded-full bg-orange px-1.5 text-xs font-bold text-navy"
                aria-label={`${count} colis à vérifier`}
              >
                {count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
