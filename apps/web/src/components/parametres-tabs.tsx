'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** `exact`: the page alone; otherwise its sub-pages too (a délégation's localités). */
const TABS = [
  { href: '/admin/parametres', label: 'Tarifs et règles', exact: true },
  { href: '/admin/parametres/zones', label: 'Zones', exact: false },
  { href: '/admin/parametres/geographie', label: 'Géographie', exact: false },
  { href: '/admin/parametres/utilisateurs', label: 'Utilisateurs', exact: false },
] as const;

/**
 * The pages of Paramètres (Admin 4.16): fees and rules, zones with their
 * couriers, the gouvernorats, délégations and localités (D-17, D-51), and
 * the staff accounts.
 */
export function ParametresTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Paramètres" className="mb-6 flex flex-wrap gap-2 border-b border-navy/10">
      {TABS.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-3 text-sm font-semibold ${
              active ? 'border-orange text-navy' : 'border-transparent text-navy/70 hover:text-navy'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
