import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SentryFeedbackButton } from '../SentryFeedbackButton';

vi.mock('@/integrations/sentry', () => ({
  sendSentryFeedback: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { sendSentryFeedback } from '@/integrations/sentry';
import { toast } from 'sonner';

const mockedSend = vi.mocked(sendSentryFeedback);

describe('SentryFeedbackButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_SENTRY_DSN', 'https://example.ingest.sentry.io/123');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('n’affiche rien si Sentry n’est pas configuré (pas de DSN)', () => {
    vi.stubEnv('VITE_SENTRY_DSN', '');
    const { container } = render(<SentryFeedbackButton />);
    expect(container).toBeEmptyDOMElement();
  });

  it('affiche un bouton accessible "Signaler un problème"', () => {
    render(<SentryFeedbackButton />);
    const button = screen.getByRole('button', { name: 'Signaler un problème' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('class', expect.stringContaining('fixed'));
  });

  it('ouvre le formulaire de signalement au clic', async () => {
    const user = userEvent.setup();
    render(<SentryFeedbackButton />);

    await user.click(screen.getByRole('button', { name: 'Signaler un problème' }));

    // Le dialog s'ouvre avec le formulaire complet.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(/Décrivez le problème rencontré/)).toBeInTheDocument();
    expect(screen.getByText(/Ajouter une image ou une vidéo/i)).toBeInTheDocument();
  });

  it('affiche le message de confirmation quand le signalement est envoyé', async () => {
    // Le mock doit déclencher le callback onSubmitted comme le vrai SDK.
    mockedSend.mockImplementation(async (_input, callbacks) => {
      callbacks?.onSubmitted?.();
      return 'event-123';
    });
    const user = userEvent.setup();
    render(<SentryFeedbackButton />);

    await user.click(screen.getByRole('button', { name: 'Signaler un problème' }));

    // Renseigne le message (validation : 10 caractères minimum).
    await user.type(
      screen.getByLabelText(/Décrivez le problème rencontré/),
      'La page produit ne charge pas les images'
    );
    await user.click(screen.getByRole('button', { name: 'Envoyer le signalement' }));

    await waitFor(() => {
      expect(mockedSend).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'La page produit ne charge pas les images',
          attachments: [],
        }),
        expect.objectContaining({ onSubmitted: expect.any(Function) })
      );
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Merci pour votre retour. Notre équipe analysera ce problème.'
      );
    });
  });

  it('affiche une erreur si l’envoi échoue', async () => {
    let onError: (() => void) | undefined;
    mockedSend.mockImplementation((_input, callbacks) => {
      onError = callbacks?.onError;
      return Promise.reject(new Error('réseau indisponible'));
    });
    const user = userEvent.setup();
    render(<SentryFeedbackButton />);

    await user.click(screen.getByRole('button', { name: 'Signaler un problème' }));
    await user.type(
      screen.getByLabelText(/Décrivez le problème rencontré/),
      'Impossible de charger la page produit'
    );
    await user.click(screen.getByRole('button', { name: 'Envoyer le signalement' }));

    await waitFor(() => {
      expect(onError).toBeDefined();
    });
    onError?.();
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Votre signalement n'a pas pu être envoyé. Réessayez plus tard."
      );
    });
  });
});
