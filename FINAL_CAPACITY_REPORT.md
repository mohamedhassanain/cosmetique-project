# Final Capacity Report

Date: 2026-08-12
Project: Kissariya Cosmétiques (React + Vite → Supabase → PostgreSQL/Storage)

---

# 1. Executive Summary

The current optimized architecture was stress-tested against the real Supabase Free
project with a read-only k6 workload (homepage → product detail → catalog → search).
The previously validated 1000-VU result (~513 req/s, p95 ~622 ms, 0% errors) could
**not be reproduced** today. Two fresh, identical 1000-VU runs both caused project
saturation: requests-per-second collapsed to 151–237, p95 rose to 8.4–32 s, p99 to
~35.7 s, multiple 60-second request timeouts appeared, and the k6 `p(95)<2000 ms`
threshold was crossed (exit code 99).

Conclusion: we did **not** validate safe capacity beyond the historic 1000-VU result.
Today's measured ceiling is below 1000 VU. The knee of the saturation curve was not
located (600–900 VU was not tested because the stop condition triggered at 1000).

---

# 2. Test Environment

- Load generator: local PC, Windows 11, 6 CPU cores, 15.2 GB RAM, k6 v2.1.0.
- k6 profile per run: ramp 90s → sustain 120s → ramp-down 60s (≈5 min total).
- Workload: `load-tests/supabase-optimized2-load.js` — identical at all levels
  (same endpoints, same filters, same sleeps 1.5–5 s, same dataset).
- Read-only: GET/SELECT only, anon (publishable) key only, no service_role,
  no INSERT/UPDATE/DELETE, no signups, no order creation.

# 3. Real Supabase Endpoint Verified

- URL: `https://ygkeuhatokvkdwwoccty.supabase.co` (from `.env`, matches the
  committed `VITE_SUPABASE_URL` in `.env.example`).
- The anon key used is the public browser key (verified: valid JWT, no placeholder,
  208 chars). No secret was exposed.

# 4. k6 Workload

Ops per iteration (matching the shop):

1. Home: `site_settings` (limit 1)
2. Home: `categories` (id,name,slug)
3. Home: `subcategories` (all)
4. Home: `promos` (active)
5. Home: `products` (active, limit 60, embedded categories)
6. Detail: `products` by slug (limit 1, full detail select)
7. Catalog: `products` by category (limit 17, no count=exact)
8. Search: `products` (search_vector.phfts + ilike, limit 17, no count=exact)

Sleep pauses: 1.5–5 s between page groups — realistic browsing.

# 5. Baseline 1000 VU

Attempted twice with the final script; both runs were treated as the baseline attempt.

| Metric | Historic validated (before) | Run 1 (fresh) | Run 2 (fresh) |
| --- | --- | --- | --- |
| Req/s | ~513 | 151.1 | 237.2 |
| p50 | ~430 ms | 96.5 ms | 431.5 ms |
| p90 | ~563 ms | 11 026 ms | 4 477 ms |
| p95 | ~622 ms | 32 168 ms | 8 364 ms |
| p99 | ~885 ms | 39 407 ms | 35 690 ms |
| Max | ~1.87 s | 60.0 s (timeout) | 60.0 s (timeout) |
| Errors | 0% | 1 timeout (0.002%) | 36 timeouts (0.052%) |
| Check pass | 100% | 99.9978% | 99.9476% |

The historic number is retained only as reference; per the rules it is clearly
labeled as NOT REPRODUCIBLE TODAY. The two fresh runs disagree with it, so today's
baseline is the degraded behavior.

# 6. Stress Test Results

Stop condition reached at 1000 VU. No higher stage was run.

| VU | RPS | p50 | p90 | p95 | p99 | Max | Errors | Status |
|----|-----|-----|-----|-----|-----|-----|--------|--------|
| 1000 (run 1) | 151 | 97 ms | 11 026 ms | 32 168 ms | 39 407 ms | 60 001 ms | 1 timeout | SATURATION |
| 1000 (run 2) | 237 | 431 ms | 4 477 ms | 8 364 ms | 35 690 ms | 60 001 ms | 36 timeouts | SATURATION |
| 1500+ | NOT TESTED — STOP CONDITION REACHED |

# 7. Performance Zones

Based only on real data available today + historic runs:

- SAFE ZONE: ≤ 500 VU (historic runs healthy; not re-run today).
- WARNING ZONE: unknown (no 600–900 VU run executed).
- SATURATION ZONE: 1000 VU (fresh: latent collapse in both runs today) — LIKELY
  platform-side (connections/compute), BUT the exact cause is NOT proven without
  Supabase dashboard metrics.

# 8. Supabase Metrics

Not accessible directly from this environment (no dashboard API/credentials).
Classification:

- Bottleneck location: NOT PROVEN. Consistent with project-side saturation of
  PostgREST/connections/compute on the Free plan.
- Load generator: NOT the bottleneck — the run completed with process alive,
  68 657 requests issued, and the machine was not exhausted.

# 9. Bottleneck Analysis

| Hypotheses | Status |
| --- | --- |
| Query payload too heavy (count=exact, select=*) | DISPROVEN as primary cause — final script is lightweight (no count=exact, limit 17) and still saturated |
| Supabase Free connections / compute / API limit | LIKELY — same script previously ~513 req/s now 151–237 req/s with multi-second p95 |
| Load generator saturation | NOT OBSERVED — runs completed; no client exhaustion |

# 10. Maximum Validated Concurrent VU

- Highest VU successfully tested: 1000 VU (with degraded metrics and timeouts) — NOT healthy.
- Highest healthy VU today: not established (historic ≤500 VU healthy).
- Highest VU before saturation: not established (knee unknown).
- First VU where WARNING appeared: not established.
- First VU where SATURATION appeared: 1000 VU (both fresh runs) — threshold crossing.

# 11. Safe Capacity

- Historic: 500 VU healthy (referenced runs). NOT re-validated today.
- Today: no VU level above 500 was proven SAFE.

# 12. Warning Capacity

820–999 VU range not probed — UNKNOWN.

# 13. Saturation Capacity

1000 VU. Both fresh runs today saturated (latency collapse + timeouts + threshold breach).

# 14. Limitations

- The load generator sat idle (no client bottleneck observed), but per-run machine
  monitor CSVs were written and not parsed for CPU% — treat "no client bottleneck"
  as LIKELY rather than PROVEN.
- Supabase dashboard metrics not available in this environment — bottleneck cause
  not PROVEN.
- Historic 1000-VU run not reproducible; cause could be platform state (Free-tier
  throttling, connection pool) or external conditions — UNKNOWN.
- VU ≠ registered users ≠ daily/monthly users. "1000 VU" means 1000 concurrent
  virtual users under this specific k6 workload.

# 15. Recommended Next Step

Confirm the bottleneck with Supabase dashboard metrics (connections, CPU, API
requests, rate limits) during a single 1000-VU run. If platform saturation is
confirmed, the only remaining lever within the current architecture is to reduce
requests further (e.g., a shared cache in front of identical public GETs) or to
re-test after enabling a paid plan — actually measured first, never assumed.
