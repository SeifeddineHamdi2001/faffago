import type { ReactNode } from 'react';
import { ROLE_LABELS_FR } from '@faffago/shared';
import { AdminNav } from '@/components/admin-nav';
import { LogoutButton } from '@/components/logout-button';
import { requireMe } from '@/lib/server/session';

/**
 * The back office (Admin 3): sidebar on a computer, bottom bar on a phone.
 * Only Admin, Dépôt and Service client get past requireMe.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const me = await requireMe('admin');

  return (
    <div className="min-h-screen md:flex">
      <aside className="bg-navy text-white md:flex md:w-60 md:flex-col md:p-4">
        <div className="flex items-center justify-between p-4 md:mb-6 md:block md:p-0">
          <p className="font-display text-xl font-bold">
            Faffa <span className="text-orange">Go</span>
          </p>
          <div className="text-right text-sm md:mt-4 md:text-left">
            <p className="font-semibold">
              {me.firstName} {me.lastName}
            </p>
            <p className="text-white/70">{ROLE_LABELS_FR[me.role]}</p>
          </div>
        </div>
        <div className="fixed inset-x-0 bottom-0 z-30 bg-navy p-2 md:static md:flex-1 md:p-0">
          <AdminNav permissions={me.permissions} />
        </div>
        <div className="hidden md:block">
          <LogoutButton loginPath="/admin/connexion" className="text-sm text-white/80 underline" />
        </div>
      </aside>
      <main className="flex-1 p-4 pb-24 md:p-8">
        {children}
        <div className="mt-8 md:hidden">
          <LogoutButton loginPath="/admin/connexion" className="btn-secondary w-full" />
        </div>
      </main>
    </div>
  );
}
