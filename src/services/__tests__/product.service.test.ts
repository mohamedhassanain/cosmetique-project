import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import {
  createProduct,
  updateProduct,
  fetchPublicProducts,
  sanitizeSearchTerm,
  MAX_PAGE_SIZE,
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

  describe('sanitizeSearchTerm', () => {
    it('neutralise la syntaxe de filtre PostgREST', () => {
      // Tentative d'injection : `a` puis `is_active.eq.false` séparé par une virgule
      const injected = sanitizeSearchTerm('a,is_active.eq.false');
      // Aucun séparateur de syntaxe PostgREST ne subsiste :
      // plus de condition supplémentaire possible (`,`) ni de structure colonne.op.valeur (`.`).
      expect(injected).not.toMatch(/[.,()%*"=<>;']/);
      // Le reste est un texte de recherche inoffensif, mots séparés par des espaces.
      expect(injected).toBe('a is_active eq false');
    });

    it('neutralise parenthèses, guillemets, pourcent, wildcards et opérateurs', () => {
      const term = sanitizeSearchTerm('x)or(is_active.eq.true)%"*;=<>');
      expect(term).not.toMatch(/[(),%*"=<>;']/);
    });

    it('conserve les mots simples et normalise les espaces', () => {
      expect(sanitizeSearchTerm('  creme   visage  ')).toBe('creme visage');
    });

    it('borne la longueur du terme', () => {
      const long = 'a'.repeat(500);
      expect(sanitizeSearchTerm(long).length).toBeLessThanOrEqual(80);
    });

    it('retourne une chaîne vide si le terme ne contient que des caractères dangereux', () => {
      expect(sanitizeSearchTerm(',()%')).toBe('');
    });
  });

  describe('fetchPublicProducts', () => {
    it('range pageSize à MAX_PAGE_SIZE + 1 ligne de détection', async () => {
      mockedFrom.mockReturnValueOnce(createBuilder({ data: [], error: null }));

      await fetchPublicProducts({ page: 1, pageSize: 9999 });

      const builder = mockedFrom.mock.results[0].value as Record<string, ReturnType<typeof vi.fn>>;
      // limit = MAX_PAGE_SIZE + 1 : 100 lignes pour détecter hasNextPage sans COUNT(*).
      expect(builder.range).toHaveBeenCalledWith(0, MAX_PAGE_SIZE);
    });

    it('applique les filtres combinés (catégorie résolue côté client + promo)', async () => {
      // Aucun appel serveur slug→id : l'id vient du cache client (filtres).
      mockedFrom.mockReturnValueOnce(createBuilder({ data: [], error: null }));

      await fetchPublicProducts({
        category_slug: 'soins-visage',
        category_id: 'cat-1',
        promo: true,
        page: 1,
        pageSize: 16,
      });

      expect(mockedFrom).toHaveBeenCalledTimes(1);
      const builder = mockedFrom.mock.results[0].value as Record<string, ReturnType<typeof vi.fn>>;
      expect(builder.eq).toHaveBeenCalledWith('is_active', true);
      expect(builder.eq).toHaveBeenCalledWith('category_id', 'cat-1');
      expect(builder.eq).toHaveBeenCalledWith('is_promotion', true);
    });

    it("résout le slug catégorie côté serveur uniquement si l'id manque (fallback)", async () => {
      mockedFrom
        .mockReturnValueOnce(createBuilder({ data: { id: 'cat-1' }, error: null }))
        .mockReturnValueOnce(createBuilder({ data: [], error: null }));

      await fetchPublicProducts({ category_slug: 'soins-visage', page: 1, pageSize: 16 });

      expect(mockedFrom).toHaveBeenCalledTimes(2);
      expect(mockedFrom).toHaveBeenNthCalledWith(1, 'categories');
      expect(mockedFrom).toHaveBeenNthCalledWith(2, 'products');
    });

    it('retourne hasNextPage=false quand l\'API renvoie exactement pageSize lignes', async () => {
      const products = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}` }));
      mockedFrom.mockReturnValueOnce(createBuilder({ data: products, error: null }));

      const result = await fetchPublicProducts({ page: 2, pageSize: 10 });

      expect(result.products).toHaveLength(10);
      expect(result.hasNextPage).toBe(false);
      expect(result.page).toBe(2);
    });

    it('retourne hasNextPage=true et tronque à pageSize quand l\'API renvoie pageSize+1', async () => {
      const products = Array.from({ length: 11 }, (_, i) => ({ id: `p${i}` }));
      mockedFrom.mockReturnValueOnce(createBuilder({ data: products, error: null }));

      const result = await fetchPublicProducts({ page: 1, pageSize: 10 });

      expect(result.products).toHaveLength(10);
      expect(result.hasNextPage).toBe(true);
      expect(result.page).toBe(1);
    });

    it('borne la page à 1 (page négative/abusive ignorée)', async () => {
      mockedFrom.mockReturnValueOnce(createBuilder({ data: [], error: null }));

      const result = await fetchPublicProducts({ page: -5, pageSize: 10 });

      const builder = mockedFrom.mock.results[0].value as Record<string, ReturnType<typeof vi.fn>>;
      expect(builder.range).toHaveBeenCalledWith(0, 10);
      expect(result.page).toBe(1);
    });
  });
});
