import { Bug } from 'lucide-react';

/**
 * Bouton de test Sentry (onboarding) : déclenche volontairement une erreur
 * JavaScript pour vérifier que le monitoring remonte bien l'événement.
 * À retirer une fois la vérification effectuée en production.
 */
export function SentryTestButton() {
  return (
    <button
      type="button"
      aria-label="Tester le monitoring d'erreurs Sentry"
      onClick={() => {
        throw new Error('This is your first error!');
      }}
      className="fixed bottom-20 left-4 z-40 h-10 w-10 rounded-full bg-gray-900 text-white shadow-lg flex items-center justify-center hover:bg-gray-700 transition-colors"
    >
      <Bug className="h-5 w-5" />
    </button>
  );
}
