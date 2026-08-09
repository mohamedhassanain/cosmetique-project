import { useRef } from 'react';
import { useCart } from '@/providers/cart-utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ShoppingCart, Trash2, Plus, Minus, MessageCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatWhatsAppNumber } from '@/lib/utils';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { createOrder } from '@/services/order.service';

export function CartSheet() {
  const { items, totalItems, totalPrice, updateQuantity, removeFromCart, clearCart } = useCart();
  const { settings } = useSiteSettings();
  // Verrou anti-double-clic : le clic sur "Commander" passe par un INSERT
  // `orders` public — on évite tout doublon en cas de clics multiples rapides.
  const orderLockRef = useRef(false);

  const handleWhatsAppOrder = async () => {
    if (items.length === 0 || orderLockRef.current) return;
    orderLockRef.current = true;
    const whatsappNumber = settings?.whatsapp_number || '+212600000000';

    try {
      // Sauvegarde de la commande pour l'admin (INSERT `orders` public).
      // Échec non bloquant : l'utilisateur part quand même sur WhatsApp.
      try {
        await createOrder({
          product_name: items.map(i => `${i.name} (x${i.quantity})`).join(', '),
          customer_name: 'En attente',
          customer_phone: '',
          quantity: items.reduce((s, i) => s + i.quantity, 0),
          total_price: totalPrice,
          status: 'pending',
          notes: items.map(i => `${i.name} x${i.quantity} - ${i.price * i.quantity} DH`).join(' | '),
        });
      } catch (err) {
        console.error('Failed to save order:', err);
      }

      const message = `Bonjour! Je souhaite commander les produits suivants :

${items.map(item => `• *${item.name}* (x${item.quantity}) - ${item.price * item.quantity} DH`).join('\n')}

*Total: ${totalPrice} DH*

Pouvez-vous confirmer la disponibilité?`;

      const whatsappUrl = `https://wa.me/${formatWhatsAppNumber(whatsappNumber)}?text=${encodeURIComponent(message)}`;
      globalThis.open(whatsappUrl, '_blank');
      clearCart();
    } finally {
      // Le verrou est TOUJOURS relâché, même en cas d'erreur inattendue :
      // sans ce finally, le bouton « Commander » resterait bloqué après un échec.
      orderLockRef.current = false;
    }
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative rounded-full h-12 w-12 shadow-lg border-2 border-pink-100 bg-white hover:bg-pink-50"
          aria-label="Ouvrir le panier"
        >
          <ShoppingCart className="h-6 w-6 text-pink-500" />
          {totalItems > 0 && (
            <Badge className="absolute -top-2 -right-2 h-6 w-6 flex items-center justify-center p-0 bg-pink-400 text-white rounded-full border-2 border-white animate-in zoom-in">
              {totalItems}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="p-6 border-b border-pink-100">
          <SheetTitle className="flex items-center gap-2 text-pink-900">
            <ShoppingCart className="h-5 w-5 text-pink-400" />
            Mon Panier
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[60vh] text-pink-400 p-6 text-center">
              <div className="h-20 w-20 bg-pink-50 rounded-full flex items-center justify-center mb-4">
                <ShoppingCart className="h-10 w-10" />
              </div>
              <p className="text-lg font-medium text-pink-900">Votre panier est vide</p>
              <p className="text-sm">Découvrez nos produits cosmétiques !</p>
            </div>
          ) : (
            <div className="p-6 space-y-4">
              {items.map((item) => (
                <div key={item.id} className="flex gap-4 p-2 rounded-xl hover:bg-pink-50 transition-colors">
                  <div className="h-20 w-20 rounded-xl bg-pink-50 overflow-hidden shrink-50 border border-pink-100">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center">
                        <span className="text-2xl">🌸</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-pink-900 text-sm truncate">{item.name}</h4>
                    <p className="text-pink-500 font-black text-sm mt-1">{item.price} DH</p>
                    <div className="flex items-center gap-3 mt-2">
                      <div className="flex items-center border border-pink-200 rounded-lg bg-pink-50">
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none text-pink-500" onClick={() => updateQuantity(item.id, item.quantity - 1)}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-8 text-center text-xs font-bold text-pink-900">{item.quantity}</span>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none text-pink-500" onClick={() => updateQuantity(item.id, item.quantity + 1)}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-500 hover:bg-red-50" onClick={() => removeFromCart(item.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {items.length > 0 && (
          <div className="p-6 border-t border-pink-100 bg-pink-50/30">
            <div className="flex items-center justify-between mb-4">
              <span className="text-pink-700 font-medium">Total</span>
              <span className="text-2xl font-black text-pink-700">{totalPrice} DH</span>
            </div>
            <Button className="w-full bg-green-500 hover:bg-green-600 text-white rounded-xl h-12 gap-2 text-sm font-bold shadow-lg" onClick={handleWhatsAppOrder}>
              <MessageCircle className="h-5 w-5" />
              Commander sur WhatsApp
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
