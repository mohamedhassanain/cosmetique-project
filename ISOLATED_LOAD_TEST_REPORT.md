# Isolated Load Test Report

Generated: 2026-08-13T10:59:14.529Z

Real Supabase project (`https://ygkeuhatokvkdwwoccty.supabase.co`), read-only workload, public anon key only.

Requests per iteration per endpoint:
- HOME = 5 (`site_settings`, `categories`, `subcategories`, `promos`, `products`)
- CATALOG = 3 (`categories`, `subcategories`, `products`)
- SEARCH = 1 (`products` hybrid `search_vector.phfts` + `name/brand.ilike`)
- DETAIL = 1 (`products` by slug)

k6 stages: 20s ramp-up / 60s sustain / 20s ramp-down. Thresholds: `http_req_failed < 5%`, `p(95) < 2000 ms`.

Legend: `exit=99` = k6 threshold `p(95)<2000 ms` crossed on that run (saturation window).

## HOME

| VU | Exit | RPS | p50 | p90 | p95 | p99 | max | Errors |
|----|----:|----:|----:|----:|----:|----:|----:|----:|
| 100 | 0 | 100 | 75 ms | 84 ms | 89 ms | 105 ms | 347 ms | 0.000% |
| 500 | 0 | 484.6 | 78 ms | 95 ms | 261 ms | 794 ms | 1803 ms | 0.000% |
| 600 | 0 | 527.3 | 122 ms | 384 ms | 460 ms | 693 ms | 1209 ms | 0.000% |
| 700 | 0 | 662.6 | 112 ms | 191 ms | 229 ms | 348 ms | 709 ms | 0.000% |
| 800 | 0 | 685.7 | 237 ms | 305 ms | 331 ms | 386 ms | 5716 ms | 0.000% |
| 900 | 0 | 683.4 | 373 ms | 437 ms | 484 ms | 618 ms | 1125 ms | 0.000% |
| 1000 | **99** | 627.6 | 502 ms | 875 ms | 1298 ms | 2124 ms | 4014 ms | 0.000% |

## CATALOG

| VU | Exit | RPS | p50 | p90 | p95 | p99 | max | Errors |
|----|----:|----:|----:|----:|----:|----:|----:|----:|
| 100 | 0 | 63.9 | 76 ms | 85 ms | 88 ms | 98 ms | 343 ms | 0.000% |
| 500 | 0 | 316.1 | 76 ms | 85 ms | 89 ms | 98 ms | 465 ms | 0.000% |
| 600 | 0 | 339.6 | 77 ms | 91 ms | 359 ms | 7786 ms | 8679 ms | 0.000% |
| 700 | 0 | 411.6 | 78 ms | 92 ms | 155 ms | 3792 ms | 4807 ms | 0.000% |
| 800 | 0 | 414.3 | 82 ms | 742 ms | 1886 ms | 6877 ms | 9682 ms | 0.000% |
| 900 | 0 | 516.4 | 90 ms | 432 ms | 592 ms | 942 ms | 1764 ms | 0.000% |
| 1000 | 0 | 565.1 | 111 ms | 379 ms | 986 ms | 1921 ms | 4085 ms | 0.000% |

## SEARCH

| VU | Exit | RPS | p50 | p90 | p95 | p99 | max | Errors |
|----|----:|----:|----:|----:|----:|----:|----:|----:|
| 100 | 0 | 22.2 | 79 ms | 88 ms | 91 ms | 158 ms | 747 ms | 0.000% |
| 500 | 0 | 110.7 | 78 ms | 86 ms | 89 ms | 100 ms | 431 ms | 0.000% |
| 600 | 0 | 130.9 | 77 ms | 86 ms | 89 ms | 98 ms | 491 ms | 0.000% |
| 700 | 0 | 153.6 | 77 ms | 86 ms | 89 ms | 98 ms | 366 ms | 0.000% |
| 800 | 0 | 174.9 | 78 ms | 87 ms | 90 ms | 99 ms | 369 ms | 0.000% |
| 900 | **99** | 175.6 | 78 ms | 90 ms | 3050 ms | 8729 ms | 9506 ms | 0.000% |
| 1000 | 0 | 218 | 77 ms | 87 ms | 91 ms | 1379 ms | 1896 ms | 0.000% |

## DETAIL

| VU | Exit | RPS | p50 | p90 | p95 | p99 | max | Errors |
|----|----:|----:|----:|----:|----:|----:|----:|----:|
| 100 | 0 | 22.2 | 80 ms | 89 ms | 92 ms | 120 ms | 261 ms | 0.000% |
| 500 | 0 | 109.7 | 80 ms | 89 ms | 93 ms | 107 ms | 290 ms | 0.000% |
| 600 | 0 | 132.4 | 80 ms | 90 ms | 94 ms | 104 ms | 454 ms | 0.000% |
| 700 | **99** | 139 | 82 ms | 111 ms | 3483 ms | 7482 ms | 9805 ms | 0.000% |
| 800 | 0 | 170.8 | 79 ms | 95 ms | 510 ms | 3234 ms | 4308 ms | 0.000% |
| 900 | 0 | 195.9 | 79 ms | 93 ms | 100 ms | 258 ms | 1002 ms | 0.000% |
| 1000 | 0 | 216 | 81 ms | 103 ms | 166 ms | 1193 ms | 2068 ms | 0.000% |

# Global Mixed Workload

Same real Supabase project, `supabase-optimized2-load.js` (home → detail → filtered catalog → search, 8 requests/iteration, 1.5–5 s sleeps, 90s ramp-up / 2m sustain / 60s ramp-down).

| VU | Exit | RPS | p50 | p90 | p95 | p99 | max | Errors |
|----|----:|----:|----:|----:|----:|----:|----:|----:|
| 500 | 0 | 345 | 76 ms | 88 ms | 97 ms | 150 ms | 480 ms | 0.000% |
| 600 | 0 | 414.6 | 77 ms | 91 ms | 98 ms | 148 ms | 676 ms | 0.000% |
| 700 | **99** | 460.1 | 83 ms | 205 ms | 427 ms | 841 ms | 2278 ms | 0.000% |

**Stop condition:** STOP CONDITION at global-700 (exit=99 errRate=0). Not continuing beyond 700.

**Note — JSON overwritten by monitored re-run:** rows that crossed `p(95)<2000 ms` were re-run with the machine monitor; the table shows the re-run metrics with the sweep exit flag, and the original sweep p95 is preserved in `load-tests/results/sweep-progress.log`.

- iso-home-1000: sweep p95=13517 ms → re-run p95=1298 ms
- global-700: sweep p95=8603 ms → re-run p95=427 ms

# Load Generator Monitor

Machine CSV samples written for **2** runs.

| File | Peak total CPU % | Peak k6 CPU % | Peak RAM used % |
|---|---:|---:|---:|
| machine-global-700.csv | 49.1% | 79.2% | 74.0% |
| machine-home-1000.csv | 57.5% | 87.3% | 78.6% |

Overall peaks: total CPU **57.5%**, k6 CPU **87.3%**, RAM **78.6%**.

Load generator stayed below 90% total CPU — client saturation was NOT the cause of the observed latency degradation.
