# SUPABASE REQUEST MAP — KISSARIYA COSMÉTIQUES

Date: 13/08/2026. Complete application-level map of every Supabase REST call in the codebase, with the React Query caching/dedup behavior for each.

## A. Public app (shop) — the only traffic relevant to load-tests

| # | File (function) | Table | Endpoint (what PostgREST actually issues) | Hook | Components consuming | When it executes | On mount? | After every render? | After nav? | After auth change? | Caching | staleTime | Dedup | Can fire multiple times simultaneously? |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `site-settings.service.ts` `fetchSiteSettings` | site_settings | `select=site_name,site_description,whatsapp_number,logo_url,hero_title,hero_subtitle&limit=1` | `useSiteSettings` | `Logo` (header, hero fallback, cart footer), `FaviconUpdater` (global), `CartSheet`, `Index`, `ProduitDetail` | only once per tab until stale | ✅ exactly 1 fetch per (queryKey, QueryClient), regardless of how many consumers | ❌ (React Query) | ❌ (no refetch on route change; cache persists in QueryClient forever — gcTime 30 min) | ❌ (`refetchOnWindowFocus:false` globally; not tied to auth) | shared key `['site-settings']` | **15 min** | ✅ React Query dedupes all consumers → **1 network call per tab per 15 min** | ❌ deduped by React Query |
| 2 | `product.service.ts` `fetchActiveProducts` | products | `select=id,name,slug,price,original_price,is_promotion,is_featured,image_url,image_url_400,image_url_800,brand,category_id,subcategory_id,categories(name,slug)&is_active=eq.true&order=created_at.desc&limit=24` | `useActiveProducts` | `Index` | once per tab until stale | ✅ 1 | ❌ | ❌ | ❌ | key `['products','active','all']` | 10 min | ✅ | ❌ |
| 3 | `category.service.ts` `fetchCategories` | categories | `select=id,name,slug&order=sort_order.asc` | `useCategories` | Home header/CategoryMegaMenu/Footer/Produits (multiple instances) | once per tab until stale | ✅ 1 | ❌ | ❌ | ❌ | key `['categories']` | 10 min | ✅ | ❌ |
| 4 | `category.service.ts` `fetchAllSubcategories` | subcategories | `select=id,category_id,name,slug&order=sort_order.asc` | `useAllSubcategories` | CategoryMegaMenu + Footer (shared) | once per tab until stale | ✅ 1 | ❌ | ❌ | ❌ | key `['subcategories',undefined]` | 10 min | ✅ | ❌ |
| 5 | `promo.service.ts` `fetchActivePromos` | promos | `select=id,badge,title,subtitle,link,image_url,sort_order&is_active=eq.true&order=sort_order.asc` | `useActivePromos` | `HeroPromoCarousel` | once per tab until stale | ✅ 1 | ❌ | ❌ | ❌ | key `['promos']` (retry:false) | 5 min | ✅ | ❌ |
| 6 | `product.service.ts` `fetchPublicProducts` | products | `select=<PRODUCT_LIST_SELECT>&is_active=eq.true[&category_id=eq.…][&subcategory_id=eq.…][&is_promotion=eq.true][&is_featured=eq.true][&order=price.asc|desc|created_at.desc]&offset=…&limit=17` | `usePublicProducts` | `Produits` (catalog page w/ filters, sort, pagination) | per unique filter/page key; only after slug→id resolved client-side | ✅ 1 per filter-set | ❌ | only on real filter/page change (new query key) | ❌ | key `['products','public',filters]` + `keepPreviousData` + next-page prefetch guarded by freshness check | 5 min | ✅ | ❌ (React Query; prefetch is guarded by `isFetching`/fresh check) |
| 7 | `product.service.ts` `fetchProductBySlug` | products | `select=<PRODUCT_DETAIL_SELECT>&slug=eq.…&is_active=eq.true&limit=1` | `useProductBySlug` | `ProduitDetail` | on mount of detail page (key `['product',slug]`) | ✅ 1 per slug | ❌ | per-product viewed | ❌ | key `['product',slug]` | 5 min | ✅ | ❌ |
| 8 | `site-settings.service.ts` `fetchWhatsAppNumber` | site_settings | `select=whatsapp_number&limit=1` | **plain call** (not via React Query) in `whatsapp.service.ts getWhatsAppNumber` | fired inside `openWhatsAppOrder(product)` — user clicks « Commander sur WhatsApp » | ONLY on user WhatsApp click | ❌ | ❌ | ❌ | ❌ | **none** (bypasses React Query cache) | — | ❌ | per-click (guarded by module-level `whatsappOrderInFlight` lock) |

### Public-app behavior summary (PROVEN from code)

- **Every public query has a stable shared React Query key** → multiple components consuming the same data (Logo×3, FaviconUpdater, CartSheet, Footer, menu) produce **1 network request** per tab, **not** one per component.
- **`refetchOnWindowFocus:false`** globally (query-client.ts) → no refetch on tab focus.
- **No `setInterval`/`setTimeout` loop fetches Supabase anywhere.** The only timers are the hero-carousel autoplay (UI state, no network) and the search debounce (300 ms, client-side only).
- **No per-render fetches.** All data access is `useQuery`.
- Expected real-session cost: **1 site_settings + 1 categories + 1 subcategories + 1 home-products + 1 promos** for the first home load (= 5 REST), then **0 further requests for 5–15 min** thanks to staleTime, across all navigation.
- The ONLY un-deduped public call is `fetchWhatsAppNumber` (event-driven on a user button click, guarded by an in-flight lock) — not a load factor.

## B. Admin app (authenticated; NOT part of load tests; must never be cached)

| File (function) | Table | Endpoint | Hook | Cache | Notes |
|---|---|---|---|---|---|
| `site-settings.service.ts` `fetchAdminSiteSettings` | site_settings | `select=*&limit=1` | `useAdminSiteSettings` | key `['site-settings','admin']`, stale 2 min | **admin-only**; `select=*` lives here and in k6 — see REQUEST_OPTIMIZATION_REPORT; it is NOT the public path |
| `product.service.ts` `fetchAllProducts` | products | admin select incl. `count=exact`, `product_images`, `subcategories` | `useProducts` | key `['products','admin',filters]`, stale 2 min | admin grid; count=exact justified (admin total Pages) |
| `category.service.ts` create/update/delete | categories/subcategories | INSERT/UPDATE/DELETE | mutation hooks | invalidates `['categories']`/`['subcategories']` | admin CRUD |
| `promo.service.ts` `fetchAllPromos` + CRUD | promos | `select=*` (admin) + mutations | `useAllPromos` | key `['promos','all']`, retry:false | admin |
| `product.service.ts` create/update/delete | products | INSERT/UPDATE/DELETE | `useCreate/Update/DeleteProduct` | optimistic + invalidates `['products']`+`['product']` | admin CRUD |
| `order.service.ts` `fetchOrders`/`countOrders`/`updateOrderStatus`/`updateOrderCustomer`/`deleteOrder`/`createOrder` | orders | SELECT count=exact, head count, UPDATE, DELETE, INSERT | `useOrders` (admin) / public cart `createOrder` | admin queries NOT cached (fresh dashboard data) | admin; `createOrder` is public insert on cart "Commander" (user action, locked) |

## C. Auth (supabase-js, not REST `/rest/v1`)

| Call | Where | When | Frequency |
|---|---|---|---|
| `supabase.auth.onAuthStateChange` + `getSession()` | `auth-provider.tsx` effect (mount) | once per tab on app start | 1/tab |
| `signInWithPassword` | `Auth` page (admin login) | on submit | user action |
| `signOut` | admin logout | user action | user action |

Auth never fires on navigation, never on focus, never on product/home views, and produces **zero** requests in the k6 load workload (k6 never signs in).
