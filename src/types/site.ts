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
  // Carte promo (hero)
  promo_enabled: boolean;
  promo_badge: string | null;
  promo_title: string | null;
  promo_subtitle: string | null;
  promo_link: string | null;
  promo_image_url: string | null;
  created_at: string;
  updated_at: string;
}
