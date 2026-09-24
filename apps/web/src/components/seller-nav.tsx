'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The seller menu (Vendeur 3). Only the screens built so far are listed;
 * Mes colis, Étiquettes, Ramassages and the rest join it with
 * their steps.
 */
const ITEMS: { href: string; label: string; exact?: boolean }[] = [
  { href: '/vendeur', label: 'Tableau de bord', exact: true },
  { href: '/vendeur/colis/nouveau', label: 'Créer un colis' },
  { href: '/vendeur/colis/import', label: 'Import CSV' },
];

export function SellerNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Menu" className="flex gap-1 bg-navy px-4 pb-3">
      {ITEMS.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
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
          </Link>
        );
      })}
    </nav>
  );
}
