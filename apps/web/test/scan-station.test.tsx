import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ScanStation } from '@/components/scan-station';
import type { CourierRow } from '@/lib/types';

const bff = vi.fn();
vi.mock('@/lib/client/call', () => ({ bff: (...args: unknown[]) => bff(...args) }));
// The camera needs a real browser; the station is tested with the keyboard.
vi.mock('@/components/camera-scanner', () => ({ CameraScanner: () => null }));

function courier(
  id: string,
  role: CourierRow['role'],
  firstName: string,
  extra: Partial<CourierRow> = {},
): CourierRow {
  return {
    id,
    role,
    firstName,
    lastName: 'Test',
    phone: '50990000',
    zones: [],
    absentToday: false,
    ...extra,
  };
}

const couriers = [
  courier('u-ali', 'LIVREUR', 'Ali'),
  courier('u-sami', 'LIVREUR', 'Sami'),
  courier('u-absent', 'LIVREUR', 'Walid', { absentToday: true }),
  courier('u-stop', 'LIVREUR', 'Nizar', { acceptsWork: false }),
  courier('u-hedi', 'RAMASSEUR', 'Hédi'),
];

/** A clock that moves `step` ms each time a key is read. */
function clockOf(step: number) {
  let t = 0;
  return () => (t += step);
}

const accepted = {
  scanId: 's1',
  clientScanId: 'c1',
  mode: 'ENTREE_DEPOT',
  accepted: true,
  replayed: false,
  refusal: null,
  message: 'Au dépôt · Au dépôt',
  manualEntry: false,
  clockSkewFlagged: false,
  parcel: {
    code: 'FG-8K2QX7AB',
    status: 'AU_DEPOT',
    location: 'AU_DEPOT',
    shopName: 'Boutique Yasmine',
    delegationNameFr: 'La Marsa',
  },
  courier: null,
  plannedFor: null,
  cancellableUntil: '2026-09-25T08:01:00.000Z',
  serverTime: '2026-09-25T08:00:00.000Z',
};

beforeEach(() => {
  bff.mockReset();
});

async function typeCode(code: string) {
  const input = screen.getByLabelText('Code du colis');
  await userEvent.type(input, `${code}{Enter}`);
}

describe('ScanStation (Admin 4.2, D-50)', () => {
  it('shows the three modes with their shortcut, Entrée dépôt first', () => {
    render(<ScanStation couriers={couriers} now={clockOf(5)} />);
    const modes = screen
      .getAllByRole('button', { pressed: undefined })
      .filter((b) => b.hasAttribute('aria-pressed'));
    expect(modes.map((b) => b.textContent)).toEqual([
      'Entrée dépôtF1',
      'Sortie coursierF2',
      'Retour de tournéeF3',
    ]);
    expect(screen.getByRole('button', { name: /Entrée dépôt/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByLabelText('Coursier')).toBeNull();
  });

  it('switches mode with F2 and asks the livreur first', () => {
    render(<ScanStation couriers={couriers} now={clockOf(5)} />);
    fireEvent.keyDown(window, { key: 'F2' });
    expect(screen.getByRole('button', { name: /Sortie coursier/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const options = within(screen.getByLabelText('Coursier'))
      .getAllByRole('option')
      .map((o) => o.textContent);
    // Only livreurs who can go out today (D-53).
    expect(options).toEqual(['Choisir…', 'Ali Test', 'Sami Test']);
  });

  it('offers every livreur on Retour de tournée: one who stopped work still hands back', () => {
    render(<ScanStation couriers={couriers} now={clockOf(5)} />);
    fireEvent.keyDown(window, { key: 'F3' });
    const options = within(screen.getByLabelText('Coursier'))
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(options).toEqual(['Choisir…', 'Ali Test', 'Nizar Test', 'Sami Test', 'Walid Test']);
  });

  it('refuses to scan before the courier is chosen, without calling the API', async () => {
    render(<ScanStation couriers={couriers} now={clockOf(5)} />);
    fireEvent.keyDown(window, { key: 'F2' });
    await typeCode('FG-8K2QX7AB');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Choisissez un coursier avant de scanner',
    );
    expect(bff).not.toHaveBeenCalled();
  });

  it('sends a gun scan with its UUID, the device time and the chosen courier', async () => {
    bff.mockResolvedValueOnce({
      ok: true,
      data: {
        ...accepted,
        mode: 'SORTIE_COURSIER',
        message: 'En livraison · Avec le livreur',
        courier: { id: 'u-ali', firstName: 'Ali', lastName: 'Test' },
        plannedFor: { id: 'u-sami', firstName: 'Sami', lastName: 'Test' },
      },
    });
    render(<ScanStation couriers={couriers} now={clockOf(5)} />);
    fireEvent.keyDown(window, { key: 'F2' });
    await userEvent.selectOptions(screen.getByLabelText('Coursier'), 'u-ali');
    await typeCode('FG-8K2QX7AB');

    expect(bff).toHaveBeenCalledWith(
      'POST',
      'scans/depot',
      expect.objectContaining({
        mode: 'SORTIE_COURSIER',
        rawCode: 'FG-8K2QX7AB',
        source: 'WEB_DOUCHETTE',
        courierId: 'u-ali',
        clientScanId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        deviceTime: expect.any(String),
      }),
    );
    const result = await screen.findByRole('status', { name: 'Résultat du scan' });
    expect(result).toHaveTextContent('En livraison · Avec le livreur');
    expect(result).toHaveTextContent('FG-8K2QX7AB');
    expect(result).toHaveTextContent('Prévu pour Sami Test');
  });

  it('flags a code typed by hand as manual entry (A-22)', async () => {
    bff.mockResolvedValueOnce({ ok: true, data: { ...accepted, manualEntry: true } });
    render(<ScanStation couriers={couriers} now={clockOf(250)} />);
    await typeCode('FG-8K2QX7AB');
    expect(bff).toHaveBeenCalledWith(
      'POST',
      'scans/depot',
      expect.objectContaining({ source: 'SAISIE_MANUELLE' }),
    );
    expect(await screen.findByRole('status', { name: 'Résultat du scan' })).toHaveTextContent(
      'Saisie manuelle signalée',
    );
  });

  it('shows a refusal in red with its reason', async () => {
    bff.mockResolvedValueOnce({
      ok: true,
      data: {
        ...accepted,
        accepted: false,
        refusal: 'COLIS_DEJA_LIVRE',
        message: 'Colis déjà livré',
      },
    });
    render(<ScanStation couriers={couriers} now={clockOf(5)} />);
    await typeCode('FG-8K2QX7AB');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Colis déjà livré');
    expect(alert).toHaveTextContent('FG-8K2QX7AB');
  });

  it('keeps the latest scans in a list, newest first', async () => {
    bff.mockResolvedValueOnce({ ok: true, data: accepted }).mockResolvedValueOnce({
      ok: true,
      data: {
        ...accepted,
        accepted: false,
        refusal: 'CODE_INCONNU',
        message: 'Code inconnu',
        parcel: null,
      },
    });
    render(<ScanStation couriers={couriers} now={clockOf(5)} />);
    await typeCode('FG-8K2QX7AB');
    await screen.findByRole('status', { name: 'Résultat du scan' });
    await typeCode('FG-ZZZZZZZZ');
    await screen.findByRole('alert');

    const items = within(screen.getByRole('list', { name: 'Derniers scans' })).getAllByRole(
      'listitem',
    );
    expect(items[0]).toHaveTextContent('Code inconnu');
    expect(items[1]).toHaveTextContent('FG-8K2QX7AB');
  });

  it('tells the scan failed when the API cannot be reached', async () => {
    bff.mockResolvedValueOnce({
      ok: false,
      status: 500,
      error: { message: 'Une erreur est survenue. Réessayez.' },
    });
    render(<ScanStation couriers={couriers} now={clockOf(5)} />);
    await typeCode('FG-8K2QX7AB');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Une erreur est survenue. Réessayez.',
    );
  });
});

describe('Annuler le dernier scan (A-11, D-54)', () => {
  it('cancels the last accepted scan and marks it in the list', async () => {
    bff.mockResolvedValueOnce({ ok: true, data: accepted }).mockResolvedValueOnce({
      ok: true,
      data: {
        scanId: 's1',
        cancelled: true,
        message: 'Scan annulé · Ramassé · Avec le ramasseur',
        parcel: { code: 'FG-8K2QX7AB', status: 'RAMASSE', location: 'AVEC_LE_RAMASSEUR' },
      },
    });
    render(<ScanStation couriers={couriers} now={clockOf(5)} />);
    await typeCode('FG-8K2QX7AB');
    await screen.findByRole('status', { name: 'Résultat du scan' });

    await userEvent.click(screen.getByRole('button', { name: 'Annuler le dernier scan' }));

    expect(bff).toHaveBeenLastCalledWith('POST', 'scans/depot/s1/cancel');
    expect(await screen.findByRole('status', { name: 'Résultat du scan' })).toHaveTextContent(
      'Scan annulé · Ramassé · Avec le ramasseur',
    );
    const [item] = within(screen.getByRole('list', { name: 'Derniers scans' })).getAllByRole(
      'listitem',
    );
    expect(item).toHaveTextContent('Annulé');
    expect(screen.queryByRole('button', { name: 'Annuler le dernier scan' })).toBeNull();
  });

  it('offers it on the latest accepted scan only, never on a refused one', async () => {
    bff
      .mockResolvedValueOnce({ ok: true, data: accepted })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          ...accepted,
          scanId: 's2',
          accepted: false,
          refusal: 'CODE_INCONNU',
          message: 'Code inconnu',
          parcel: null,
        },
      })
      .mockResolvedValueOnce({ ok: true, data: { ...accepted, scanId: 's3' } })
      .mockResolvedValueOnce({
        ok: true,
        data: { scanId: 's3', cancelled: true, message: 'Scan annulé', parcel: accepted.parcel },
      });
    render(<ScanStation couriers={couriers} now={clockOf(5)} />);
    await typeCode('FG-8K2QX7AB');
    await screen.findByRole('status', { name: 'Résultat du scan' });
    await typeCode('FG-ZZZZZZZZ');
    await screen.findByRole('alert');
    expect(screen.getAllByRole('button', { name: 'Annuler le dernier scan' })).toHaveLength(1);

    await typeCode('FG-3M9TW2CD');
    await screen.findByRole('status', { name: 'Résultat du scan' });
    const buttons = screen.getAllByRole('button', { name: 'Annuler le dernier scan' });
    expect(buttons).toHaveLength(1);
    await userEvent.click(buttons[0]!);
    expect(bff).toHaveBeenLastCalledWith('POST', 'scans/depot/s3/cancel');
  });

  it('hides the button once the window of the server has passed (D-54)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      bff.mockResolvedValueOnce({ ok: true, data: accepted });
      render(<ScanStation couriers={couriers} now={clockOf(5)} />);
      await typeCode('FG-8K2QX7AB');
      expect(
        await screen.findByRole('button', { name: 'Annuler le dernier scan' }),
      ).toBeInTheDocument();

      await act(() => vi.advanceTimersByTimeAsync(61_000));
      expect(screen.queryByRole('button', { name: 'Annuler le dernier scan' })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('never offers it without a window from the server', async () => {
    bff.mockResolvedValueOnce({ ok: true, data: { ...accepted, cancellableUntil: null } });
    render(<ScanStation couriers={couriers} now={clockOf(5)} />);
    await typeCode('FG-8K2QX7AB');
    await screen.findByRole('status', { name: 'Résultat du scan' });
    expect(screen.queryByRole('button', { name: 'Annuler le dernier scan' })).toBeNull();
  });

  it('shows why a scan can no longer be cancelled', async () => {
    bff.mockResolvedValueOnce({ ok: true, data: accepted }).mockResolvedValueOnce({
      ok: false,
      status: 409,
      error: {
        code: 'ANNULATION_HORS_DELAI',
        message: 'Délai d’annulation dépassé : seul l’admin peut corriger',
      },
    });
    render(<ScanStation couriers={couriers} now={clockOf(5)} />);
    await typeCode('FG-8K2QX7AB');
    await screen.findByRole('status', { name: 'Résultat du scan' });
    await userEvent.click(screen.getByRole('button', { name: 'Annuler le dernier scan' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Délai d’annulation dépassé');
  });
});
