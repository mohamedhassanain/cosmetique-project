/**
 * Couche d'accès au stockage Supabase (upload d'images).
 */
import { supabase } from '@/integrations/supabase/client';

export const STORAGE_BUCKET = 'cosmetics-images';

export async function uploadImage(file: File, folder: string = 'products'): Promise<string> {
  const fileExt = file.name.split('.').pop();
  const fileName = `${folder}/${crypto.randomUUID()}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(fileName, file);

  if (uploadError) throw uploadError;

  const { data } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(fileName);

  return data.publicUrl;
}
