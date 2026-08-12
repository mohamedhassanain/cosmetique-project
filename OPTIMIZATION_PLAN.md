# Kissariya Cosmétiques — Performance Optimization Plan (Supabase Free Plan)

Date: 12 August 2026
Scope: Frontend/query/cache/image optimization only. **No architecture change, no new services, no schema/RLS changes executed automatically.**

## 1. Current Architecture

```
React + Vite (SPA, code-split, React Query)
   ↓  anon key, RLS-protected
Supabase (PostgREST + Storage CDN)
   ↓
PostgreSQL (single instance, Free plan)
```

- Data access is centralized in `src/services/*.service.ts`; all components consume them through React Query hooks in `src/hooks/`.
- Client: `src/integrations/supabase/client.ts` (anon key only).
- Query cache: `src/providers/query-client.ts` — global `staleTime 5m`, `gcTime 10m`, `refetchOnWindowFocus false`, `retry 1`.
- Deploy: Netlify/Vercel SPA + `scripts/prerender-products.mjs` for bot/prerendered product pages.

## 2. Inventory of Supabase read queries (public)

| Query | Service | Select | count | Cache (staleTime) |
|---|---|---|---|---|
| site_settings (singleton) | site-settings.service | `*` (1 row) | — | global 5m |
| categories | category.service | **`*`** | — | 10m |
| subcategories(categoryId) | category.service | **`*`** | — | global 5m (default) |
| promos (active) | promo.service | **`*`** | — | 5m |
| products active (home, limit 60) | product.service | narrow list set | — | 10m |
| products public (catalog/search) | product.service | narrow list set | **`exact`** | 5m |
| product detail by slug | product.service | **ADMIN select** (incl. `product_images` join, `created_at`, `updated_at`, `is_active`, full admin fields) | — | 5m |

Admin queries (orders, admin products, admin promos/settings) also use `count: 'exact'` and `select('*')` where appropriate; admin traffic is low and correctness matters — left unchanged.

## 3. Current Bottlenecks (from audit + last measurements)

1. **Public product detail requests the full admin row** — `fetchProductBySlug` uses `PRODUCT_SELECT_ADMIN`: 3 embedded relations (`categories`, `subcategories`, `product_images`) and ~10 fields the public page never renders. `product_images` join is entirely unused by the public UI (gallery uses `image_url` JSON, not the join). Payload + join cost on every detail view.
2. **`select('*')` on categories / subcategories / promos** — returns timestamps and unused columns on every public catalog/home/footer request.
3. **`count: 'exact'` on every catalog/search page request** — PostgREST executes an extra exact `COUNT(*)` over the full filtered set on top of the page fetch. (Required for the UI "X produit(s)" + pagination — see Phase 3 tradeoff.)
4. **No `keepPreviousData` on catalog pagination** — every page change drops the current list and shows skeletons while refetching.
5. **No next-page prefetch** — page N+1 is fetched only after the user clicks Next.
6. **Card images can download the 1600px original as the 2x candidate** — `getProductCardImage` srcSet is `400px 1x, ORIGINAL 2x`: on a DPR-2 screen a 240px card downloads the full-size webp. Retina = full-size image for every card.
7. **subcategory queries have only the global 5m staleTime** and are fired once per footer column + mega menu; a long staleTime (10m, like categories) avoids refetch between visits.
8. Known from prior load tests: **the hard ceiling is server-side (Supabase API/connection pool)**, not query weight. 500 VU stable (p95 ~97ms), 1000 VU near/at saturation (p95 ~1.86s current, 25.9s lightweight), 2000 VU collapse (p95 60s, 5.1% errors). This plan reduces **per-request cost and total request volume**, which helps at every load level but does NOT raise the platform ceiling.

## 4. Proposed Optimizations

| # | Change | Files | Expected impact | Risk |
|---|---|---|---|---|
| 1 | Dedicated public detail select (no `product_images`, no unused admin fields) | `product.service.ts` | Lower detail payload + join cost | Low — fields verified against ProduitDetail render |
| 2 | Narrow category/subcategory/promo selects to rendered fields | `category.service.ts`, `promo.service.ts` | Smaller payloads on every page/footer/menu | Low — verify admin pages don't need dropped fields |
| 3 | Keep `count: 'exact'` where UI needs totals; document why; rely on cache for repeat filters | `product.service.ts` (no change) | n/a (kept intentionally) | n/a |
| 4 | `keepPreviousData` on public products | `useProducts.tsx` | No refetch/spinner on page change; smoother pagination | Low |
| 5 | Prefetch only the immediate next page | `useProducts.tsx` + `Produits.tsx` | Page 2 ready from cache on click | Low |
| 6 | Card image: `400px` src, srcSet `400/800` only — never the 1600px original | `lib/images.ts` | Huge bandwidth win on retina (biggest free-plan saving) | Low |
| 7 | Detail image: `800px` src, `800 1x / original 2x`; QuickView + gallery use the 800 helper; cart thumbnails use 400 variant | `lib/images.ts`, `QuickViewDialog.tsx`, `ProduitDetail.tsx`, `ProductCard.tsx`, `CartSheet.tsx` | LCP quality kept, bandwidth reduced | Low |
| 8 | `subcategories`: staleTime 10m / gcTime 15m (same as categories) | `useCategories.tsx` | Fewer refetches between visits | Low |
| 9 | site_settings: longer staleTime (15m) — singleton, admin invalidates on edit | `useSiteSettings.tsx` | Fewer home refetches | Low |
| 10 | Explicit width/height/aspect on QuickView + cart images | `QuickViewDialog.tsx`, `CartSheet.tsx` | No layout shift | Low |
| 11 | Index audit → `OPTIMIZATION_INDEXES.sql` (proposed only, not executed) | new file | Documented DB-level candidates | n/a (not run) |
| 12 | Confirm retry policy `retry: 1` + `retry: false` for promo/settings; no aggressive refetch | already set | Document; no change | n/a |

Admin architecture (Supabase Auth → admin → RLS → Postgres) and all CRUD remain untouched. Public shop behavior unchanged (only smaller payloads + cache behavior).

## 5. Verification Plan

- `tsc --noEmit`, `npm run build`, `npx vitest run`, `npm run lint` before and after.
- Browser flow request count (React app, real Supabase): Home → Catalog page 1 → page 2 → Product detail, cold and warm; count `rest/v1` requests + bytes BEFORE and AFTER.
- k6 (same real Supabase, anon key only, read-only): the repo's existing `supabase-current-load.js` = BEFORE. A new `supabase-optimized-load.js` mirroring the post-change queries = AFTER. Levels: 100 / 500 / 1000 VUs (stop if error rate or p95 gate crossed).
- All numbers reported are REAL measurements; anything not measured is labeled NOT VERIFIED / LIKELY.
