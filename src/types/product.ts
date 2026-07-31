export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface Subcategory {
  id: string;
  category_id: string;
  name: string;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

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
  // Relations (populated by Supabase joins)
  categories?: Pick<Category, 'name' | 'slug'> | null;
  subcategories?: Pick<Subcategory, 'name'> | null;
  // Images normalisées (depuis product_images)
  product_images?: ProductImage[];
}

export interface Order {
  id: string;
  customer_name: string;
  customer_phone: string;
  customer_city: string | null;
  product_id: string | null;
  product_name: string;
  quantity: number;
  total_price: number;
  status: string;
  notes: string | null;
  created_at: string;
}

export interface SiteSettings {
  id: string;
  site_name: string;
  site_description: string | null;
  whatsapp_number: string;
  phone_number: string | null;
  email: string | null;
  address: string | null;
  logo_url: string | null;
  hero_title: string | null;
  hero_subtitle: string | null;
  free_shipping_min: number | null;
  created_at: string;
  updated_at: string;
}
