# Load Tests — Kissariya Cosmétiques (Supabase reads)

This directory contains a **read-only** load test that hits the **REAL Supabase
project** used by the application (`VITE_SUPABASE_URL` from
`.env.example` / `src/integrations/supabase/client.ts`).

Chain measured:

```
k6 (this machine) → Supabase API (PostgREST) → PostgreSQL
```

No local server, no mocks, no fake architecture.

---

## Safety contract

- **Read-only workload.** Every request in `supabase-read-load.js` is a `GET`
  (`SELECT`) against PostgREST. There are no `INSERT`, `UPDATE`, `DELETE`,
  signups, order creations or admin operations.
- **Anonymous public access only.** Requests use the public `anon` key — the
  same key shipped to the browser (`VITE_SUPABASE_PUBLISHABLE_KEY`).
  **Never** use the `service_role` key, database password, or private tokens.
- **RLS enforced.** Anonymous reads are limited by the existing RLS policies:
  `products` (only `is_active = true`), `promos` (only `is_active = true`),
  `categories`, `subcategories`, `site_settings` are all publicly
  selectable — that's exactly what the storefront queries.
- **No schema or code changes.** The application, database schema, RLS and
  auth are never modified by this test.

## What is tested (real queries mirroring `src/services/*`)

| # | Operation | Tables | Source in app |
|---|-----------|--------|---------------|
| 1 | Homepage: site settings | `site_settings` | `site-settings.service.ts` |
| 2 | Homepage: categories | `categories` | `category.service.ts` |
| 3 | Homepage: active products (limit 60) | `products` + embedded `categories`, `subcategories` | `product.service.ts` `fetchActiveProducts` |
| 4 | Homepage: active promos | `promos` | `promo.service.ts` |
| 5 | Product detail by slug (full select + images) | `products` + `product_images` | `product.service.ts` `fetchProductBySlug` |
| 6 | Catalog: subcategories of a category | `subcategories` | `category.service.ts` |
| 7 | Catalog: products filtered by category (paginated, `count=exact`) | `products` | `product.service.ts` `fetchPublicProducts` |
| 8 | Search: `search_vector.phfts` + `name.ilike` + `brand.ilike` | `products` | `product.service.ts` `fetchPublicProducts` |

Each virtual user walks through these in a realistic order with
`sleep()` pauses (1.5–5 s), like a visitor browsing the store.

## Real Supabase project

The test targets the project configured in the app's committed `.env.example`:

```
SUPABASE_URL=https://ygkeuhatokvkdwwoccty.supabase.co
```

The anon publishable key is already public (it ships in the browser bundle).
For local runs it is read from environment variables, so no secret is written
into this repository.

## Setup

```powershell
# 1. k6 must be installed
k6 version

# 2. (Optional) copy the template — never commit the real file
Copy-Item load-tests/.env.example load-tests/.env
#    then edit load-tests/.env and set SUPABASE_ANON_KEY=<anon key>
```

## Running the tests (progressive levels)

Run each level, check the results, and **only continue if the previous level is
stable** (error rate < 5 % and p95 < 2000 ms). Stop increasing if latency or
errors blow up.

PowerShell:

```powershell
k6 run -e SUPABASE_URL=https://ygkeuhatokvkdwwoccty.supabase.co `
       -e SUPABASE_ANON_KEY=<ANON_KEY> `
       -e MAX_VUS=100 -e SUSTAIN_DURATION=2m `
       load-tests/supabase-read-load.js
```

Then repeat with `MAX_VUS=500`, `1000`, `2000`, `5000`.

Stage profile per run:

```
ramp-up 90s → sustain 2m → ramp-down 60s
```

A JSON summary is written to `load-tests/results/summary-<VUS>vu.json` after
each run.

## Metrics & thresholds

Default thresholds in the script (measurement gates, not product claims):

| Metric | Threshold |
|--------|-----------|
| `http_req_failed` | rate < 5 % |
| `http_req_duration` | p(95) < 2000 ms |

Full metrics collected per run: `http_req_duration` (avg/p50/p90/p95/p99),
`http_req_failed`, `http_reqs`, `checks`, `iteration_duration`, `vus`,
`vus_max`.

## Interpreting results

- **Concurrent virtual users ≠ users per second ≠ registered users.**
  5000 VUs does **not** mean 5000 users/s or 5M users/day. See
  `LOAD_TEST_REPORT.md` for the interpretation.
- A fast local report with low VUs (e.g. 20) proves nothing about capacity.
  Only the staged runs (100→5000) with sustained load produce meaningful
  measurements.
- If the load-generator machine caps out (CPU 100 %, no more sockets), that is
  a **client bottleneck**, not a Supabase one. Check it separately.

## Reports

| File | Content |
|------|---------|
| `supabase-read-load.js` | k6 read-only workload (baseline) |
| `supabase-current-load.js` | control group (same workload as baseline) |
| `supabase-lightweight-load.js` | experiment group (same endpoints, reduced payload/embed/count) |
| `monitor-k6.ps1` | load-generator CPU/RAM/sockets sampler (client-bottleneck check) |
| `.env.example` | env template (placeholders, no secrets) |
| `results/summary-<N>vu.json` | raw k6 export per run (generated) |
| `results/comparison-*-<N>vu.json` | raw k6 exports of the comparison runs (generated) |
| `LOAD_TEST_REPORT.md` | baseline report with real measurements |
| `LOAD_TEST_COMPARISON_REPORT.md` | current-vs-lightweight diagnosis report |

---

## Diagnostic comparison (current vs lightweight)

The second test answers: *is the bottleneck caused by heavy queries or by
Supabase/API/PostgreSQL capacity?*

Run both scripts at the same levels **sequentially** (let the system recover
between runs). Everything is identical except the query weight:

| Aspect | `supabase-current-load.js` | `supabase-lightweight-load.js` |
|--------|----------------------------|-------------------------------|
| Endpoints / tables / WHERE filters | same | same |
| Browsing order, sleeps, stages, duration | same | same |
| `select` | app's real selects (`select=*`, embeds) | only UI-rendered columns |
| Embedded relations | `categories()`, `subcategories()`, `product_images()` | removed |
| `Prefer: count=exact` | present (as the app sends it) | removed |
| VU levels | 100 → 500 → 1000 → 2000 | 100 → 500 → 1000 → 2000 |

Example (PowerShell) — run lightweight first at each level, then current:

```powershell
# optional: monitor the load generator
.\load-tests\monitor-k6.ps1 -Seconds 5 -OutFile load-tests/results/machine-light-500vu.csv

k6 run -e SUPABASE_URL=https://ygkeuhatokvkdwwoccty.supabase.co `
       -e SUPABASE_ANON_KEY=<ANON_KEY> `
       -e MAX_VUS=500 -e SUSTAIN_DURATION=2m `
       load-tests/supabase-lightweight-load.js

k6 run -e SUPABASE_URL=https://ygkeuhatokvkdwwoccty.supabase.co `
       -e SUPABASE_ANON_KEY=<ANON_KEY> `
       -e MAX_VUS=500 -e SUSTAIN_DURATION=2m `
       load-tests/supabase-current-load.js
```

If the lightweight workload degrades at the same VU level with the same error
rate, the bottleneck is **not** primarily query payload — it points at
project/API/connection capacity. If lightweight performs clearly better, query
complexity is a significant factor.

**Do not run 5,000 VUs automatically** — if 2,000 VUs saturates, stop there.
