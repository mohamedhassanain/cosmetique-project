/**
 * Couche d'accès aux paramètres du site (Supabase).
 */
import { supabase } from '@/integrations/supabase/client';
import { SiteSettings } from '@/types/product';

/**
 * Colonnes réellement lues par le shop public (header, hero, logo, favicon, WhatsApp).
 * Le formulaire admin utilise `fetchAdminSiteSettings()` (select complet).
 * Ne PAS ajouter de colonne ici sans vérifier qu'un composant public la lit.
 */
const SITE_SETTINGS_SELECT_PUBLIC =
  'site_name, site_description, whatsapp_number, logo_url, hero_title, hero_subtitle';

/**
 * Site settings PUBLICS : uniquement les colonnes rendues par le shop.
 * (Avant : `select('*')` transférait aussi favicon_url, email, address,
 * free_shipping_min, promo_*, created_at, updated_at — jamais lus publiquement.)
 */
export async function fetchSiteSettings(): Promise<SiteSettings> {
  const { data, error } = await supabase
    .from('site_settings')
    .select(SITE_SETTINGS_SELECT_PUBLIC)
    .limit(1)
    .single();

  if (error) throw error;
  return data as SiteSettings;
}

/**
 * Site settings COMPLETS pour le formulaire admin (Paramètres).
 * Séparé de la requête publique : l'admin lit/écrit des champs
 * supplémentaires (phone_number, email, address, promo_*, etc.).
 */
export async function fetchAdminSiteSettings(): Promise<SiteSettings> {
  const { data, error } = await supabase
    .from('site_settings')
    .select('*')
    .limit(1)
    .single();

  if (error) throw error;
  return data as SiteSettings;
}

export async function fetchWhatsAppNumber(): Promise<string> {
  const { data, error } = await supabase
    .from('site_settings')
    .select('whatsapp_number')
    .limit(1)
    .single();

  if (error) throw error;
  return data?.whatsapp_number ?? '';
}

export async function updateSiteSettings(formData: Partial<SiteSettings>): Promise<unknown> {
  const { data: existing } = await supabase
    .from('site_settings')
    .select('id')
    .limit(1)
    .single();

  let result;
  if (existing) {
    const { data, error } = await supabase
      .from('site_settings')
      .update(formData)
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    result = data;
  } else {
    const { data, error } = await supabase
      .from('site_settings')
      .insert(formData)
      .select()
      .single();
    if (error) throw error;
    result = data;
  }

  return result;
}
