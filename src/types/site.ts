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
  // Champs hérités de l'ancienne carte promo unique (conservés pour compatibilité).
  promo_enabled: boolean;
  promo_badge: string | null;
  promo_title: string | null;
  promo_subtitle: string | null;
  promo_link: string | null;
  promo_image_url: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Une publicité affichée dans le carrousel du hero.
 * L'admin peut en créer plusieurs ; elles défilent automatiquement.
 */
export interface Promo {
  id: string;
  badge: string | null;
  title: string;
  subtitle: string | null;
  link: string;
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface PromoInput {
  badge?: string;
  title: string;
  subtitle?: string | null;
  link?: string;
  image_url?: string | null;
  is_active?: boolean;
  sort_order?: number;
}
