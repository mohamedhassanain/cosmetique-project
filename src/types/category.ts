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
  slug: string | null;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}
