import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PERMISSIONS_BY_ROLE } from '@faffago/shared';
import { AdminNav } from '@/components/admin-nav';

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/coursiers' }));

/** "Each role only sees the menu items it can use" (Admin 3). */

function links() {
  return screen.getAllByRole('link').map((link) => link.textContent);
}

describe('AdminNav', () => {
  it('gives the admin every built screen', () => {
    render(<AdminNav permissions={[...PERMISSIONS_BY_ROLE.ADMIN]} />);
    expect(links()).toEqual([
      'Scan',
      'Colis',
      'Ramassages',
      'Tournées',
      'Vendeurs',
      'Coursiers',
      'Paramètres',
    ]);
  });

  it('gives Dépôt the Scan, Colis, Ramassages, Tournées, Vendeurs and Coursiers, never Paramètres', () => {
    render(<AdminNav permissions={[...PERMISSIONS_BY_ROLE.DEPOT]} />);
    expect(links()).toEqual(['Scan', 'Colis', 'Ramassages', 'Tournées', 'Vendeurs', 'Coursiers']);
  });

  it('gives Service client Colis, Vendeurs and Coursiers, no Scan nor planning (Admin 2, D-11)', () => {
    render(<AdminNav permissions={[...PERMISSIONS_BY_ROLE.SERVICE_CLIENT]} />);
    expect(links()).toEqual(['Colis', 'Vendeurs', 'Coursiers']);
  });

  it('marks the current screen', () => {
    render(<AdminNav permissions={[...PERMISSIONS_BY_ROLE.ADMIN]} />);
    expect(screen.getByRole('link', { name: 'Coursiers' })).toHaveAttribute('aria-current', 'page');
  });
});
