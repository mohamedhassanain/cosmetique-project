# BOTTLENECK ANALYSIS — KISSARIYA COSMÉTIQUES

Date: 13/08/2026. Evidence-based classification of every potential bottleneck at 700–1000 VU. All figures REAL (saved k6 JSONs + this session's TEST A).

## 1. Component classification

| # | Component | Status | Evidence |
|---|---|---|---|
| 1 | k6 / load generator | **PROVEN — NOT the primary bottleneck** | TEST A: same machine + k6 at 1000 VU against Docker/Nginx achieved p95 5.5 ms, 59 085 req, 0 errors. Monitor: k6 CPU peaked ≤78.8% (single core), total CPU ≤78.1%, RAM free 2.7–3.4 GB, TCP ~2 040. If the generator were saturated, TEST A would degrade too — it did not. |
| 2 | Docker | **PROVEN — NOT a bottleneck** | Container `kissariya-web` served 1000 VU static/SPA at p95 5.5 ms, p99 24 ms, max 94 ms, exit 0. |
| 3 | Nginx | **PROVEN — NOT a bottleneck** | Same TEST A (origin IS Nginx): 574.9 RPS, 0 failures. Nginx config (worker_auto, gzip on, static alias, SPA fallback) verified in DOCKER_FINAL_REPORT.md. |
| 4 | React / frontend | **PROVEN — NOT a bottleneck (in the load tests)** | k6 never executes React; the SPA shell it fetches is served in 1–6 ms. App-side request count already reduced (13 cold / 6 warm) and queries are explicit-select, no count, no N+1 (see SUPABASE_LOAD_AUDIT.md). |
| 5 | Network (this machine → Supabase) | **LIKELY a contributor, NOT proven primary** | All REST calls traverse the public internet to `*.supabase.co`. One-way RTT is visible in the ~77–82 ms p50 floor from Morocco on every endpoint run — consistent across healthy AND collapsed runs, so it does not explain the multi-second p95 spikes. |
| 6 | Supabase API (edge/PostgREST gateway) | **UNKNOWN — REQUIRES LIVE DASHBOARD METRICS** | Traffic is 100% Supabase REST; Docker/Nginx excluded at same VUs. Whether the collapse is the gateway vs DB cannot be told from k6 alone. |
| 7 | PostgreSQL | **UNKNOWN — REQUIRES LIVE DASHBOARD METRICS** | Index coverage for every load query is PROVEN present (supabase/database.sql); catalog is ~1–10 active rows. Actual EXPLAIN ANALYZE under load is unavailable from the repo. |
| 8 | Supabase platform / rate limits | **UNKNOWN — REQUIRES LIVE DASHBOARD METRICS** | 0% HTTP errors everywhere means no 429/5xx was seen by k6 — but k6 cannot detect a gateway that silently queues before returning 200. |
| 9 | Query inefficiency | **UNKNOWN — PROVEN absent at source level** | No select=*, no count=exact, no N+1, indexes match every query (SUPABASE_LOAD_AUDIT.md §3–§4). Remaining unknown is execution cost under concurrency, which needs EXPLAIN ANALYZE under load. |

## 2. What is PROVEN

1. **Docker/Nginx are NOT the bottleneck**: TEST A at 1000 VU → p95 5.5 ms, 0 errors.
2. **The added latency lives on the Supabase REST path**: identical machine/k6/think-times, only difference is target (Docker/Nginx 5.5 ms vs Supabase REST 986 ms–1.3 s p95 and historic up to 8.4 s).
3. **Saturation is intermittent, not a hard ceiling**: within the same hour, SEARCH 900 collapsed (p95 3.05 s) while SEARCH 1000 was healthy (91 ms); DETAIL 700 collapsed (3.48 s) while DETAIL 1000 was healthy (166 ms). This points to tenant/resource variability — consistent with a shared Free-plan tenant — but that is inferred, not dashboard-proven.
4. **Load generator is proven NOT to be the primary bottleneck** (see table row 1).

## 3. What remains UNKNOWN

- Exact layer inside Supabase (edge / PostgREST / connection pool / DB CPU / rate limit) at the moment of collapse.
- Whether `EXPLAIN ANALYZE` shows any expensive plan under concurrency.
- Whether the Free-plan tenant shares CPU/network with noisy neighbors during runs.

**Supabase bottleneck: UNKNOWN — REQUIRES LIVE SUPABASE DASHBOARD METRICS.** The procedure in SUPABASE_LOAD_MONITORING.md is the exact next step; no definitive "Supabase is the bottleneck" claim can be made from repository data alone.

## 4. Recommended fix (evidence-based)

- **No frontend/Docker/Nginx change is justified** — PROVEN not the bottleneck.
- The only proven-safe lever left is **not in this phase's code**: reduce Supabase REST traffic per user by serving public data from a shared cache. React Query is browser-local (not a shared cache); a CDN cache of `/rest/v1/*` is NOT SAFE (private/auth risk, no purge channel — documented in FINAL_REMAINING_PERFORMANCE_AUDIT.md). Static-asset CDN (Cloudflare, prepared) offloads Docker/Nginx, which is already cheap.
- **Required next action**: run SUPABASE_LOAD_MONITORING.md §2–§4, then re-classify rows 6–8 with live numbers.

## 5. Anti-fixes rejected (do not do)

- Adding backend/Redis/LB/K8s — explicitly out of scope and unjustified by evidence.
- Adding DB indexes — no proven missing index at this catalog size.
- Caching `/rest/v1/*` — unsafe (RLS/private data, no purge).
- "Tuning" Nginx/Docker — no evidence of a problem (TEST A proves capacity).
- Claiming "1000 VU = 1000 users" — see LOAD_TEST_AUDIT.md §6 and FINAL_PHASE_REPORT.md §7.
