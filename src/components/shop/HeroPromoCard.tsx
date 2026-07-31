import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Logo from '@/components/layout/Logo';
import { Sparkles, ArrowRight } from 'lucide-react';

/**
 * Grande carte « pub » carrée affichée à droite du hero sur desktop.
 * Lien vers les promotions et logo de la marque.
 */
export function HeroPromoCard() {
  return (
    <div className="hidden md:block">
      <div className="relative aspect-square w-full max-w-md mx-auto rounded-[2rem] overflow-hidden bg-gradient-to-br from-pink-300 via-rose-200 to-purple-200 border-4 border-white shadow-2xl">
        {/* Décor flous */}
        <div className="absolute -top-10 -right-10 h-40 w-40 bg-pink-400/30 rounded-full blur-2xl" />
        <div className="absolute -bottom-12 -left-12 h-44 w-44 bg-purple-300/30 rounded-full blur-2xl" />

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
          <Badge className="bg-pink-500 text-white border-none px-4 py-1 shadow-lg text-sm font-bold">
            <Sparkles className="h-3.5 w-3.5 mr-1" />
            PROMO DU MOMENT
          </Badge>

          <Logo className="h-20 w-20" />

          <h3 className="font-display text-3xl font-bold text-pink-900 leading-tight">
            Jusqu'à -50%
          </h3>
          <p className="text-pink-700/80 text-sm max-w-[220px]">
            Sur une sélection de cosmétiques naturels & bio
          </p>

          <Button
            asChild
            className="mt-2 bg-pink-400 hover:bg-pink-500 text-white rounded-full px-6 shadow-lg"
          >
            <Link to="/produits?promotions=true">
              Découvrir <ArrowRight className="h-4 w-4 ml-2" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
