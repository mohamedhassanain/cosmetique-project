import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Product } from '@/types/product';
import { ProductCard } from '@/components/product/ProductCard';
import { cn } from '@/lib/utils';

interface ProductCarouselProps {
  products: Product[];
}

const SCROLL_STEP = 320;

/**
 * Carrousel horizontal scrollable : l'utilisateur scrolle dans la section
 * pour découvrir tous les produits (aucune limite d'affichage).
 * Sur desktop (md+), des boutons ← / → permettent de naviguer facilement.
 */
export function ProductCarousel({ products }: Readonly<ProductCarouselProps>) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateArrows = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    updateArrows();
    el.addEventListener('scroll', updateArrows, { passive: true });
    window.addEventListener('resize', updateArrows);
    return () => {
      el.removeEventListener('scroll', updateArrows);
      window.removeEventListener('resize', updateArrows);
    };
  }, [updateArrows]);

  const scrollBy = useCallback((direction: 'left' | 'right') => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: direction === 'left' ? -SCROLL_STEP : SCROLL_STEP, behavior: 'smooth' });
  }, []);

  if (products.length === 0) return null;

  return (
    <div className="relative">
      <div
        ref={trackRef}
        className="flex gap-4 overflow-x-auto scrollbar-hide pb-2 snap-x snap-mandatory"
      >
        {products.map((product) => (
          <div
            key={product.id}
            className="shrink-0 basis-[190px] sm:basis-[220px] lg:basis-[240px] snap-start"
          >
            <ProductCard product={product} />
          </div>
        ))}
      </div>

      {/* Boutons de navigation — desktop uniquement */}
      <button
        type="button"
        aria-label="Voir les produits précédents"
        onClick={() => scrollBy('left')}
        disabled={!canScrollLeft}
        className={cn(
          "absolute left-0 top-1/2 -translate-y-1/2 z-10",
          "hidden md:flex items-center justify-center",
          "h-12 w-12 rounded-full bg-white/95 border border-pink-100 shadow-lg",
          "text-pink-600 hover:bg-pink-50 hover:text-pink-700 transition-all",
          "disabled:opacity-0 disabled:pointer-events-none cursor-pointer"
        )}
      >
        <ChevronLeft className="h-6 w-6" />
      </button>
      <button
        type="button"
        aria-label="Voir les produits suivants"
        onClick={() => scrollBy('right')}
        disabled={!canScrollRight}
        className={cn(
          "absolute right-0 top-1/2 -translate-y-1/2 z-10",
          "hidden md:flex items-center justify-center",
          "h-12 w-12 rounded-full bg-white/95 border border-pink-100 shadow-lg",
          "text-pink-600 hover:bg-pink-50 hover:text-pink-700 transition-all",
          "disabled:opacity-0 disabled:pointer-events-none cursor-pointer"
        )}
      >
        <ChevronRight className="h-6 w-6" />
      </button>

      {/* Indice visuel de scroll (dégradé à droite) */}
      <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#fef8fa] to-transparent hidden md:block" />
    </div>
  );
}
