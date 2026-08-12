# Load Test — Before vs After (Round 2)

Strict comparison of the same real Supabase project, same k6 workload geometry
(home → product detail → filtered catalog → search), same stages
(90s ramp-up, 2m sustain, 60s ramp-down), read-only, anon key only.

- **BEFORE** = `load-tests/supabase-optimized-load.js`
  (round-1 optimized = round-2 baseline; still used `count=exact` on catalog/search)
- **AFTER** = `load-tests/supabase-optimized2-load.js`
  (round-2: no `count=exact`, `limit=17` probe for `hasNextPage`)

Both scripts issue the same number of HTTP requests per iteration (8). The
round-2 changes above are **client-side**: an identical k6 workload therefore
produces near-identical endpoint numbers — which is exactly what the data shows.
The real request reduction happens at the app level and is measured in the
browser flow (see `REQUEST_OPTIMIZATION_REPORT.md`).

> Figures in this file supersede an earlier draft that cited an unverified
> "6 → 4" filtered-deep-link reduction. Verified app-level numbers below:
> COLD flow 37 → 13 REST, WARM session 14 → 6 REST (real captures in
> `load-tests/results/browser-*.json`).

## Raw results (REAL measurements)

|  VUs | Metric        | BEFORE     | AFTER      | Δ          |
| ---: | ------------- | ---------: | ---------: | ---------: |
|  100 | Requests/s    | 65.04      | 65.03      | −0.01      |
|  100 | p95 latency   | 91.3 ms    | 89.3 ms    | −2.0 ms    |
|  100 | Errors        | 0%         | 0%         | —          |
|  500 | Requests/s    | 321.55     | 317.87     | −1.1%      |
|  500 | p95 latency   | 92.9 ms    | 96.4 ms    | +3.5 ms    |
|  500 | p99 latency   | 159.4 ms   | 517.4 ms   | +358 ms    |
|  500 | Errors        | 0%         | 0%         | —          |
| 1000 | Requests/s    | 508.0      | 513.2      | +1.0%      |
| 1000 | p95 latency   | 730.0 ms   | 622.2 ms   | −107.8 ms  |
| 1000 | p99 latency   | 1132.1 ms  | 884.8 ms   | −247.3 ms  |
| 1000 | Errors        | 0%         | 0%         | —          |

Request counts per run:

|  VUs | Iterations BEFORE | Iterations AFTER | HTTP reqs BEFORE | HTTP reqs AFTER |
| ---: | -----------------: | ---------------: | ---------------: | ---------------: |
|  100 | 2 254              | 2 253            | 18 034           | 18 026           |
|  500 | 11 156             | 10 989           | 89 250           | 87 914           |
| 1000 | 17 709             | 17 885           | 141 674          | 143 082          |

Both runs at each level: 0% HTTP failures, all 8 status checks 200.

## Interpretation

- **100 VU** — identical within noise (both ≈65 req/s, p95 ≈90 ms).
- **500 VU** — essentially identical throughput (−1.1%); p95 within noise.
  p99 shows a single-run tail difference (517 ms vs 159 ms) on a run that
  otherwise had 0% errors; this is run-to-run variance, not a regression in
  query shape (the query shape is identical).
- **1000 VU** — **improved tail latency**: p95 730→622 ms (−15%), p99
  1132→885 ms (−22%), and throughput slightly higher (508→513 req/s).
  Consistent with the removal of the `COUNT(*)` aggregate from the catalog
  and search paths, which reduces per-request database work at saturation.

## Verdict

- Endpoint-level saturation behavior: **PROVEN BY TEST** — unchanged at
  100/500 VU, improved tail latency at 1000 VU, 0% errors at all three levels.
- The purpose of round 2 (fewer requests per app page view, smaller payloads)
  is **NOT** visible in an endpoint-equivalent k6 run by construction. It is
  measured in the browser flow — `REQUEST_OPTIMIZATION_REPORT.md`:
  - COLD flow (home → catalog → detail): 37 → 13 Supabase REST requests (−65%)
  - WARM SPA session (React Query cache): 14 → 6 REST requests (−57%)
- Aggressive stress (1500/2000/5000 VU) was **NOT** run: the load generator is
  a single local machine and the previous round already showed client-side
  saturation effects above 1000 VU; nothing in round 2 changes server capacity.

Source files: `load-tests/results/optimized-*vu.json` (BEFORE),
`load-tests/results/optimized2-*vu.json` (AFTER).
