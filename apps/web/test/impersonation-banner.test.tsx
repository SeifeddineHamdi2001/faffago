import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImpersonationBanner } from '@/components/impersonation-banner';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, refresh: vi.fn() }) }));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

/** D-5: a banner that says whose account this is, with an exit button. */
describe('ImpersonationBanner', () => {
  it('names the shop and says it is read-only', () => {
    render(<ImpersonationBanner banner="Vous consultez le compte de Boutique Démo" />);
    expect(screen.getByRole('region', { name: 'Consultation' })).toHaveTextContent(
      'Vous consultez le compte de Boutique Démo',
    );
    expect(screen.getByText(/lecture seule/)).toBeInTheDocument();
  });

  it('exits through the API and returns to the Vendeurs screen', async () => {
    const user = userEvent.setup();
    render(<ImpersonationBanner banner="Vous consultez le compte de Boutique Démo" />);
    await user.click(screen.getByRole('button', { name: 'Quitter' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/impersonation', { method: 'DELETE' });
    expect(replace).toHaveBeenCalledWith('/admin/vendeurs');
  });
});
