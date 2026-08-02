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
