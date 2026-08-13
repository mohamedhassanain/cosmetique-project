# LOAD TEST BEFORE / AFTER — KISSARIYA COSMÉTIQUES

Date: 13/08/2026. Real figures from saved k6 result JSONs (`load-tests/results/`). The AFTER series is the current `supabase-optimized2-load.js` global mixed workload (8 REST requests/iteration, anon key, read-only, real Supabase project). BEFORE = saved pre-optimization global summaries from earlier rounds.

> Caveat on comparability: BEFORE and AFTER are different workload **versions** (request mix + stage profiles evolved between rounds). The comparison is therefore directional, not a controlled A/B. The only controlled isolation performed this round is TEST A (same script/hardware, target switched from Supabase to Docker/Nginx).

## 1. Global mixed workload — BEFORE vs AFTER

| VU | Before RPS | After RPS | Before p95 | After p95 | Before err | After err | Before max | After max |
|----|-----------:|----------:|-----------:|----------:|-----------:|----------:|-----------:|----------:|
| 100 | 64.6 | (not re-run) | 88ms | — | 0% | — | 3.59s | — |
| 500 | 320.9 | 345.0 | 97ms | 97ms | 0% | 0% | 3.68s | 480ms |
| 600 | — | 414.6 | — | 98ms | — | 0% | — | 676ms |
| 700 | — | 460.1 | — | 427ms | — | 0% | — | 2.28s |
| 1000 | 409.1 | 237.2 | 1.86s | 8.36s | 0% | 0.05% | 8.99s | 60.00s* |

\* 60.00s = k6 HTTP timeout hit (request timed out). p99 at AFTER/1000: 35.69s.

> **Live re-run 13/08 14:32–14:36 (this session, at user request) reproduced the saturation almost exactly**: 68 657 requests, RPS 237.2, p50 431ms, p95 8.36s, p99 35.69s, max 60.00s (`http_req_duration p(95)<2000` threshold FAILED), err 0.05% (36 timeouts). Machine monitor: k6 CPU ≤55.5%, total CPU ≤48.9%, RAM free ≥2.0 GB, TCP ~1 049 — load generator clearly NOT the cause. Source: `load-tests/results/optimized2-1000vu.json` (overwritten by rerun) + `machine-global-1000-rerun.csv`.

Source files: `summary-100vu-BEFORE.json`, `summary-500vu-BEFORE.json`, `summary-1000vu-BEFORE.json`; `optimized2-500vu.json`, `optimized2-600vu.json`, `optimized2-700vu.json`, `optimized2-1000vu.json`.

## 2. Reading the 1000 VU rows honestly

- AFTER/700 → AFTER/1000 shows the **saturation signature**: RPS **drops** 460.1 → 237.2 while latency explodes (p95 427ms → 8.36s, p99 35.69s, max 60s timeout). That is a classic throughput-collapse under overload — the system stops absorbing load.
- BEFORE/1000 (p95 1.86s, RPS 409) was already degraded. AFTER/1000 is worse on this occasion — the heavier mixed iteration (8 REST calls + longer sustain) drives the tenant into collapse. Run-to-run variance at high VU is itself a documented finding (isolated runs at 1000 VU were mostly healthy: p95 91ms–1.30s).
- This is **Supabase REST-path** degradation: TEST A proved Docker/Nginx + load generator handle 1000 VU at p95 5.5ms with 0 errors (below).

## 3. TEST A — controlled isolation (new this round)

Same machine, same k6, same 1000 VU, same think-times, **target switched to Docker/Nginx with zero Supabase traffic**:

| Metric | Value |
|---|---|
| Requests | 59 085 |
| RPS | 574.9 |
| p50 / p95 / p99 / max | 1.6ms / 5.5ms / 24ms / 94ms |
| Errors / timeouts | 0 / 0 |
| Load generator (peak) | k6 CPU 78.8% (1 core), total CPU 78.1%, RAM free 2.7–3.4GB, TCP ~2 040 |

Conclusion (PROVEN): the degradation observed at 1000 VU in the k6 workload is produced on the Supabase REST path, not by Docker/Nginx and not by the load generator.

## 4. Zones (based on global AFTER runs, real data)

| Zone | VU (this workload) | Evidence |
|---|---|---|
| **SAFE** | ≤ 600 | 500–600 VU: p95 ≤ 98ms, RPS rising 345→414.6, 0 err |
| **WARNING** | 700 (intermittent) | 700 VU run p95 427ms / p99 841ms / max 2.28s; isolated runs at 700–900 intermittently collapse (SEARCH 900: p95 3.05s; DETAIL 700: p95 3.48s) |
| **SATURATION** | 1000 | global 1000: throughput collapse 460→237 RPS, p95 8.36s, p99 35.69s, 60s timeouts |

## 5. What did NOT change

- No frontend/Docker/Nginx change was made this round — none is justified (PROVEN not the bottleneck).
- No index changes — none proven needed at current catalog size (see DATABASE_INDEX_OPTIMIZATION.md / SUPABASE_LOAD_AUDIT.md).
- The measured 1000 VU collapse must be re-observed with live Supabase Dashboard metrics to classify the internal layer (SUPABASE_LOAD_MONITORING.md). Until then the Supabase-internal cause is **UNKNOWN**.

## 6. Maximum stable VU (this specific workload)

**~600 VU stable; 700 VU intermittent; 1000 VU saturation.** This is NOT "600 users" — see LOAD_TEST_AUDIT.md §6.
