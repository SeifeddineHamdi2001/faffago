import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PERMISSIONS_BY_ROLE } from '@faffago/shared';
import { AdminNav } from '@/components/admin-nav';
import { ParametresTabs } from '@/components/parametres-tabs';

let pathname = '/admin/parametres';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

/** Paramètres (Admin 4.16): Tarifs et règles, then Utilisateurs. */
describe('ParametresTabs', () => {
  it('links both pages and marks the current one', () => {
    pathname = '/admin/parametres';
    render(<ParametresTabs />);
    expect(screen.getByRole('link', { name: 'Tarifs et règles' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Utilisateurs' })).toHaveAttribute(
      'href',
      '/admin/parametres/utilisateurs',
    );
  });

  it('marks Utilisateurs on its own page, not Tarifs et règles', () => {
    pathname = '/admin/parametres/utilisateurs';
    render(<ParametresTabs />);
    expect(screen.getByRole('link', { name: 'Utilisateurs' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Tarifs et règles' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('is reached from the admin menu, which opens on Tarifs et règles', () => {
    render(<AdminNav permissions={[...PERMISSIONS_BY_ROLE.ADMIN]} />);
    expect(screen.getByRole('link', { name: 'Paramètres' })).toHaveAttribute(
      'href',
      '/admin/parametres',
    );
  });
});
