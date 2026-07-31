import { useCallback } from 'react';
import { toast } from 'sonner';
import {
  parseImages as serviceParseImages,
  openWhatsAppOrder as serviceOpenWhatsAppOrder,
  getProductShareData as serviceGetProductShareData,
  ShareData,
} from '@/services/whatsapp.service';
import { Product } from '@/types/product';

/**
 * Hook d'actions produit (WhatsApp, partage, parsing d'images).
 * La logique métier vit dans services/whatsapp.service — le hook ne fait que de l'adaptation.
 */
export function useProductActions() {
  const parseImages = useCallback((imageUrl: string | null | undefined): string[] => {
    return serviceParseImages(imageUrl);
  }, []);

  const handleWhatsAppOrder = useCallback(async (product: Product) => {
    try {
      await serviceOpenWhatsAppOrder(product);
    } catch (error) {
      console.error('Error handling WhatsApp order:', error);
      toast.error('Erreur lors de l\'ouverture de WhatsApp');
    }
  }, []);

  const getShareData = useCallback((product: Product): ShareData => {
    return serviceGetProductShareData(product);
  }, []);

  return {
    parseImages,
    handleWhatsAppOrder,
    getShareData,
  };
}
