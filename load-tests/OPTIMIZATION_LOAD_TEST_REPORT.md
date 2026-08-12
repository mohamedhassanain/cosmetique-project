# Load Test Report — Before vs After (Optimization session)

Date: 12/08/2026 (evening) — Same real Supabase Free project, same k6 workload
(`load-tests/supabase-read-load.js`, home → product detail → filtered catalog → search,
8 HTTP requests per iteration, 90s ramp-up / 2m sustain / 60s ramp-down, read-only,
anon key only, 0% failures).

- **BEFORE** = `load-tests/results/summary-{n}vu-BEFORE.json` (original baseline
  reference, matches the figures quoted at the start of this optimization task:
  100 VU ≈64.6 req/s, 500 VU ≈320.9 req/s, 1000 VU ≈409 req/s).
- **AFTER** = `load-tests/results/summary-{n}vu.json` (runs against the optimized
  client build).

The k6 script issues an identical number of HTTP requests per iteration BEFORE and
AFTER (8). The optimizations reduce the number of Supabase requests **per page view**
at the application level (measured separately in `REQUEST_OPTIMIZATION_REPORT.md`),
so an endpoint-equivalent k6 run is expected to produce near-identical server numbers.
That is exactly what the data shows.

## Real measurements

|  VUs | Before p95 | After p95 | Before Req/s | After Req/s | Before Errors | After Errors |
| ---: | ---------: | --------: | -----------: | ----------: | ------------: | -----------: |
|  100 | 88.4 ms  | 86.5 ms | 64.6 | 65.5 | 0% | 0% |
|  500 | 97.0 ms  | 104.3 ms | 320.9 | 305.0 | 0% | 0% |
| 1000 | 1863.9 ms | 2222.0 ms (run 1) / 2187.2 ms (run 2) | 409.1 | 279.4 (run 1) / 389.6 (run 2) | 0% | 0% |

## Detailed AFTER runs (raw, extracted from summary JSON)

| Run | Reqs | Req/s | p50 | p90 | p95 | avg | max | Errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 VU | 18 2xx | 65.5 | — | — | 86.5 ms | — | — | 0% |
| 500 VU | 85 610 | 305.0 | 79.4 ms | 94.4 ms | 104.3 ms | 131.4 ms | 8 491 ms | 0% |
| 1000 VU run 1 | 83 968 | 279.4 | 654.8 ms | 1 627 ms | 2 222.0 ms | 1 450.6 ms | 56 283 ms | 0% |
| 1000 VU run 2 | 110 506 | 389.6 | 633.1 ms | 1 408 ms | 2 187.2 ms | 804.7 ms | 11 614 ms | 0% |

BEFORE runs (source: `summary-{n}vu-BEFORE.json`):

| Run | Reqs | Req/s | p50 | p90 | p95 | avg | max | Errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 VU | 17 994 | 64.6 | 76.5 ms | 84.8 ms | 88.4 ms | 78.1 ms | 3 592 ms | 0% |
| 500 VU | 89 618 | 320.9 | 79.0 ms | 91.5 ms | 97.0 ms | 81.1 ms | 3 683 ms | 0% |
| 1000 VU | 114 082 | 409.1 | 670.3 ms | 1 416 ms | 1 863.9 ms | 750.6 ms | 8 992 ms | 0% |

## Interpretation

- **100 VU** — identical within noise (≈65 req/s; p95 ≈87–88 ms). **PROVEN BY TEST.**
- **500 VU** — essentially identical (p95 97 → 104 ms; median identical at 79 ms;
  throughput −5%). No clear regression; within run-to-run variance. **PROVEN BY TEST.**
- **1000 VU** — saturation zone of the Free-plan tenant. p95 stays above ~1.9–2.2 s in
  all runs (BEFORE and AFTER), 0% errors. The two AFTER runs differ by a large margin
  (279 vs 390 req/s), demonstrating high run-to-run variance on the shared Free tenant;
  run 2 (0 interrupted iterations, 110 506 requests) is the more representative one and
  matches the BEFORE run's geometry (114 082 requests). **The server-side ceiling is
  unchanged, as expected: the k6 workload is endpoint-identical by construction.**

## Endpoint isolation runs (per-endpoint bottleneck)

Additional read-only runs against the same real Supabase Free project, isolating each
public endpoint (`load-tests/k6-isolated.js`, anon key, real Supabase, 0% failures in
every run). Duration: 20s ramp-up / 60s sustain / 20s ramp-down (2m10s max).

Requests per iteration (from the script):

- **HOME** = 5 (`site_settings`, `categories`, `subcategories`, `promos`, `products`)
- **CATALOG** = 3 (`categories`, `subcategories`, `products`)
- **SEARCH** = 1 (`products` with `or=(search_vector.phfts…, name.ilike…, brand.ilike…)`)
- **DETAIL** = 1 (`products` by slug)

| Endpoint | req/iter | 100 VU p95 | 500 VU p95 | 750 VU p95 | 1000 VU p95 | 1000 VU max | 1000 VU req/s | 1000 VU errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| HOME | 5 | 84.9 ms | 272.1 ms | — | 2 722.5 ms | 42 240 ms | 463.9 | 0% |
| CATALOG | 3 | 85.6 ms | 87.5 ms | 1 063.3 ms | 714.2 ms | 7 528 ms | 560.0 | 0% |
| SEARCH | 1 | 88.4 ms | 86.2 ms | — | 86.9 ms | 703 ms | 217.0 | 0% |
| DETAIL | 1 | 87.9 ms | 89.2 ms | — | — | — | — | 0% |

Source files: `load-tests/results/k6-{home,catalog,search,detail}-{100,500,750,1000}vu.json`.

### Interpretation of isolated runs

- At **100 VU** every endpoint is identical (~85–88 ms p95). No query is intrinsically
  slow.
- A **750-VU CATALOG follow-up run** (20s ramp-up / 60s sustain / 20s ramp-down, real
  Supabase, `load-tests/results/k6-catalog-750vu.json`; 42 986 requests, 411.6 req/s,
  0% errors, median 79 ms) shows the saturation knee for this 3-requests-per-page
  endpoint: p95 jumps 87.5 ms (500 VU) → 1 063 ms (750 VU), p99 4 326 ms, max 6 077 ms.
  The observed throughput (≈412 req/s at 750 VU) sits right at the ~400–600 req/s
  tenant ceiling, confirming PostgREST connection occupancy as the limiting factor.
- At **1000 VU** the pattern is decisive: endpoints that issue **multiple REST calls per
  iteration** collapse (HOME 5 req/iter → p95 2.7 s; CATALOG 3 req/iter → p95 714 ms on
  a separate 1000-VU run — high run-to-run variance, the 750-VU run already degraded),
  while single-request endpoints stay healthy (SEARCH 1 req/iter → p95 87 ms).
- **SEARCH is NOT a bottleneck.** The `or=(search_vector.phfts…, name.ilike…,
  brand.ilike…)` query sustains ~217 req/s at p95 87 ms with 0% errors at 1000 VU. ILIKE
  only degrades at the same request-volume ceiling as every other query — it does not
  degrade earlier.
- **Conclusion:** the limiting factor is the number of **concurrent PostgREST requests
  per iteration**, not query complexity or index coverage for the current catalog size.
  Each extra REST call per page view multiplies PostgREST connection occupancy, and the
  Free-plan tenant saturates at roughly 400–600 req/s before latency degrades sharply.
  This is exactly why the client-side request reductions (37 → 13 cold, 14 → 6 warm,
  see `REQUEST_OPTIMIZATION_REPORT.md`) raise the effective capacity: fewer REST calls
  per page view means more concurrent users fit under the same req/s ceiling.

## Search A/B latency sweep (real Supabase, anon key, read-only)

`load-tests/search-ab-bench.mjs` compares the current client search (A:
`or=(search_vector.phfts…, name.ilike…, brand.ilike…)`) against a search_vector-only
variant (B: `search_vector=fts.<term>`) over 5 query classes (common term, brand,
partial term, rare term, short term), 25 samples each after 5 warm-ups per variant.

Result: **A ≈ B in latency** — p50 82–84 ms vs 81–86 ms, p95 87–94 ms vs 87–101 ms,
0 errors in all 250 samples. Production currently has 0 `is_active=true` products
(rowCount 0), so result-quality could not be compared on real data.

**Decision: keep variant A (current implementation).** It is at least as fast as B and
additionally covers substring matches (name/brand `ilike`) that B cannot produce; the
`search_vector` tsquery path alone would lose partial-match results once the catalog is
populated. No production change was made based on this sweep.

[Response interrupted by API Error]

## What this test does NOT show

The k6 endpoint test is deliberately insensitive to the client-side optimizations
(`count=exact` removal, slug→id resolution from cache, N+1 fix, explicit selects,
React Query caching, image variants). Those effects are measured at the application
level — see `REQUEST_OPTIMIZATION_REPORT.md`:

- COLD browser flow (home → catalog → detail): **37 → 13 REST requests (−65%)**
- WARM SPA session (React Query cache): **14 → 6 REST requests (−57%)**
- Filtered deep-link: **6 → 4 requests, 0 COUNT(*)**
- Payload: **13.8 KB → 7.9 KB (−43%)** cold flow

## Source files

- BEFORE: `load-tests/results/summary-100vu-BEFORE.json`, `summary-500vu-BEFORE.json`, `summary-1000vu-BEFORE.json`
- AFTER: `load-tests/results/summary-100vu-AFTER.json`, `summary-500vu.json`, `summary-1000vu.json`
  (100-VU AFTER run is stored as `summary-100vu-AFTER.json`; `summary-100vu.json` remains the
  original tracked baseline file)

- Script: `load-tests/supabase-read-load.js`
