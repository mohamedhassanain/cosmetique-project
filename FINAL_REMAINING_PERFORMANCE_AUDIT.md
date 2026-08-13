# FINAL REMAINING PERFORMANCE AUDIT

Date: 13/08/2026
Scope: audit of the current optimized tree **before** this round — no app code modified.
Base commit state: matches `FINAL_PERFORMANCE_REPORT.md` + `NEXT_OPTIMIZATIONS.md` (rounds 1–2 complete).

---

## 0. What was verified in code (this audit)

| Item | File(s) | Status |
|---|---|---|
| No `count=exact` on public catalog/search | `src/services/product.service.ts` (`fetchPublicProducts`) | ✅ VERIFIED |
| `hasNextPage` via `limit = pageSize + 1` | same | ✅ VERIFIED |
| pageSize clamped `[1,100]`, page clamped `≥1` | same | ✅ VERIFIED |
| Search term sanitized (PostgREST injection-proof) | `sanitizeSearchTerm` | ✅ VERIFIED |
| 300 ms debounce + `setPage(1)` | `src/pages/shop/Produits.tsx` | ✅ VERIFIED |
| Client-side slug→id from React Query cache | `Produits.tsx` + `useProducts.tsx` | ✅ VERIFIED |
| Prefetch next page in `useEffect` + freshness guard | `useProducts.tsx` | ✅ VERIFIED |
| All subcategories in 1 query (N+1 gone) | `fetchAllSubcategories` / `useAllSubcategories` | ✅ VERIFIED |
| Narrow public selects | `product.service.ts` (PUBLIC / PUBLIC_DETAIL), `site-settings.service.ts`, `promo.service.ts` | ✅ VERIFIED |
| React Query cache config | `src/providers/query-client.ts` (stale 5 m / gc 10 m / focus-refetch off / retry 1) | ✅ VERIFIED |
| Card image 400px + 400/800 srcSet, lazy, fixed dims | `src/lib/images.ts`, `ProductCard.tsx` | ✅ VERIFIED |
| Detail image 800px + retina original, eager | `src/lib/images.ts`, `ProduitDetail.tsx` | ✅ VERIFIED (see ⚠ below) |
| Search query shape | `.or(search_vector.phfts.X, name.ilike.%X%, brand.ilike.%X%)` + GIN indexes | ✅ VERIFIED |
| Index coverage | `supabase/database.sql` | ✅ VERIFIED |
| No `service_role` anywhere in tests | `load-tests/*` (anon key only) | ✅ VERIFIED |
| RLS intact | `database.sql` policies | ✅ VERIFIED |

⚠ Detail image: `loading="eager"` + `decoding="async"` + explicit 800×800; the `fetchPriority="high"` mentioned in earlier reports is **not present** in the current `ProduitDetail.tsx`. Minor LCP attribute gap (browser default high priority for large eager hero images in practice) — re-enabled only if a real LCP regression is measured. Classification: LIKELY (not a proven problem).

---

## 1. Remaining issues — classification

### 1.1 Shared cache for public data (the only remaining architecture-level lever)

Public data that changes rarely: `categories`, `subcategories`, `site_settings` (public fields), `promos` (active), `featured/active products`.

Facts:
- React Query cache is **browser-local**. It is **NOT** a cache shared between users. Confirmed — no claim otherwise.
- Supabase PostgREST responses do **not** set `Cache-Control` headers. The Free plan does not expose response caching or a CDN cache layer in front of PostgREST.
- Netlify/Vercel (current hosts) can cache **static files they serve**, but **cannot** add cache headers to cross-origin `supabase.co` REST responses.
- The only user-shared cache achievable without a backend is a **static JSON snapshot** (built at deploy time, or written to the public Storage bucket by the admin browser session) served from Supabase Storage CDN / Netlify CDN.

| Resource | Cacheable now (safe)? | Why not / requirement |
|---|---|---|
| categories | NO (safe implementation impossible) | CDN/HTTP impossible without backend; snapshot would be stale until next deploy/admin write; nav correctness harm is low but invalidation is unsolvable safely |
| subcategories | NO | same |
| site_settings | NO | stale `whatsapp_number` / hero / CTAs = broken conversions (money-critical) |
| promos | NO | stale promo = displayed wrong prices (business-critical) |
| featured products | NO | stale merchandising = revenue loss |
| active products list | NO | stale prices/stock/availability = direct revenue loss |

Detailed analysis (per resource, per the task's 6 questions):

1. **Can it safely be cached?** Only as a static snapshot with **no safe invalidation channel** today.
2. **Cache key required:** entity + filterset (e.g. `categories:all`, `promos:active`, `products:featured`) — trivially satisfied by URL.
3. **Appropriate TTL:** would need `s-maxage=60…300`; but TTL cannot be enforced by the response (no headers) unless we serve snapshots as static files.
4. **Invalidation:** only via deploy rebuild (Netlify build) or admin-initiated Storage rewrite. Both leave an unbounded window where SQL-editor/admin-dashboard inconsistencies are invisible to visitors. Admin UI mutations happen client-side; they cannot safely trigger a server-side purge, and writing snapshot regeneration from every admin mutation adds failure modes (partially consistent sets across 4 entity types).
5. **Stale-data risk:** YES — prices, promos and featured flags are money-critical. Unbounded staleness is unacceptable without a purge signal we do not have.
6. **CDN/HTTP caching possible with current deployment?** NO for PostgREST responses. YES for static snapshots, but that reintroduces the staleness problem.

**Verdict: NOT SAFE to implement in this phase.** React Query browser cache remains the only client cache; the documented future implementation (Nginx `proxy_cache` + `Cache-Control: s-maxage` + purge-on-admin-write, or CDN-cached regenerated snapshots) is part of the next Docker phase — see `IMAGE_OPTIMIZATION_PLAN.md` and §5 below.

### 1.2 Search

Current (verified in code): debounce 300 ms; single paused React Query; term sanitized; `.or(search_vector.phfts.X, name.ilike.%X%, brand.ilike.%X%)`; `limit=17` no count; GIN `search_vector` + GIN trgm `name`/`brand`; filters/sort/pagination intact.

Existing benchmark (real Supabase, anon, read-only, `load-tests/search-ab-bench.mjs` → `results/search-ab-bench2.json`, 25 samples/term/variant after 5 warmups):

| Term | A (hybrid) p50/p95 | B (fts-only) p50/p95 | Errors (250 samples) |
|---|---|---|---|
| creme (common) | 83 / 88 ms | 86 / 101 ms | 0 |
| yves (brand) | 84 / 93 ms | 81 / 92 ms | 0 |
| ser (partial) | 83 / 94 ms | 81 / 91 ms | 0 |
| argan (rare) | 82 / 92 ms | 81 / 88 ms | 0 |
| bio (short) | 83 / 87 ms | 83 / 87 ms | 0 |

- Latency: **A ≈ B** (PROVEN for latency, 0 errors).
- Result quality: **NOT MEASURABLE** — catalog has 0 `is_active` products (rowCount 0 in every sample), so quality comparison on real data is impossible today (UNKNOWN).
- Reasoning for keeping A: B (`search_vector=fts`) cannot return substring/brand matches that A's `ilike` branches produce; with an empty/young catalog the fallback branches are the only working matcher. Swapping to B would **lose** results for no latency gain.
- **Verdict: KEEP hybrid (A). No code change.** Re-benchmark is scheduled whenever the catalog is populated (see §5).

### 1.3 Database

- Indexes already cover every public/admin query shape (`database.sql` audit block). GIN search + 2× trgm + slug + created_at + category/subcategory/active/promotion/featured + subcategory unique + product_images sort.
- Candidate composite `(category_id, is_active, created_at DESC) WHERE is_active` would only pay off at thousands of products; catalog is ~0–24 active rows → write overhead without measurable gain. Documented in `database.sql` already. **Verdict: no index change.**
- EXPLAIN ANALYZE: **UNKNOWN / not runnable** from this environment (anon key only; no DB credentials; PostgREST cannot EXPLAIN). Covered by index-coverage audit instead.

### 1.4 Request deduplication (final sweep)

Full-tree sweep (`supabase.from|rpc`, `useQuery`, `useInfiniteQuery`, `prefetchQuery`, `useEffect`, `fetch`):

- `supabase.from(`: only `order.service` (insert — WhatsApp order) and `product.service` admin `product_images` delete/insert. No `supabase.rpc`.
- `fetch(`: `useLocation.tsx` → Nominatim reverse-geocode (on-demand admin geolocation, not page render); `AdminProductForm.tsx` → image URL probe (admin). Both non-critical paths, no duplication.
- Public pages:
  - HOME: 5 queries (settings, categories, subcategories-all, promos, active products) — all React Query-deduped, stable keys.
  - CATALOG: categories + subcategories (already hot) + publicProducts (deduped, `keepPreviousData`, prefetch-next in `useEffect` with freshness guard).
  - SEARCH: same as catalog, debounced, paused when typing.
  - DETAIL: productBySlug + siteSettings (hot). No duplicate fetch.
- **Verdict: no genuine duplicates remain. PROVEN by code sweep.**

### 1.5 Capacity ceiling (prior evidence, this audit)

| Hypothesis | Status |
|---|---|
| Query weight (count=exact, select='*') | DISPROVEN as primary cause — lightweight queries still saturate at 1000 VU |
| PostgREST connection occupancy per page-view multiplies | LIKELY — isolated runs: multi-request endpoints collapse at high VU, single-request endpoints stay healthy |
| Free-plan tenant ceiling ~400–600 req/s | LIKELY — observed in multiple runs |
| Load generator saturation | NOT OBSERVED in prior runs (monitor CSVs written but not parsed) → LIKELY not the cause; will be monitored in this round |
| Supabase dashboard metrics (CPU/connections/rate limits) | UNKNOWN — no dashboard credentials/API in this environment |
| Exact 600–900 VU knee | UNKNOWN — never run (this round will test 600/700/800/900) |

---

## 2. What this round will do

1. **Shared cache:** verdict NOT SAFE now → documented (§1.1) + future implementation recorded in the Docker-readiness plan.
2. **Search:** KEEP hybrid A (evidence above); verification only (debounce/dedup/cancel/pagination already verified in code).
3. **DB:** no index change (evidence above, matches `database.sql`).
4. **Request dedup:** no change needed.
5. **Capacity testing (NEW evidence):** isolated HOME/CATALOG/SEARCH/DETAIL at 100/500/600/700/800/900/1000 VU + global mixed workload 500→1000(+beyond only if stable) against the **real** Supabase project, read-only, anon key, with load-generator monitoring.
6. **Regression:** build + tsc + lint + tests.
7. **Reports:** `ISOLATED_LOAD_TEST_REPORT.md`, updated `FINAL_PERFORMANCE_REPORT.md`, `IMAGE_OPTIMIZATION_PLAN.md`.

## 3. Classified issues (summary)

| # | Issue | Class | Action |
|---|---|---|---|
| 1 | No shared cache between users | PROVEN (architectural fact) | NOT SAFE now — document; next-phase plan |
| 2 | Search latency (hybrid vs fts-only) | PROVEN A≈B | Keep hybrid, no change |
| 3 | Search result quality on empty catalog | UNKNOWN | Re-benchmark when catalog populated |
| 4 | Missing composite index (category,active,created) | LIKELY irrelevant at current size | No change (documented in DB) |
| 5 | Missing `fetchPriority="high"` on detail LCP image | LIKELY (minor) | Re-add only if LCP regression measured |
| 6 | Exact 600–900 VU knee | UNKNOWN | Tested this round |
| 7 | Supabase dashboard saturation cause | UNKNOWN | Mark UNKNOWN; infer from k6 isolation + generator monitor |
| 8 | Load-generator saturation at ≥1000 VU | LIKELY not (prior) | Machine monitor every run this round |
| 9 | Duplicate requests | DISPROVEN | No change |
| 10 | Free-plan tenant ceiling ~400–600 req/s | LIKELY | Re-verified with new runs this round |
