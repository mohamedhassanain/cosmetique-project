import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  fetchAllProducts,
  fetchActiveProducts,
  fetchPublicProducts,
  fetchProductBySlug,
  createProduct as apiCreateProduct,
  updateProduct as apiUpdateProduct,
  deleteProduct as apiDeleteProduct,
  ProductFormData,
  ProductFilters,
} from '@/services/product.service';
import { QUERY_KEYS, PRODUCT_INVALIDATION_KEYS } from '@/constants/query-keys';

// Ré-export pour compatibilité avec les imports existants
export type { ProductFormData, ProductFilters } from '@/services/product.service';

type QueryKey = string[] | readonly string[];

async function invalidateProductQueries(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all(PRODUCT_INVALIDATION_KEYS.map(({ queryKey }) =>
    queryClient.invalidateQueries({ queryKey: queryKey as unknown as QueryKey })
  ));
}

// ==============================
// HOOKS DE REQUÊTE
// ==============================

export function useProducts() {
  const { data: products = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.products,
    queryFn: fetchAllProducts,
    staleTime: 1000 * 60 * 2,
  });

  return {
    products,
    featuredProducts: products.filter(p => p.is_featured),
    promotionProducts: products.filter(p => p.is_promotion),
    isLoading,
  };
}

export function useActiveProducts() {
  const { data: activeProducts = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.activeProducts,
    queryFn: fetchActiveProducts,
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 15,
  });

  return {
    activeProducts,
    featuredProducts: activeProducts.filter(p => p.is_featured),
    promotionProducts: activeProducts.filter(p => p.is_promotion),
    isLoading,
  };
}

export function usePublicProducts(filters: ProductFilters = {}) {
  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEYS.publicProducts(filters),
    queryFn: () => fetchPublicProducts(filters),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });

  return {
    products: data?.products || [],
    total: data?.total || 0,
    totalPages: data?.totalPages || 0,
    currentPage: data?.page || 1,
    isLoading,
  };
}

export function useProductBySlug(slug: string | undefined) {
  return useQuery({
    queryKey: QUERY_KEYS.productBySlug(slug),
    queryFn: async () => {
      if (!slug) return null;
      return fetchProductBySlug(slug);
    },
    enabled: !!slug,
    staleTime: 1000 * 60 * 5,
  });
}

// ==============================
// HOOKS DE MUTATION
// ==============================

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiCreateProduct,
    onSuccess: () => {
      void invalidateProductQueries(queryClient);
      toast.success('Produit ajouté avec succès !');
    },
    onError: (error: Error) => {
      toast.error(`Erreur: ${error.message}`);
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...formData }: Partial<ProductFormData> & { id: string }) =>
      apiUpdateProduct(id, formData),
    onSuccess: () => {
      void invalidateProductQueries(queryClient);
      toast.success('Produit mis à jour !');
    },
    onError: (error: Error) => {
      toast.error(`Erreur: ${error.message}`);
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiDeleteProduct,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.products });
      toast.success('Produit supprimé !');
    },
    onError: (error: Error) => {
      toast.error(`Erreur: ${error.message}`);
    },
  });
}

// Alias compatibilité ascendante
export const createProduct = useCreateProduct;
export const updateProduct = useUpdateProduct;
export const deleteProduct = useDeleteProduct;
