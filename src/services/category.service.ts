/**
 * Couche d'accès aux données catégories & sous-catégories (Supabase).
 */
import { supabase } from '@/integrations/supabase/client';
import { Category, Subcategory } from '@/types/product';

export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data || []) as Category[];
}

export interface CategoryInput {
  name: string;
  slug: string;
  description?: string;
}

export async function createCategory(input: CategoryInput): Promise<unknown> {
  const { data, error } = await supabase
    .from('categories')
    .insert([{ name: input.name, slug: input.slug, description: input.description || null }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateCategory(
  id: string,
  input: Partial<CategoryInput>
): Promise<unknown> {
  const updateData: Record<string, unknown> = {};
  if (input.name !== undefined) updateData.name = input.name;
  if (input.slug !== undefined) updateData.slug = input.slug;
  if (input.description !== undefined) updateData.description = input.description;

  const { data, error } = await supabase
    .from('categories')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function fetchSubcategories(categoryId: string): Promise<Subcategory[]> {
  const { data, error } = await supabase
    .from('subcategories')
    .select('*')
    .eq('category_id', categoryId)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data || []) as Subcategory[];
}

export async function createSubcategory(categoryId: string, name: string): Promise<unknown> {
  const { data, error } = await supabase
    .from('subcategories')
    .insert([{ category_id: categoryId, name }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateSubcategory(id: string, name: string): Promise<unknown> {
  const { data, error } = await supabase
    .from('subcategories')
    .update({ name })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteSubcategory(id: string): Promise<void> {
  const { error } = await supabase
    .from('subcategories')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
