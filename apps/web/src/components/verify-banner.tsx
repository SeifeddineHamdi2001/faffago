import Link from 'next/link';
import type { SellerVerifySummary } from '@/lib/types';
import { TimeLeft } from './time-left';

/**
 * The Tableau de bord banner: every parcel with less than 24 hours left
 * before its automatic return. Stands in for the "Plus que 24 h pour
 * décider" notification (Vendeur 4.13) until notifications come, after launch.
 */
export function VerifyBanner({ summary }: { summary: SellerVerifySummary }) {
  if (summary.urgent.length === 0) return null;
  const n = summary.urgent.length;
  return (
    <section
      role="alert"
      aria-labelledby="urgent-title"
      className="mb-6 rounded-2xl border-2 border-red-700 bg-red-50 p-4 text-navy"
    >
      <h2 id="urgent-title" className="font-display text-lg font-bold">
        {n === 1
          ? 'Moins de 24 h pour décider sur 1 colis'
          : `Moins de 24 h pour décider sur ${n} colis`}
      </h2>
      <p className="mb-3 text-sm">Sans décision, il vous sera retourné automatiquement.</p>
      <ul className="space-y-2 text-sm">
        {summary.urgent.map((parcel) => (
          <li key={parcel.code} className="flex flex-wrap items-center justify-between gap-2">
            <Link
              href={`/vendeur/colis/${parcel.code}#decision`}
              className="font-semibold underline"
            >
              <span className="font-mono">{parcel.code}</span> · {parcel.recipientName}
            </Link>
            <TimeLeft deadline={parcel.verifyDeadlineAt} serverNow={summary.now} />
          </li>
        ))}
      </ul>
    </section>
  );
}
