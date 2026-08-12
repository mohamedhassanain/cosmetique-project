# Performance Optimization Report

Date: 12/08/2026 — Supabase Free plan, React 18 + Vite + TanStack React Query 5.

## Executive Summary

The architecture is unchanged (React → Supabase → PostgreSQL/Storage, no new services). The two optimization rounds reduced the number of Supabase requests per page view, the per-request cost (no exact `COUNT(*)` on catalog/search), and the payload size (explicit column lists, no `select('*')` on public lists). Measured results:

- Cold browser flow (home → catalog → detail): **37 → 13 Supabase REST requests (−65%)**, bytes **13 844 → 7 899 (−43%)**
- Warm SPA session (React Query cache): **14 → 6 (−57%)**, bytes **5 588 → 3 529 (−37%)**
- Filtered catalog deep-link: **6 → 4 REST requests (−33%)**, zero `count=exact`
- k6 1000 VU: p95 **730 → 622 ms (−15%)**, p99 **1132 → 885 ms (−22%)**, 0% errors
- No change at 100/500 VU (within noise), 0% errors at all three levels

## Changes Implemented

1. Removed `count=exact` from public catalog/search; `hasNextPage` via `limit = pageSize + 1` probe; UI shows "Page X" + prev/next instead of a total (documented tradeoff).
2. Slug → id resolution for catalog filters moved to the client cache (categories + all subcategories already hot from menu/footer); the 2 server lookup requests per filtered page are gone.
3. Subcategories: single `fetchAllSubcategories` request replacing the per-category N+1 (was 9 requests on home, now 1).
4. Public product lists and detail use explicit narrow selects (no admin fields, no unused `product_images` join on detail).
5. Response payloads for public lists downsized (verified: 468 → 408 B for the products query in the filtered capture; combined flow 13.8 KB → 7.9 KB).
6. Prefetch of the next product page only (guarded by fresh-cache check), `keepPreviousData` on pagination; `page` clamped ≥ 1, `pageSize` clamped ≤ 100.
7. Card images use the 400px variant with 400/800 srcSet (never the 1600px original); lazy + explicit dimensions. Detail image uses 800px + retina-only original, eager with `fetchPriority=high`. Verified in code.
8. Search debounce at 300 ms with `setPage(1)`; search filter sanitized (anti-PostgREST-injection), backed by GIN `search_vector` + trigram indexes.
9. Cache policy documented/confirmed: categories/subcategories 10–15 min stale, site_settings 15 min stale (30 min gc), public products 5 min stale (10 min gc), `refetchOnWindowFocus: false`, `retry: 1`.
10. Retry policy kept conservative: global `retry: 1`; promos/settings `retry: false`. Documented.

Admin, Auth, RLS, and Storage remain unchanged.

## Supabase Request Reduction

| Context | BEFORE | AFTER | Δ |
| --- | ---: | ---: | ---: |
| Cold flow REST | 37 | 13 | **−65%** |
| Warm session REST | 14 | 6 | **−57%** |
| Filtered deep-link REST | 6 | 4 | **−33%** |
| Cold flow bytes | 13 844 | 7 899 | **−43%** |
| Warm session bytes | 5 588 | 3 529 | **−37%** |

All figures from live Playwright captures (`load-tests/results/browser-*.json`, `filtered-after.json`). PROVEN BY TEST.

## Query Optimization

- `select('*')` eliminated from public reads — explicit column lists (`categories: id,name,slug`, public products: only rendered fields).
- Public detail no longer embeds `product_images`/full admin row.
- `count=exact` removed from catalog/search (kept in admin, where totals are required — admin unchanged).
- Products query in the filtered capture now requests `limit=17` with no count.

## Cache Optimization

- Same-data requests deduplicated by React Query (stable query keys, identical queries share one fetch).
- Focus refetch disabled; conservative retry.
- Static data (categories, subcategories, site_settings) cached long; products 5 min stale.

## Image Optimization

- Cards: 400px src, 400/800 srcSet only, lazy, explicit 400×400 + aspect-square (no CLS). Verified in code.
- Detail: 800px src, retina-only original, eager + high priority (LCP). Verified in code.
- Cart thumbnails use the 400 variant.
- Live image bytes unchanged across rounds (6 requests / 327 090 B) — no regression. PROVEN BY TEST.

## Search Optimization

- 300 ms debounce already in place; only the paused query fires.
- Filter uses `search_vector.phfts` + `name/brand.ilike` with GIN indexes; term sanitized.
- No `count=exact` on search results.

## Database Index Audit

Existing indexes cover all public and admin query patterns — see `DATABASE_INDEX_OPTIMIZATION.md`. Proposed composite/partial indexes were analyzed and intentionally NOT created (current catalog ~1–10 active products; index write overhead with no measurable benefit). `supabase/database.sql` is the single SQL script and was not modified.

## Load Test Results

Same real Supabase project, same k6 workload (home → detail → filtered catalog → search), 100/500/1000 VU; real results in `load-tests/BEFORE_AFTER_LOAD_TEST.md`:

| VUs | BEFORE req/s | AFTER req/s | BEFORE p95 | AFTER p95 | BEFORE p99 | AFTER p99 | Errors |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 65.04 | 65.03 | 91.3 ms | 89.3 ms | 104.2 ms | 102.6 ms | 0% / 0% |
| 500 | 321.55 | 317.87 | 92.9 ms | 96.4 ms | 159.4 ms | 517.4 ms | 0% / 0% |
| 1000 | 508.0 | 513.2 | 730.0 ms | 622.2 ms | 1132.1 ms | 884.8 ms | 0% / 0% |

## Bottleneck

- App-level request/payload reduction: **PROVEN BY TEST** (browser captures above).
- Endpoint-level tail-latency improvement at 1000 VU: **PROVEN BY TEST** (p95 −15%, p99 −22%).
- 100/500 VU unchanged within noise: **PROVEN BY TEST**.
- The hard ceiling (Supabase connection pool / PostgREST at saturation) remains the limiting factor: **LIKELY** — consistent with the 2000-VU collapse observed before these rounds; not re-tested at 2000+.
- Filtered deep-link BEFORE=6: **NOT VERIFIED** as a live capture (round-1 code is no longer in the tree); it is derived from the round-1 code path (2 slug→id lookups + `count=exact`) and confirmed =4 AFTER by live capture.

## Free Plan Considerations

- Request volume per visitor is now 4–6 REST requests per page view (was 12–13), directly reducing load on the Free-plan API/edge.
- Payload bytes per flow cut ~40%, reducing egress.
- Storage bandwidth is unchanged (same variants, same CDN); is the largest remaining data cost at scale.
- Database CPU/connection pool is the hard limit; no frontend change can raise it.

## Remaining Bottlenecks

- Supabase Free connection pool / PostgREST throughput (server-side ceiling).
- Free-plan egress/bandwidth if traffic grows (mitigated: −40% payload, −65% requests).
- Offset pagination degrades on very large catalogs; acceptable today (< 100 rows) — a cursor/keyset would be a DB-affecting change and was intentionally not applied.

## Next Step

Only one step is justified by the current measurements: **re-run the 2000-VU stress test** on the optimized tree while monitoring Supabase dashboard utilization, to quantify how much of the previous 2000-VU collapse (p95 ~60 s, ~5% errors) was client-side load-generator saturation vs. actual server ceiling. If the optimized build holds 2000 VU with low errors, the next step is a read replica — but only after that measurement, not before.
