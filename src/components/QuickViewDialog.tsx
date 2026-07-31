import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Share2, ShoppingCart, MessageCircle, Package, ChevronLeft, ChevronRight, Sparkles, Leaf } from 'lucide-react';
import { Product } from '@/types/product';
import { useProductActions } from '@/hooks/useProductActions';
import { useCart } from '@/hooks/cart-utils';

interface QuickViewDialogProps {
  product: Product | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onShare: (product: Product) => void;
}

export function QuickViewDialog({ product, isOpen, onOpenChange, onShare }: Readonly<QuickViewDialogProps>) {
  const [imageIndex, setImageIndex] = useState(0);
  const { handleWhatsAppOrder, parseImages } = useProductActions();
  const { addToCart } = useCart();

  const images = useMemo(() => (product ? parseImages(product.image_url) : []), [product, parseImages]);

  if (!product) return null;

  const handleAddToCart = () => {
    addToCart({
      id: product.id,
      name: product.name,
      price: product.price,
      image_url: images[0] || null,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) setImageIndex(0);
      onOpenChange(open);
    }}>
      <DialogContent className="max-w-5xl p-0 overflow-y-auto md:overflow-hidden rounded-3xl border-none shadow-2xl max-h-[95vh] md:max-h-[90vh] w-[95vw] md:w-full">
        <div className="grid md:grid-cols-[1.2fr,1fr] md:h-[80vh] min-h-[500px] overflow-hidden">
          <div className="bg-pink-50 md:h-full flex flex-col overflow-hidden">
            <div className="relative w-full aspect-square md:aspect-auto md:flex-1 overflow-hidden">
              {images.length > 0 ? (
                <img src={images[imageIndex]} alt={product.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Package className="h-20 w-20 text-pink-200" />
                </div>
              )}
              {product.is_promotion ? (
                <div className="absolute top-4 left-4">
                  <Badge className="bg-red-400 text-white px-3 py-1 text-sm font-black shadow-lg border-none">
                    {product.original_price && product.original_price > product.price
                      ? `-${Math.round(((product.original_price - product.price) / product.original_price) * 100)}%`
                      : 'PROMO'}
                  </Badge>
                </div>
              ) : null}
              {images.length > 1 && (
                <>
                  <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2 px-4 z-30">
                    {images.map((img, idx) => (
                      <button key={idx} type="button" onClick={() => setImageIndex(idx)}
                        className={`h-2 rounded-full transition-all ${idx === imageIndex ? 'w-8 bg-pink-400' : 'w-2 bg-pink-200 hover:bg-pink-300'}`}
                        aria-label={`Image ${idx + 1}`} />
                    ))}
                  </div>
                  <div className="absolute inset-0 flex items-center justify-between px-4 z-30 pointer-events-none">
                    <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full bg-white/70 hover:bg-white text-pink-700 pointer-events-auto"
                      onClick={() => setImageIndex(imageIndex === 0 ? images.length - 1 : imageIndex - 1)}>
                      <ChevronLeft className="h-6 w-6" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full bg-white/70 hover:bg-white text-pink-700 pointer-events-auto"
                      onClick={() => setImageIndex(imageIndex === images.length - 1 ? 0 : imageIndex + 1)}>
                      <ChevronRight className="h-6 w-6" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="p-5 md:p-8 flex flex-col h-full min-h-0 bg-white">
            <ScrollArea className="flex-1 md:pr-4 mb-4">
              <div className="space-y-4 md:space-y-6">
                <div>
                  {product.categories && (
                    <Link to={`/produits?categorie=${product.categories.slug}`} className="text-xs uppercase tracking-wider text-pink-500 hover:text-pink-700 font-bold block mb-1">
                      {product.categories.name}
                    </Link>
                  )}
                  <DialogTitle className="text-2xl md:text-3xl font-display font-bold text-pink-900 leading-tight mb-2">
                    {product.name}
                  </DialogTitle>
                  <DialogDescription className="sr-only">Détails du produit {product.name}</DialogDescription>
                  {product.brand && (
                    <div className="flex items-center gap-1 text-sm text-pink-500 mt-1">
                      <Leaf className="h-3 w-3 text-green-400" /> {product.brand}
                    </div>
                  )}
                  {product.weight_grams && (
                    <p className="text-xs text-pink-400 mt-1">{product.weight_grams}g</p>
                  )}
                </div>

                <div className="flex items-baseline gap-3">
                  <span className="text-3xl md:text-4xl font-black text-pink-600">{product.price} DH</span>
                  {product.is_promotion && product.original_price ? (
                    <span className="text-lg text-pink-300 line-through">{product.original_price} DH</span>
                  ) : null}
                </div>

                <div className="pt-4 border-t border-pink-100">
                  <h4 className="font-bold text-pink-900 mb-2 uppercase text-xs tracking-widest">Description</h4>
                  <p className="text-pink-700 leading-relaxed text-sm md:text-base mb-4">
                    {product.description || 'Découvrez ce produit cosmétique exceptionnel.'}
                  </p>
                  {product.ingredients && (
                    <div className="bg-pink-50 rounded-xl p-3 mb-4">
                      <h5 className="font-bold text-pink-900 text-xs mb-1">Ingrédients</h5>
                      <p className="text-pink-600 text-sm">{product.ingredients}</p>
                    </div>
                  )}
                  {product.how_to_use && (
                    <div>
                      <h5 className="font-bold text-pink-900 text-xs mb-1">Mode d'emploi</h5>
                      <p className="text-pink-600 text-sm">{product.how_to_use}</p>
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
            
            <div className="space-y-2 pt-3 border-t border-pink-100 bg-white">
              <Button variant="outline" className="w-full h-10 border-pink-200 text-pink-600 hover:bg-pink-50 rounded-xl text-sm font-bold shadow-sm gap-2"
                onClick={() => onShare(product)}>
                <Share2 className="h-4 w-4" /> Partager
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="h-12 border-pink-400 text-pink-600 hover:bg-pink-50 rounded-xl text-base font-black shadow-sm gap-2"
                  onClick={handleAddToCart}>
                  <ShoppingCart className="h-5 w-5" /> Panier
                </Button>
                <Button className="h-12 bg-green-500 hover:bg-green-600 text-white rounded-xl text-base font-black shadow-sm gap-2"
                  onClick={() => handleWhatsAppOrder(product)}>
                  <MessageCircle className="h-5 w-5" /> Direct
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
