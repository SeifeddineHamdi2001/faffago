import Link from 'next/link';

/**
 * Placeholder until the landing page (phase 8, docs/landing.md). It only
 * carries the entry point that already exists: Se connecter.
 */
const TEXT = {
  fr: { login: 'Se connecter', other: 'العربية', otherHref: '/ar' },
  // TO VERIFY: to be read by a native speaker with the rest of the public site.
  ar: { login: 'تسجيل الدخول', other: 'Français', otherHref: '/fr' },
} as const;

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const text = TEXT[locale === 'ar' ? 'ar' : 'fr'];

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-navy p-4 text-white">
      <p className="font-display text-4xl font-bold">
        Faffa <span className="text-orange">Go</span>
      </p>
      <Link href="/vendeur/connexion" className="btn-primary">
        {text.login}
      </Link>
      <Link
        href={text.otherHref}
        className="text-sm text-white/80 underline"
        lang={locale === 'ar' ? 'fr' : 'ar'}
      >
        {text.other}
      </Link>
    </main>
  );
}
