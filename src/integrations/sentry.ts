import * as Sentry from '@sentry/react';

/**
 * Initialise Sentry pour le monitoring des erreurs en production.
 * - No-op total si le DSN n'est pas défini (dev / build sans variable).
 * - Seuil d'échantillonnage des transactions fixé à 10% pour limiter le coût.
 * - Masque les identifiants physiques (UDR) par défaut.
 */
export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE || 'development',
    release: import.meta.env.VITE_COMMIT_SHA || undefined,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
  });
}
