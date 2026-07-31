import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Logo from '@/components/layout/Logo';
import { useActivePromos } from '@/hooks/usePromos';
import { Sparkles, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const AUTOPLAY_MS = 5000;

/**
 * Carrousel de publicités carrées, affiché à droite du hero sur desktop.
 * L'admin peut créer plusieurs pubs ; elles défilent automatiquement
 * avec points de navigation et flèches. Masqué sur mobile.
 */
export function HeroPromoCarousel() {
  const { data: promos = [] } = useActivePromos();
  const [index, setIndex] = useState(0);

  const count = promos.length;

  const goTo = useCallback((i: number) => {
    if (count === 0) return;
    setIndex(((i % count) + count) % count);
  }, [count]);

  const next = useCallback(() => goTo(index + 1), [goTo, index]);
  const prev = useCallback(() => goTo(index - 1), [goTo, index]);

  // Auto-play (relancé quand la pub change)
  useEffect(() => {
    if (count <= 1) return;
    const timer = setInterval(next, AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [next, count]);

  if (count === 0) return null;

  const promo = promos[index];

  return (
    <div className="hidden md:block">
      <div className="relative aspect-square w-full max-w-md mx-auto rounded-[2rem] overflow-hidden bg-gradient-to-br from-pink-300 via-rose-200 to-purple-200 border-4 border-white shadow-2xl">
        {/* Décor flous */}
        <div className="absolute -top-10 -right-10 h-40 w-40 bg-pink-400/30 rounded-full blur-2xl" />
        <div className="absolute -bottom-12 -left-12 h-44 w-44 bg-purple-300/30 rounded-full blur-2xl" />

        {promo.image_url ? (
          <img src={promo.image_url} alt={promo.title} className="absolute inset-0 w-full h-full object-cover" />
        ) : null}

        <Link to={promo.link} className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
          <Badge className="bg-pink-500 text-white border-none px-4 py-1 shadow-lg text-sm font-bold">
            <Sparkles className="h-3.5 w-3.5 mr-1" />
            {promo.badge || 'PROMO DU MOMENT'}
          </Badge>

          <Logo className="h-20 w-20" />

          <h3 className="font-display text-3xl font-bold text-pink-900 leading-tight">{promo.title}</h3>
          {promo.subtitle && (
            <p className="text-pink-700/80 text-sm max-w-[220px]">{promo.subtitle}</p>
          )}

          <Button className="mt-2 bg-pink-400 hover:bg-pink-500 text-white rounded-full px-6 shadow-lg" asChild>
            <span>Découvrir <ArrowRight className="h-4 w-4 ml-2" /></span>
          </Button>
        </Link>

        {/* Flèches (si plusieurs pubs) */}
        {count > 1 && (
          <>
            <button
              type="button"
              aria-label="Publicité précédente"
              onClick={prev}
              className="absolute left-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-white/80 hover:bg-white flex items-center justify-center shadow transition-colors cursor-pointer"
            >
              <ChevronLeft className="h-5 w-5 text-pink-700" />
            </button>
            <button
              type="button"
              aria-label="Publicité suivante"
              onClick={next}
              className="absolute right-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-white/80 hover:bg-white flex items-center justify-center shadow transition-colors cursor-pointer"
            >
              <ChevronRight className="h-5 w-5 text-pink-700" />
            </button>
          </>
        )}
      </div>

      {/* Points de navigation */}
      {count > 1 && (
        <div className="flex items-center justify-center gap-2 mt-3">
          {promos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              aria-label={`Aller à la publicité ${i + 1}`}
              onClick={() => goTo(i)}
              className={cn(
                "h-2 rounded-full transition-all cursor-pointer",
                i === index ? "w-6 bg-pink-500" : "w-2 bg-pink-300 hover:bg-pink-400"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
