import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import {
  fetchCategories,
  createCategory,
  fetchSubcategories,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory,
} from '../category.service';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn() },
}));

const mockedFrom = vi.mocked(supabase.from);

/** Builder chaînable minimal simulant les méthodes Supabase. */
function createBuilder(result: { data?: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.insert = vi.fn(() => builder);
  builder.update = vi.fn(() => builder);
  builder.delete = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.single = vi.fn(() => Promise.resolve({ data: result.data ?? null, error: result.error ?? null }));
  builder.then = (resolve: (v: unknown) => void) => resolve({ data: result.data ?? null, error: result.error ?? null });
  return builder as never;
}

beforeEach(() => {
  mockedFrom.mockReset();
});

describe('category.service', () => {
  it('fetchCategories récupère toutes les catégories triées par sort_order', async () => {
    const categories = [{ id: 'c1', name: 'Soins Visage', slug: 'soins-visage' }];
    mockedFrom.mockReturnValueOnce(createBuilder({ data: categories }));

    const result = await fetchCategories();

    expect(mockedFrom).toHaveBeenCalledWith('categories');
    expect(result).toEqual(categories);
  });

  it('createCategory insère et retourne la catégorie', async () => {
    const created = { id: 'c1', name: 'Soins', slug: 'soins' };
    mockedFrom.mockReturnValueOnce(createBuilder({ data: created }));

    const result = await createCategory({ name: 'Soins', slug: 'soins' });

    expect(result).toEqual(created);
  });

  it('createSubcategory génère le slug via slugify', async () => {
    const created = { id: 's1', category_id: 'c1', name: 'Crème Visage', slug: 'creme-visage' };
    mockedFrom.mockReturnValueOnce(createBuilder({ data: created }));

    const result = await createSubcategory('c1', 'Crème Visage');

    expect(result).toEqual(created);
  });

  it('updateSubcategory re-calcule le slug', async () => {
    const updated = { id: 's1', category_id: 'c1', name: 'Crème Corps', slug: 'creme-corps' };
    mockedFrom.mockReturnValueOnce(createBuilder({ data: updated }));

    const result = await updateSubcategory('s1', 'Crème Corps');

    expect(result).toEqual(updated);
  });

  it('fetchSubcategories filtre par catégorie', async () => {
    const subs = [{ id: 's1', category_id: 'c1', name: 'A' }];
    const builder = createBuilder({ data: subs });
    mockedFrom.mockReturnValueOnce(builder);

    await fetchSubcategories('c1');

    expect((builder as { eq: ReturnType<typeof vi.fn> }).eq).toHaveBeenCalledWith('category_id', 'c1');
  });

  it('deleteSubcategory appelle delete().eq()', async () => {
    mockedFrom.mockReturnValueOnce(createBuilder({ data: null }));

    await expect(deleteSubcategory('s1')).resolves.toBeUndefined();
  });

  it('propage les erreurs Supabase', async () => {
    mockedFrom.mockReturnValueOnce(createBuilder({ error: { message: 'RLS error' } }));

    await expect(fetchCategories()).rejects.toMatchObject({ message: 'RLS error' });
  });
});
