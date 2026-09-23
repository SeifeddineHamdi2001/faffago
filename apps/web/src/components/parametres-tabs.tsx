'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/admin/parametres', label: 'Tarifs et règles' },
  { href: '/admin/parametres/utilisateurs', label: 'Utilisateurs' },
] as const;

/**
 * The pages of Paramètres built so far (Admin 4.16). Zones, délégations and
 * localités join them with the zones and Tournées (phase 5, D-18).
 */
export function ParametresTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Paramètres" className="mb-6 flex gap-2 border-b border-navy/10">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
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
