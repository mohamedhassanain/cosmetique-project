# PERFORMANCE & BOTTLENECK AUDIT — Kissariya Cosmétiques

Date : 2026-08-15
Scope : full-stack code-level audit (frontend → Supabase Data API → PostgreSQL schema → Edge Functions → k6). No architectural redesign. No Redis/Kubernetes/Load Balancer introduced.

Evidence split (no fabricated numbers) :
- **CODE VERIFIED** — statically proven from the repository (this audit).
- **LOCALLY TESTED** — verified via lint/typecheck/tests/build in this session.
- **LIVE SUPABASE VERIFIED** — requires the live project.
- **NOT YET VERIFIED** — requires live measurement.

---

## 1. Executive summary

The repository is already extensively optimized for Supabase free-plan constraints. One real, code-proven redundant request path was found and fixed; the rest of the audit confirms the existing defense layers are correct and should NOT be changed.

Fixed bottleneck : `fetchWhatsAppNumber()` issued a dedicated `SELECT whatsapp_number` against `site_settings` on **every WhatsApp click**, bypassing the shared 10-minute public settings cache (`fetchSiteSettings`). Since `whatsapp_number` is already included in the public narrow select, the dedicated query was redundant. It now resolves through the shared cache (`fetchSiteSettings()`), eliminating one API request per WhatsApp click (product cards, quick-view, cart checkout).

## 2. Supabase query inventory (CODE VERIFIED)

| Table | Select | Filters | Order | Pagination | Frequency driver | Duplicated? | Cacheable? | Public/Admin |
|---|---|---|---|---|---|---|---|---|
| `site_settings` (public) | 6 narrow cols (`SITE_SETTINGS_SELECT_PUBLIC`) | limit 1 | – | no | per app mount + per 10-min TTL | No — shared memory cache + React Query dedup | Yes (10 min memory + 15 min React Query) | Public |
| `site_settings` (admin form) | `*` | limit 1 | – | no | admin page view | No | Yes (2 min admin cache) | Admin |
| `site_settings` (wa per click) | `whatsapp_number` | limit 1 | – | no | **every WhatsApp click** | **BEFORE FIX : yes — redundant with public settings fetch** | Yes | Public |
| `categories` | `id,name,slug` | – | sort_order | no | per mount | No (React Query, 10 min) | Yes | Public |
| `subcategories` | 4 cols | category filtered (per-category) or all | sort_order | no | per mount / per category page | No (React Query, 10 min) | Yes | Public |
| `promos` (active) | 7 cols (`PROMO_SELECT_PUBLIC`) | `is_active=true` | sort_order | no | per mount | No (React Query, 5 min, retry false) | Yes | Public |
| `products` (home) | narrow public card select | `is_active=true` | created_at desc | limit 24 | per mount | No (React Query, 10 min) | Yes | Public |
| `products` (catalog) | narrow public card select | active + category/subcategory/promo/featured/or(search) | newest/price | **page+1, no count=exact** | per filter/page change (debounced search 300 ms) | No (React Query, 5 min, keepPreviousData) | Yes | Public |
| `products` (detail) | `PRODUCT_SELECT_PUBLIC_DETAIL` | slug + active | – | limit 1 | per product page | No (React Query, 5 min) | Yes | Public |
| `products` (admin) | full admin select incl. joins | search | created_at desc | count=exact + range; pageSize capped 100 | admin page | No (React Query, 2 min) | Yes | Admin |
| `orders` (admin) | `*`, count exact | status filter | created_at desc | range, pageSize ≤ 50 | admin page | No (React Query, 30 s) | No — admin data | Admin |
| `orders` (stats) | `id` HEAD count | optional status | – | head | dashboard mount | No (React Query, 30 s) | No — admin data | Admin |
| `orders` (public create) | – | – | – | – | WhatsApp click / cart checkout | Guarded (anti double-click) | No — write | Edge Function `create-order` |
| `contact_messages` (public create) | – | – | – | – | contact submit | Guarded | No — write | Edge Function `create-contact` |

### Frequencies (from Supabase observability)

- ~25k `site_settings`, ~49k `categories`, ~49k product-listing queries — largely **per-session/per-navigation** for a small catalog with a 5–15 min frontend cache. With the React Query + memory-cache layers and the per-click WhatsApp fix, per-user request counts are minimal.
- `site_settings` ~1 s average in one observed window : `NOT PROVEN — REQUIRES LIVE MEASUREMENT` (the app now performs at most one narrow settings fetch per 10 min per tab, so the request itself is unlikely to be the source of sustained load).

## 3. Bottlenecks found

### BOTTLENECK #1 (fixed)
LOCATION : `src/services/site-settings.service.ts` → `fetchWhatsAppNumber()`
EVIDENCE : `whatsapp.service.ts` calls `fetchWhatsAppNumber()` on every `openWhatsAppOrder()` (product detail, quick-view, ProductCard "Direct", CartSheet checkout). Before the fix each call issued its own `SELECT whatsapp_number`.
IMPACT : 1 redundant Supabase request per WhatsApp click, regardless of cache state.
ROOT CAUSE : dedicated query not routed through the existing shared public-settings cache.
FIX : `fetchWhatsAppNumber()` now delegates to `fetchSiteSettings()` (10-min shared memory cache, already selecting `whatsapp_number`).
EXPECTED IMPROVEMENT : −1 request per WhatsApp interaction; the number is served from cache after the first settings load.
RISK : none — same column, same table, same error semantics (fallback `+212600000000` on failure).

### Other observations (verified — NOT bottlenecks, no changes made)

- No `select('*')` on public routes. Public selects are narrow and matched to rendered fields.
- No `supabase.from()` / `supabase.rpc()` calls in components — all through services + React Query.
- No polling, no realtime subscriptions, no `useInfiniteQuery`.
- Search is DB-side (`search_vector.phfts` + `name/brand ilike`, sanitized), never full-table download.
- Catalog pagination uses `limit+1` for `hasNextPage` — no exact `COUNT(*)` on the public hot path.
- Slug→id resolution happens client-side from the categories/subcategories cache (no server lookups per filter change).
- Bundle : routes code-split via `lazy()`; images lazy/decoding async with width/height; srcSet/sizes on ProductCard, QuickView, ProduitDetail.

## 4. Changes implemented

| File | Change | Type |
|---|---|---|
| `src/services/site-settings.service.ts` | `fetchWhatsAppNumber()` now reuses `fetchSiteSettings()` (shared 10-min memory cache) instead of issuing a dedicated query | Request reduction |

## 5. Database / indexes

`supabase/database.sql` already contains the relevant indexes (verified) : `products.slug` UNIQUE (detail lookup), `idx_products_category`, `idx_products_subcategory`, `idx_products_active`, `idx_products_promotion`, `idx_products_featured`, `idx_products_search_vector` GIN, `idx_products_name_trgm` / `idx_products_brand_trgm` GIN (search), `idx_subcategories_category_slug` UNIQUE, `idx_products_created_at`, `idx_orders_created_at` / `idx_orders_status_created`, `idx_contact_messages_created_at`, `idx_product_images_product_sort`. **No new index added** — the current query patterns (verified against the service layer) are already covered. The two composite indexes documented in `database.sql` remain gated behind `EXPLAIN ANALYZE` on representative volume (NOT YET VERIFIED).

## 6. Supabase request reduction

- Fixed: −1 request per WhatsApp click (settings), cached for 10 min.
- Already in place: React Query dedup + `staleTime` 5–15 min on public data; shared in-memory settings cache; `keepPreviousData` catalog pagination; client-side slug→id; debounced search (300 ms); prefetch gated by freshness checks.

## 7. Caching changes

- `fetchWhatsAppNumber()` now benefits from the existing shared settings memory cache (10 min), already invalidated by `updateSiteSettings()` via `clearPublicSettingsCache()`.
- No new cache layer; nothing sensitive is cached. Admin/orders/auth data remain uncached / admin-keyed.

## 8. Frontend optimizations

No further changes implemented — the audit verified the existing optimizations are correct (code splitting, lazy images, srcSet/sizes, memoized `ProductCard`, no render-phase side effects).

## 9. Edge Functions

Verified, no changes: `create-order` / `create-contact` perform validation → persistent PostgreSQL rate limiting (hashed IP, 10 min + 1 h windows) → `service_role` insert. Order price is recalculated server-side from the catalog. No unnecessary DB round-trips beyond the price read for `product_id` orders; no timers; secrets read from env only.

## 10. k6 results

- `k6/bottleneck-controlled.js` verified **read-only** for workloads A–E and H (GETs against the anon REST API). Workloads F/G (write) are guarded to ≤ 5 VU and clearly marked "NEVER run against production". It measures RPS, p50/p90/p95/p99, error counters (2xx/4xx/429/5xx/timeout) and supports 500/700/1000 VU via `MAX_VUS`.
- Historical results file `load-tests/results/controlled-H-1000vu.json` documents p95 ≈ 11.8 s at 1000 VU with 0 errors.
- **This session: NO k6 run executed** (no Supabase test credentials / no live project access). Before/after comparison for the settings fix must be measured at the requested levels (500/700/1000 VU) on the live project — `NOT YET VERIFIED`.

## 11. Before / After comparison

| Metric | Before | After |
|---|---|---|
| WhatsApp click → Supabase requests | 1 settings SELECT + 1 Edge Function POST | 1 Edge Function POST (settings served from cache after first load) |
| Public page per-session Supabase requests | already deduped via React Query + memory cache | unchanged |
| Tests / lint / build | — | 97/97 · lint OK · build OK |

## 12. Remaining risks & production recommendations

- **Live verification pending** : re-check Supabase logs for `site_settings` request counts after deploy (expect per-tab drop to ≤ 1 per 10 min). Run the k6 sweep (A–E, H) at 500/700/1000 VU on the live project.
- **High-load behavior** : 1000 VU p95 ≈ 11.8 s with 0 errors, low DB CPU — consistent with the platform/API path being the constraint, not PostgreSQL. This remains `NOT YET VERIFIED` as a root cause; do not add Redis/Kubernetes/LB without live measurement pointing there.
- **esbuild advisory** : dev-server-only; breaking `vite@8` fix intentionally deferred. `nanoid` already ≥ 3.3.18.
- Keep Cloudflare cache rules limited to static assets and explicit origin-respect (never `/rest/v1/*` or `/auth/v1/*`).

## 13. Validation results (LOCALLY TESTED)

- `npx tsc --noEmit` — clean
- `npm run lint` — clean
- `npx vitest run` — 13 files / 97 tests passed
- `npm run build` (production anon config) — success (≈ 11.7 s)
- Auth/admin/RLS/Edge Function security — unchanged; no service_role exposed; no new dependencies.
