# CLOUDFLARE PERFORMANCE BASELINE — KISSARIYA COSMÉTIQUES

Date: 13/08/2026 — REAL measurements captured BEFORE the Cloudflare (custom-domain) phase.
These are the numbers the WITH-CDN comparison must be measured against. No Cloudflare
production behavior is claimed here.

## 1. Production bundle (real `dist/`, today)

| Class | Raw bytes | Notes |
|---|---|---|
| JS | 1 167 158 (1 139.8 KB) | 33 code-split chunks; index ~161 KB (45 KB gz); largest = sentry chunk 274 KB |
| CSS | 83 941 (82.0 KB) | 1 file, 14.2 KB gzip |
| **Total `dist/assets/`** | **1 251 099 (1 221.8 KB)** | |

These are served by Nginx with `public, max-age=31536000, immutable` (PROVEN in the
Docker phase) → after Cloudflare connect, only the first visitor per edge POP pays
origination; all subsequent hits are edge-served (HIT ratio to be measured).

## 2. Page flow (real browser measurements, `browser-after.json`, 12/08)

| Metric | Cold flow (home→catalog→detail) | Warm session |
|---|---|---|
| REST requests | 13 | 6 |
| REST bytes | 7 899 B | 3 529 B |
| Image requests | 6 | 0 (browser-cached) |
| Image bytes | 327 090 B | 0 |
| REST requests saved vs unoptimized baseline | 37 → 13 (−65%) | 14 → 6 (−57%) |

## 3. Product images (real Storage requests, today)

| Image | Bytes | Cache-Control | cf-cache-status |
|---|---|---|---|
| site banner webp | 19 552 | public, max-age=3600 | HIT |
| product webp (×2 sampled) | 89 478 each | public, max-age=3600 | HIT |
| **avg sampled** | **66 169 B** | | |

## 4. Supabase REST latency under load (real k6, previous round — reference only)

- Global mixed 600 VU: p95 98 ms, 0% errors (SAFE ZONE)
- Global 700 VU: intermittent collapse (8.6 s p95) then healthy re-run (WARNING)
- Isolated SEARCH/DETAIL ~90 ms p95 through 800+ VU in most runs

Note: Cloudflare on our domain does NOT change the `/rest/v1/*` path (never cached,
never proxied) — the Supabase load picture stays as measured.

## 5. What will change after Cloudflare connect (expected, to be measured)

| Item | Expected direction | How verified (post-connect) |
|---|---|---|
| `/assets/*` origin load | ↓ large (edge HITs) | cf-cache-status HIT on repeat requests |
| `index.html` / SPA | no change (no-store) | cf-cache-status absent, cache-control no-store |
| `/admin*` | no change (never cached) | same as above |
| Product images | no change (already HIT at supabase.co) | browser network tab |
| Supabase /rest + /auth | no change | k6-cdn-compare.js at 500–1000 VU |

## 6. Honest status

- **NOT VERIFIED**: any Cloudflare production metric (HIT ratio, edge latency, origin
  request reduction). The domain is not yet behind Cloudflare in this environment.
- **PROVEN**: the origin headers that make caching safe (immutable assets, no-store
  index/admin) and that Storage images are already Cloudflare-HIT.
