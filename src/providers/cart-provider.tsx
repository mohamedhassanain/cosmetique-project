import { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { CartContext, CartItem } from './cart-context';

const CART_STORAGE_KEY = 'cart';

function loadCart(): CartItem[] {
  const saved = localStorage.getItem(CART_STORAGE_KEY);
  if (!saved) return [];
  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    localStorage.removeItem(CART_STORAGE_KEY);
    return [];
  }
}

export function CartProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    setItems(loadCart());
  }, []);

  useEffect(() => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  // Synchronisation multi-onglets : quand un autre onglet modifie le panier
  // (event `storage` du navigateur, déclenché uniquement dans les AUTRES onglets),
  // on recharge le panier depuis localStorage pour rester cohérent.
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== CART_STORAGE_KEY) return;
      try {
        const parsed = event.newValue ? JSON.parse(event.newValue) : [];
        setItems(Array.isArray(parsed) ? parsed : []);
      } catch {
        // Valeur corrompue dans un autre onglet → on ignore, le panier garde son état local.
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const addToCart = useCallback((newItem: Omit<CartItem, 'quantity'>) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.id === newItem.id);
      if (existing) {
        toast.success(`Quantité mise à jour pour ${newItem.name}`);
        return prev.map((i) =>
          i.id === newItem.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      toast.success(`${newItem.name} ajouté au panier`);
      return [...prev, { ...newItem, quantity: 1 }];
    });
  }, []);

  const removeFromCart = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    toast.info('Produit retiré du panier');
  }, []);

  const updateQuantity = useCallback((id: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(id);
      return;
    }
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, quantity } : i))
    );
  }, [removeFromCart]);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const totalItems = useMemo(() => items.reduce((sum, i) => sum + i.quantity, 0), [items]);
  const totalPrice = useMemo(() => items.reduce((sum, i) => sum + i.price * i.quantity, 0), [items]);

  const value = useMemo(() => ({
    items,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    totalItems,
    totalPrice,
  }), [items, addToCart, removeFromCart, updateQuantity, clearCart, totalItems, totalPrice]);

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
}
