import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettingValues } from '@faffago/shared';
import { SettingsScreen } from '@/components/settings-screen';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

const bff = vi.fn();
vi.mock('@/lib/client/call', () => ({ bff: (...args: unknown[]) => bff(...args) }));

const FAILURE_REASONS = [
  { code: 'NE_REPOND_PAS', label: 'Ne répond pas' },
  { code: 'INJOIGNABLE', label: 'Injoignable' },
  { code: 'ADRESSE_INCORRECTE', label: 'Adresse incorrecte' },
  { code: 'REPORTE_PAR_LE_CLIENT', label: 'Reporté par le client' },
  { code: 'REFUSE', label: 'Refusé' },
];

function renderScreen() {
  return render(
    <SettingsScreen values={defaultSettingValues()} failureReasons={FAILURE_REASONS} />,
  );
}

function section(name: string) {
  return screen.getByRole('region', { name });
}

beforeEach(() => {
  bff.mockReset();
  refresh.mockReset();
});

/** Paramètres (Admin 4.16, D-20): fees, retenue, limits and contact links. */
describe('SettingsScreen', () => {
  it('shows the fees in DT, the retenue in percent, and the contact links', () => {
    renderScreen();
    expect(screen.getByLabelText('Frais de livraison (DT)')).toHaveValue('5,500');
    expect(screen.getByLabelText('Frais de retour (DT)')).toHaveValue('2,000');
    expect(screen.getByLabelText('Frais de changement de client (DT)')).toHaveValue('1,000');
    expect(screen.getByLabelText('Tarif coursier par colis livré (DT)')).toHaveValue('3,500');
    expect(screen.getByLabelText('Retenue à la source, CIN uniquement (%)')).toHaveValue('3');
    expect(screen.getByLabelText('TikTok')).toHaveValue('https://www.tiktok.com/@faffa_goo');
  });

  it('says that a new rate applies only to parcels created after it', () => {
    renderScreen();
    expect(
      within(section('Frais')).getByText(/colis créés après la modification/),
    ).toBeInTheDocument();
  });

  it('lists the failure reasons without any way to change them (D-20)', () => {
    renderScreen();
    const reasons = section("Raisons d'échec");
    for (const reason of FAILURE_REASONS) {
      expect(within(reasons).getByText(reason.label)).toBeInTheDocument();
    }
    expect(within(reasons).queryByRole('textbox')).toBeNull();
    expect(within(reasons).queryByRole('button')).toBeNull();
  });

  it('sends only what changed, money as millimes in digits', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValue({ ok: true, data: { changed: true } });
    renderScreen();

    const delivery = screen.getByLabelText('Frais de livraison (DT)');
    await user.clear(delivery);
    await user.type(delivery, '6,000');
    await user.click(within(section('Frais')).getByRole('button', { name: 'Enregistrer' }));

    expect(bff).toHaveBeenCalledTimes(1);
    expect(bff).toHaveBeenCalledWith('PATCH', 'settings/delivery_fee_millimes', {
      value: '6000',
    });
    expect(await within(section('Frais')).findByText('Enregistré')).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it('sends the retenue in basis points', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValue({ ok: true, data: { changed: true } });
    renderScreen();

    const rate = screen.getByLabelText('Retenue à la source, CIN uniquement (%)');
    await user.clear(rate);
    await user.type(rate, '2,5');
    await user.click(
      within(section('Retenue à la source')).getByRole('button', { name: 'Enregistrer' }),
    );

    expect(bff).toHaveBeenCalledWith('PATCH', 'settings/retenue_rate_bps', { value: 250 });
  });

  it('sends the contact links as one setting', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValue({ ok: true, data: { changed: true } });
    renderScreen();

    const tiktok = screen.getByLabelText('TikTok');
    await user.clear(tiktok);
    await user.type(tiktok, 'https://www.tiktok.com/@faffago');
    await user.click(
      within(section('Liens de contact')).getByRole('button', { name: 'Enregistrer' }),
    );

    expect(bff).toHaveBeenCalledWith('PATCH', 'settings/contact_links', {
      value: expect.objectContaining({ tiktok: 'https://www.tiktok.com/@faffago' }),
    });
  });

  it('keeps Meta Pixel off by default, and lets the admin switch it on or off again', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValue({ ok: true, data: { changed: true } });
    const { rerender } = renderScreen();

    const pixel = screen.getByLabelText('Identifiant Meta Pixel');
    expect(pixel).toHaveValue('');
    await user.type(pixel, '123456789012345');
    const ads = section('Suivi publicitaire');
    await user.click(within(ads).getByRole('button', { name: 'Enregistrer' }));
    expect(bff).toHaveBeenCalledWith('PATCH', 'settings/meta_pixel_id', {
      value: '123456789012345',
    });

    bff.mockClear();
    rerender(
      <SettingsScreen
        key="on"
        values={{ ...defaultSettingValues(), meta_pixel_id: '123456789012345' }}
        failureReasons={FAILURE_REASONS}
      />,
    );
    await user.clear(screen.getByLabelText('Identifiant Meta Pixel'));
    await user.click(
      within(section('Suivi publicitaire')).getByRole('button', { name: 'Enregistrer' }),
    );
    expect(bff).toHaveBeenCalledWith('PATCH', 'settings/meta_pixel_id', { value: '' });
  });

  it('refuses an amount it cannot read, before calling the API', async () => {
    const user = userEvent.setup();
    renderScreen();

    const delivery = screen.getByLabelText('Frais de livraison (DT)');
    await user.clear(delivery);
    await user.type(delivery, 'cinq dinars');
    await user.click(within(section('Frais')).getByRole('button', { name: 'Enregistrer' }));

    expect(bff).not.toHaveBeenCalled();
    expect(within(section('Frais')).getByText(/Format : 5,500/)).toBeInTheDocument();
  });

  it('shows the reason the API gives when it refuses', async () => {
    const user = userEvent.setup();
    bff.mockResolvedValue({
      ok: false,
      status: 400,
      error: { code: 'VALEUR_INVALIDE', message: 'Maximum 10' },
    });
    renderScreen();

    const attempts = screen.getByLabelText('Tentatives de livraison maximum');
    await user.clear(attempts);
    await user.type(attempts, '50');
    await user.click(within(section('Règles')).getByRole('button', { name: 'Enregistrer' }));

    expect(await within(section('Règles')).findByText('Maximum 10')).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
