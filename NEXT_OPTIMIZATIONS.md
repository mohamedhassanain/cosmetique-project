# Next Optimizations

Identified during the final stress test (2026-08-12). NOT implemented — measurement only.

## 1. Persistent cache / high-request-rate pages

- **Problem**: Home pages (settings, categories, all subcategories, promos, 60 recent products) repeat identical reads per VU. Under 1000-VU sustained load the project saturates (p95 8–32 s, req/s collapses 54–70%).
- **Evidence**: 1000 VU run 1: 151 req/s, p95 32 168 ms, 1 timeout. Run 2: 237 req/s, p95 8 364 ms, p99 35 690 ms, 36 timeouts. Historic validated run: ~513 req/s, p95 622 ms.
- **Expected impact**: A shared cache in front of PostgREST for identical public GETs (home settings/categories/subcategories/promos) would cut most backend reads; fewer requests = less saturation risk.
- **Priority**: HIGH (only if we can add a cache layer without violating the current frontend-only constraint).

## 2. Supabase Free plan compute/connection limits

- **Problem**: The project saturates at 1000 VU despite lightweight queries (no count=exact, narrow selects, limit 17).
- **Evidence**: Same script previously validated at ~513 req/s p95 622 ms; two fresh identical runs both degrade to 151–237 req/s with multi-second p95. This is consistent with platform-side saturation (connections/compute/API), not query payload.
- **Expected impact**: Unknown until proven — requires a controlled test on a paid tier or platform metrics.
- **Priority**: HIGH (needs project-side data; cannot be fixed from the frontend).

## 3. Reduce unique query shapes

- **Problem**: Search uses `or=(search_vector.phfts.creme,name.ilike.%25creme%25,brand.ilike.%25creme%25)` — three OR branches across different index types per request.
- **Evidence**: Search requests time out at 60 s during the 1000-VU runs.
- **Expected impact**: A single GIN index on `search_vector` + a narrower query pattern would reduce per-query cost.
- **Priority**: MEDIUM.

## 4. Re-verify below true saturation threshold

- **Problem**: We do not know the exact VU level where saturation begins (we only tested 1000 VU, twice).
- **Evidence**: 100 VU / 500 VU historic runs were healthy; 1000 VU today is not.
- **Expected impact**: A 600–900 VU sweep would locate the knee. Only useful if platform capacity changed; requires Supabase dashboard metrics to confirm.
- **Priority**: MEDIUM.

## Not recommended

- Adding Redis/Docker/load balancer/backend — outside the allowed architecture for now.
- Raising page size (limit 17 is already a good balance).
- Aggressive retries (would multiply traffic during saturation).
