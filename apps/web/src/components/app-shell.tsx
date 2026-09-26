'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * The frame of the seller space and the back office (D-94): the menu in a
 * sidebar on a computer; on a phone a top bar with a burger that slides the
 * same sidebar in. The top bar (shop or user name, bell) is always visible.
 */
export function AppShell({
  brand,
  sidebarHeader,
  nav,
  sidebarFooter,
  topBar,
  banner,
  children,
}: {
  brand: ReactNode;
  /** Under the logo in the sidebar (name, role). */
  sidebarHeader?: ReactNode;
  nav: ReactNode;
  /** At the bottom of the sidebar (Se déconnecter). */
  sidebarFooter?: ReactNode;
  /** Right of the top bar: always visible (shop name, bell). */
  topBar: ReactNode;
  /** Above the top bar, sticky with it (Voir comme le vendeur, D-5). */
  banner?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const closeRef = useRef<HTMLButtonElement>(null);
  const burgerRef = useRef<HTMLButtonElement>(null);

  // A link was followed: the drawer has done its job.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        burgerRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="md:flex">
      {open && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-40 bg-navy-deep/60 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        id="menu-lateral"
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-navy p-4 text-white transition-[transform,visibility] md:sticky md:top-0 md:z-auto md:h-screen md:w-60 md:max-w-none md:translate-x-0 md:visible print:hidden ${
          open ? 'visible translate-x-0' : 'invisible -translate-x-full'
        }`}
      >
        <div className="mb-4 flex items-center justify-between">
          {brand}
          <button
            ref={closeRef}
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fermer le menu"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-white/10 md:hidden"
          >
            <svg
              viewBox="0 0 24 24"
              width="24"
              height="24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {sidebarHeader && <div className="mb-4">{sidebarHeader}</div>}
        <div className="flex-1">{nav}</div>
        {sidebarFooter && <div className="mt-4">{sidebarFooter}</div>}
      </aside>
      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-30 print:hidden">
          {banner}
          <header className="flex items-center gap-2 bg-navy px-2 py-2 text-white md:px-8">
            <button
              ref={burgerRef}
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Ouvrir le menu"
              aria-expanded={open}
              aria-controls="menu-lateral"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-white/10 md:hidden"
            >
              <svg
                viewBox="0 0 24 24"
                width="24"
                height="24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="md:hidden">{brand}</div>
            <div className="ml-auto flex min-w-0 items-center gap-2">{topBar}</div>
          </header>
        </div>
        <main className="p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
