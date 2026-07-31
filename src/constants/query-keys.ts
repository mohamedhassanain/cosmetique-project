/**
 * Clés de cache React Query centralisées.
 * Centraliser ici permet d'éviter les chaînes dupliquées entre hooks et invalidations.
 */
export const QUERY_KEYS = {
  products: ['products'] as const,
  productBySlug: (slug: string | undefined) => ['product', slug] as const,
  publicProducts: (filters: unknown) => ['products', 'public', filters] as const,
  activeProducts: ['products', 'active', 'all'] as const,
  categories: ['categories'] as const,
  subcategories: (categoryId?: string) => ['subcategories', categoryId] as const,
  orders: ['orders'] as const,
  siteSettings: ['site-settings'] as const,
} as const;

/** Liste des préfixes de clés à invalider quand un produit change. */
export const PRODUCT_INVALIDATION_KEYS = [
  { queryKey: QUERY_KEYS.products },
  { queryKey: ['product'] },
] as const;
