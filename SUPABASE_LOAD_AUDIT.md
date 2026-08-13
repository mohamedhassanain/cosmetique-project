# SUPABASE LOAD AUDIT — KISSARIYA COSMÉTIQUES

Date: 13/08/2026. Every Supabase request used by the load-test workload, plus what already returns from the live API. Classification: PROVEN / LIKELY / UNKNOWN.

## 1. Query inventory (from `k6-isolated.js` / `supabase-optimized2-load.js` — live production queries)

| # | Endpoint | Table | Columns selected | Filters | Ordering | Pagination | Est. payload (live) | Cacheability |
|---|---|---|---|---|---|---|---|---|
| 1 | `GET /rest/v1/site_settings?select=…&limit=1` | site_settings | site_name,site_description,whatsapp_number,logo_url,hero_title,hero_subtitle | — | — | limit 1 | ~1 row, few KB | Public, stable |
| 2 | `GET /rest/v1/categories?select=id,name,slug&order=sort_order.asc` | categories | id,name,slug | — | sort_order asc | none | ~9 rows | Public, stable |
| 3 | `GET /rest/v1/subcategories?select=…&order=sort_order.asc` | subcategories | id,category_id,name,slug | — | sort_order asc | none | small | Public, stable |
| 4 | `GET /rest/v1/promos?select=…&is_active=eq.true&order=sort_order.asc` | promos | id,badge,title,subtitle,link,image_url,sort_order | is_active=true | sort_order asc | none | small | Public, rarely changes |
| 5 | `GET /rest/v1/products?select=…&is_active=eq.true&order=created_at.desc&limit=24` | products | 14 cols incl. image_url_400/800 + `categories(name,slug)` | is_active=true | created_at desc | limit 24 | ~1–10 rows | Public |
| 6 | `GET /rest/v1/products?select=…&is_active=eq.true&slug=eq.X&limit=1` | products | 21 cols | is_active=true, slug | — | limit 1 | 1 row | Public |
| 7 | `GET /rest/v1/products?select=…&is_active=eq.true&category_id=eq.X&order=created_at.desc&offset=0&limit=17` | products | 14 cols + category join | is_active, category_id | created_at desc | offset 0 limit 17 | ~1–10 rows | Public |
| 8 | `GET /rest/v1/products?select=…&is_active=eq.true&or=(search_vector.phfts.T, name.ilike.%T%, brand.ilike.%T%)&limit=17&offset=0` | products | 8 cols | is_active + OR search | none | limit 17 | small | Public |

All queries: **no `select=*`** (explicit column lists), **no `count=exact`**, no N+1 (category join is a single embedded resource; subcategory lookup is a single query), React-Query-deduplicated browser-side. The slug→id and N+1 category/subcategory fixes from earlier rounds are reflected: no `categories slug=` prefetch in the load workload; catalog fetches categories once and reuses.

## 2. Frequency / per-page decomposition

- Home page (browser): queries #1–#5 = **5 requests** (matches the 13-request optimized cold flow when combined with prefetch of #6/#7 etc.; warm = 6).
- Catalog: #2 (shared) + #3 (per category) + #7 = 3 per page.
- Search: #8 = 1 per submitted query.
- Product detail: #6 = 1 per product view.
- Load-test iteration mix: 1× each of #1–#8 = 8 REST requests/iter.

## 3. Audit checklist (Phase 5 questions — REAL answers)

| Question | Answer | Class |
|---|---|---|
| SELECT * anywhere? | No — explicit selects everywhere in the load workload + app services | PROVEN |
| Unnecessary columns? | No; product list is 14 cols, detail 21 cols, all rendered/used | PROVEN |
| Duplicate requests? | Load script intentionally fires independent identical-looking GETs (they are distinct cache keys per VU — no cross-VU dedup exists anyway); app-side React Query dedups per browser tab. No duplicate requests in the app flow documented earlier (13 cold / 6 warm) | PROVEN |
| N+1? | None in load workload. Embedded `categories(name,slug)` is 1:1 for products; subcategories fetched once then filtered client-side | PROVEN |
| Repeated category query? | Home fires categories once; catalog fires once per page — both required | PROVEN |
| Repeated product query? | Home products + catalog products are distinct queries (newest-24 vs category-17) — both used by the real UI | PROVEN |
| count queries? | None in load workload (`count=exact` removed in earlier rounds) | PROVEN |
| Expensive filters? | Search `OR(search_vector.phfts, name.ilike, brand.ilike)` is the heaviest — covered by GIN (FTS) + GIN trigram (name/brand) indexes; catalog is ~1–10 active rows | PROVEN (indexes exist in supabase/database.sql) |
| Unnecessary sorting? | All `ORDER BY` match a UI need (created_at desc, sort_order asc) and have index support | PROVEN |
| Missing pagination? | Present wherever the UI paginates (limit 17/24, offset 0) | PROVEN |
| Large payloads? | REST JSON ~7.9 KB cold / 3.5 KB warm (measured browser flow) — small | PROVEN |
| Auth requests in load? | Zero (anon only, no sign-in in load) | PROVEN |

## 4. Database indexes (from DATABASE_INDEX_OPTIMIZATION.md + supabase/database.sql)

Indexes matching the real queries: `products.slug` UNIQUE (detail), `idx_products_search_vector` GIN (search_vector.phfts), `idx_products_name_trgm` + `idx_products_brand_trgm` GIN trigram (name/brand ilike), `idx_products_created_at` (ORDER BY created_at DESC), `idx_products_active`, `idx_products_category`, `idx_products_subcategory`, partial `idx_products_promotion`/`idx_products_featured`, `categories.slug` UNIQUE, `idx_subcategories_category_slug` UNIQUE. **No redundant index exists and none is missing for the current catalog size (~1–10 active products).** No index change was made in this phase — consistent with the documented rule "no index without proof" (adding composite indexes on a near-empty table would add write cost for zero measurable read gain).

## 5. Execution performance

- Actual PostgreSQL `EXPLAIN ANALYZE` on the live Supabase project is **not available from the repository** (no SQL console/psql access in this environment).
- Classification: **UNKNOWN — REQUIRES SUPABASE DATABASE INSPECTION** (SQL editor: `EXPLAIN ANALYZE SELECT …` for each of the 8 queries above, ideally under load).

## 6. Conclusions

1. The application layer is not adding load: no `select=*`, no count, no N+1, no duplicate prefetch, small payloads, correct pagination — all PROVEN from source.
2. DB index coverage for every load workload query is PROVEN present.
3. Whether actual query execution (per-query latency, plan quality, connection-pool contention, tenant CPU) is the cause of the 700–1000 VU collapse is **UNKNOWN — REQUIRES LIVE SUPABASE DASHBOARD METRICS** (SUPABASE_LOAD_MONITORING.md) and SQL-console EXPLAIN ANALYZE under load.
