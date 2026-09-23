import { LoginPage } from '@/components/login-page';

/** Back office login: username + password (A-20). */
export default async function AdminConnexion({
  searchParams,
}: {
  searchParams: Promise<{ raison?: string }>;
}) {
  const { raison } = await searchParams;
  return (
    <LoginPage
      kind="staff"
      subtitle="Équipe Faffa Go"
      sessionExpired={raison === 'session-expiree'}
    />
  );
}
