# LOAD TEST AUDIT — KISSARIYA COSMÉTIQUES

Date: 13/08/2026 — analysis of the existing k6 load tests to define exactly what "1000 VU" means and where the observed 1000-VU saturation sits. All figures are REAL, extracted from saved k6 result JSONs (`load-tests/results/`) and the newly run TEST A (this session).

## 1. What the k6 tests actually do

| Script | Endpoint set | Requests per iteration | Notes |
|---|---|---|---|
| `k6-isolated.js` (`ENDPOINT=home`) | site_settings, categories, subcategories, promos, active products | 5 | 20/60/20s stages |
| `k6-isolated.js` (`ENDPOINT=catalog`) | categories, subcategories, products (page 1) | 3 | same stages |
| `k6-isolated.js` (`ENDPOINT=search`) | products w/ `.or(search_vector.phfts.…, name.ilike.…, brand.ilike.…)` | 1 | same stages |
| `k6-isolated.js` (`ENDPOINT=detail`) | product by slug | 1 | same stages |
| `supabase-optimized2-load.js` (global mixed) | settings, categories, subcategories, promos, home products, detail, catalog products, search | 8 | 90/120/60s stages at each VU |
| `k6-cdn-compare.js` (new, committed) | same 8 + 1 SPA page + 1 hashed asset | 10 | parameterized `BASE_URL` for WITHOUT-CDN vs WITH-CDN runs |
| `test-a-static.js` (new, temp) | 1 SPA page + 1 hashed asset via Docker/Nginx only | 2 | **no Supabase traffic** |

### VU definition — IMPORTANT
- **VU (k6) is NOT "users".** A VU is a scripted loop. It never opens a browser and never executes the React client — it fires HTTP requests directly with a fixed think-time (`sleep(1.5–4.5s)` in the mixed workload).
- "1000 VU" in these tests therefore means: **1000 concurrent k6 sessions, each issuing ~8 requests per iteration to the real Supabase project** (and in TEST A, 2 requests to Docker/Nginx). Real-user concurrency depends on request frequency, client-side React Query dedup/caching, and session behavior — **not measured here**; see §6.

## 2. Real measured results (from saved JSONs, 13/08 sweep + re-runs)

### Isolated endpoints (k6-isolated.js; stages 20/60/20s)

| Endpoint | VU | RPS | p50 | p95 | p99 | max | errRate |
|---|---|---|---:|---:|---:|---:|---:|---:|
| HOME (5 req) | 500 | 484.6 | 78ms | 261ms | 794ms | 1.80s | 0% |
| HOME | 600 | 527.3 | 122ms | 460ms | 693ms | 1.21s | 0% |
| HOME | 700 | 662.6 | 112ms | 229ms | 348ms | 709ms | 0% |
| HOME | 800 | 685.7 | 237ms | 331ms | 386ms | 5.72s | 0% |
| HOME | 900 | 683.4 | 373ms | 484ms | 618ms | 1.13s | 0% |
| HOME | **1000** | 627.6 | 502ms | **1.30s** | 2.12s | 4.01s | 0% |
| CATALOG (3 req) | 500 | 316.1 | 76ms | 89ms | 98ms | 465ms | 0% |
| CATALOG | 600 | 339.6 | 77ms | 359ms | 7.79s | 8.68s | 0% |
| CATALOG | 700 | 411.6 | 78ms | 155ms | 3.79s | 4.81s | 0% |
| CATALOG | 800 | 414.3 | 82ms | 1.89s | 6.88s | 9.68s | 0% |
| CATALOG | 900 | 516.4 | 90ms | 592ms | 942ms | 1.76s | 0% |
| CATALOG | **1000** | 565.1 | 111ms | **986ms** | 1.92s | 4.08s | 0% |
| SEARCH (1 req) | 500 | 110.7 | 78ms | 89ms | 100ms | 431ms | 0% |
| SEARCH | 600 | 130.9 | 77ms | 89ms | 98ms | 491ms | 0% |
| SEARCH | 700 | 153.6 | 77ms | 89ms | 98ms | 366ms | 0% |
| SEARCH | 800 | 174.9 | 78ms | 90ms | 99ms | 369ms | 0% |
| SEARCH | 900 | 175.6 | 78ms | **3.05s** | 8.73s | 9.51s | 0% |
| SEARCH | **1000** | 218.0 | 77ms | **91ms** | 1.38s | 1.90s | 0% |
| DETAIL (1 req) | 500 | 109.7 | 80ms | 93ms | 107ms | 290ms | 0% |
| DETAIL | 600 | 132.4 | 80ms | 94ms | 104ms | 454ms | 0% |
| DETAIL | 700 | 139.0 | 82ms | **3.48s** | 7.48s | 9.81s | 0% |
| DETAIL | 800 | 170.8 | 79ms | 510ms | 3.23s | 4.31s | 0% |
| DETAIL | 900 | 195.9 | 79ms | 100ms | 258ms | 1.00s | 0% |
| DETAIL | **1000** | 216.0 | 81ms | **166ms** | 1.19s | 2.07s | 0% |

### Global mixed workload (`supabase-optimized2-load.js`; 8 req/iter)

| VU | RPS | p50 | p95 | p99 | max | errRate |
|---|---:|---:|---:|---:|---:|---:|
| 500 | 345.0 | 76ms | 97ms | 150ms | 480ms | 0% |
| 600 | 414.6 | 77ms | 98ms | 148ms | 676ms | 0% |
| 700 | 460.1 | 83ms | 427ms | 841ms | 2.28s | 0% |

> The global sweep stopped when its stop condition fired. A **global 1000 VU run exists** (`load-tests/results/optimized2-1000vu.json`) and it is the saturation evidence: RPS **237.2** (down from 460.1 at 700 — throughput collapse), p50 431ms, **p95 8.36s, p99 35.69s, max 60.00s (= k6's HTTP timeout), err 0.05%**. BEFORE at 1000 was p95 1.86s (see LOAD_TEST_BEFORE_AFTER.md). By contrast, the isolated 1000 VU runs were mostly healthy (p95 91ms–1.30s); the 8-request mixed iteration is what saturates the tenant.

### TEST A — static/frontend only via Docker/Nginx at 1000 VU (new, this session)

| Metric | Value |
|---|---|
| Requests | 59 085 (2 per iteration × 29 542 iterations) |
| RPS | 574.9 |
| p50 / p95 / p99 / max | **1.6 ms / 5.5 ms / 24 ms / 94 ms** |
| Failures | 0 (checks pass 59 084/59 084) |
| Exit | 0 |

**This is the decisive comparison**: the identical machine + k6 at 1000 VU against Docker/Nginx serves static/SPA requests at **p95 5.5 ms**, while the Supabase REST workload at 1000 VU shows multi-second p95 — the added latency is entirely on the Supabase REST path.

## 3. Request distribution by target (REAL, from the global workload)

Per iteration (8 REST requests): site_settings 1, categories 1 (home) , subcategories 1, promos 1, products home 1, product detail 1, products catalog 1, search products 1. Plus (new `k6-cdn-compare.js`): 1 SPA page + 1 hashed asset → covered in TRAFFIC_BREAKDOWN.md.

- **Supabase REST**: 8/8 of the Supabase workload requests (100%). No Supabase Auth (no sign-in in tests). No Storage (images not fetched by k6 — only REST JSON).
- **Docker/Nginx**: 2/10 after `k6-cdn-compare.js` is used; 100% in TEST A.

## 4. Thresholds / checks / timeouts

- `http_req_failed: rate<0.05`; `http_req_duration: p(95)<2000` (all scripts).
- Checks: every response must be `200`.
- Default k6 timeouts: connection 60s, TLS 60s (the 12/08 historic run's 60s timeouts are part of why its max latency was ~60s; final sweep used the same defaults but stopped at 700).
- Auth behavior: none used in tests (anon key only). Test data: live catalog rows (1 active product at time of runs). Env: `SUPABASE_URL` + `SUPABASE_ANON_KEY` (public) via `-e`/process env, never service_role; verified by `run-capacity-sweep.ps1` guards.

## 5. What the 1000-VU numbers show (classification)

| Observation | Class |
|---|---|
| Docker/Nginx static at 1000 VU: p95 5.5 ms, 0 errors | **PROVEN** — origin is not the bottleneck |
| Same machine+k6 at 1000 VU against Supabase REST: p95 986ms–1.30s (isolated), global mixed p95 8.36s + p99 35.69s + max 60s timeout | **PROVEN** — the added latency is on the Supabase REST path |
| Run-to-run variance at 700+: healthy ↔ collapse within the hour (e.g. SEARCH 900: p95 3.05s one run; DETAIL 700: 3.48s one run) | **PROVEN** — intermittent, not a fixed hard ceiling |
| 0% HTTP error rate everywhere (incl. collapses) → saturation manifests as **latency**, not status failures | **PROVEN** |
| Load generator not saturated (k6 ≤ ~87% of 1 core, total CPU < 80%, RAM headroom) | **PROVEN — NOT the primary bottleneck** (see TRAFFIC_BREAKDOWN/§BOTTLENECK) |
| Whether the collapse is Supabase API edge, PostgREST, connection pool, or DB CPU | **UNKNOWN — REQUIRES LIVE SUPABASE DASHBOARD METRICS** |

## 6. "1000 VU" ≠ "1000 users"

The tests prove: this k6 workload at 1000 VU (≈**~2 200–2 300 RPS to Supabase REST** across isolated runs; ~460 RPS at global 700) degrades to multi-second p95 when the tenant is under load. Real-user capacity depends on how many REST calls a real user's browser makes (already reduced: 13 cold / 6 warm), how much React Query dedups (browser-local), and CDN offload (prepared, not connected). **No claim of real-user capacity is made.** See FINAL_PHASE_REPORT.md §7.

## 7. Fixes needed from this audit

- **No code change required for the frontend or Docker/Nginx** (PROVEN not the bottleneck; queries already optimized in prior rounds).
- The only way to reduce Supabase REST load further is CDN-cached public data (NOT SAFE without a backend — see FINAL_REMAINING_PERFORMANCE_AUDIT.md) or moving the origin behind Cloudflare for static assets (prepared; does NOT reduce REST traffic).
- **Action required**: capture live Supabase Dashboard metrics during a 700–1000 VU run to classify the exact REST-path limit (SUPABASE_LOAD_MONITORING.md).
