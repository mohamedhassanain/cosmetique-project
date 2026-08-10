/**
 * Helpers responsives pour les images produit (srcSet/sizes).
 * Fonctionnement sans plan payant : si la variante 400/800 n'existe pas
 * (produits existants), on retombe sur l'URL d'origine — aucune casse.
 */
import type { Product } from '@/types/product';

export interface ResponsiveImage {
  src: string;
  srcSet?: string;
  sizes?: string;
}

function urlFor(url: string | null | undefined): string {
  if (!url) return '';
  try {
    const parsed = JSON.parse(url);
    if (Array.isArray(parsed)) return parsed[0] || '';
    return url;
  } catch {
    return url;
  }
}

/** srcSet 1x/2x pour la carte produit : variante 400px + original (retina). */
export function getProductCardImage(product: Pick<Product, 'image_url' | 'image_url_400'>): ResponsiveImage {
  const original = urlFor(product.image_url);
  const thumb = urlFor(product.image_url_400);
  if (!original) return { src: '' };
  if (!thumb) return { src: original };
  return {
    src: thumb,
    srcSet: `${thumb} 1x, ${original} 2x`,
    sizes: '(min-width: 1024px) 240px, (min-width: 640px) 220px, 190px',
  };
}

/** Image 800px pour la fiche produit (srcSet 800 → original). */
export function getProductDetailImage(product: Pick<Product, 'image_url' | 'image_url_800'>): ResponsiveImage {
  const original = urlFor(product.image_url);
  const medium = urlFor(product.image_url_800);
  if (!original) return { src: '' };
  if (!medium) return { src: original };
  return {
    src: medium,
    srcSet: `${medium} 1x, ${original} 2x`,
    sizes: '(min-width: 768px) 512px, 100vw',
  };
}
