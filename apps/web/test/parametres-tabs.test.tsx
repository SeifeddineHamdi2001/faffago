import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PERMISSIONS_BY_ROLE } from '@faffago/shared';
import { AdminNav } from '@/components/admin-nav';
import { ParametresTabs } from '@/components/parametres-tabs';

let pathname = '/admin/parametres';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

/** Paramètres (Admin 4.16): Tarifs et règles, Zones, Géographie, Utilisateurs. */
describe('ParametresTabs', () => {
  it('links every page and marks the current one', () => {
    pathname = '/admin/parametres';
    render(<ParametresTabs />);
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Tarifs et règles',
      'Zones',
      'Géographie',
      'Utilisateurs',
    ]);
    expect(screen.getByRole('link', { name: 'Tarifs et règles' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Zones' })).toHaveAttribute(
      'href',
      '/admin/parametres/zones',
    );
    expect(screen.getByRole('link', { name: 'Géographie' })).toHaveAttribute(
      'href',
      '/admin/parametres/geographie',
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

  it('keeps Géographie marked on a délégation’s localités', () => {
    pathname = '/admin/parametres/geographie/3f1e4b6a-2c7d-4e8f-9a0b-1c2d3e4f5a6b';
    render(<ParametresTabs />);
    expect(screen.getByRole('link', { name: 'Géographie' })).toHaveAttribute(
      'aria-current',
      'page',
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
