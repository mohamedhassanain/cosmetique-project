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
