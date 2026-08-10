// Types du domaine produit.
import type { Category, Subcategory } from './category';

export interface ProductImage {
  id: string;
  product_id: string;
  url: string;
  sort_order: number;
  created_at?: string;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  ingredients: string | null;
  how_to_use: string | null;
  price: number;
  original_price: number | null;
  is_promotion: boolean;
  is_featured: boolean;
  is_active: boolean;
  image_url: string | null;
  /** Variante optimisée 400px (cartes produit) — générée à l'upload. */
  image_url_400: string | null;
  /** Variante optimisée 800px (fiche produit) — générée à l'upload. */
  image_url_800: string | null;
  video_url: string | null;
  category_id: string | null;
  subcategory_id: string | null;
  stock_quantity: number;
  weight_grams: number | null;
  brand: string | null;
  location_city: string | null;
  location_url: string | null;
  show_location: boolean;
  created_at: string;
  updated_at: string;
  // Relations (populées par les jointures Supabase)
  categories?: Pick<Category, 'name' | 'slug'> | null;
  subcategories?: Pick<Subcategory, 'name'> | null;
  // Images normalisées (depuis product_images)
  product_images?: ProductImage[];
}

// Ré-exports des autres domaines pour compatibilité des imports existants.
export type { Category, Subcategory } from './category';
export type { Order } from './order';
export type { SiteSettings } from './site';
