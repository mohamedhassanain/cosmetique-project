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

/**
 * srcSet 1x/2x pour la carte produit : variante 400px (1x) + 800px (2x).
 * ⚠️ L'original 1600px n'est JAMAIS chargé pour une carte (~200-240px) :
 *    avant ce changement, un écran retina téléchargeait la pleine résolution.
 *    Repli propre : si la variante 800 manque, srcSet = 400 seule (pas d'original).
 */
export function getProductCardImage(product: Pick<Product, 'image_url' | 'image_url_400' | 'image_url_800'>): ResponsiveImage {
  const original = urlFor(product.image_url);
  const thumb = urlFor(product.image_url_400);
  const medium = urlFor(product.image_url_800);
  if (!original) return { src: '' };
  if (!thumb) return { src: original };
  if (!medium) {
    return {
      src: thumb,
      srcSet: `${thumb} 1x`,
      sizes: '(min-width: 1024px) 240px, (min-width: 640px) 220px, 190px',
    };
  }
  return {
    src: thumb,
    srcSet: `${thumb} 1x, ${medium} 2x`,
    sizes: '(min-width: 1024px) 240px, (min-width: 640px) 220px, 190px',
  };
}

/** URL src unique de la carte (variante 400 si disponible). */
export function getProductCardImageSrc(product: Pick<Product, 'image_url' | 'image_url_400' | 'image_url_800'>): string {
  return getProductCardImage(product).src;
}

/**
 * Image de la fiche produit : 800px en src, srcSet 800 (1x) → original (2x).
 * La fiche peut afficher ~512-800px (retina), l'original 1600px n'est donc
 * téléchargé que par les écrans retina qui en ont réellement besoin.
 */
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
