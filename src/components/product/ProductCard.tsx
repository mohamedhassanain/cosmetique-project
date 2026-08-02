import { memo } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Product } from '@/types/product';
import { useProductActions } from '@/hooks/useProductActions';
import { useCart } from '@/hooks/cart-utils';
import { useIsDesktop } from '@/hooks/useIsDesktop';

interface ProductCardProps {
  product: Product;
}

export const ProductCard = memo(function ProductCard({ product }: Readonly<ProductCardProps>) {
  const { handleWhatsAppOrder, parseImages } = useProductActions();
  const { addToCart } = useCart();
  const isDesktop = useIsDesktop();

  const images = parseImages(product.image_url);
  const displayImage = images[0];

  // Sur PC (souris), la fiche produit s'ouvre dans un nouvel onglet.
  // Sur mobile et tablette (tactile), la navigation actuelle est conservée.
  const productLinkProps = isDesktop
    ? { target: '_blank', rel: 'noopener noreferrer' }
    : {};

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    addToCart({
      id: product.id,
      name: product.name,
      price: product.price,
      image_url: displayImage || null,
    });
  };

  const handleWhatsApp = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    handleWhatsAppOrder(product);
  };

  return (
    <Card className="group border-none bg-white hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 overflow-hidden rounded-2xl shadow-sm">
      <Link to={`/produit/${product.slug}`} {...productLinkProps}>
        <div className="aspect-square relative overflow-hidden w-full rounded-t-2xl bg-pink-50">
          {displayImage ? (
            <img
              src={displayImage}
              alt={product.name}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-pink-200 text-4xl">🌸</span>
            </div>
          )}
          
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />

          {product.is_promotion && (
            <div className="absolute top-3 left-3 z-20">
              <Badge className="bg-red-400 hover:bg-red-500 border-none px-2 py-0.5 shadow-lg text-xs">
                {product.original_price && product.original_price > product.price
                  ? `-${Math.round(((product.original_price - product.price) / product.original_price) * 100)}%`
                  : 'PROMO'}
              </Badge>
            </div>
          )}

          {product.is_featured && (
            <div className="absolute top-3 right-3 z-20">
              <Badge className="bg-green-400 hover:bg-green-500 border-none px-2 py-0.5 shadow-lg text-xs font-medium">
                Coup de cœur
              </Badge>
            </div>
          )}
        </div>
      </Link>
      
      <CardContent className="p-4">
        <Link to={`/produit/${product.slug}`} {...productLinkProps}>
          <h3 className="font-bold text-slate-800 text-sm line-clamp-2 h-10 group-hover:text-pink-600 transition-colors">
            {product.name}
          </h3>
        </Link>
        
        {product.categories && (
          <p className="text-[10px] text-pink-400 uppercase tracking-wider mt-1">{product.categories.name}</p>
        )}
        
        <div className="flex items-baseline gap-2 mt-1 mb-3">
          <span className="font-black text-lg text-pink-700">{product.price} DH</span>
          {product.is_promotion && product.original_price ? (
            <span className="text-xs text-pink-300 line-through">{product.original_price} DH</span>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" className="w-full border-pink-200 text-pink-600 hover:bg-pink-50 hover:text-pink-700 rounded-xl h-10 shadow-sm transition-all gap-2" onClick={handleAddToCart}>
            <ShoppingCart className="h-4 w-4" />
            <span className="text-[10px] font-bold">Panier</span>
          </Button>
          <Button type="button" className="w-full bg-green-500 hover:bg-green-600 text-white rounded-xl h-10 shadow-sm hover:shadow-md transition-all gap-2" onClick={handleWhatsApp}>
            <MessageCircle className="h-4 w-4" />
            <span className="text-[10px] font-bold">Direct</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
});

ProductCard.displayName = 'ProductCard';
