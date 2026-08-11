# Supabase Load Test Report — Kissariya Cosmétiques

Date: **11 August 2026**
Target: **https://ygkeuhatokvkdwwoccty.supabase.co** (the real Supabase project used by the app)
Status: **Completed up to 2,000 VUs. The 2,000 VU stage failed (server saturation). The 5,000 VU stage was deliberately NOT run** (see "Maximum Stable Load").

---

## 1. Environment

| Item | Value |
|------|-------|
| k6 version | k6.exe v2.1.0 (go1.26.4, windows/amd64) |
| Load generator | Local Windows 11 PC (`C:\Users\mohamed hassanain\Desktop\kissariya-main`) |
| CPU / RAM of load generator | Not collected (k6 = single-threaded per-VU, async I/O; no local resource saturation was observed) |
| Supabase project URL | `https://ygkeuhatokvkdwwoccty.supabase.co` (public URL, safe to publish) |
| Auth for the test | Public **anon** (publishable) key only — the same key shipped to the browser. **No `service_role` key, no secrets.** |
| Chain tested | `k6 → Supabase API (PostgREST) → PostgreSQL` |

Stage profile per run: ramp-up **90 s** → sustained **2 min** → ramp-down **60 s** (each level run separately).

## 2. Workload — real read operations only

Every request was a **GET** (`SELECT`) against the real PostgREST API, mirroring the exact queries in `src/services/*.service.ts`. **No INSERT / UPDATE / DELETE, no signups, no orders, no admin operations.**

| # | Operation | Table(s) | App source |
|---|-----------|----------|------------|
| 1 | Homepage: site settings (`limit=1`) | `site_settings` | `site-settings.service.ts` |
| 2 | Homepage: categories (`order=sort_order.asc`) | `categories` | `category.service.ts` |
| 3 | Homepage: active products, `limit=60`, embeds `categories`, `subcategories` | `products` | `product.service.ts` |
| 4 | Homepage: active promos | `promos` | `promo.service.ts` |
| 5 | Product detail by slug — full select with embeds `categories`, `subcategories`, `product_images` | `products` | `product.service.ts` |
| 6 | Catalog: subcategories of a category | `subcategories` | `category.service.ts` |
| 7 | Catalog: products filtered by category, `offset/limit=16`, `count=exact` | `products` | `product.service.ts` |
| 8 | Search: `search_vector.phfts` + `name.ilike` + `brand.ilike` | `products` | `product.service.ts` |

Each virtual user walked through these in browsing order (home → product detail → catalog → search) with realistic pauses of **1.5–5 s** (`sleep()`), i.e. ~8 requests per iteration. RLS remained active and was never touched; anonymous reads were limited to rows allowed by RLS (`is_active = true` filters, etc.).

## 3. Results (real measurements)

Smoke test (1 VU, ~46 s): 42 requests, **0 errors**, p95 = 199 ms — connectivity confirmed before the staged series.

| Level | VUs | Total requests | Requests/s | Avg latency | p50 | p90 | p95 | p99* | Error rate | Failed reqs | Checks (% pass) | Interrupted iterations |
|-------|-----|----------------|------------|-------------|-----|-----|-----|------|------------|-------------|-----------------|------------------------|
| 1 | 100 | 17,994 | **64.6** | 78 ms | 77 ms | 85 ms | **88 ms** | n/a¹ | **0 %** | 0 | 100 % (17,992/17,992) | 0 |
| 2 | 500 | 89,618 | **320.9** | 81 ms | 79 ms | 91 ms | **97 ms** | n/a¹ | **0 %** | 0 | 100 % (89,616/89,616) | 0 |
| 3 | 1,000 | 114,082 | **409.1** | 751 ms | 670 ms | 1,416 ms | **1,864 ms** | n/a¹ | **0 %** | 0 | 100 % (114,080/114,080) | 0 |
| 4 | 2,000 | 31,273 | **103.9** | 11,774 ms | 924 ms² | 41,899 ms | **60,000 ms** (timeout ceiling) | n/a¹ | **5.1 %** | **1,594** | 94.9 % (29,677/31,271) | **1,783** |
| 5 | 5,000 | — | — | — | — | — | — | — | — | — | — | **NOT RUN** (protocol: stop when the system is failing) |

¹ The k6 export (`summary-*.json`) was configured with `summaryTrendStats = [avg, min, med, max, p(90), p(95)]`, so **p99 was not recorded** in the JSON exports. p90/p95 are the recorded percentiles in all rows.
² Median stayed low because the burst of timeouts was concentrated after shutdown began (see below); the distribution was bimodal: fast successes, then a wall of 60 s timeouts.

Threshold gates configured in the script: `http_req_failed < 5 %` and `http_req_duration p(95) < 2000 ms`.

- Test 1 (100 VUs): **both gates OK**
- Test 2 (500 VUs): **both gates OK**
- Test 3 (1,000 VUs): **both gates OK**, but p95 (1,864 ms) is very close to the 2,000 ms gate
- Test 4 (2,000 VUs): **both gates CROSSED** — `ERRO thresholds on metrics 'http_req_duration, http_req_failed' have been crossed`

Additional measured metrics per run:

| Metric | 100 VUs | 500 VUs | 1,000 VUs | 2,000 VUs |
|--------|---------|---------|-----------|-----------|
| Iterations (completed) | 2,249 | 11,202 | 14,260 | 2,981 |
| Iterations/s | 8.1 | 40.1 | 51.1 | 9.9 |
| Iteration duration p95 | 10,967 ms | 11,010 ms | 22,807 ms | 198,691 ms |
| Data received | 21.6 MB | 108.2 MB | 140.5 MB | 45.7 MB |
| Data received/s | 78 KB/s | 387 KB/s | 504 KB/s | 152 KB/s |
| Max VUs reached | 100 | 500 | 1,000 | 2,000 |

### What happened at 2,000 VUs

At ~2m36s into the run the first `WARN Request Failed ... request timeout` appeared (60 s timeout ceiling). From that point the failures cascaded across **every endpoint** — `site_settings`, `categories`, `products` (list, detail, filtered, search), `promos`, `subcategories` — and completed iterations froze. During the sustained phase, request throughput **collapsed to ~104 req/s**, *lower* than the 500-VU result, while VUs were doubled. Ramp-down forced 1,783 VUs to be interrupted.

## 4. Bottleneck analysis

The evidence points to **server-side saturation of the Supabase endpoint (PostgREST/PostgreSQL pool), not the load-generator machine**:

- **Not a k6/client bottleneck:** k6 initialized all 2,000 VUs and sustained them for minutes. The failures were exclusively remote `Get "https://ygkeuhatokvkdwwoccty.supabase.co/rest/v1/...": request timeout` (60 s). No local socket/memory failures occurred. A client bottleneck would have produced local errors and would hit *all* VUs from the start, not after a clean 100→500→1,000 progression.
- **Throughput inversion:** doubling VUs from 1,000→2,000 *decreased* throughput (409 → 104 req/s) and exploded latency (p95 1.9 s → 60 s timeout). This is the classic signature of a saturated server (queueing), not a healthy system.
- **Where exactly (API gateway vs. DB)?** Cannot be conclusively separated from outside the project. The simultaneous timeout of *all* endpoints suggests either the API/edge layer (e.g. free-tier request/concurrency limits or connection pooling exhaustion at the gateway) or Postgres connection saturation (100 free tier connections vs 2,000 concurrent callers). **Both hypotheses are consistent with the data — do not guess further than this.**
- **Query design contribution (observed, not isolated):** the heaviest queries (product detail with 3 embedded relations; the `count=exact` paginated list; the `search_vector.phfts` OR-filter) are the most expensive read paths in the app. This test cannot quantify their individual weight — that would require a separate differential test.
- **Network:** latency at low concurrency was ~78–97 ms p95 — the distance Morocco→Supabase region is a fixed baseline, negligible next to the 60 s timeouts. Network is *not* the bottleneck.

## 5. Maximum stable load

- **Highest level that completed without errors: 1,000 VUs** (0 errors, but p95 = 1,864 ms — already close to the 2,000 ms gate, so this level runs hot).
- **Highest level with healthy margins (no meaningful degradation): 500 VUs** (p95 = 97 ms, 0 errors).
- **2,000 VUs: FAILED** (5.1 % errors, p95 = 60 s, throughput collapse).
- **5,000 VUs: NOT RUN** — the staged protocol says to stop increasing once the current level is unstable. The 2,000 VU result satisfies that stop condition.

**Conclusion: for this workload pattern (realistic browsing with the app's exact queries), the Supabase project sustained up to ~500–1,000 concurrent anonymous readers, and degraded hard between 1,000 and 2,000 concurrent readers.**

## 6. Interpretation — what these numbers mean (and do not mean)

**500 or 1,000 "VUs" is NOT "500/1,000 users per second", nor "X users/day".**

- **Concurrent virtual users (VU):** how many *simulated browsing sessions* are open simultaneously. Each VU makes ~8 requests, then sleeps 1.5–5 s.
- **Requests/s:** actual API throughput. 500 VUs → ~321 req/s; 1,000 VUs → ~409 req/s.
- **Sessions/s:** at 500 VUs the test completed ~40 browsing sessions per second (`iterations/s`). 1,000 VUs → ~51 sessions/s.
- **Active users / registered users / daily active users:** these depend on real session length, bounce rate, and repeat visits — **they cannot be derived from a load test**. E.g. 40 sessions/s sustained for 1 h would be ~144,000 session starts/hour *if* traffic were constant at that rate (a synthetic worst case, not a daily-active-user claim).

**Estimates (clearly labeled as estimates):** with this app's pause pattern, each "session" approximates one visitor landing on a page and browsing ~2–3 pages. So the 500–1,000 VU ceiling corresponds very roughly to **~40–50 visitor sessions per second** as a *sustained instantaneous* rate. Extrapolating that to "the site supports X DAU" is **not valid** — real DAU depends on how spread out traffic is over the day.

**Do not claim:** "the app supports 100K/1M users because 1,000 VUs passed." The only thing demonstrated is the measured capacity in the table above.

## 7. Recommendations (based only on observed results)

1. **Operating envelope:** keep sustained anonymous-read concurrency below ~500 VUs for comfort; treat ~1,000 VUs (p95 ≈ 1.9 s) as the practical ceiling for this project configuration. The 1,000→2,000 VU cliff should be respected in any capacity planning.
2. **Isolate the query-design factor:** run a differential test (same load, lighter selects / no `count=exact` / smaller embeds) to measure how much of the saturation is query weight vs. project limits. Until then, the relative contribution of query design is **uncertain**.
3. **Reduce hot-path weight (if the differential test confirms it):** product-detail embeds 3 relations (`categories`, `subcategories`, `product_images`) and the catalog list returns 25+ columns with `count=exact`; the homepage list is `limit=60` with 2 embeds. Narrower selects and paging would lower per-request cost (an app-side change — out of scope for this test to perform).
4. **Caching in front of Postgres:** the homepage (settings/categories/60 products/promos) re-queries identical rows on every visitor. A storefront cache (SSR/ISR/prerender or CDN) would cut a large share of the Read-replica/Postgres load. A `scripts/prerender-products.mjs` already exists in the repo.
5. **If >1,000 concurrent readers is a goal:** this is a Supabase plan/compute decision (DB compute size, connections, possibly a read replica or pooling configuration). That cannot be validated from app code and is outside the scope of this test report.
6. **Repeat the test** after any of: schema/index changes, plan/compute change, added caching, or query rework — then re-measure with the same script to compare.

## 8. Security & integrity checklist

- [x] Only the **public anon/publishable key** was used — never `service_role`, database password, or private credentials.
- [x] No secrets printed to terminal output; the anon key was supplied via `-e` runtime env vars, not stored in any file.
- [x] `load-tests/.env.example` contains placeholders only (`SUPABASE_URL=`, `SUPABASE_ANON_KEY=`). No real `.env` was created; `.gitignore` already excludes `.env*` (except `.env.example`).
- [x] Sweep of `load-tests/` found **zero** occurrences of `service_role` / `SUPABASE_SERVICE_ROLE_KEY`. The JSON result exports contain metrics only, no keys.
- [x] All requests in the load test were **GET/SELECT** — no INSERT/UPDATE/DELETE, no signups, no order creation, no admin operations. Verified by reading the script.
- [x] Application source (**`src/`**) was **not modified**.
- [x] Database schema, RLS policies, and authentication were **not modified** (no SQL/schema tooling was invoked; RLS stayed active during the test).
- [x] k6 verified: `k6.exe v2.1.0` responds correctly.

## 9. Files

| File | Purpose |
|------|---------|
| `load-tests/supabase-read-load.js` | Read-only k6 workload (all GET) |
| `load-tests/.env.example` | Env template (placeholders, no secrets) |
| `load-tests/README.md` | How to run / interpret |
| `load-tests/LOAD_TEST_REPORT.md` | This report |
| `load-tests/results/summary-<N>vu.json` | Raw k6 JSON export per level (N = 1, 100, 500, 1000, 2000) |
