import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from '@/components/login-form';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, refresh: vi.fn() }) }));

let fetchMock: ReturnType<typeof vi.fn>;

function answer(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  replace.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('LoginForm — seller (email)', () => {
  it('logs in and goes to the seller space', async () => {
    const user = userEvent.setup();
    answer(200, { user: { role: 'VENDEUR' } });
    render(<LoginForm kind="vendeur" />);

    await user.type(screen.getByLabelText('Email'), 'boutique@mail.tn');
    await user.type(screen.getByLabelText('Mot de passe'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/session/login/vendeur',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({
      email: 'boutique@mail.tn',
      password: 'secret',
    });
    expect(replace).toHaveBeenCalledWith('/vendeur');
  });

  it("shows the API's message on a refusal", async () => {
    const user = userEvent.setup();
    answer(401, {
      code: 'IDENTIFIANTS_INCORRECTS',
      message: 'Identifiant ou mot de passe incorrect',
    });
    render(<LoginForm kind="vendeur" />);
    await user.type(screen.getByLabelText('Email'), 'a@b.tn');
    await user.type(screen.getByLabelText('Mot de passe'), 'x');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Identifiant ou mot de passe incorrect',
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it('points a forgotten password to Faffa Go, with no reset link (Vendeur 2.1)', () => {
    render(<LoginForm kind="vendeur" />);
    expect(screen.getByText(/Mot de passe oublié/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /oublié/ })).toBeNull();
  });

  it('says so when the session expired', () => {
    render(<LoginForm kind="vendeur" sessionExpired />);
    expect(screen.getByRole('status')).toHaveTextContent('Session expirée. Reconnectez-vous.');
  });
});

describe('LoginForm — staff (username)', () => {
  it('asks for the username and goes to the back office', async () => {
    const user = userEvent.setup();
    answer(200, { user: { role: 'DEPOT' } });
    render(<LoginForm kind="staff" />);
    await user.type(screen.getByLabelText('Identifiant'), 'demo.depot');
    await user.type(screen.getByLabelText('Mot de passe'), 'x');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));

    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({
      username: 'demo.depot',
      password: 'x',
    });
    expect(replace).toHaveBeenCalledWith('/admin');
  });

  it('counts down after too many attempts and blocks the button meanwhile', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    answer(429, {
      code: 'TROP_DE_TENTATIVES',
      message: 'Trop de tentatives. Réessayez dans 3 s.',
      retryAfterSeconds: 3,
    });
    render(<LoginForm kind="staff" />);
    await user.type(screen.getByLabelText('Identifiant'), 'saif');
    await user.type(screen.getByLabelText('Mot de passe'), 'x');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Réessayez dans 3 s.');
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeDisabled();

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Réessayez dans 2 s.');

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeEnabled();
  });
});
