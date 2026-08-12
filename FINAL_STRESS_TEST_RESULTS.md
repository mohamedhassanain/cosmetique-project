# Final Stress Test Results

Date: 2026-08-12
Real Supabase project: `https://ygkeuhatokvkdwwoccty.supabase.co`
Script: `load-tests/supabase-optimized2-load.js` (read-only, anon key only)

Same workload at every level (home → product detail → catalog → search, 1.5–5 s sleeps,
ramp 90 s / sustain 2 min / ramp-down 60 s, ~5 min per run).

## Results

| VU | RPS | p50 | p90 | p95 | p99 | Max | Errors | Status |
|----|-----|-----|-----|-----|-----|-----|--------|--------|
| 1000 (run 1) | 151.1 | 96.5 ms | 11 026 ms | 32 168 ms | 39 407 ms | 60 001 ms | 1 timeout (0.002%) | SATURATION |
| 1000 (run 2) | 237.2 | 431.5 ms | 4 477 ms | 8 364 ms | 35 690 ms | 60 001 ms | 36 timeouts (0.052%) | SATURATION |
| 1500 | NOT TESTED — STOP CONDITION REACHED | | | | | | |
| 2000 | NOT TESTED — STOP CONDITION REACHED | | | | | | |
| 2500+ | NOT TESTED — STOP CONDITION REACHED | | | | | | |

## Stop conditions met (both runs)

1. p95 unacceptable: 8.4 s (run 2), 32 s (run 1). k6 threshold `p(95)<2000ms` crossed — exit code 99.
2. Significant timeouts: multiple 60-second request timeouts (product detail, catalog, home, search).
3. Requests/sec collapsed vs the historic validated run (~513 req/s) by 54–70%.

## Historic reference (not reproducible today)

Earlier validated 1000-VU run of the same script reached ~513 req/s, p95 ~622 ms,
p99 ~885 ms, 0% errors. Two fresh identical runs both saturated. The historic result
is retained only as reference and is clearly NOT REPRODUCIBLE TODAY.

## Interpretation

- Free-plan project saturates under sustained repeated 1000-VU load.
- p50 remains low (97–431 ms) while p90+ grows to seconds: characteristic of
  platform-side saturation (connections/compute/API), not uniform client-side blocking.
- Load generator is not the bottleneck: runs completed end-to-end with the process alive.
- 10 VU behavior is healthy; the collapse is load-induced.

## Raw data

- Run 1 metrics: extracted from `optimized2-1000vu.json` before run 2 overwrote it
  (duration 300 790 ms, 45 460 requests, 5 192 iterations, 1 check failure).
- Run 2 raw export: `load-tests/results/optimized2-1000vu.json` (duration 289 495 ms,
  68 657 requests, 8 247 iterations, 36 check failures).
- Per-run machine monitors: `load-tests/results/machine-stress-1000vu-*.csv` (written,
  not parsed — no client bottleneck observed).

## Recommendations forced by this result

- Do NOT claim validated capacity at 1000 VU for this project today.
- Verify the cause with Supabase dashboard metrics (connections, CPU, API rate limits)
  during one 1000-VU run before any further conclusion.
- Do not run 1500+/2000+ against this project until the saturation at 1000 VU is
  understood and resolved.
