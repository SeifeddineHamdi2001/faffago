import { LoginPage } from '@/components/login-page';

/** Se connecter (Vendeur 2.1): email + password. */
export default async function VendeurConnexion({
  searchParams,
}: {
  searchParams: Promise<{ raison?: string }>;
}) {
  const { raison } = await searchParams;
  return (
    <LoginPage
      kind="vendeur"
      subtitle="Espace vendeur"
      sessionExpired={raison === 'session-expiree'}
    />
  );
}
