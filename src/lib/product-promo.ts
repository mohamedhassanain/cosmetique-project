import type { Product } from '@/types/product';

export interface PromoDisplay {
  /** Pourcentage de réduction arrondi (ex: 50 pour « −50% »). */
  percent: number;
  /** Prix actuel affiché (le plus bas des deux prix). */
  currentPrice: number;
  /** Ancien prix affiché barré (le plus haut des deux prix). */
  oldPrice: number;
}

/**
 * Calcule l'affichage d'une promotion : pourcentage + prix barré.
 *
 * Ordre-insensible : certaines saisies admin ont inversé les deux prix
 * (price > original_price). On prend toujours le prix le plus haut comme
 * ancien prix (barré) et le plus bas comme prix actuel, pour que le badge
 * affiche un pourcentage cohérent dans tous les cas.
 *
 * @returns null si le produit n'est pas en promo ou si les prix sont invalides/égaux.
 */
export function getPromoDisplay(
  product: Pick<Product, 'price' | 'original_price' | 'is_promotion'>,
): PromoDisplay | null {
  if (!product.is_promotion) return null;
  const price = product.price;
  const original = product.original_price;
  if (!original || original <= 0 || price <= 0) return null;
  if (price === original) return null;

  const oldPrice = Math.max(price, original);
  const currentPrice = Math.min(price, original);
  const percent = Math.round(((oldPrice - currentPrice) / oldPrice) * 100);
  return { percent, currentPrice, oldPrice };
}
