/**
 * Toutes les routes de l'application, centralisées.
 * Évite les fautes de frappe dans les liens et facilite les changements d'URL.
 */
export const ROUTES = {
  home: "/",
  products: "/produits",
  productDetail: (slug: string) => `/produit/${slug}`,
  productsByCategory: (slug: string) => `/produits?categorie=${slug}`,
  productsBySubcategory: (categorySlug: string, subName: string) =>
    `/produits?categorie=${categorySlug}&sous-categorie=${subName.toLowerCase()}`,
  productsPromotions: "/produits?promotions=true",
  productsFeatured: "/produits?featured=true",
  auth: "/auth",
  admin: "/admin",
  adminProducts: "/admin/produits",
  adminProductNew: "/admin/produits/nouveau",
  adminProductEdit: (id: string) => `/admin/produits/${id}`,
  adminCategories: "/admin/categories",
  adminOrders: "/admin/commandes",
  adminSettings: "/admin/parametres",
} as const;
