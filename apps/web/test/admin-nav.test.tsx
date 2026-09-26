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
      'À vérifier',
      'Exceptions',
      'Caisse',
      'Paiements vendeurs',
      'Retours',
      'Paie coursiers',
      'Rapports',
      'Vendeurs',
      'Coursiers',
      'Paramètres',
    ]);
  });

  it('gives Dépôt the operations screens, the Caisse and Retours, never payments, pay or Paramètres', () => {
    render(<AdminNav permissions={[...PERMISSIONS_BY_ROLE.DEPOT]} />);
    expect(links()).toEqual([
      'Scan',
      'Colis',
      'Ramassages',
      'Tournées',
      'Exceptions',
      'Caisse',
      'Retours',
      'Vendeurs',
      'Coursiers',
    ]);
  });

  it('gives Service client Colis, À vérifier, Exceptions, Retours, Vendeurs and Coursiers, no Scan nor money (D-11)', () => {
    render(<AdminNav permissions={[...PERMISSIONS_BY_ROLE.SERVICE_CLIENT]} />);
    expect(links()).toEqual([
      'Colis',
      'À vérifier',
      'Exceptions',
      'Retours',
      'Vendeurs',
      'Coursiers',
    ]);
  });

  it('marks the current screen', () => {
    render(<AdminNav permissions={[...PERMISSIONS_BY_ROLE.ADMIN]} />);
    expect(screen.getByRole('link', { name: 'Coursiers' })).toHaveAttribute('aria-current', 'page');
  });
});
