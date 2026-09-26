import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from '@/components/app-shell';

vi.mock('next/navigation', () => ({ usePathname: () => '/vendeur' }));

/** Sidebar on a computer, burger menu on a phone (D-94). */

function renderShell() {
  return render(
    <AppShell
      brand={<p>Faffa Go</p>}
      nav={
        <nav aria-label="Menu">
          <a href="/vendeur/colis">Mes colis</a>
        </nav>
      }
      topBar={<p>Boutique Démo</p>}
    >
      <p>Contenu</p>
    </AppShell>,
  );
}

describe('AppShell', () => {
  it('opens the menu with the burger and closes it with Fermer or Escape', () => {
    renderShell();
    const burger = screen.getByRole('button', { name: 'Ouvrir le menu' });
    const menu = document.getElementById('menu-lateral')!;
    expect(burger).toHaveAttribute('aria-expanded', 'false');
    expect(menu.className).toContain('-translate-x-full');

    fireEvent.click(burger);
    expect(burger).toHaveAttribute('aria-expanded', 'true');
    expect(menu.className).toContain('translate-x-0');
    expect(screen.getByRole('button', { name: 'Fermer le menu' })).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Fermer le menu' }));
    expect(burger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(burger);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(burger).toHaveAttribute('aria-expanded', 'false');
    expect(burger).toHaveFocus();
  });

  it('keeps the top bar and the page visible', () => {
    renderShell();
    expect(screen.getByText('Boutique Démo')).toBeInTheDocument();
    expect(screen.getByText('Contenu')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mes colis' })).toBeInTheDocument();
  });
});
