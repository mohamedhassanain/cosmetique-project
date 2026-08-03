import * as Sentry from '@sentry/react';

/** Thème clair du widget de signalement — cohérent avec Kissariya (rose poudré). */
const FEEDBACK_THEME_LIGHT = {
  accentBackground: '#f472b6',
  accentForeground: '#ffffff',
  foreground: '#831843',
  background: '#ffffff',
  successColor: '#16a34a',
  errorColor: '#dc2626',
  boxShadow: '0 10px 25px -5px rgb(236 72 153 / 0.25)',
  outline: '2px solid #f9a8d4',
};

/** Variante sombre du thème (accent conservé, fond foncé). */
const FEEDBACK_THEME_DARK = {
  accentBackground: '#f472b6',
  accentForeground: '#ffffff',
  foreground: '#fdf2f8',
  background: '#1f1420',
  successColor: '#4ade80',
  errorColor: '#f87171',
  boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.5)',
  outline: '2px solid #9d174d',
};

/**
 * Configure Sentry pour le monitoring des erreurs, logs, métriques,
 * session replay, tracing et le widget User Feedback officiel.
 *
 * - No-op total si le DSN n'est pas défini (dev / build sans variable).
 * - `tracesSampleRate: 1.0` en dev pour attraper toutes les transactions,
 *   à réduire en production (ex: 0.1) pour limiter le coût.
 * - `tracePropagationTargets` limite le tracing distribué aux appels locaux
 *   (le site static n'a pas d'API backend propre).
 *
 * User Feedback : le widget officiel est branché via `feedbackAsyncIntegration`
 * (chargement paresseux du code au premier clic). Le bouton flottant
 * (`SentryFeedbackButton`) appelle `openSentryFeedback` — toutes les données
 * partent exclusivement vers Sentry, aucune écriture Supabase. Si Session
 * Replay est actif, le feedback est automatiquement lié à la session par le SDK.
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
      // Widget officiel Sentry User Feedback — chargé paresseusement.
      // autoInject false : pas de bouton acteur par défaut, on ouvre le
      // formulaire à la demande depuis notre bouton flottant.
      Sentry.feedbackAsyncIntegration({
        colorScheme: 'system',
        autoInject: false,
        // Thème Kissariya (rose poudré) pour le widget de signalement.
        themeLight: FEEDBACK_THEME_LIGHT,
        themeDark: FEEDBACK_THEME_DARK,
      }),
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
 * Ouvre le formulaire officiel Sentry User Feedback (modale).
 *
 * Le code du widget est chargé paresseusement au premier appel, puis le formulaire
 * est inséré dans le DOM et ouvert. Les données (description, email, nom) sont
 * envoyées **uniquement** vers Sentry.
 *
 * @returns Une promesse résolue une fois le formulaire ouvert.
 */
export async function openSentryFeedback(callbacks: SentryFeedbackCallbacks = {}): Promise<void> {
  if (typeof document === 'undefined') return;

  const widget = Sentry.getFeedback();
  if (!widget) return;

  try {
    const dialog = await widget.createForm({
      // Général
      colorScheme: 'system',
      showBranding: false,
      // Textes (français, cohérents avec l'app)
      formTitle: 'Signaler un problème',
      messageLabel: 'Décrivez le problème rencontré',
      messagePlaceholder: "Ex. : la page ne charge pas, une image ne s'affiche pas…",
      nameLabel: 'Votre nom (optionnel)',
      namePlaceholder: 'Votre nom',
      emailLabel: 'Votre email (optionnel)',
      emailPlaceholder: 'vous@exemple.com',
      submitButtonLabel: 'Envoyer le signalement',
      cancelButtonLabel: 'Annuler',
      successMessageText: 'Merci pour votre retour !',
      // Le thème suit le colorScheme système (défini à l'init de l'intégration).
      // Callbacks
      onSubmitSuccess: () => callbacks.onSubmitted?.(),
      onSubmitError: () => callbacks.onError?.(),
    });


    dialog.appendToDom();
    dialog.open();
  } catch (error) {
    // Le lazy-load peut échouer (réseau, ad-blocker…) — le site ne doit pas se bloquer.
    console.error("Impossible d'ouvrir le formulaire de signalement Sentry:", error);
  }
}

/**
 * Supprime le widget feedback du DOM courant, s'il existe.
 * À appeler au démontage du bouton flottant pour éviter toute fuite de listeners.
 */
export function removeSentryFeedback(): void {
  const widget = Sentry.getFeedback();
  widget?.remove();
}
