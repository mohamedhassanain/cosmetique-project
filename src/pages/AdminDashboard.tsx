import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/auth-utils';
import { useProducts } from '@/hooks/useProducts';
import { useOrders } from '@/hooks/useOrders';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, ShoppingCart, Tags, Settings, Plus, LogOut, Sparkles, TrendingUp, Eye, Flower2 } from 'lucide-react';
import Logo from '@/components/Logo';

function firstImage(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  try {
    const parsed = JSON.parse(imageUrl);
    if (Array.isArray(parsed)) return parsed[0] || null;
    return imageUrl;
  } catch {
    return imageUrl;
  }
}

export default function AdminDashboard() {
  const { user, loading: authLoading, signOut } = useAuth();
  const { products, featuredProducts, promotionProducts, isLoading: productsLoading } = useProducts();
  const { pendingOrders, isLoading: ordersLoading } = useOrders();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth');
  }, [user, authLoading, navigate]);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-pink-50">
        <div className="h-12 w-12 border-4 border-pink-300 border-t-pink-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-rose-50">
      <header className="border-b border-pink-100 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo className="h-10 w-10" />
            <div>
              <h1 className="font-display font-bold text-lg text-pink-900">Administration</h1>
              <p className="text-xs text-pink-500">Gérez votre boutique</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="border-pink-200 text-pink-700" asChild>
              <Link to="/"><Eye className="h-4 w-4 mr-1" />Voir le site</Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Quick Actions */}
        <div className="flex flex-wrap gap-3 mb-8">
          <Button asChild className="bg-pink-400 hover:bg-pink-500 text-white rounded-full shadow-lg">
            <Link to="/admin/produits/nouveau"><Plus className="h-4 w-4 mr-2" />Nouveau produit</Link>
          </Button>
          <Button variant="outline" className="border-pink-200 text-pink-700" asChild>
            <Link to="/admin/produits"><Package className="h-4 w-4 mr-2" />Produits</Link>
          </Button>
          <Button variant="outline" className="border-pink-200 text-pink-700" asChild>
            <Link to="/admin/categories"><Tags className="h-4 w-4 mr-2" />Catégories</Link>
          </Button>
          <Button variant="outline" className="border-pink-200 text-pink-700" asChild>
            <Link to="/admin/commandes"><ShoppingCart className="h-4 w-4 mr-2" />Commandes</Link>
          </Button>
          <Button variant="outline" className="border-pink-200 text-pink-700" asChild>
            <Link to="/admin/parametres"><Settings className="h-4 w-4 mr-2" />Paramètres</Link>
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="border-pink-100">
            <CardHeader className="pb-2"><CardDescription className="flex items-center gap-2 text-pink-500"><Package className="h-4 w-4" />Produits</CardDescription></CardHeader>
            <CardContent><p className="text-3xl font-bold text-pink-900">{products.length}</p></CardContent>
          </Card>
          <Card className="border-pink-100">
            <CardHeader className="pb-2"><CardDescription className="flex items-center gap-2 text-pink-500"><Sparkles className="h-4 w-4" />En vedette</CardDescription></CardHeader>
            <CardContent><p className="text-3xl font-bold text-pink-900">{featuredProducts.length}</p></CardContent>
          </Card>
          <Card className="border-pink-100">
            <CardHeader className="pb-2"><CardDescription className="flex items-center gap-2 text-pink-500"><TrendingUp className="h-4 w-4" />Promotions</CardDescription></CardHeader>
            <CardContent><p className="text-3xl font-bold text-pink-900">{promotionProducts.length}</p></CardContent>
          </Card>
          <Card className="border-pink-100">
            <CardHeader className="pb-2"><CardDescription className="flex items-center gap-2 text-pink-500"><ShoppingCart className="h-4 w-4" />Commandes en attente</CardDescription></CardHeader>
            <CardContent><p className="text-3xl font-bold text-pink-900">{pendingOrders.length}</p></CardContent>
          </Card>
        </div>

        {/* Quick Links */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="border-pink-100">
            <CardHeader><CardTitle className="text-pink-900 text-lg">Derniers produits</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {products.slice(0, 5).map(p => (
                <div key={p.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-pink-50">
                  <div className="flex items-center gap-3">
                    {firstImage(p.image_url) ? (
                      <img src={firstImage(p.image_url)!} alt="" className="h-10 w-10 rounded-lg object-cover" />
                    ) : (
                      <div className="h-10 w-10 rounded-lg bg-pink-100 flex items-center justify-center"><Flower2 className="h-5 w-5 text-pink-300" /></div>
                    )}
                    <div>
                      <p className="font-medium text-pink-900 text-sm">{p.name}</p>
                      <p className="text-xs text-pink-500">{p.price} DH</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="text-pink-500" asChild><Link to={`/admin/produits/${p.id}`}>Modifier</Link></Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-pink-100">
            <CardHeader><CardTitle className="text-pink-900 text-lg">Commandes récentes</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {pendingOrders.slice(0, 5).map(o => (
                <div key={o.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-pink-50">
                  <div>
                    <p className="font-medium text-pink-900 text-sm">{o.product_name}</p>
                    <p className="text-xs text-pink-500">{o.customer_name} - {o.total_price} DH</p>
                  </div>
                  <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">{o.status}</span>
                </div>
              ))}
              {pendingOrders.length === 0 && <p className="text-pink-400 text-sm text-center py-8">Aucune commande en attente</p>}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
