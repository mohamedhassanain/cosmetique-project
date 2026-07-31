import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Product } from '@/types/product';

export interface ProductFormData {
  name: string;
  slug: string;
  description?: string;
  price: number;
  original_price?: number;
  is_promotion?: boolean;
  is_featured?: boolean;
  is_active?: boolean;
  image_url?: string;
  images?: string[];
  video_url?: string;
  category_id?: string;
  subcategory_id?: string;
  stock_quantity?: number;
  weight_grams?: number;
  brand?: string;
  location_city?: string;
  location_url?: string;
  show_location?: boolean;
}

export interface ProductFilters {
  search?: string;
  category_slug?: string | null;
  subcategory_slug?: string | null;
  promo?: boolean;
  featured?: boolean;
  sort?: 'newest' | 'price-asc' | 'price-desc';
  page?: number;
  pageSize?: number;
}

const PRODUCT_SELECT_ADMIN = `
  id, name, slug, description, ingredients, how_to_use,
  price, original_price, is_promotion, is_featured, is_active,
  image_url, video_url, category_id, subcategory_id,
  stock_quantity, weight_grams, brand,
  location_city, location_url, show_location,
  created_at, updated_at,
  categories(name, slug),
  subcategories(name),
  product_images(id, url, sort_order)
`;

const PRODUCT_SELECT_PUBLIC = `
  id, name, slug, price, original_price,
  is_promotion, is_featured, image_url, brand, created_at,
  category_id, subcategory_id,
  categories(name, slug),
  subcategories(name)
`;

// ==============================
// HOOKS DE REQUÊTE
// ==============================

export function useProducts() {
  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select(PRODUCT_SELECT_ADMIN)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as Product[];
    },
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
    queryKey: ['products', 'active', 'all'],
    queryFn: async () => {
      // La page d'accueil n'affiche que 4 produits par catégorie (+ featured/promos).
      // Limiter ici évite de charger tout le catalogue à chaque visite.
      const { data, error } = await supabase
        .from('products')
        .select(PRODUCT_SELECT_PUBLIC)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(60);

      if (error) throw error;
      return (data || []) as unknown as Product[];
    },
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
  const {
    search = '',
    category_slug = null,
    subcategory_slug = null,
    promo = false,
    featured: featuredFilter = false,
    sort = 'newest',
    page = 1,
    pageSize = 16,
  } = filters;

  const { data, isLoading } = useQuery({
    queryKey: ['products', 'public', filters],
    queryFn: async () => {
      let categoryId: string | null = null;
      if (category_slug) {
        const { data: cat } = await supabase
          .from('categories')
          .select('id')
          .eq('slug', category_slug)
          .maybeSingle();
        categoryId = cat?.id || null;
      }

      let subcategoryId: string | null = null;
      if (subcategory_slug && categoryId) {
        const { data: sub } = await supabase
          .from('subcategories')
          .select('id')
          .eq('category_id', categoryId)
          .ilike('name', subcategory_slug.replace(/-/g, ' '))
          .maybeSingle();
        subcategoryId = sub?.id || null;
      }

      let query = supabase
        .from('products')
        .select(PRODUCT_SELECT_PUBLIC, { count: 'exact' })
        .eq('is_active', true);

      if (categoryId) query = query.eq('category_id', categoryId);
      if (subcategoryId) query = query.eq('subcategory_id', subcategoryId);
      if (promo) query = query.eq('is_promotion', true);
      if (featuredFilter) query = query.eq('is_featured', true);

      if (search.trim()) {
        const term = search.trim();
        query = query.or(
          `search_vector.phfts.${term},` +
          `name.ilike.%${term}%,` +
          `brand.ilike.%${term}%`
        );
      }

      if (sort === 'price-asc') query = query.order('price', { ascending: true });
      else if (sort === 'price-desc') query = query.order('price', { ascending: false });
      else query = query.order('created_at', { ascending: false });

      const from = (page - 1) * pageSize;
      query = query.range(from, from + pageSize - 1);

      const { data, error, count } = await query;
      if (error) throw error;

      return {
        products: (data || []) as unknown as Product[],
        total: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize),
        page,
      };
    },
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
    queryKey: ['product', slug],
    queryFn: async () => {
      if (!slug) return null;
      const { data, error } = await supabase
        .from('products')
        .select(PRODUCT_SELECT_ADMIN)
        .eq('slug', slug)
        .eq('is_active', true)
        .single();

      if (error) throw error;
      return data as unknown as Product;
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
    mutationFn: async (formData: ProductFormData) => {
      const { images, ...productData } = formData;
      const { data, error } = await supabase
        .from('products')
        .insert({
          name: productData.name,
          slug: productData.slug,
          description: productData.description || null,
          price: productData.price,
          original_price: productData.original_price || null,
          is_promotion: productData.is_promotion || false,
          is_featured: productData.is_featured || false,
          is_active: productData.is_active ?? true,
          image_url: productData.image_url || null,
          video_url: productData.video_url || null,
          category_id: productData.category_id || null,
          subcategory_id: productData.subcategory_id || null,
          stock_quantity: productData.stock_quantity ?? 0,
          weight_grams: productData.weight_grams || null,
          brand: productData.brand || null,
          location_city: productData.location_city || null,
          location_url: productData.location_url || null,
          show_location: productData.show_location ?? false,
        })
        .select()
        .single();

      if (error) throw error;

      const newProduct = data as { id: string } | null;
      if (images && images.length > 0 && newProduct) {
        const imageRows = images.map((url, idx) => ({
          product_id: newProduct.id,
          url,
          sort_order: idx,
        }));
        const { error: imgError } = await supabase
          .from('product_images')
          .insert(imageRows as any);
        if (imgError) console.error('Failed to insert product images:', imgError);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product'] });
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
    mutationFn: async ({ id, ...formData }: Partial<ProductFormData> & { id: string }) => {
      const { images, ...productData } = formData;
      const updateData: Record<string, unknown> = {};
      if (productData.name !== undefined) updateData.name = productData.name;
      if (productData.slug !== undefined) updateData.slug = productData.slug;
      if (productData.description !== undefined) updateData.description = productData.description || null;
      if (productData.price !== undefined) updateData.price = productData.price;
      if (productData.original_price !== undefined) updateData.original_price = productData.original_price || null;
      if (productData.is_promotion !== undefined) updateData.is_promotion = productData.is_promotion;
      if (productData.is_featured !== undefined) updateData.is_featured = productData.is_featured;
      if (productData.is_active !== undefined) updateData.is_active = productData.is_active;
      if (productData.image_url !== undefined) updateData.image_url = productData.image_url || null;
      if (productData.video_url !== undefined) updateData.video_url = productData.video_url || null;
      if (productData.category_id !== undefined) updateData.category_id = productData.category_id || null;
      if (productData.subcategory_id !== undefined) updateData.subcategory_id = productData.subcategory_id || null;
      if (productData.stock_quantity !== undefined) updateData.stock_quantity = productData.stock_quantity;
      if (productData.weight_grams !== undefined) updateData.weight_grams = productData.weight_grams || null;
      if (productData.brand !== undefined) updateData.brand = productData.brand || null;
      if (productData.location_city !== undefined) updateData.location_city = productData.location_city || null;
      if (productData.location_url !== undefined) updateData.location_url = productData.location_url || null;
      if (productData.show_location !== undefined) updateData.show_location = productData.show_location;

      const { data, error } = await supabase
        .from('products')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      if (images) {
        await supabase.from('product_images').delete().eq('product_id', id);
        if (images.length > 0) {
          const imageRows = images.map((url, idx) => ({
            product_id: id,
            url,
            sort_order: idx,
          }));
          const { error: imgError } = await supabase
            .from('product_images')
            .insert(imageRows as any);
          if (imgError) console.error('Failed to update product images:', imgError);
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product'] });
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
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
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
