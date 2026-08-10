import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryProvider } from "@/providers/query-provider";
import { AuthProvider } from "@/providers/auth-provider";
import { RequireAdmin } from "@/components/shared/RequireAdmin";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { CartProvider } from "@/providers/cart-provider";
import { BottomNav } from "@/components/layout/BottomNav";
import { FaviconUpdater } from "@/components/shared/FaviconUpdater";
import { SentryTestButton } from "@/components/shared/SentryTestButton";
import { SentryFeedbackButton } from "@/components/shared/SentryFeedbackButton";
import Index from "./pages/shop/Index";

// Code splitting — chaque page est chargée uniquement quand on y navigue
const Auth = lazy(() => import("./pages/auth/Auth"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminProducts = lazy(() => import("./pages/admin/AdminProducts"));
const AdminProductForm = lazy(() => import("./pages/admin/AdminProductForm"));
const AdminCategories = lazy(() => import("./pages/admin/AdminCategories"));
const AdminOrders = lazy(() => import("./pages/admin/AdminOrders"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings"));
const AdminPromos = lazy(() => import("./pages/admin/AdminPromos"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const Produits = lazy(() => import("./pages/shop/Produits"));
const ProduitDetail = lazy(() => import("./pages/shop/ProduitDetail"));
const NotFound = lazy(() => import("./pages/errors/NotFound"));
const AccesRefuse = lazy(() => import("./pages/errors/AccesRefuse"));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fef8fa]">
      <div className="h-12 w-12 border-4 border-pink-300 border-t-pink-600 rounded-full animate-spin" />
    </div>
  );
}

const App = () => (
  <QueryProvider>
    <AuthProvider>
      <CartProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <FaviconUpdater />
          <BrowserRouter>
            <div className="min-h-screen pb-16 md:pb-0">
              <SentryTestButton />
              <SentryFeedbackButton />
              <ErrorBoundary>
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                  {/* Pages publiques */}
                  <Route path="/" element={<Index />} />
                  <Route path="/produits" element={<Produits />} />
                  <Route path="/produit/:slug" element={<ProduitDetail />} />

                  {/* Authentification (admin) */}
                  <Route path="/auth" element={<Auth />} />

                  {/* Pages admin — protégées par RequireAdmin (connecté + is_admin) */}
                  <Route
                    path="/admin"
                    element={
                      <RequireAdmin>
                        <AdminDashboard />
                      </RequireAdmin>
                    }
                  />
                  <Route
                    path="/admin/produits"
                    element={
                      <RequireAdmin>
                        <AdminProducts />
                      </RequireAdmin>
                    }
                  />
                  <Route
                    path="/admin/produits/nouveau"
                    element={
                      <RequireAdmin>
                        <AdminProductForm />
                      </RequireAdmin>
                    }
                  />
                  <Route
                    path="/admin/produits/:id"
                    element={
                      <RequireAdmin>
                        <AdminProductForm />
                      </RequireAdmin>
                    }
                  />
                  <Route
                    path="/admin/categories"
                    element={
                      <RequireAdmin>
                        <AdminCategories />
                      </RequireAdmin>
                    }
                  />
                  <Route
                    path="/admin/commandes"
                    element={
                      <RequireAdmin>
                        <AdminOrders />
                      </RequireAdmin>
                    }
                  />
                  <Route
                    path="/admin/parametres"
                    element={
                      <RequireAdmin>
                        <AdminSettings />
                      </RequireAdmin>
                    }
                  />
                  <Route
                    path="/admin/publicites"
                    element={
                      <RequireAdmin>
                        <AdminPromos />
                      </RequireAdmin>
                    }
                  />

                  <Route
                    path="/admin/administrateurs"
                    element={
                      <RequireAdmin>
                        <AdminUsers />
                      </RequireAdmin>
                    }
                  />

                    <Route path="/acces-refuse" element={<AccesRefuse />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
              </ErrorBoundary>
              <BottomNav />
            </div>
          </BrowserRouter>
        </TooltipProvider>
      </CartProvider>
    </AuthProvider>
  </QueryProvider>
);

export default App;
