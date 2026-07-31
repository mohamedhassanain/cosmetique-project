/**
 * Couche d'accès aux données produits (Supabase).
 * Les hooks React Query consomment ces fonctions — aucune logique Supabase dans les composants.
 */
import { supabase } from '@/integrations/supabase/client';
import { Product, ProductImage } from '@/types/product';
import { slugify } from '@/lib/utils';

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

export interface PublicProductsResult {
  products: Product[];
  total: number;
  totalPages: number;
  page: number;
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

export async function fetchAllProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT_ADMIN)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as unknown as Product[];
}

/** Produits actifs limités (page d'accueil) — évite de charger tout le catalogue. */
export async function fetchActiveProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT_PUBLIC)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(60);

  if (error) throw error;
  return (data || []) as unknown as Product[];
}

export async function fetchPublicProducts(filters: ProductFilters = {}): Promise<PublicProductsResult> {
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
    // Résolution fiable par slug exact (accents/casse normalisés), sans ILIKE.
    // Chaînes séparées pour éviter les types trop profonds du builder Supabase.
    const { data: sub } = await supabase
      .from('subcategories')
      .select('id')
      .eq('category_id', categoryId)
      .eq('slug', slugify(subcategory_slug))
      .maybeSingle();
    subcategoryId = sub?.id ?? null;
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
}

export async function fetchProductBySlug(slug: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT_ADMIN)
    .eq('slug', slug)
    .eq('is_active', true)
    .single();

  if (error) throw error;
  return data as unknown as Product;
}

async function replaceProductImages(productId: string, images: string[]): Promise<void> {
  await supabase.from('product_images').delete().eq('product_id', productId);
  if (images.length === 0) return;

  const imageRows: Pick<ProductImage, 'product_id' | 'url' | 'sort_order'>[] = images.map((url, idx) => ({
    product_id: productId,
    url,
    sort_order: idx,
  }));
  const { error } = await supabase.from('product_images').insert(imageRows as never);
  if (error) {
    // Échec non bloquant : le produit est créé, seules les images secondaires manquent.
    console.error('Failed to sync product images:', error);
  }
}

export async function createProduct(formData: ProductFormData): Promise<unknown> {
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
    await replaceProductImages(newProduct.id, images);
  }

  return data;
}

export async function updateProduct(id: string, formData: Partial<ProductFormData>): Promise<unknown> {
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
    await replaceProductImages(id, images);
  }

  return data;
}

export async function deleteProduct(id: string): Promise<void> {
  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
