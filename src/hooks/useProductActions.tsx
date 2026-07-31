import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatWhatsAppNumber } from '@/lib/utils';
import { toast } from 'sonner';
import { Product, SiteSettings } from '@/types/product';

export function useProductActions() {
  const parseImages = useCallback((imageUrl: string | null): string[] => {
    if (!imageUrl) return [];
    try {
      if (imageUrl.startsWith('[')) {
        return JSON.parse(imageUrl);
      }
      return [imageUrl];
    } catch {
      return [imageUrl];
    }
  }, []);

  const getWhatsAppNumber = useCallback(async (): Promise<string> => {
    try {
      const { data } = await supabase
        .from('site_settings')
        .select('whatsapp_number')
        .limit(1)
        .single();
      if (data?.whatsapp_number) return data.whatsapp_number;
    } catch {
      // fallback
    }
    return '+212600000000';
  }, []);

  const handleWhatsAppOrder = useCallback(async (product: Product) => {
    try {
      const whatsappNumber = await getWhatsAppNumber();

      if (!whatsappNumber?.trim()) {
        toast.error('Numéro WhatsApp non configuré');
        return;
      }

      // Track product view silently
      try {
        await supabase.from('orders').insert({
          product_id: product.id,
          product_name: product.name,
          customer_name: 'WhatsApp Click',
          customer_phone: whatsappNumber,
          quantity: 1,
          total_price: product.price,
          status: 'pending',
          notes: 'Clic depuis le site',
        });
      } catch {
        // silent - tracking failure shouldn't block the user
      }

      const productUrl = `${globalThis.location.origin}/produit/${product.slug}`;

      const message = `${productUrl}\n\nBonjour! J'ai vu votre produit *${product.name}* sur Kissariya Cosmétiques. Est-il toujours disponible?`;

      const whatsappUrl = `https://wa.me/${formatWhatsAppNumber(whatsappNumber)}?text=${encodeURIComponent(message)}`;
      globalThis.open(whatsappUrl, '_blank');
    } catch (error) {
      console.error('Error handling WhatsApp order:', error);
      toast.error('Erreur lors de l\'ouverture de WhatsApp');
    }
  }, []);

  const getShareData = useCallback((product: Product) => {
    const url = `${globalThis.location.origin}/produit/${product.slug}`;
    return {
      url,
      title: product.name || 'Produit',
    };
  }, []);

  return {
    parseImages,
    handleWhatsAppOrder,
    getShareData,
  };
}
