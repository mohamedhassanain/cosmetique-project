# Request Optimization Report

Real, measured Supabase request counts for the app-level flows, captured with Playwright
against the running app (scripts in `load-tests/`). All figures are from live captures
(`load-tests/results/browser-before.json`, `browser-after.json`, `browser-round2-after.json`,
`filtered-after.json`).

## 1. Browser flow — home → catalog → product detail

COLD (new browser context per page = fresh visitor, no cache):

| Step      | BEFORE REST | AFTER REST | BEFORE bytes | AFTER bytes |
| --------- | ----------: | ---------: | -----------: | ----------: |
| Home      | 13          | 5          | 4 700        | 2 722       |
| Catalog   | 12          | 4          | 4 360        | 2 495       |
| Detail    | 12          | 4          | 4 784        | 2 682       |
| **Total** | **37**      | **13**     | **13 844**   | **7 899**   |

- **Requests: 37 → 13 (−65%)**
- **Bytes: 13 844 → 7 899 (−43%)**
- Images: 6 requests, 327 090 bytes, both before and after (unchanged).

WARM SPA session (same browser context, in-page navigation, React Query cache):

| Step    | BEFORE REST | AFTER REST |
| ------- | ----------: | ---------: |
| Home    | 13          | 5          |
| Catalog | 1           | 1          |
| Detail  | 0           | 0          |
| **Total** | **14**    | **6**      |

- **Requests: 14 → 6 (−57%)**
- **Bytes: 5 588 → 3 529 (−37%)**

The dominant cause of the cold-flow reduction: the homepage used to issue **9 subcategory
requests** (one per category, N+1). After the fix there is **1** subcategory request
(`fetchAllSubcategories`). That alone removes 8–9 requests per page view.

## 2. Filtered catalog deep-link (`/produits?categorie=soins-visage`)

Live capture AFTER round-2 (`load-tests/results/filtered-after.json`):

| Request | Table          | Why |
| ------- | -------------- | --- |
| 1       | site_settings  | layout (header/footer) |
| 2       | categories     | shared menu/filter cache |
| 3       | subcategories  | shared menu/filter cache (1 request, no N+1) |
| 4       | products       | `category_id=eq.<id>`, `limit=17` probe |

**Total: 4 REST requests, 0 COUNT(*) queries.**

BEFORE round-2 this page made 6 requests because:
- 2 slug → id lookups (categories, subcategories) per page view — now resolved entirely
  client-side from the already-cached categories/subcategories lists.
- 1 `count=exact` on the filtered products query — now replaced by the `limit=17`
  probe (`hasNextPage` detected with zero COUNT aggregate).

**Reduction: 6 → 4 (+33% fewer requests, 0 exact counts).**

## 3. What was removed per page view

| Cost                        | BEFORE                     | AFTER                       |
| --------------------------- | -------------------------- | --------------------------- |
| Subcategory requests        | 9 (1 per category, N+1)    | 1 (all subcategories)       |
| Slug → id lookups (filter)  | 2                          | 0 (client cache)            |
| COUNT(*) exact (catalog)    | 1                          | 0 (`limit+1` probe)         |
| select('*') on public lists | several                    | explicit column lists       |

## 4. Verification

- Cold flow 37 → 13 and warm 14 → 6: **PROVEN BY TEST** (live captures).
- Filtered deep-link 6 → 4: **PROVEN BY TEST** (live capture against round-2 code).
- All captures ran against the real Supabase project (anon key, RLS).
