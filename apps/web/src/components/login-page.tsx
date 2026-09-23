import { LoginForm } from './login-form';

/** The frame shared by the two login pages. */
export function LoginPage({
  kind,
  subtitle,
  sessionExpired,
}: {
  kind: 'vendeur' | 'staff';
  subtitle: string;
  sessionExpired: boolean;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-navy p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <p className="font-display text-2xl font-bold text-navy">
          Faffa <span className="text-orange-dark">Go</span>
        </p>
        <h1 className="mt-4 font-display text-xl font-bold">Se connecter</h1>
        <p className="mb-6 text-sm text-navy/70">{subtitle}</p>
        <LoginForm kind={kind} sessionExpired={sessionExpired} />
      </div>
    </main>
  );
}
