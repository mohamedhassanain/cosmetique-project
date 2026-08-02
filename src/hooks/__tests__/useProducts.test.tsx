import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCreateProduct } from '../useProducts';

vi.mock('@/services/product.service', () => ({
  fetchAllProducts: vi.fn(),
  fetchActiveProducts: vi.fn(),
  fetchPublicProducts: vi.fn(),
  fetchProductBySlug: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  deleteProduct: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { createProduct } from '@/services/product.service';

const mockedCreateProduct = vi.mocked(createProduct);

function renderWithQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useCreateProduct (mutation optimiste)', () => {
  it('ajoute le produit en cache de façon optimiste puis invalide les requêtes', async () => {
    const { queryClient, wrapper } = renderWithQueryClient();
    queryClient.setQueryData(['products'], []);
    mockedCreateProduct.mockResolvedValue({ id: 'p9', name: 'Nouveau' });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockImplementation(() => Promise.resolve());

    const { result } = renderHook(() => useCreateProduct(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ name: 'Nouveau', slug: 'nouveau', price: 10 });
    });

    const cache = queryClient.getQueryData<Array<{ id: string; name: string; slug: string; price: number }>>(['products']) ?? [];
    expect(cache[0]).toMatchObject({
      name: 'Nouveau',
      slug: 'nouveau',
      price: 10,
      id: expect.stringContaining('temp-'),
    });
    expect(invalidateSpy).toHaveBeenCalled();
  });

  it('restaure le cache précédent quand createProduct échoue (rollback)', async () => {
    const { queryClient, wrapper } = renderWithQueryClient();
    const initial = [{ id: 'p1', name: 'Existant', slug: 'existant', price: 5 }];
    queryClient.setQueryData(['products'], initial);
    mockedCreateProduct.mockRejectedValue(new Error('réseau indisponible'));

    const { result } = renderHook(() => useCreateProduct(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ name: 'Nouveau', slug: 'nouveau', price: 10 })).rejects.toThrow(
        'réseau indisponible'
      );
    });

    expect(queryClient.getQueryData(['products'])).toEqual(initial);
  });

  it('ne laisse aucune trace dans le cache quand il n’y avait pas de données', async () => {
    const { queryClient, wrapper } = renderWithQueryClient();
    mockedCreateProduct.mockRejectedValue(new Error('erreur'));

    const { result } = renderHook(() => useCreateProduct(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ name: 'X', slug: 'x', price: 1 })).rejects.toThrow('erreur');
    });

    expect(queryClient.getQueryData(['products'])).toBeUndefined();
  });
});
