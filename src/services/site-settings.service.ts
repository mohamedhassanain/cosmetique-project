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

/** TTL du cache mémoire public (site_settings quasi-statique, modifié uniquement par l'admin). */
const PUBLIC_SETTINGS_TTL_MS = 10 * 60 * 1000;

/** Cache mémoire partagé PUBLIC (une seule ligne, données publiques, jamais privées). */
let publicSettingsCache: { data: SiteSettings; expiresAt: number } | null = null;

function getPublicSettingsCache(): SiteSettings | null {
  if (!publicSettingsCache) return null;
  if (Date.now() > publicSettingsCache.expiresAt) {
    publicSettingsCache = null;
    return null;
  }
  return publicSettingsCache.data;
}

export function clearPublicSettingsCache(): void {
  publicSettingsCache = null;
}

/**
 * Site settings PUBLICS : uniquement les colonnes rendues par le shop.
 * (Avant : `select('*')` transférait aussi favicon_url, email, address,
 * free_shipping_min, promo_*, created_at, updated_at — jamais lus publiquement.)
 * Cache mémoire partagé (10 min) : toutes les instances montées (Logo, header,
 * footer, favicon, cart, pages) obtiennent le même objet sans requête Supabase
 * supplémentaire, même avant l'hydratation de React Query.
 */
export async function fetchSiteSettings(): Promise<SiteSettings> {
  const cached = getPublicSettingsCache();
  if (cached) return cached;

  const { data, error } = await supabase
    .from('site_settings')
    .select(SITE_SETTINGS_SELECT_PUBLIC)
    .limit(1)
    .single();

  if (error) throw error;
  const settings = data as SiteSettings;
  publicSettingsCache = { data: settings, expiresAt: Date.now() + PUBLIC_SETTINGS_TTL_MS };
  return settings;
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

  // L'admin vient de modifier les paramètres : le cache public mémoire doit
  // être invalidé immédiatement, sinon le shop pourrait servir des valeurs
  // obsolètes jusqu'à la fin du TTL (10 min).
  clearPublicSettingsCache();

  return result;
}
