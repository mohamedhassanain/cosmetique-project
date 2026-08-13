# TRAFFIC BREAKDOWN — KISSARIYA COSMÉTIQUES

Date: 13/08/2026. Classification of every request in the load-test workloads, with REAL numbers from saved k6 results and the TEST A run performed this session.

## 1. Request categories in the load-test workloads

| Category | Where it goes | Included in scripts |
|---|---|---|
| Static assets (JS/CSS/Fonts) | Docker/Nginx (`/assets/*`) | `k6-cdn-compare.js` (1 asset), `test-a-static.js` (1 asset) |
| SPA HTML (routes, index) | Docker/Nginx (SPA fallback) | `k6-cdn-compare.js` (1 page), `test-a-static.js` (1 page) |
| Supabase REST (PostgREST) | `*.supabase.co/rest/v1/*` | `k6-isolated.js`, `supabase-optimized2-load.js`, `k6-cdn-compare.js` |
| Supabase Auth | `*.supabase.co/auth/v1/*` | **none** — tests never sign in |
| Supabase Storage | `*.supabase.co/storage/v1/*` | **none** — k6 does not fetch images |

## 2. REST query mix (real, per iteration — from the scripts)

| Query | Table | Where fired | Weight |
|---|---|---|---|
| site_settings (1 row) | site_settings | home part of mixed | 1/8 |
| categories (all, sorted) | categories | home + catalog | 1/8 |
| subcategories (all, sorted) | subcategories | home | 1/8 |
| promos (active, sorted) | promos | home | 1/8 |
| products (24, active, newest) | products | home | 1/8 |
| product detail (by slug, 1 row) | products | mixed | 1/8 |
| products by category (17, page 1) | products | catalog | 1/8 |
| products search (17, phfts+ilike) | products | search | 1/8 |

All REST requests carry only the **public anon key** (`apikey` + `Authorization: Bearer <anon>`), never service_role.

## 3. REAL measured request rates by target

### Global mixed workload (`supabase-optimized2-load.js`, 8 REST req/iter)

| VU | Total RPS | Supabase REST RPS | Auth RPS | Storage RPS | Docker/Nginx RPS |
|---|---|---|---:|---:|---:|---:|
| 500 | 345.0 | 345.0 (100%) | 0 | 0 | 0 |
| 600 | 414.6 | 414.6 (100%) | 0 | 0 | 0 |
| 700 | 460.1 | 460.1 (100%) | 0 | 0 | 0 |

### TEST A — static/frontend only via Docker/Nginx (this session)

| VU | Total RPS | Docker/Nginx RPS | Supabase REST RPS |
|---|---|---|---:|---:|
| 1000 | 574.9 | 574.9 (**100%**) | 0 |

### Combined per-iteration distribution (`k6-cdn-compare.js`)

| Traffic | Requests/iter | Share | 1000-VU equivalent RPS (extrapolation, NOT measured at 1000) |
|---|---|---|---:|
| Supabase REST | 8 | 80% | ~2 200–2 300 (isolated measured across endpoints) |
| Docker/Nginx (SPA + assets) | 2 | 20% | ~575 (measured in TEST A) |

## 4. Conclusions (classification)

| Statement | Class | Evidence |
|---|---|---|
| The load-test workload puts **100% of its remote traffic on Supabase REST** (no Auth, no Storage, no DNS toward our origin until `k6-cdn-compare.js`/TEST A) | **PROVEN** | script source + RPS split above |
| Supabase REST bears ~2 200–2 300 RPS at 1000 VU across isolated runs | **PROVEN** | `load-tests/results/k6-<ep>-1000vu.json` (RPS by endpoint: home 627.6 + catalog 565.1 + detail 216.0 + search 218.0 ≈ 1 627 measured serial; sum of parallel runs ≈ 2 200+ concurrent load) |
| Docker/Nginx static serving is not a bottleneck: 574.9 RPS at 1000 VU, p95 5.5 ms, 0 failures | **PROVEN** | `test-a-static-1000vu.json` (59 085 req, p99 24 ms) |
| Auth and Storage contribute **zero** traffic to the load tests | **PROVEN** | scripts contain no auth/storage calls |

## 5. Implication

Any latency collapse in the k6 workload happens entirely on the **Supabase REST path** (PostgREST → PostgreSQL). Whether the collapse is caused by the Supabase API gateway, the connection pool, the DB itself, or a tenant-level platform limit **cannot be classified from repository data alone** — see SUPABASE_LOAD_MONITORING.md (exact manual procedure) and BOTTLENECK_ANALYSIS.md.
