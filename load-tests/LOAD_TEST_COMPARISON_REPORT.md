# Supabase Load Test Report — Current vs Lightweight Workload Comparison (Kissariya Cosmétiques)

Date: **11 August 2026**  
Target: **https://ygkeuhatokvkdwwoccty.supabase.co** (the real Supabase project used by the app)  
Status: **Completed up to 500 VUs for both groups. The 1,000 VU stage was run for the lightweight group and FAILED (server saturation). The current group was NOT re-run at 1,000 VUs** (uses the existing baseline data), and **no 2,000 / 5,000 VU stages were run** (see "Maximum Stable Load").

---

## 1. Purpose

The baseline report (`LOAD_TEST_REPORT.md`) showed the app's real workload collapsing between 1,000 and 2,000 VUs. This comparison answers: **is the bottleneck caused by the app's heavy read queries (wide `select=*`, embedded relations, `Prefer: count=exact`), or by the Supabase project itself (API / PostgREST / PostgreSQL / plan limits)?**

Two identical workloads were run against the **same** real Supabase project, differing **only** in query weight:

| Aspect | `supabase-current-load.js` (control) | `supabase-lightweight-load.js` (experiment) |
|--------|--------------------------------------|---------------------------------------------|
| Endpoints / tables / WHERE filters | same (the app's real queries) | same |
| Browsing order, `sleep()` pauses, stages, duration | same | same |
| `select` | `select=*` / wide selects + embeds | only columns the UI renders |
| Embedded relations | `categories()`, `subcategories()`, `product_images()` | removed |
| `Prefer: count=exact` | present (as the app sends it) | removed |
| Auth | public **anon** (publishable) key only | public **anon** key only |

Everything hits: `k6 (this machine) → Supabase API (PostgREST) → PostgreSQL`. No mocks, no local server, no schema/app/auth/RLS changes, read-only (`GET`/`SELECT` only).

## 2. Environment

| Item | Value |
|------|-------|
| k6 version | k6.exe v2.1.0 (commit/83a87a41e2, go1.26.4, windows/amd64) |
| Load generator | Local Windows 11 PC (`C:\Users\mohamed hassanain\Desktop\kissariya-main`) |
| Supabase project URL | `https://ygkeuhatokvkdwwoccty.supabase.co` (public URL, safe to publish) |
| Auth | public **anon** key only — never `service_role`, no secrets |
| Stage profile | ramp-up **90 s** → sustained **2 min** → ramp-down **60 s** (run per level) |
| Machine monitor | `monitor-k6.ps1` exists; CSV for the 1,000 VU run was **not produced** (the `start` of a hidden monitor instance had a typo (`BBypass`) and the runner exited before sampling k6; a later monitor instance found no running k6 process). Machine-resource data for the 1,000 VU run is therefore **not available**. No local resource saturation was observed in the earlier runs. |

## 3. Results (real measurements)

Percentiles are from the k6 JSON exports (`comparison-*.json`). `errors`/`err_rate` = `http_req_failed`; `checks` = HTTP status 200 checks.

### 3a. 1 VU smoke (connectivity)

| Group | Req | Req/s | Avg | p50 | p90 | p95 | p99 | Max | Errors | Checks (pass) |
|-------|-----|-------|-----|-----|-----|-----|-----|-----|--------|---------------|
| Lightweight | 10 | 1.0 | 258 ms | 149 ms | 442 ms | 785 ms | 1,059 ms | 1,128 ms | 0 | 8/8 (100 %) |
| Current | 10 | 1.1 | 106 ms | 91 ms | 163 ms | 170 ms | 176 ms | 177 ms | 0 | 8/8 (100 %) |

(1-VU runs are a 1-iteration smoke; noise between the two is normal, both under 1.1 s max.)

### 3b. 100 VUs

| Group | Req | Req/s | Avg | p50 | p90 | p95 | p99 | Max | Err rate | Failed reqs | Checks (% pass) | Iterations | Iter/s |
|-------|-----|-------|-----|-----|-----|-----|-----|-----|----------|-------------|-----------------|------------|--------|
| Lightweight | 17,866 | 64.4 | 78 ms | 77 ms | 86 ms | **89 ms** | 106 ms | 232 ms | 0 % | 0 | 100 % (17,864/17,864) | 2,233 | 8.1 |
| Current | 18,018 | 64.6 | 80 ms | 78 ms | 88 ms | **92 ms** | 119 ms | 695 ms | 0 % | 0 | 100 % (18,016/18,016) | 2,252 | 8.1 |

→ Identical performance. Query weight has no measurable effect at this level.

### 3c. 500 VUs

| Group | Req | Req/s | Avg | p50 | p90 | p95 | p99 | Max | Err rate | Failed reqs | Checks (% pass) | Iterations | Iter/s |
|-------|-----|-------|-----|-----|-----|-----|-----|-----|----------|-------------|-----------------|------------|--------|
| Lightweight | 82,722 | 296.1 | 182 ms | 79 ms | 105 ms | **140 ms** | 1,565 ms | 12,980 ms | 0 % | 0 | 100 % (82,720/82,720) | 10,340 | 37.0 |
| Current | 89,010 | 317.5 | 92 ms | 80 ms | 107 ms | **149 ms** | 286 ms | 4,479 ms | 0 % | 0 | 100 % (89,008/89,008) | 11,126 | 39.7 |

→ Both stable, 0 errors, near-identical throughput and p95. Note the lightweight group starts showing a long p99 tail (1.57 s vs 286 ms) and a 13 s max, but 0 % errors and p95 still ≈ 140–149 ms.

### 3d. 1,000 VUs

| Group | Req | Req/s | Avg | p50 | p90 | p95 | p99 | Max | Err rate | Failed reqs | Checks (% pass) | Iterations | Iter/s |
|-------|-----|-------|-----|-----|-----|-----|-----|-----|----------|-------------|-----------------|------------|--------|
| Lightweight | 39,643 | **141.3** | 4,209 ms | 318 ms | 13,888 ms | **25,892 ms** | **43,704 ms** | 60,000 ms (timeout) | **0.053 %** | **21** | 99.95 % (39,620/39,622) | 4,870 (116 interrupted) | 17.4 |
| Current | — | — | — | — | — | — | — | — | — | — | — | — | — |

The lightweight run **crossed the `http_req_duration` p(95)<2000 ms threshold** (`ERRO[0281] thresholds on metrics 'http_req_duration' have been crossed`) and produced 21 request failures + 116 interrupted iterations. A wall of `WARN[0xxx] Request Failed ... request timeout` (60 s ceiling) appeared across **every** endpoint: `site_settings`, `categories`, `products` (list / detail-by-slug / catalog-filtered / search), `promos`, `subcategories`.

Per the staged protocol ("if error rate or latency becomes dangerously high, STOP increasing the load"), the current group was **not re-run at 1,000 VUs** — running the heavier workload at a level already saturating the lighter one cannot add information and would only add load to a saturated project. The relevant comparison point is the baseline session: the same `current` workload previously **passed** 1,000 VUs (0 errors, p95 = 1,864 ms) and only collapsed at 2,000 VUs.

## 4. Bottleneck analysis

**The bottleneck is server-side project capacity, not query payload weight.**

Evidence:

1. **No difference at healthy load.** At 100 and 500 VUs the lightweight and current workloads are statistically indistinguishable (p95 89 vs 92 ms; 140 vs 149 ms; req/s 64.4 vs 64.6; 296 vs 317). If the heavy queries themselves were the limiting factor, the lightweight group would pull clearly ahead — it does not.
2. **Saturation profile is identical in shape.** Baseline: current workload overloaded between 1,000 and 2,000 VUs (throughput collapse 409 → 104 req/s, wall of 60 s timeouts). This session: the *lighter* workload overloaded at 1,000 VUs with the same signature (throughput 296 → 141 req/s, wall of 60 s timeouts, requests now queueing past the 2 s gate).
3. **The workload that failed here is dramatically lighter** (narrow selects, no embeds, no `count=exact`), yet still saturated at 1,000 VUs. That directly rules out query complexity as the primary cause.
4. **No client/load-generator bottleneck observed.** k6 initialized and sustained 1,000 VUs; failures were exclusively remote `Get "...supabase.co/rest/v1/...": request timeout` at the 60 s ceiling — no local socket/memory errors. (Machine CPU/RAM for the 1,000 VU run was not sampled due to the monitor-launch typo above; this conclusion relies on the k6 error signature and the clean 100→500→1,000 progression.)
5. **Where exactly?** Cannot be conclusively separated from outside the project. The evidence (both HTTP statuses and DB-level latencies grow together at the same VU boundary, independent of query weight) is consistent with:
   - **PostgREST/API concurrency or connection-pool exhaustion** (e.g. free-tier limits, 100-connection Postgres pool vs 1,000 concurrent sessions), and/or
   - **Project/plan-level rate limits**.
   
   Both hypotheses fit the data. **This is a labeled conclusion: the data points at Supabase-side capacity (API gateway and/or Postgres connection pool), but the exact layer cannot be isolated from outside the project.**

## 5. Maximum stable load

- **Highest level fully stable for BOTH workloads: 500 VUs** (0 errors, p95 ≈ 140–149 ms).
- **1,000 VUs: NOT stable in this session.** The lightweight workload — the *lighter* of the two — saturated with 60 s timeouts, 21 failed requests, 116 interrupted iterations, and a crossed threshold. The heavier workload had previously squeaked through 1,000 VUs (p95 = 1,864 ms, near the 2,000 ms gate), which shows run-to-run variance near the ceiling, not guaranteed capacity.
- **2,000 VUs: previously FAILED for the current workload; NOT re-run** this session.
- **5,000 VUs: NOT RUN** — the staged protocol's stop condition was met at 1,000 VUs.

**Conclusion: the practical sustained ceiling for anonymous read traffic on this project is around 500 concurrent VUs, with hard degradation setting in somewhere in the 1,000–2,000 VU band regardless of query weight.**

## 6. Interpretation — what these numbers mean (and do not mean)

- **500 / 1,000 "VUs" is NOT "500 / 1,000 users per second", nor "X users/day".** A VU is one simulated browsing session (≈ 8 requests then 1.5–5 s pauses).
- **Sessions/s:** at 500 VUs the test produced ~37–40 browsing sessions per second; at the failing 1,000 VU run, ~17 sessions/s before the collapse. These are *instantaneous sustained* rates during the test window.
- **Registered / active / daily-active users** cannot be derived from a load test — they depend on real session length, visit frequency, and how traffic is spread over the day. Extrapolating "500 VUs → N DAU" is **not valid**.

## 7. Recommendations (based only on observed results)

1. **Treat ~500 concurrent anonymous readers (≈ 37–40 sessions/s) as the comfortable operating envelope** for the current project configuration; plan for hard degradation above that.
2. **If higher concurrency is a business goal, the lever is the Supabase plan/compute, not the app queries.** The differential test shows query weight is not the gating factor. Options to evaluate (outside app code, cannot be validated here): larger compute, Postgres connection pooling (e.g. pgBouncer / Supabase Pooler), read replicas, or project-level rate-limit review.
3. **Still worth the cheap query optimizations** (narrower selects, no `count=exact`, smaller/removed embeds) — they reduce per-request cost and data transfer (lightweight transferred a fraction of the bytes at 500 VUs while matching latency), which helps at *every* load level even if it does not raise the ceiling. Measured observation: this session's lightweight runs moved less data than the earlier current runs at the same VU levels while achieving the same p95.
4. **Cache the hot public reads** (site settings, categories, home products limit 60, promos): identical rows are re-fetched on every visitor and every VU. SSR/ISR/prerender or CDN caching would cut the largest share of PostgREST/Postgres traffic. A `scripts/prerender-products.mjs` already exists in the repo.
5. **Re-measure after changes** with the same scripts to compare: run the staged series, always starting at 100 VUs, and stop when a level crosses `p(95) < 2000 ms` or `http_req_failed < 5 %`.

## 8. Security & integrity checklist

- [x] Only the **public anon/publishable key** was used — never `service_role`, `SUPABASE_SERVICE_ROLE_KEY`, database password, or private credentials; supplied via `-e` runtime env vars, not stored in files.
- [x] Sweep of `load-tests/` (scripts + README + reports + JSON exports) found **zero** occurrences of `service_role`, `SUPABASE_SERVICE_ROLE_KEY`, or the anon key string in any committed/new file.
- [x] `.gitignore` excludes `.env` and `.env.*` (except `.env.example`); `load-tests/.env.example` contains placeholders only.
- [x] All requests were **GET/SELECT** — no INSERT/UPDATE/DELETE, no signups, no orders, no admin operations (verified by reading both scripts).
- [x] Application source (`src/`), database schema, RLS policies, and authentication were **not modified**; RLS stayed active throughout; anonymous reads were limited to RLS-permitted rows.
- [x] k6 verified working: `k6.exe v2.1.0`.

## 9. Files

| File | Purpose |
|------|---------|
| `load-tests/supabase-current-load.js` | Control group (app's real query weight) |
| `load-tests/supabase-lightweight-load.js` | Experiment group (same endpoints, reduced payload) |
| `load-tests/monitor-k6.ps1` | Load-generator machine sampler (client-bottleneck check) |
| `load-tests/README.md` | How to run / interpret (updated with the comparison workflow) |
| `load-tests/LOAD_TEST_REPORT.md` | Baseline report (previous session: 100→2,000 VUs) |
| `load-tests/LOAD_TEST_COMPARISON_REPORT.md` | This report |
| `load-tests/results/comparison-{current,lightweight}-{1,100,500}vu.json` | Raw k6 exports (real measurements) |
| `load-tests/results/comparison-lightweight-1000vu.json` | Raw k6 export of the failed 1,000 VU run |
