import { Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Page « Accès refusé » — affichée quand un utilisateur connecté
 * mais NON administrateur tente d'ouvrir une route /admin.
 * La sécurité réelle est assurée par RLS côté Supabase.
 */
const AccesRefuse = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fef8fa] px-4">
      <div className="text-center">
        <ShieldAlert className="h-16 w-16 mx-auto text-pink-300 mb-6" />
        <h1 className="mb-2 font-display text-4xl font-bold text-pink-900">Accès réservé</h1>
        <p className="mb-8 text-lg text-pink-600">Votre compte n'a pas les droits administrateur.</p>
        <div className="flex flex-wrap gap-3 justify-center">
          <Button asChild className="bg-pink-300 hover:bg-pink-400 text-white rounded-full px-8">
            <Link to="/">Retour à l'accueil</Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AccesRefuse;
