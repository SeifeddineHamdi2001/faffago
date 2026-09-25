'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The seller menu (Vendeur 3). À vérifier carries its count: with
 * notifications post-launch, the badge is how no seller misses a decision.
 * Paiements and Retours count the bons on their way to him (D-83).
 */
type Badge = 'aVerifier' | 'paiements' | 'retours';

const BADGE_LABEL: Record<Badge, (n: number) => string> = {
  aVerifier: (n) => `${n} colis à vérifier`,
  paiements: (n) => `${n} bon(s) de versement en route`,
  retours: (n) => `${n} bon(s) de retour en route`,
};

const ITEMS: { href: string; label: string; exact?: boolean; badge?: Badge }[] = [
  { href: '/vendeur', label: 'Tableau de bord', exact: true },
  { href: '/vendeur/colis', label: 'Mes colis', exact: true },
  { href: '/vendeur/a-verifier', label: 'À vérifier', badge: 'aVerifier' },
  { href: '/vendeur/colis/nouveau', label: 'Créer un colis' },
  { href: '/vendeur/colis/import', label: 'Import CSV' },
  { href: '/vendeur/ramassages', label: 'Ramassages' },
  { href: '/vendeur/paiements', label: 'Paiements', badge: 'paiements' },
  { href: '/vendeur/retours', label: 'Retours', badge: 'retours' },
  { href: '/vendeur/profil', label: 'Profil' },
];

export function SellerNav({
  aVerifierCount = 0,
  paiementsCount = 0,
  retoursCount = 0,
}: {
  aVerifierCount?: number;
  paiementsCount?: number;
  retoursCount?: number;
}) {
  const counts: Record<Badge, number> = {
    aVerifier: aVerifierCount,
    paiements: paiementsCount,
    retours: retoursCount,
  };
  const pathname = usePathname();
  return (
    <nav aria-label="Menu" className="flex flex-wrap gap-1 bg-navy px-4 pb-3">
      {ITEMS.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        const count = item.badge ? counts[item.badge] : 0;
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
                aria-label={BADGE_LABEL[item.badge!](count)}
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
