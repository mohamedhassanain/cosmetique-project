import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import {
  createProduct,
  updateProduct,
  fetchPublicProducts,
} from '../product.service';

// Mock du client Supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

const mockedFrom = vi.mocked(supabase.from);

/** Builder chaînable minimal : les méthodes retournent le builder, maybeSingle résout result.data. */
function createBuilder(result: { data: unknown; error: unknown; count?: number | null }) {
  const builder: Record<string, unknown> = {};
  const then = (resolve: (value: unknown) => void) => resolve(result);

  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.ilike = vi.fn(() => builder);
  builder.or = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.range = vi.fn(() => builder);
  builder.limit = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: result.data, error: null }));
  builder.then = then;

  return builder as never;
}

/** Mock de la table product_images : gère delete().eq() puis insert(). */
function mockProductImagesTable(insertError: { message: string } | null = null) {
  const table = {
    delete: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ data: null, error: null })) })),
    insert: vi.fn(() => Promise.resolve({ data: null, error: insertError })),
  };
  return table as never;
}

beforeEach(() => {
  mockedFrom.mockReset();
});

describe('product.service', () => {
  describe('createProduct', () => {
    it('insert un produit sans images et retourne la donnée', async () => {
      const inserted = { id: 'p1', name: 'Crème' };
      mockedFrom.mockReturnValueOnce({
        insert: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: inserted, error: null })) })) })),
      } as never);

      const result = await createProduct({ name: 'Crème', slug: 'creme', price: 10 });

      expect(mockedFrom).toHaveBeenCalledWith('products');
      expect(result).toEqual(inserted);
    });

    it('ajoute les images secondaires via product_images (delete puis insert)', async () => {
      const inserted = { id: 'p1', name: 'Crème' };
      mockedFrom
        .mockReturnValueOnce({
          insert: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: inserted, error: null })) })) })),
        } as never)
        .mockReturnValueOnce(mockProductImagesTable())
        .mockReturnValueOnce(mockProductImagesTable());

      const result = await createProduct({
        name: 'Crème',
        slug: 'creme',
        price: 10,
        images: ['img1.png', 'img2.png'],
      });

      expect(result).toEqual(inserted);
      expect(mockedFrom.mock.calls.filter(([t]) => t === 'product_images')).toHaveLength(2);
    });

    it('ne bloque pas si l’insert des images échoue', async () => {
      const inserted = { id: 'p1', name: 'Crème' };
      mockedFrom
        .mockReturnValueOnce({
          insert: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: inserted, error: null })) })) })),
        } as never)
        .mockReturnValueOnce(mockProductImagesTable())
        .mockReturnValueOnce(mockProductImagesTable({ message: 'img error' }));

      await expect(createProduct({ name: 'Crème', slug: 'creme', price: 10, images: ['a.png'] })).resolves.toEqual(inserted);
    });
  });

  describe('updateProduct', () => {
    it('met à jour uniquement les champs fournis (update partiel)', async () => {
      const updated = { id: 'p1', name: 'Nouveau Nom' };
      const chain = {
        update: vi.fn(() => ({ eq: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: updated, error: null })) })) })) })),
      };
      mockedFrom.mockReturnValue(chain as never);

      const result = await updateProduct('p1', { name: 'Nouveau Nom', price: 25 });

      expect(chain.update).toHaveBeenCalledWith({ name: 'Nouveau Nom', price: 25 });
      expect(result).toEqual(updated);
    });

    it('ne touche pas aux images si images est undefined', async () => {
      const updated = { id: 'p1' };
      const chain = {
        update: vi.fn(() => ({ eq: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: updated, error: null })) })) })) })),
      };
      mockedFrom.mockReturnValue(chain as never);

      await updateProduct('p1', { slug: 'nouveau-slug' });

      expect(mockedFrom).not.toHaveBeenCalledWith('product_images');
    });
  });

  describe('fetchPublicProducts', () => {
    it('applique les filtres combinés (catégorie + promo)', async () => {
      mockedFrom
        .mockReturnValueOnce(createBuilder({ data: { id: 'cat-1' }, error: null }))
        .mockReturnValueOnce(createBuilder({ data: [], error: null, count: 0 }));

      await fetchPublicProducts({ category_slug: 'soins-visage', promo: true, page: 1, pageSize: 16 });

      const builder = mockedFrom.mock.results[1].value as Record<string, ReturnType<typeof vi.fn>>;
      expect(builder.eq).toHaveBeenCalledWith('is_active', true);
      expect(builder.eq).toHaveBeenCalledWith('category_id', 'cat-1');
      expect(builder.eq).toHaveBeenCalledWith('is_promotion', true);
    });

    it('retourne les produits, le total et le nombre de pages', async () => {
      const products = [{ id: 'p1' }, { id: 'p2' }];
      // Sans category_slug, un seul appel à from('products') est effectué.
      mockedFrom.mockReturnValueOnce(createBuilder({ data: products, error: null, count: 32 }));

      const result = await fetchPublicProducts({ page: 2, pageSize: 10 });

      expect(result.products).toEqual(products);
      expect(result.total).toBe(32);
      expect(result.totalPages).toBe(4);
      expect(result.page).toBe(2);
    });
  });
});
