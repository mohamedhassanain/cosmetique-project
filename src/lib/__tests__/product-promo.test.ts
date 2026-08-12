import { describe, expect, it } from 'vitest';
import { getPromoDisplay } from '@/lib/product-promo';
import type { Product } from '@/types/product';

const baseProduct: Pick<Product, 'price' | 'original_price' | 'is_promotion'> = {
  price: 100,
  original_price: null,
  is_promotion: false,
};

describe('getPromoDisplay', () => {
  it('returns null when the product is not a promotion', () => {
    expect(getPromoDisplay(baseProduct)).toBeNull();
  });

  it('returns null when there is no valid original price', () => {
    expect(getPromoDisplay({ ...baseProduct, is_promotion: true, original_price: null })).toBeNull();
    expect(getPromoDisplay({ ...baseProduct, is_promotion: true, original_price: 0 })).toBeNull();
    expect(getPromoDisplay({ ...baseProduct, is_promotion: true, original_price: -5 })).toBeNull();
  });

  it('returns null when both prices are equal or invalid', () => {
    expect(getPromoDisplay({ ...baseProduct, price: 100, is_promotion: true, original_price: 100 })).toBeNull();
    expect(getPromoDisplay({ ...baseProduct, price: 0, is_promotion: true, original_price: 200 })).toBeNull();
  });

  it('returns percent + current/old prices when the promo is valid', () => {
    expect(getPromoDisplay({ ...baseProduct, is_promotion: true, original_price: 200 })).toEqual({
      percent: 50,
      currentPrice: 100,
      oldPrice: 200,
    });
    expect(getPromoDisplay({ ...baseProduct, price: 99, is_promotion: true, original_price: 200 })).toEqual({
      percent: 51,
      currentPrice: 99,
      oldPrice: 200,
    });
    expect(getPromoDisplay({ ...baseProduct, price: 199, is_promotion: true, original_price: 249 })).toEqual({
      percent: 20,
      currentPrice: 199,
      oldPrice: 249,
    });
  });

  it('handles inverted admin data (price > original_price) by swapping', () => {
    // Données inversées en base : price=200, original_price=99.
    // On affiche quand même un pourcentage cohérent : 200 → 99 = −51%.
    const display = getPromoDisplay({ price: 200, original_price: 99, is_promotion: true });
    expect(display).toEqual({ percent: 51, currentPrice: 99, oldPrice: 200 });
  });
});
