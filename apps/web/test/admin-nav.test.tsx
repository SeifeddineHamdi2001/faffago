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
    expect(links()).toEqual(['Vendeurs', 'Coursiers', 'Paramètres']);
  });

  it('gives Dépôt and Service client Vendeurs and Coursiers, never Paramètres', () => {
    for (const role of ['DEPOT', 'SERVICE_CLIENT'] as const) {
      render(<AdminNav permissions={[...PERMISSIONS_BY_ROLE[role]]} />);
      expect(links()).toEqual(['Vendeurs', 'Coursiers']);
      document.body.innerHTML = '';
    }
  });

  it('marks the current screen', () => {
    render(<AdminNav permissions={[...PERMISSIONS_BY_ROLE.ADMIN]} />);
    expect(screen.getByRole('link', { name: 'Coursiers' })).toHaveAttribute('aria-current', 'page');
  });
});
