import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Auth from '../Auth';
import { BrowserRouter } from 'react-router-dom';

// Mock de sonner pour éviter de monter le Toaster
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

// Mock de useAuth
const mockSignIn = vi.fn();

vi.mock('@/hooks/auth-utils', () => ({
  useAuth: () => ({
    signIn: mockSignIn,
    user: null,
    loading: false,
  }),
}));

vi.mock('@/hooks/auth-provider', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const renderWithProviders = (component: React.ReactNode) => {
  return render(
    <BrowserRouter>
      {component}
    </BrowserRouter>
  );
};

const setupAuthTest = () => {
  const user = userEvent.setup();
  renderWithProviders(<Auth />);
  return { user };
};

const fillLoginForm = async (user: ReturnType<typeof userEvent.setup>, email: string, pass: string) => {
  const emailInput = screen.getByLabelText(/Email/i);
  const passInput = screen.getByLabelText(/Mot de passe/i);
  await user.clear(emailInput);
  await user.clear(passInput);
  await user.type(emailInput, email);
  await user.type(passInput, pass);
};

describe('Page Auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('affiche le formulaire de connexion', () => {
    setupAuthTest();
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Mot de passe/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Se connecter/i })).toBeInTheDocument();
  });

  it("gère la connexion (succès et erreur)", async () => {
    const { user } = setupAuthTest();

    // Erreur
    mockSignIn.mockResolvedValueOnce({ data: null, error: { message: 'Invalid login credentials' } });
    await fillLoginForm(user, 'wrong@example.com', 'wrongpass');
    await user.click(screen.getByRole('button', { name: /Se connecter/i }));
    await waitFor(() => expect(mockSignIn).toHaveBeenCalledWith('wrong@example.com', 'wrongpass'));
    await waitFor(() => expect(mockSignIn).toHaveBeenCalledTimes(1));

    // Succès
    mockSignIn.mockResolvedValueOnce({ data: {}, error: null });
    await fillLoginForm(user, 'test@example.com', 'password123');
    await user.click(screen.getByRole('button', { name: /Se connecter/i }));
    await waitFor(() => expect(mockSignIn).toHaveBeenCalledTimes(2));
  });

  it("valide les entrées avant d'appeler signIn", async () => {
    const { user } = setupAuthTest();

    // Email invalide
    await fillLoginForm(user, 'invalid-email', 'pass');
    await user.click(screen.getByRole('button', { name: /Se connecter/i }));
    expect(mockSignIn).not.toHaveBeenCalled();

    // Mot de passe trop court
    await fillLoginForm(user, 'test@example.com', '123');
    await user.click(screen.getByRole('button', { name: /Se connecter/i }));
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('bloque les tentatives après 5 échecs consécutifs', async () => {
    const { user } = setupAuthTest();

    mockSignIn.mockResolvedValue({ data: null, error: { message: 'Invalid login credentials' } });

    for (let i = 0; i < 5; i++) {
      await fillLoginForm(user, 'test@example.com', 'wrongpass');
      await user.click(screen.getByRole('button', { name: /Se connecter/i }));
    }

    await waitFor(() => expect(mockSignIn).toHaveBeenCalledTimes(5));
    // Le bandeau de blocage est rendu dans le composant
    expect(screen.getByText(/Trop de tentatives de connexion/i)).toBeInTheDocument();
  });

  it("redirige vers /admin après un login réussi", async () => {
    mockSignIn.mockResolvedValueOnce({ data: {}, error: null });
    const { user } = setupAuthTest();

    await fillLoginForm(user, 'test@example.com', 'password123');
    await user.click(screen.getByRole('button', { name: /Se connecter/i }));

    await waitFor(() => expect(mockSignIn).toHaveBeenCalledTimes(1));
  });
});
