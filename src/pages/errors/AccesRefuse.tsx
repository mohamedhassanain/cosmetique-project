import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ShieldAlert, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

/**
 * Page « Accès refusé » — affichée quand un utilisateur connecté n'a pas
 * les droits administrateur (UUID absent de l'allowlist `admin_users`).
 *
 * La sécurité réelle est assurée par RLS côté Supabase (`is_admin()`).
 * Cette page ajoute la possibilité de se DÉCONNECTER explicitement : le
 * bouton « Déconnexion » appelle `supabase.auth.signOut()` (mécanisme
 * Supabase existant — pas de second système d'auth). La session étant
 * révoquée, un retour arrière vers /admin retombe sur RequireAdmin
 * (utilisateur non connecté) → redirection vers /admin/login.
 */
const AccesRefuse = () => {
  const navigate = useNavigate();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSignOut = async () => {
    if (isSigningOut) return; // anti double-clic
    setIsSigningOut(true);
    setErrorMessage(null);
    const { error } = await supabase.auth.signOut();
    if (error) {
      // Erreur technique : loggée uniquement côté dev, jamais exposée à l'utilisateur.
      if (import.meta.env.DEV) {
        console.error("signOut failed", error);
      }
      setErrorMessage("La déconnexion a échoué. Veuillez réessayer.");
      setIsSigningOut(false);
      return;
    }
    navigate("/admin/login", { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fef8fa] px-4">
      <div className="text-center">
        <ShieldAlert className="h-16 w-16 mx-auto text-pink-300 mb-6" />
        <h1 className="mb-2 font-display text-4xl font-bold text-pink-900">Accès réservé</h1>
        <p className="mb-8 text-lg text-pink-600">Votre compte n'a pas les droits administrateur.</p>
        {errorMessage && (
          <p
            role="alert"
            className="mb-6 rounded-lg border border-pink-200 bg-pink-50 px-4 py-3 text-sm text-pink-800"
          >
            {errorMessage}
          </p>
        )}
        <div className="flex flex-wrap gap-3 justify-center">
          <Button asChild className="bg-pink-300 hover:bg-pink-400 text-white rounded-full px-8">
            <Link to="/">Retour à l'accueil</Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="rounded-full px-8"
          >
            <LogOut className="h-4 w-4" />
            {isSigningOut ? "Déconnexion…" : "Déconnexion"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AccesRefuse;
