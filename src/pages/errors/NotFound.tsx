import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Flower2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSeo } from "@/hooks/useSeo";

const NotFound = () => {
  const location = useLocation();

  // noindex : les URLs inconnues ne doivent jamais polluer l'index Google.
  useSeo({
    title: 'Page introuvable',
    description: 'La page demandée est introuvable.',
    path: location.pathname,
    index: false,
  });

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fef8fa] px-4">
      <div className="text-center">
        <Flower2 className="h-16 w-16 mx-auto text-pink-300 mb-6" />
        <h1 className="mb-2 font-display text-6xl font-bold text-pink-900">404</h1>
        <p className="mb-8 text-xl text-pink-600">Oops ! Page introuvable</p>
        <Button asChild className="bg-pink-300 hover:bg-pink-400 text-white rounded-full px-8">
          <Link to="/">Retour à l'accueil</Link>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
