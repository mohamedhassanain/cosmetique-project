import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
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
  AdminProductFilters,
} from '@/services/product.service';
import { QUERY_KEYS, PRODUCT_INVALIDATION_KEYS } from '@/constants/query-keys';
import { Product } from '@/types/product';

// Ré-export pour compatibilité avec les imports existants
export type { ProductFormData, ProductFilters, AdminProductFilters } from '@/services/product.service';

type QueryClientType = ReturnType<typeof useQueryClient>;

async function invalidateProductQueries(queryClient: QueryClientType) {
  await Promise.all(PRODUCT_INVALIDATION_KEYS.map(({ queryKey }) =>
    queryClient.invalidateQueries({ queryKey: queryKey as readonly string[] })
  ));
}

/** Met à jour immédiatement le cache ['products'] avec la valeur optimiste. */
function optimisticSetProducts(queryClient: QueryClientType, updater: (products: Product[]) => Product[]) {
  queryClient.setQueryData<Product[]>(QUERY_KEYS.products as readonly string[], (old) =>
    updater(old ?? [])
  );
}

/**
 * Restaure le cache après un échec de mutation.
 * - previousProducts défini → on le remet tel quel (rollback).
 * - previousProducts undefined → l'optimistic update a créé le cache de toutes pièces :
 *   on le retire pour revenir à l'état « jamais chargé ».
 */
function rollbackProducts(queryClient: QueryClientType, previousProducts: Product[] | undefined) {
  if (previousProducts !== undefined) {
    queryClient.setQueryData(QUERY_KEYS.products as readonly string[], previousProducts);
  } else {
    queryClient.removeQueries({ queryKey: QUERY_KEYS.products as readonly string[] });
  }
}

// ==============================
// HOOKS DE REQUÊTE
// ==============================

export function useProducts(filters: AdminProductFilters = {}) {
  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEYS.adminProducts(filters),
    queryFn: () => fetchAllProducts(filters),
    staleTime: 1000 * 60 * 2,
  });

  const products = data?.products ?? [];

  return {
    products,
    total: data?.total ?? 0,
    totalPages: data?.totalPages ?? 0,
    currentPage: data?.page ?? 1,
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

export function usePublicProducts(filters: ProductFilters = {}, enabled = true) {
  const queryClient = useQueryClient();
  const page = filters.page ?? 1;

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEYS.publicProducts(filters),
    queryFn: () => fetchPublicProducts(filters),
    enabled,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
    // La page précédente reste affichée pendant le chargement de la suivante :
    // pas de flash de skeletons à chaque changement de page.
    placeholderData: keepPreviousData,
  });

  const hasNextPage = data?.hasNextPage ?? false;

  // Prefetch de la page suivante UNIQUEMENT (page immédiatement pertinente) :
  // au clic sur « suivant », la page est déjà dans le cache.
  // Effectué dans useEffect (plus d'effet de bord pendant le rendu) et gardé
  // par une vérification de fraîcheur : si le cache contient déjà une requête
  // en cours ou fraîche, on ne relance pas de fetch.
  const nextPageKey = QUERY_KEYS.publicProducts({ ...filters, page: page + 1 });
  useEffect(() => {
    if (!hasNextPage) return;
    // Ne pas dupliquer : si la page suivante est déjà en cours de fetch
    // ou fraîche dans le cache (staleTime), on ne relance rien.
    if (queryClient.isFetching({ queryKey: nextPageKey }) > 0) return;
    const existing = queryClient.getQueryState(nextPageKey);
    const isFresh = (existing?.dataUpdatedAt ?? 0) > Date.now() - 1000 * 60 * 5;
    if (existing && isFresh) return;
    void queryClient.prefetchQuery({
      queryKey: nextPageKey,
      queryFn: () => fetchPublicProducts({ ...filters, page: page + 1 }),
      staleTime: 1000 * 60 * 5,
    });
  }, [hasNextPage, nextPageKey, queryClient, filters, page]);

  return {
    products: data?.products || [],
    hasNextPage,
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
// HOOKS DE MUTATION (optimistic)
// ==============================

export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: apiCreateProduct,
    onMutate: async (formData: ProductFormData) => {
      // Annule toutes les requêtes en vol pour éviter d'écraser l'optimistic update
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.products });

      const previousProducts = queryClient.getQueryData<Product[]>(QUERY_KEYS.products as readonly string[]);

      const optimisticProduct = {
        id: `temp-${Date.now()}`,
        name: formData.name,
        slug: formData.slug,
        description: formData.description ?? null,
        price: formData.price,
        original_price: formData.original_price ?? null,
        is_promotion: formData.is_promotion ?? false,
        is_featured: formData.is_featured ?? false,
        is_active: formData.is_active ?? true,
        image_url: formData.image_url ?? null,
        category_id: formData.category_id ?? null,
        subcategory_id: formData.subcategory_id ?? null,
        stock_quantity: formData.stock_quantity ?? 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as Product;

      optimisticSetProducts(queryClient, (products) => [optimisticProduct, ...products]);

      // Contexte pour le rollback si la mutation échoue
      return { previousProducts };
    },
    onError: (error: Error, _variables, context) => {
      rollbackProducts(queryClient, context?.previousProducts);
      toast.error(`Erreur: ${error.message}`);
    },
    onSettled: () => {
      void invalidateProductQueries(queryClient);
    },
    onSuccess: () => {
      toast.success('Produit ajouté avec succès !');
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...formData }: Partial<ProductFormData> & { id: string }) =>
      apiUpdateProduct(id, formData),
    onMutate: async ({ id, ...formData }: Partial<ProductFormData> & { id: string }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.products });

      const previousProducts = queryClient.getQueryData<Product[]>(QUERY_KEYS.products as readonly string[]);

      optimisticSetProducts(queryClient, (products) =>
        products.map((p) => {
          if (p.id !== id) return p;
          return {
            ...p,
            ...(formData.name !== undefined && { name: formData.name }),
            ...(formData.slug !== undefined && { slug: formData.slug }),
            ...(formData.price !== undefined && { price: formData.price }),
            ...(formData.image_url !== undefined && { image_url: formData.image_url ?? null }),
            ...(formData.is_active !== undefined && { is_active: formData.is_active }),
            ...(formData.is_featured !== undefined && { is_featured: formData.is_featured }),
            ...(formData.is_promotion !== undefined && { is_promotion: formData.is_promotion }),
          };
        })
      );

      return { previousProducts };
    },
    onError: (error: Error, _variables, context) => {
      rollbackProducts(queryClient, context?.previousProducts);
      toast.error(`Erreur: ${error.message}`);
    },
    onSettled: () => {
      void invalidateProductQueries(queryClient);
    },
    onSuccess: () => {
      toast.success('Produit mis à jour !');
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: apiDeleteProduct,
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.products });

      const previousProducts = queryClient.getQueryData<Product[]>(QUERY_KEYS.products as readonly string[]);

      optimisticSetProducts(queryClient, (products) => products.filter((p) => p.id !== id));

      return { previousProducts };
    },
    onError: (error: Error, _variables, context) => {
      rollbackProducts(queryClient, context?.previousProducts);
      toast.error(`Erreur: ${error.message}`);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.products });
    },
    onSuccess: () => {
      toast.success('Produit supprimé !');
    },
  });
}

// Alias compatibilité ascendante
export const createProduct = useCreateProduct;
export const updateProduct = useUpdateProduct;
export const deleteProduct = useDeleteProduct;
