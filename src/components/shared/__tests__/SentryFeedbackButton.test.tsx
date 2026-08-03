import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SentryFeedbackButton } from '../SentryFeedbackButton';

const mockOpenFeedback = vi.fn();

vi.mock('@/integrations/sentry', () => ({
  openSentryFeedback: (...args: unknown[]) => mockOpenFeedback(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { toast } from 'sonner';

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
    expect(button).toHaveAttribute(
      'class',
      expect.stringContaining('fixed')
    );
  });

  it('ouvre le widget Sentry au clic', async () => {
    mockOpenFeedback.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<SentryFeedbackButton />);

    await user.click(screen.getByRole('button', { name: 'Signaler un problème' }));

    expect(mockOpenFeedback).toHaveBeenCalledTimes(1);
    expect(mockOpenFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        onSubmitted: expect.any(Function),
        onError: expect.any(Function),
      })
    );
  });

  it('affiche le message de confirmation quand le feedback est envoyé', async () => {
    let onSubmitted: (() => void) | undefined;
    mockOpenFeedback.mockImplementation(
      (callbacks: { onSubmitted?: () => void }) => {
        onSubmitted = callbacks.onSubmitted;
        return Promise.resolve();
      }
    );
    const user = userEvent.setup();
    render(<SentryFeedbackButton />);

    await user.click(screen.getByRole('button', { name: 'Signaler un problème' }));
    onSubmitted?.();

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Merci pour votre retour. Notre équipe analysera ce problème.'
      );
    });
  });

  it('affiche une erreur si l’envoi échoue', async () => {
    let onError: (() => void) | undefined;
    mockOpenFeedback.mockImplementation(
      (callbacks: { onError?: () => void }) => {
        onError = callbacks.onError;
        return Promise.resolve();
      }
    );
    const user = userEvent.setup();
    render(<SentryFeedbackButton />);

    await user.click(screen.getByRole('button', { name: 'Signaler un problème' }));
    onError?.();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Votre signalement n'a pas pu être envoyé. Réessayez plus tard."
      );
    });
  });
});
