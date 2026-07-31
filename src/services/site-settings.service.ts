/**
 * Couche d'accès aux paramètres du site (Supabase).
 */
import { supabase } from '@/integrations/supabase/client';
import { SiteSettings } from '@/types/product';

export async function fetchSiteSettings(): Promise<SiteSettings> {
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
