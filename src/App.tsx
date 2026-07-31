import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/auth-provider";
import { RequireAuth } from "@/components/RequireAuth";
import { CartProvider } from "@/hooks/cart-provider";
import { BottomNav } from "@/components/BottomNav";
import { FaviconUpdater } from "@/components/FaviconUpdater";
import Index from "./pages/Index";

// Code splitting — chaque page est chargée uniquement quand on y navigue
const Auth = lazy(() => import("./pages/Auth"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminProducts = lazy(() => import("./pages/AdminProducts"));
const AdminProductForm = lazy(() => import("./pages/AdminProductForm"));
const AdminCategories = lazy(() => import("./pages/AdminCategories"));
const AdminOrders = lazy(() => import("./pages/AdminOrders"));
const AdminSettings = lazy(() => import("./pages/AdminSettings"));
const Produits = lazy(() => import("./pages/Produits"));
const ProduitDetail = lazy(() => import("./pages/ProduitDetail"));
const NotFound = lazy(() => import("./pages/NotFound"));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fef8fa]">
      <div className="h-12 w-12 border-4 border-pink-300 border-t-pink-600 rounded-full animate-spin" />
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <CartProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <FaviconUpdater />
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <div className="min-h-screen pb-16 md:pb-0">
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  {/* Pages publiques */}
                  <Route path="/" element={<Index />} />
                  <Route path="/produits" element={<Produits />} />
                  <Route path="/produit/:slug" element={<ProduitDetail />} />

                  {/* Authentification (admin) */}
                  <Route path="/auth" element={<Auth />} />

                  {/* Pages admin — protégées par RequireAuth */}
                  <Route
                    path="/admin"
                    element={
                      <RequireAuth>
                        <AdminDashboard />
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/admin/produits"
                    element={
                      <RequireAuth>
                        <AdminProducts />
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/admin/produits/nouveau"
                    element={
                      <RequireAuth>
                        <AdminProductForm />
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/admin/produits/:id"
                    element={
                      <RequireAuth>
                        <AdminProductForm />
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/admin/categories"
                    element={
                      <RequireAuth>
                        <AdminCategories />
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/admin/commandes"
                    element={
                      <RequireAuth>
                        <AdminOrders />
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/admin/parametres"
                    element={
                      <RequireAuth>
                        <AdminSettings />
                      </RequireAuth>
                    }
                  />

                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
              <BottomNav />
            </div>
          </BrowserRouter>
        </TooltipProvider>
      </CartProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
