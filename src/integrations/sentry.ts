import * as Sentry from '@sentry/react';

/**
 * Configure Sentry pour le monitoring des erreurs, logs, métriques,
 * session replay et tracing.
 *
 * - No-op total si le DSN n'est pas défini (dev / build sans variable).
 * - `tracesSampleRate: 1.0` en dev pour attraper toutes les transactions,
 *   à réduire en production (ex: 0.1) pour limiter le coût.
 * - `tracePropagationTargets` limite le tracing distribué aux appels locaux
 *   (le site static n'a pas d'API backend propre).
 *
 * Le signalement utilisateur (« Signaler un problème ») est géré dans
 * `sendSentryFeedback` : formulaire custom mais envoi via le SDK officiel
 * (`captureFeedback` + attachments), exclusivement vers Sentry.
 */
export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;

  const isProd = import.meta.env.PROD;

  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE || 'development',
    release: import.meta.env.VITE_COMMIT_SHA || undefined,

    // Session Replay: 10% des sessions, 100% si erreur
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],

    // Tracing: 100% en dev, 10% en production (équilibre coût/utilité)
    tracesSampleRate: isProd ? 0.1 : 1.0,
    tracePropagationTargets: ['localhost', /^https:\/\/yourserver\.io\/api/],

    // Session Replay
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    // Logs
    enableLogs: true,
  });
}

export interface SentryFeedbackCallbacks {
  /** Appelé quand le feedback a été envoyé avec succès à Sentry. */
  onSubmitted?: () => void;
  /** Appelé si l'envoi du feedback échoue. */
  onError?: () => void;
}

/**
 * Convertit un fichier local (image/vidéo) en pièce jointe Sentry.
 * Les données sont envoyées **uniquement** vers Sentry (attachement
 * d'événement) — aucune écriture Supabase.
 */
async function fileToSentryAttachment(file: File): Promise<{ data: Uint8Array; filename: string; contentType: string }> {
  const data = new Uint8Array(await file.arrayBuffer());
  return {
    data,
    filename: file.name,
    contentType: file.type || 'application/octet-stream',
  };
}

/**
 * Envoie un signalement utilisateur à Sentry avec pièces jointes optionnelles
 * (images/vidéos chargées depuis le local).
 *
 * Cette fonction implémente le pattern officiel « Bring Your Own Widget »
 * documenté par Sentry (`captureFeedback` + `attachments`) : le formulaire
 * est custom mais les données passent par le SDK officiel, exclusivement vers
 * Sentry. URL, browser, OS, release et timestamp sont ajoutés par le SDK.
 *
 * @returns L'eventId Sentry en cas de succès.
 */
export async function sendSentryFeedback(
  input: { message: string; name?: string; email?: string; attachments?: File[] },
  callbacks?: SentryFeedbackCallbacks
): Promise<string> {
  try {
    const attachments = await Promise.all(
      (input.attachments ?? []).map(fileToSentryAttachment)
    );

    const hint: Parameters<typeof Sentry.captureFeedback>[1] = {
      includeReplay: true, // lie la session replay si active
      attachments: attachments.length > 0 ? attachments : undefined,
    };

    const eventId = Sentry.captureFeedback(
      {
        message: input.message,
        name: input.name || undefined,
        email: input.email || undefined,
      },
      hint
    );

    callbacks?.onSubmitted?.();
    return eventId;
  } catch (error) {
    console.error('Failed to send feedback to Sentry:', error);
    callbacks?.onError?.();
    throw error;
  }
}
