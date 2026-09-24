import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSIONS_BY_ROLE } from '@faffago/shared';
import { SellerDetailScreen } from '@/components/seller-detail-screen';
import { SellersScreen } from '@/components/sellers-screen';
import type { SellerDetail } from '@/lib/types';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh, replace: vi.fn() }) }));

const bff = vi.fn();
vi.mock('@/lib/client/call', () => ({ bff: (...args: unknown[]) => bff(...args) }));

beforeEach(() => {
  bff.mockReset();
  refresh.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

const admin = [...PERMISSIONS_BY_ROLE.ADMIN];
const depot = [...PERMISSIONS_BY_ROLE.DEPOT];

function file(name: string, size = 10) {
  return new File([new Uint8Array(size)], name, { type: 'image/jpeg' });
}

async function fillSeller(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Nom de la boutique'), 'Bijoux Yasmine');
  await user.selectOptions(screen.getByLabelText('Catégorie de produits'), 'BIJOUX_ACCESSOIRES');
  await user.type(screen.getByLabelText('Prénom'), 'Yasmine');
  await user.type(screen.getByLabelText('Nom'), 'Trabelsi');
  await user.type(screen.getByLabelText('Téléphone'), '22123456');
  await user.type(screen.getByLabelText('Email (identifiant de connexion)'), 'yasmine@exemple.tn');
}

describe('Créer un vendeur (Admin 4.14, D-33)', () => {
  it('is offered to the admin only', () => {
    const { unmount } = render(<SellersScreen rows={[]} permissions={depot} />);
    expect(screen.queryByRole('button', { name: 'Créer un vendeur' })).toBeNull();
    unmount();
    render(<SellersScreen rows={[]} permissions={admin} />);
    expect(screen.getByRole('button', { name: 'Créer un vendeur' })).toBeTruthy();
  });

  it('asks for CIN front and back, and the patente only for Patente', async () => {
    const user = userEvent.setup();
    render(<SellersScreen rows={[]} permissions={admin} />);
    await user.click(screen.getByRole('button', { name: 'Créer un vendeur' }));

    const fileInputs = () =>
      Array.from(document.querySelectorAll('input[type=file]')).map(
        (input) => document.querySelector(`label[for="${input.id}"]`)?.textContent,
      );
    expect(fileInputs()).toEqual(['CIN (recto)', 'CIN (verso)']);

    await user.click(screen.getByRole('radio', { name: 'Patente' }));
    expect(fileInputs()).toEqual(['CIN (recto)', 'CIN (verso)', 'Patente']);
    await user.click(screen.getByRole('radio', { name: 'Auto-entrepreneur' }));
    expect(fileInputs()).toEqual(['CIN (recto)', 'CIN (verso)', 'Carte auto-entrepreneur']);
  });

  it('refuses a missing document or one over 10 MB before uploading anything', async () => {
    const user = userEvent.setup();
    render(<SellersScreen rows={[]} permissions={admin} />);
    await user.click(screen.getByRole('button', { name: 'Créer un vendeur' }));
    await fillSeller(user);
    await user.upload(screen.getByLabelText('CIN (recto)'), file('recto.jpg', 11 * 1024 * 1024));
    await user.click(screen.getByRole('button', { name: 'Créer' }));

    expect(screen.getByText('Fichier trop volumineux : 10 Mo maximum.')).toBeTruthy();
    expect(screen.getByText('Document obligatoire')).toBeTruthy();
    expect(bff).not.toHaveBeenCalled();
  });

  it('sends the account and its documents in one multipart request, then shows the password once', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({
      ok: true,
      data: {
        seller: { id: 's9', email: 'yasmine@exemple.tn', shopName: 'Bijoux Yasmine' },
        password: 'Kx7mPq2wZr9t',
      },
    });
    render(<SellersScreen rows={[]} permissions={admin} />);
    await user.click(screen.getByRole('button', { name: 'Créer un vendeur' }));
    await fillSeller(user);
    await user.upload(screen.getByLabelText('CIN (recto)'), file('recto.jpg'));
    await user.upload(screen.getByLabelText('CIN (verso)'), file('verso.jpg'));
    await user.click(screen.getByRole('button', { name: 'Créer' }));

    expect(bff).toHaveBeenCalledTimes(1);
    const [method, path, body] = bff.mock.calls[0]!;
    expect([method, path]).toEqual(['POST', 'sellers']);
    const form = body as FormData;
    expect(form.get('email')).toBe('yasmine@exemple.tn');
    expect(form.get('statut')).toBe('CIN_UNIQUEMENT');
    expect((form.get('CIN_RECTO') as File).name).toBe('recto.jpg');
    expect((form.get('CIN_VERSO') as File).name).toBe('verso.jpg');
    expect(form.get('PATENTE')).toBeNull();

    const dialog = screen.getByRole('dialog', { name: 'Mot de passe généré' });
    expect(within(dialog).getByText('yasmine@exemple.tn')).toBeTruthy();
    expect(within(dialog).getByText('Kx7mPq2wZr9t')).toBeTruthy();
  });
});

const detail: SellerDetail = {
  id: 's1',
  userId: 'u1',
  shopName: 'Bijoux Yasmine',
  contactFullName: 'Yasmine Trabelsi',
  contactFirstName: 'Yasmine',
  contactLastName: 'Trabelsi',
  contactPhone: '22123456',
  email: 'yasmine@exemple.tn',
  productCategory: 'BIJOUX_ACCESSOIRES',
  storeLink: null,
  statut: 'CIN_UNIQUEMENT',
  accountState: 'ACTIF',
  createdAt: '2026-09-24T09:00:00.000Z',
  documents: [
    {
      id: 'd1',
      type: 'CIN_RECTO',
      mimeType: 'image/jpeg',
      sizeBytes: 200_000,
      uploadedAt: '2026-09-24T09:00:00.000Z',
      replacedAt: null,
    },
    {
      id: 'd2',
      type: 'CIN_VERSO',
      mimeType: 'image/png',
      sizeBytes: 150_000,
      uploadedAt: '2026-09-24T09:00:00.000Z',
      replacedAt: null,
    },
    {
      id: 'd0',
      type: 'CIN_RECTO',
      mimeType: 'image/jpeg',
      sizeBytes: 90_000,
      uploadedAt: '2026-09-20T09:00:00.000Z',
      replacedAt: '2026-09-24T09:00:00.000Z',
    },
  ],
};

describe('the seller page', () => {
  it('shows Dépôt the shop and the contact, no document, no action (D-11)', () => {
    render(
      <SellerDetailScreen
        seller={{
          id: 's1',
          shopName: 'Bijoux Yasmine',
          contactFullName: 'Yasmine Trabelsi',
          contactPhone: '22123456',
        }}
        permissions={depot}
      />,
    );
    expect(screen.getByText('Yasmine Trabelsi')).toBeTruthy();
    expect(screen.queryByText('Documents')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    // His parcels, in Colis (D-11).
    expect(screen.getByRole('link', { name: 'Voir ses colis' }).getAttribute('href')).toBe(
      '/admin/colis?sellerId=s1',
    );
  });

  it('opens each document through the BFF, never a public URL, old versions included', async () => {
    const user = userEvent.setup();
    render(<SellerDetailScreen seller={detail} permissions={admin} />);
    const links = screen.getAllByRole('link', { name: 'Voir' });
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/api/bff/sellers/s1/documents/d1',
      '/api/bff/sellers/s1/documents/d2',
    ]);
    await user.click(screen.getByText('Versions remplacées (1)'));
    expect(screen.getByRole('link', { name: 'CIN (recto)' }).getAttribute('href')).toBe(
      '/api/bff/sellers/s1/documents/d0',
    );
  });

  it('asks for the patente when switching to Patente, then sends it with the statut', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({ ok: true, data: {} });
    render(<SellerDetailScreen seller={detail} permissions={admin} />);
    await user.click(screen.getByRole('button', { name: 'Changer le statut' }));
    const dialog = screen.getByRole('dialog', { name: 'Changer le statut' });

    await user.click(within(dialog).getByRole('radio', { name: 'Patente' }));
    await user.click(within(dialog).getByRole('button', { name: 'Changer le statut' }));
    expect(within(dialog).getByText('Document obligatoire')).toBeTruthy();
    expect(bff).not.toHaveBeenCalled();

    await user.upload(
      within(dialog).getByLabelText('Patente', { selector: 'input[type=file]' }),
      file('patente.pdf'),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Changer le statut' }));
    const [method, path, body] = bff.mock.calls[0]!;
    expect([method, path]).toEqual(['POST', 'sellers/s1/statut']);
    expect((body as FormData).get('statut')).toBe('PATENTE');
    expect(((body as FormData).get('document') as File).name).toBe('patente.pdf');
    expect(refresh).toHaveBeenCalled();
  });

  it('changes the contact only with the new person’s CIN front and back (D-42)', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({ ok: true, data: {} });
    render(<SellerDetailScreen seller={detail} permissions={admin} />);
    await user.click(screen.getByRole('button', { name: 'Changer de contact' }));
    const dialog = screen.getByRole('dialog', { name: 'Changer de contact' });
    await user.type(within(dialog).getByLabelText('Prénom'), 'Mehdi');
    await user.type(within(dialog).getByLabelText('Nom'), 'Ben Salah');
    await user.type(within(dialog).getByLabelText('Téléphone'), '98123456');
    await user.upload(within(dialog).getByLabelText('CIN (recto)'), file('recto.jpg'));
    await user.click(within(dialog).getByRole('button', { name: 'Changer de contact' }));
    expect(within(dialog).getByText('Document obligatoire')).toBeTruthy();
    expect(bff).not.toHaveBeenCalled();

    await user.upload(within(dialog).getByLabelText('CIN (verso)'), file('verso.jpg'));
    await user.click(within(dialog).getByRole('button', { name: 'Changer de contact' }));
    const [method, path, body] = bff.mock.calls[0]!;
    expect([method, path]).toEqual(['POST', 'sellers/s1/contact']);
    const form = body as FormData;
    expect(form.get('contactLastName')).toBe('Ben Salah');
    expect((form.get('CIN_RECTO') as File).name).toBe('recto.jpg');
    expect((form.get('CIN_VERSO') as File).name).toBe('verso.jpg');
  });

  it('sends only the fields that changed', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({ ok: true, data: {} });
    render(<SellerDetailScreen seller={detail} permissions={admin} />);
    await user.click(screen.getByRole('button', { name: 'Modifier' }));
    const shop = screen.getByLabelText('Nom de la boutique');
    await user.clear(shop);
    await user.type(shop, 'Yasmine Bijoux');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(bff).toHaveBeenCalledWith('PATCH', 'sellers/s1', { shopName: 'Yasmine Bijoux' });
  });

  it('suspends after a confirmation that says what the seller keeps (Vendeur 2.5)', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValueOnce({ ok: true, data: {} });
    render(<SellerDetailScreen seller={detail} permissions={admin} />);
    await user.click(screen.getByRole('button', { name: 'Suspendre' }));
    const dialog = screen.getByRole('dialog', { name: 'Suspendre le vendeur' });
    expect(within(dialog).getByText(/ne pourra plus créer de colis/)).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Suspendre' }));
    expect(bff).toHaveBeenCalledWith('POST', 'sellers/s1/suspend');
  });
});
