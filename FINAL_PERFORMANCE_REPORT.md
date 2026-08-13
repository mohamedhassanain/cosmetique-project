# Final Performance Report — Kissariya Cosmétiques

Date: 13/08/2026 — React 18 + Vite 5 + TanStack React Query 5 → Supabase (Auth + PostgreSQL/PostgREST + Storage). Architecture unchanged; no new services added.

---

# 1. Current Architecture

```
Users → Netlify/Vercel (SPA, code-split)
        → React 18 + React Query 5 (browser cache, stable keys, dedup)
        → Supabase (anon key only, RLS intact)
              ├── Auth (admin-only accounts)
              ├── PostgreSQL (public + admin tables)
              ├── PostgREST (REST reads)
              └── Storage (public bucket cosmetics-images, 400/800 variant URLs)
```

Data access is centralized in `src/services/*.service.ts`; React Query hooks in `src/hooks/`; query keys centralized (`src/constants/query-keys.ts`).

# 2. Optimizations Already Completed (prior rounds, preserved)

- `count=exact` removed from public catalog/search; `hasNextPage` via `limit = pageSize + 1`.
- page/pageSize clamped; search term sanitized (PostgREST injection-proof).
- Client-side slug→id from React Query cache (2 server lookups eliminated on filtered pages).
- All subcategories in 1 request (N+1 gone).
- Public selects narrowed (explicit column lists, no admin fields).
- Prefetch next page in `useEffect` with freshness guard; `keepPreviousData`.
- React Query caching (browser-local) + dedup; focus-refetch off; retry 1.
- Images: 400px card src + 400/800 srcSet (never 1600 on cards); 800px detail + retina original; lazy/async/dims; cart thumbnails 400px.
- RLS/Auth/Storage preserved; security reviewed.

Measured app-level gains (prior, preserved):
- Cold flow: **37 → 13 REST requests (−65%)**; bytes **13 844 → 7 899 (−43%)**
- Warm session: **14 → 6 REST (−57%)**
- Filtered deep-link: **6 → 4 REST, 0 COUNT(*)**

# 3. Remaining Optimizations (this round)

| # | Item | Decision |
|---|---|---|
| 1 | Shared cache for public data | **NOT SAFE now** — see §4 |
| 2 | Search hybrid vs search_vector-only | KEPT hybrid — see §5 |
| 3 | Database indexes | No change — see §6 |
| 4 | Request deduplication | None found — see §7 |
| 5 | Capacity measurement | FULL k6 sweep, monitored — see §8–15 |

# 4. Shared Cache

**NOT SAFE to implement in this phase.**

Analysis (`FINAL_REMAINING_PERFORMANCE_AUDIT.md` §1.1):
- React Query cache is **browser-local**; it is NOT a shared cache between users (confirmed, no claim otherwise).
- PostgREST responses do not carry `Cache-Control`; neither Netlify nor Vercel can add cache headers to cross-origin `supabase.co` responses. No CDN/shared cache in front of the API today.
- The only user-shared cache possible without a backend would be static JSON snapshots served from Storage/CDN — but there is **no safe invalidation channel**:
  - admin mutations happen client-side and cannot trigger a server-side purge;
  - deploy-time rebuild is the only purge, leaving unbounded stale windows;
  - categories/subcategories/site_settings/promos/featured/products are **money-critical** (prices, promos, availability) — unbounded staleness is unacceptable.
- Verdict per resource: all six public resources **NOT safely cacheable** under current architecture.

**Recommended future implementation** (Docker phase): Nginx `proxy_cache` in front of public PostgREST routes + explicit `Cache-Control: s-maxage` + purge-on-admin-write (admin mutation triggers cache purge via the Nginx key), or CDN-cached regenerated snapshots. Documented in `IMAGE_OPTIMIZATION_PLAN.md` and §20.

# 5. Search Optimization

**KEPT hybrid** (`search_vector.phfts` + `name.ilike` + `brand.ilike`). No code change.

Real benchmark (anon key, real Supabase, 25 samples/term after 5 warmups, `search-ab-bench.mjs` → `search-ab-bench2.json`):

| Term | A (hybrid) p50/p95/p99 | B (fts-only) p50/p95/p99 | Errors |
|---|---|---|---|
| creme | 83/88/91 ms | 86/101/159 ms | 0 |
| yves (brand) | 84/93/94 ms | 81/92/94 ms | 0 |
| ser (partial) | 83/94/101 ms | 81/91/93 ms | 0 |
| argan (rare) | 82/92/97 ms | 81/88/95 ms | 0 |
| bio (short) | 83/87/90 ms | 83/87/133 ms | 0 |

- Latency: **A ≈ B** (both sub-100 ms p95, 0 errors).
- Result quality: **not measurable** — catalog has 0 active products; B provably cannot produce substring/brand matches that A's `ilike` branches do. Swapping to B would lose results for zero latency gain.
- Verified in code: 300 ms debounce, `setPage(1)` on debounce, single paused query, sanitized term, `limit=17`, filters/sort/pagination intact, no per-keystroke request, no `useEffect` race.

**Search p95 (hybrid, at load):** unchanged since no code change — isolated SEARCH p95 ~89 ms through 800 VU, ~177–218 req/s at 900–1000 VU; see §8.

# 6. Database Optimization

No index changes (matches `supabase/database.sql` audit block).

- Existing indexes cover every public/admin query: GIN `search_vector`, GIN trgm `name`+`brand`, slugs UNIQUE, `created_at`/category/subcategory/active/promotion/featured, subcategory (category_id,slug) UNIQUE, product_images (product_id,sort_order), orders + contact messages.
- Candidate composite `(category_id, is_active, created_at DESC) WHERE is_active` mathematically cannot pay off at the current catalog size (~0–24 active rows) and adds write overhead — documented, not executed.
- EXPLAIN ANALYZE: **UNKNOWN** — anon key only (no DB credentials); covered by index audit instead.

# 7. Request Deduplication

Final full-tree sweep (`supabase.from|rpc`, `useQuery`, `useInfiniteQuery`, `prefetchQuery`, `useEffect`, `fetch`): no genuine duplicates remain.

- `supabase.from(` only in `order.service` (WhatsApp insert) + `product.service` admin `product_images` (delete/insert).
- `fetch(` only in `useLocation` (admin geolocation, on demand) + `AdminProductForm` (image probe, admin).
- HOME: 5 queries deduped by stable keys. CATALOG/SEARCH: categories+subcategories already hot; products deduped + prefetch-next with freshness guard. DETAIL: slug + settings (hot).
- **Verdict: no new request reduction available without changing architecture.** PROVEN by sweep.

# 8. Isolated K6 Results (13/08/2026 — real Supabase, anon, read-only, machine-monitored)

Scripts: `k6-isolated.js` per endpoint. Stages: 20/60/20s. Full table in `ISOLATED_LOAD_TEST_REPORT.md`.

| Endpoint | req/iter | 100 VU p95 | 500 p95 | 600 p95 | 700 p95 | 800 p95 | 900 p95 | 1000 p95 | 1000 RPS | 1000 max | Errors | Saturation window |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| HOME | 5 | 89 ms | 261 ms | 460 ms | 229 ms | 331 ms | 484 ms | **13 517 ms (exit 99)** | 177 | 42 309 ms | 0% | 1000 |
| CATALOG | 3 | 88 ms | 89 ms | 359 ms | 155 ms | 1 886 ms | 592 ms | 986 ms | 565 | 4 085 ms | 0% | none sustained |
| SEARCH | 1 | 91 ms | 89 ms | 89 ms | 89 ms | 90 ms | **3 050 ms (exit 99)** | 91 ms | 218 | 1 896 ms | 0% | one run @900 |
| DETAIL | 1 | 92 ms | 93 ms | 94 ms | **3 483 ms (exit 99)** | 510 ms | 100 ms | 166 ms | 216 | 2 068 ms | 0% | one run @700 |

Run-to-run variance is high: identical workloads oscillate between ~90 ms and multi-second tails. The only **sustained** collapse in the sweep was HOME @1000 VU (RPS 685→177, p95→13.5 s). Single-request endpoints mostly hold ~90–166 ms even at 1000 VU.

# 9. Global K6 Results (13/08/2026 — same project, `supabase-optimized2-load.js`, 8 req/iter)

| VU | RPS | p50 | p90 | p95 | p99 | max | Errors | Status |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 500 | 345 | 76 ms | 88 ms | 97 ms | 150 ms | 480 ms | 0% | HEALTHY |
| 600 | 415 | 77 ms | 91 ms | 98 ms | 148 ms | 676 ms | 0% | HEALTHY |
| 700 | 191 | 787 ms | 5 588 ms | 8 603 ms | 16 395 ms | 23 685 ms | 0% | SATURATION WINDOW (exit 99) |
| 800–1000 (this round) | — | — | — | — | — | — | — | NOT RUN (stop condition at 700) |

> Note: earlier `optimized2-1000vu.json` is a 12/08 run with 60-second timeouts — NOT part of today's sweep; today stopped at 700 VU per protocol.

**Monitored re-run of the two saturation levels (13/08, same day):**

| Level | Result | Load-gen peak total CPU | Peak k6 CPU | Peak k6 RSS | Peak RAM used |
|---|---|---|---|---|---|
| iso HOME @1000 VU | **EXIT 0 (healthy)** | 57.5% | 87.3% (1 core) | ~528 MB | 78.6% |
| global @700 VU | **EXIT 0 (healthy)** | 49.1% | 79.2% (1 core) | ~398 MB | 74.0% |

Machine CSVs: `load-tests/results/machine-home-1000.csv`, `machine-global-700.csv`. Load generator was **never saturated** (total CPU peaked < 60%; k6 uses ~1 core).

Conclusion: the earlier collapses at exactly these levels did not reproduce within the hour — evidence of **intermittent shared-tenant saturation**, not a hard capacity boundary and not the load generator.

# 10. Maximum Stable VU

**GLOBAL MIXED WORKLOAD:** 600 VU stable today (p95 98 ms, 0% errors). 700 VU collapsed once (p95 8.6 s) then ran healthy in the monitored re-run — so 700 is a **warning zone**, not a hard ceiling.
**ISOLATED endpoints:** SEARCH/DETAIL/CATALOG held ~90–166 ms p95 at 1000 VU (with isolated noise runs); HOME is the first endpoint to collapse (1000 VU: p95 13.5 s in the sweep, healthy in the re-run).

This is the maximum stable VU **for this specific k6 workload and this one machine**. It is NOT "number of users supported" — VU ≠ registered/daily/monthly/concurrent real users.

# 11. First Saturation Point

Global: **700 VU** (one run p95 8.6 s, threshold breached). Isolated HOME: **1000 VU** (sustained collapse in the sweep). Both reproduced the pattern seen yesterday (1000 VU global, 8–9 s p95) — i.e. the tenant sags intermittently in the 700–1000 VU range.

# 12. Safe Zone

- **≤ 600 VU** for the global mixed workload today (p95 < 100 ms, 0% errors, sustained). PROVEN by today's runs.
- Isolated single-request endpoints (SEARCH/DETAIL): effectively no degradation through 1000 VU in most runs.

# 13. Warning Zone

- **700–1000 VU** global: intermittent multi-second p95 spikes (8.6 s@700, 13.5 s@1000 HOME) interspersed with healthy runs. Treat 700+ as unpredictable on the Free plan.

# 14. Saturation Zone

- Global **1000 VU**: historic collapse pattern (yesterday: 8.4 s p95, 60 s timeouts). Today's sweep stopped at 700 before reaching 1000 global; HOME@1000 isolated collapsed once.
- The zone boundary is **blurry and time-dependent** — the same level flips between healthy and collapsed run-to-run.

# 15. Real Bottleneck

**Supabase Free-plan tenant capacity (PostgREST connection occupancy / compute / API edge) — LIKELY.** Evidence:
- Lightweight queries saturated at the same levels as heavier ones (round-1/2 comparisons, yesterday's runs).
- Multi-request per-iteration endpoints degrade first; single-request endpoints mostly hold — consistent with per-request connection occupancy multiplying.
- The exact same run flipped healthy↔collapsed within the hour with the load generator at <60% CPU — pointing at tenant-side intermittent saturation.
- Load generator: NOT the bottleneck — PROVEN by monitored re-runs (peaks 57.5% / 49.1% total CPU; k6 ~1 core).

# 16. Supabase Bottleneck

**YES** (as the limiting factor under load) — qualified:
- The bottleneck is **the Supabase Free-plan shared tenant** (API/edge/connection pool/compute). PROVEN that it is not the frontend and not the load generator; NOT PROVEN which exact internal resource (CPU/connections/rate limit) — dashboard metrics unavailable in this environment (marked UNKNOWN in the raw-data sense).
- Pattern is consistent across all rounds: req/s ceiling ~400–600 sustained; above that, latency collapses intermittently.

# 17. Before vs After

| Metric | Before (rounds 1–2 baseline) | After (13/08 sweep) |
|---|---|---|
| Cold flow REST requests | 37 | 13 (−65%, preserved) |
| Warm session REST | 14 | 6 (−57%, preserved) |
| Payload cold flow | 13.8 KB | 7.9 KB (−43%, preserved) |
| Global 500 VU p95 | 97 ms (yesterday) | **97 ms** |
| Global 600 VU p95 | — | **98 ms** (new level tested) |
| Global 700 VU p95 | — (not run) | 8.6 s (collapse window) / healthy re-run |
| Global 1000 VU p95 | 2.2–8.4 s | stop-at-700 protocol; HOME isolated 13.5 s/probe (intermittent) |

No code changes this round → app-level request/payload figures unchanged. The measured change is the **evidence** about capacity shape (600 safe, 700+ warning).

# 18. Remaining Risks

1. **Free-plan tenant intermittency** — 700–1000 VU is unpredictable (healthy↔collapsed run-to-run). Highest risk; no frontend fix.
2. **Shared cache not implementable** without a cache layer — the only remaining lever is the Docker/Nginx/CDN phase.
3. **Search result quality unmeasurable** until the catalog is populated (0 active products).
4. **Image bandwidth** grows with catalog size + traffic; mitigated in next phase (AVIF/WebP/immutable).
5. **Load-generator single machine** — k6 is single-process; at ≥1000 VU the test can be constrained by the generator's 1-core k6 usage. Use 2+ distributed loaders at higher VUs.
6. **60 s k6 timeouts** in the historic 1000-VU run — request timeouts on the API path are real symptoms of tenant saturation.

# 19. Image Optimization Plan

`IMAGE_OPTIMIZATION_PLAN.md` — audit complete:
- Current: 400px cards + 400/800 srcSet (never 1600), 800px detail + retina original, lazy/eager appropriately, Stable Storage URLs. Measured 6 image requests / 327 KB cold flow.
- Next phase: AVIF/WebP conversion, server-side variant generation or upload-time variant generation, `Cache-Control: immutable` for UUID-keyed images, LCP preload + `fetchPriority=high`, estimated further **60–90% byte reduction** on images (to be measured in the Docker phase).

# 20. Docker Readiness

**YES** (architecture-level readiness confirmed; deployment intentionally NOT implemented in this task).

- Next-phase plan is concrete and documented: Nginx container serving the SPA + reverse-proxying public PostgREST reads with `proxy_cache` + `s-maxage` + purge-on-admin-write; CDN in front; image transformation + immutable caching. This is also the vehicle to make a **shared cache safe** (§4).
- Prerequisites now in place: measured capacity baseline, known safe/warning/saturation zones, image strategy, dedup/request/payload evidence, working k6 instrumentation (`run-capacity-sweep.ps1`, `monitor-k6.ps1`, `build-k6-report.mjs`).

---

## Annex — Files

- `FINAL_REMAINING_PERFORMANCE_AUDIT.md` — Phase 1 audit, PROVEN/LIKELY/UNKNOWN classification
- `ISOLATED_LOAD_TEST_REPORT.md` — full per-endpoint tables + machine monitor (generated from real exports)
- `IMAGE_OPTIMIZATION_PLAN.md` — Phase 12 image/CDN/Docker plan
- `load-tests/run-capacity-sweep.ps1`, `load-tests/monitor-k6.ps1`, `load-tests/build-k6-report.mjs` — reproducible sweep tooling
- Raw data: `load-tests/results/k6-*.json`, `optimized2-*.json`, `machine-*.csv`, `sweep-progress.log`
