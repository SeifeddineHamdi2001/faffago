import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CredentialsDialog } from '@/components/credentials-dialog';

/** "Copier les identifiants" (Admin v1.10): the password is shown once. */

function renderDialog(onClose = vi.fn()) {
  render(
    <CredentialsDialog
      identifierLabel="Téléphone"
      identifier="50990004"
      password="Abcdefghjkmnpq"
      extraLines={['Rôle : Livreur']}
      onClose={onClose}
    />,
  );
  return onClose;
}

describe('CredentialsDialog', () => {
  it('shows the identifier and the password, and says it will not be shown again', () => {
    renderDialog();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('50990004')).toBeInTheDocument();
    expect(screen.getByText('Abcdefghjkmnpq')).toBeInTheDocument();
    expect(screen.getByText(/ne sera plus affiché/)).toBeInTheDocument();
  });

  it('copies everything the person needs to log in, in one go', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Copier les identifiants' }));
    expect(writeText).toHaveBeenCalledWith(
      'Téléphone : 50990004\nMot de passe : Abcdefghjkmnpq\nRôle : Livreur',
    );
    expect(await screen.findByText('Copié')).toBeInTheDocument();
  });

  it('cannot be closed before the admin confirms he noted the password', async () => {
    const user = userEvent.setup();
    const onClose = renderDialog();
    const close = screen.getByRole('button', { name: 'Fermer' });

    expect(close).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole('checkbox', { name: "J'ai noté le mot de passe" }));
    expect(close).toBeEnabled();
    await user.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
