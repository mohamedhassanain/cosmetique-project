/**
 * Couche d'accès aux publicités (carrousel du hero) — Supabase.
 */
import { supabase } from '@/integrations/supabase/client';
import { Promo, PromoInput } from '@/types/site';

export async function fetchActivePromos(): Promise<Promo[]> {
  const { data, error } = await supabase
    .from('promos')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data || []) as Promo[];
}

export async function fetchAllPromos(): Promise<Promo[]> {
  const { data, error } = await supabase
    .from('promos')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data || []) as Promo[];
}

export async function createPromo(input: PromoInput): Promise<unknown> {
  const { data, error } = await supabase
    .from('promos')
    .insert([{
      badge: input.badge ?? null,
      title: input.title,
      subtitle: input.subtitle ?? null,
      link: input.link || '/produits?promotions=true',
      image_url: input.image_url ?? null,
      is_active: input.is_active ?? true,
      sort_order: input.sort_order ?? 0,
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updatePromo(id: string, input: Partial<PromoInput>): Promise<unknown> {
  const updateData: Record<string, unknown> = {};
  if (input.badge !== undefined) updateData.badge = input.badge;
  if (input.title !== undefined) updateData.title = input.title;
  if (input.subtitle !== undefined) updateData.subtitle = input.subtitle;
  if (input.link !== undefined) updateData.link = input.link;
  if (input.image_url !== undefined) updateData.image_url = input.image_url;
  if (input.is_active !== undefined) updateData.is_active = input.is_active;
  if (input.sort_order !== undefined) updateData.sort_order = input.sort_order;

  const { data, error } = await supabase
    .from('promos')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deletePromo(id: string): Promise<void> {
  const { error } = await supabase
    .from('promos')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
