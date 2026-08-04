import { useState, useCallback } from 'react';
import imageCompression from 'browser-image-compression';
import { uploadImage as apiUploadImage } from '@/services/storage.service';
import { toast } from 'sonner';

/** Dimension max côté long de l'image redimensionnée (sur-échantillonnée pour retina). */
const MAX_IMAGE_DIMENSION = 1600;

/** Taille cible après compression : ~300 Ko. */
const MAX_IMAGE_SIZE_MB = 0.3;

/** Type MIME de sortie : WebP si supporté, sinon JPEG (compatible partout). */
const OUTPUT_TYPE = 'image/webp';

export function isWebPSupported(): boolean {
  if (typeof document === 'undefined') return false;
  const canvas = document.createElement('canvas');
  const dataUrl = canvas.toDataURL(OUTPUT_TYPE);
  // toDataURL peut renvoyer null dans certains environnements (jsdom, tests) :
  // on considère alors que le WebP n'est pas supporté, sans lever d'erreur.
  return typeof dataUrl === 'string' && dataUrl.startsWith('data:image/webp');
}

/**
 * Compresse et redimensionne une image via `browser-image-compression`
 * (web worker → thread principal jamais bloqué). Réduit à ~300 Ko,
 * max 1600px, converti en WebP si le navigateur le supporte, sinon JPEG.
 *
 * @returns Le fichier optimisé, avec une extension adaptée au format de sortie.
 * @throws Error si la compression échoue (l'appelant retombe sur l'original).
 */
export async function optimizeImage(file: File): Promise<File> {
  const useWebP = isWebPSupported();
  const mime = useWebP ? OUTPUT_TYPE : 'image/jpeg';

  const options = {
    maxWidthOrHeight: MAX_IMAGE_DIMENSION,
    maxSizeMB: MAX_IMAGE_SIZE_MB,
    useWebWorker: true,
    fileType: mime,
  };

  const compressed = await imageCompression(file, options);

  // L'extension du nom doit suivre le format réellement encodé.
  const baseName = file.name.replace(/\.[^.]+$/, '');
  const ext = useWebP ? 'webp' : 'jpeg';
  return new File([compressed], `${baseName}.${ext}`, { type: mime });
}

export function useImageUpload() {
  const [uploading, setUploading] = useState(false);

  const uploadImage = useCallback(async (file: File, folder: string = 'products'): Promise<string | null> => {
    try {
      setUploading(true);

      // Les fichiers non-image (vidéos) ne sont pas compressés. Note : storage.service.ts
      // les rejette via assertValidImage() (comportement existant conservé — le chemin
      // vidéo de AdminProductForm reste géré par un upload direct hors de ce hook).
      if (!file.type.startsWith('image/')) {
        return await apiUploadImage(file, folder);
      }

      // Compression côté client pour réduire la taille envoyée à Supabase Storage.
      // En cas d'échec, on retombe sur l'original : ne jamais bloquer l'admin.
      let optimized = file;
      try {
        optimized = await optimizeImage(file);
      } catch (compressionError) {
        console.error('Image compression failed, uploading original:', compressionError);
        toast.warning("L'image n'a pas pu être compressée automatiquement. Envoi du fichier original.");
      }

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
