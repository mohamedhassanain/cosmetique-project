import { useState } from 'react';
import { SentryFeedbackDialog } from './SentryFeedbackDialog';

/**
 * Bouton flottant « Signaler un problème » — visible sur toutes les pages,
 * reste à l'écran pendant le scroll.
 *
 * Au clic, ouvre `SentryFeedbackDialog` : formulaire de signalement avec
 * pièces jointes (images/vidéos depuis le local), envoyé via le SDK officiel
 * Sentry (`captureFeedback` + attachments). Aucune écriture Supabase.
 */
export function SentryFeedbackButton() {
  const [dialogOpen, setDialogOpen] = useState(false);

  // Sans DSN configuré, le SDK Sentry est désactivé : l'envoi serait
  // impossible. On masque le bouton plutôt qu'afficher un clic sans effet.
  if (!import.meta.env.VITE_SENTRY_DSN) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        aria-label="Signaler un problème"
        title="Signaler un problème"
        className={[
          // Position : en bas à droite, à gauche du panier flottant (ne se chevauchent pas).
          'fixed z-40 bottom-20 md:bottom-6 right-24',
          // Apparence : pilule rose, bordure, ombre légère, très arrondie.
          'inline-flex items-center gap-2 rounded-full',
          'bg-white/95 backdrop-blur border-2 border-pink-200',
          'px-3.5 py-2 shadow-lg shadow-pink-200/40',
          'hover:bg-pink-50 hover:border-pink-400 hover:-translate-y-0.5',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400',
          'active:translate-y-0 active:shadow-md',
          'transition-all duration-200 cursor-pointer select-none',
          // Animation d'apparition (tailwindcss-animate).
          'animate-in fade-in slide-in-from-bottom-4 duration-500',
        ].join(' ')}
      >
        <span aria-hidden="true" className="text-base leading-none">
          🐞
        </span>
        <span className="hidden sm:inline text-sm font-semibold text-pink-700">
          Signaler un problème
        </span>
      </button>

      <SentryFeedbackDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
