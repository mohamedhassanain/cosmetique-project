import { useState, useCallback } from 'react';
import { uploadImage as apiUploadImage } from '@/services/storage.service';
import { toast } from 'sonner';

export function useImageUpload() {
  const [uploading, setUploading] = useState(false);

  const uploadImage = useCallback(async (file: File, folder: string = 'products'): Promise<string | null> => {
    try {
      setUploading(true);
      return await apiUploadImage(file, folder);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Erreur lors du téléchargement de l\'image');
      return null;
    } finally {
      setUploading(false);
    }
  }, []);

  return { uploadImage, uploading };
}
