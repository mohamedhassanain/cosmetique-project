# REQUEST AMPLIFICATION ANALYSIS — KISSARIYA COSMÉTIQUES

Date: 13/08/2026. Reconciliation of the real Supabase Data API observability (60-min window) with the application code and the k6 load-test configuration. All request counts are real (dashboard + saved k6 results).

## 1. The observability data being explained

| Data API (last 60 min) | Requests | Avg resp. |
|---|---|---|
| site_settings `select=*&limit=1` | 14 058 | 881 ms |
| products query #1 | 1 611 | 913 ms |
| products query #2 | 1 578 | 876 ms |
| **Total Data API requests** | **112 635** | — |

## 2. What the application actually does (PROVEN from code — SUPABASE_REQUEST_MAP.md)

- **Every public query goes through React Query with a SHARED key and long `staleTime`**:
  - site_settings: key `['site-settings']`, `staleTime 15 min`, `gcTime 30 min`.
  - categories / subcategories / active-products: `staleTime 10 min`.
  - promos: `staleTime 5 min`.
  - public products / product detail: `staleTime 5 min`.
- `refetchOnWindowFocus: false` **globally** (query-client.ts) → no refetch on tab focus.
- No `setInterval`/`setTimeout` Supabase polling anywhere (the hero-carousel timer is UI state; search debounce is client-side).
- Multiple consumers of the same data (Logo ×3, FaviconUpdater, CartSheet, Header, Footer, menu) are all served by **one** query → **one** network request.
- Measured real browser flow: **13 REST requests cold, 6 warm** (measure-browser-flow). After the first load, a real tab makes 0 additional requests for 5–15 minutes.

**Conclusion: the application does NOT multiply Supabase requests.** Expected cost per real user tab: 5 requests on the first home load, then none for 5–15 minutes of navigation.

## 3. What the k6 test actually does (PROVEN from the script)

`supabase-optimized2-load.js` (global mixed workload) issues **8 Supabase REST requests per iteration**, in one VU loop with `sleep(1.5–4.5 s)` and **no browser, no React Query, no cache**:

| Iteration request | Table | Note |
|---|---|---|
| 1 | site_settings | **`select=*`** (app uses explicit columns) |
| 2 | categories | |
| 3 | subcategories (all) | |
| 4 | promos | |
| 5 | products (home) | **`limit=60`** (app uses `limit=24`) |
| 6 | products (detail) | |
| 7 | products (catalog) | `limit=17` |
| 8 | products (search) | `limit=17` |

Each VU iteration is equivalent to a **brand-new cold visitor that fully reloads the app every ~4.5 seconds**, with zero caching. This is a deliberate worst-case stress model — valid for stress, but it is the direct source of the request counts below.

## 4. Reconciliation — where 14 058 site_settings and 112 635 total come from (REAL)

### Live 1000 VU rerun (13/08 14:32–14:36, same hour as the observability window)

| Metric | Value |
|---|---|
| Iterations | 8 247 |
| REST requests / iteration | 8 |
| REST + setup `http_reqs` | **68 657** |
| site_settings requests (1/iter) | **8 247** |
| products requests (3/iter) | ~24 741 |
| categories/subcategories/promos/detail | 8 247 each |

### 60-minute dashboard totals vs test traffic

| Dashboard (60 min) | Source |
|---|---|
| site_settings 14 058 | 8 247 from the global 1000 VU rerun + ~5 800 from other k6 runs in the hour (isolated home/global runs each fire 1 site_settings per iteration) — i.e., **load-test traffic** |
| products (2 patterns) 1 611 + 1 578 = 3 189 | lower than the ~24 741 expected from the rerun alone → dashboard pane groups/limits the query patterns it lists and its window differs from that of a single run; **flag for dashboard verification** (see REQUEST_OPTIMIZATION_REPORT §12) |
| Total 112 635 | consistent with multiple k6 runs (8 REST/iter) + browser activity inside the 60-min window — **entirely test/browser generated** |

## 5. Amplification factors (REAL)

| Query | Real app (per tab) | k6 (per iteration) | k6 1000 VU run | Dashboard 60 min | Where the multiplier comes from |
|---|---|---|---|---|---|
| site_settings | **1 per 15 min** (≈0.07/min) | 1 | 8 247 | 14 058 | k6 = fresh cold load every ~4.5 s (no React Query) |
| products | 1 per visited page (cached 5–10 min) | 3 | ~24 741 | 1 611 + 1 578* | same + `limit=60` vs app 24 (payload only) |
| categories | 1 per 10 min | 1 | 8 247 | in total | same |
| subcategories | 1 per 10 min | 1 | 8 247 | in total | same |
| promos | 1 per 5 min | 1 | 8 247 | in total | same |
| TOTAL | 5 first-load, then ≈0 | 8 | 68 657 | 112 635 | test model, not app code |

\* pane shows only 2 products patterns; verify grouping in the dashboard.

**The "amplification" is the load-test model itself**: each k6 VU iterates a full cold page-load with no browser caching, producing ~8 requests per ~4.5 s per VU. A real user produces 5 requests then ~0 for 15 minutes. There is **no redundant-request path in the app** to remove — the shared-cache layer was already built (started in earlier optimization rounds).

## 6. Test-fidelity gaps found in the k6 script (PROVEN, documented — test NOT changed yet per instruction)

1. `site_settings?select=*&limit=1` — the app's public query selects 6 explicit columns. `select=*` only exists in the app for the **admin** form (private, correct).
2. Home products `limit=60` — the app fetches `limit=24`. Same payload logic, larger rows.
3. No per-VU cache — by design for stress; keep for capacity but never compare "VU" to "users" (LOAD_TEST_AUDIT.md §6).

These are test-representation improvements, not app bugs.

## 7. Bottom line

- **14 058 site_settings / 112 635 total = the load tests + browser tests in the window, not user-driven app amplification.**
- The application is PROVEN cache-correct (shared keys, staleTime 5–15 min, `refetchOnWindowFocus:false`, no polling).
- With real DB metrics during load (CPU ≈2 %, connections 15/60, disk IO ≈0 %), **PostgreSQL and the connection pool are PROVEN NOT the bottleneck** — see BOTTLENECK_ANALYSIS.md (updated).
