/**
 * Couche d'accès au stockage Supabase (upload d'images).
 */
import { supabase } from '@/integrations/supabase/client';

export const STORAGE_BUCKET = 'cosmetics-images';

/** Taille maximale d'une image : 5 Mo. */
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Valide un fichier image avant upload.
 * @throws Error avec un message clair en français si le fichier est invalide.
 */
export function assertValidImage(file: File): void {
  if (!file.type.startsWith('image/')) {
    throw new Error('Fichier non valide : seules les images sont autorisées.');
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error('Image trop volumineuse : la taille maximale est de 5 Mo.');
  }
}

export async function uploadImage(file: File, folder: string = 'products'): Promise<string> {
  assertValidImage(file);

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
