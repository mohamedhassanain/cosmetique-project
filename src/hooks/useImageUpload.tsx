import { useState, useCallback } from 'react';
import { uploadImage as apiUploadImage } from '@/services/storage.service';
import { toast } from 'sonner';

/** Dimension max côté long de l'image redimensionnée (préserve les proportions). */
const MAX_IMAGE_DIMENSION = 1200;

/** Qualité JPEG/WebP de sortie après compression (0-1). */
const IMAGE_QUALITY = 0.8;

/** Type MIME de sortie : WebP si supporté, sinon JPEG (compatible partout). */
const OUTPUT_TYPE = 'image/webp';

export function isWebPSupported(): boolean {
  if (typeof document === 'undefined') return false;
  const canvas = document.createElement('canvas');
  return canvas.toDataURL(OUTPUT_TYPE).startsWith('data:image/webp');
}

/**
 * Compresse et redimensionne une image en canvas natif (aucune lib).
 * Convertit en WebP si le navigateur le supporte, sinon JPEG.
 * @throws Error si le format n'est pas décodable ou la compression échoue.
 */
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Fichier non valide : seules les images sont autorisées.');
  }

  const bitmap = await createImageBitmap(file);

  const maxSide = Math.max(bitmap.width, bitmap.height);
  const scale = maxSide > MAX_IMAGE_DIMENSION ? MAX_IMAGE_DIMENSION / maxSide : 1;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Compression impossible : canvas non supporté');
  }

  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  const useWebP = isWebPSupported();
  const ext = useWebP ? 'webp' : 'jpeg';
  const mime = useWebP ? OUTPUT_TYPE : 'image/jpeg';
  const blob: Blob | null = await new Promise((resolve) => {
    canvas.toBlob(resolve, mime, IMAGE_QUALITY);
  });

  bitmap.close();

  if (!blob) {
    throw new Error('Échec de la compression de l\'image');
  }

  const baseName = file.name.replace(/\.[^.]+$/, '');
  return new File([blob], `${baseName}.${ext}`, { type: mime });
}

export function useImageUpload() {
  const [uploading, setUploading] = useState(false);

  const uploadImage = useCallback(async (file: File, folder: string = 'products'): Promise<string | null> => {
    try {
      setUploading(true);
      // Compression côté client pour réduire la taille envoyée à Supabase Storage.
      const optimized = await compressImage(file);
      return await apiUploadImage(optimized, folder);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(error instanceof Error ? error.message : 'Erreur lors du téléchargement de l\'image');
      return null;
    } finally {
      setUploading(false);
    }
  }, []);

  return { uploadImage, uploading };
}
