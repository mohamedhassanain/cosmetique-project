# CLOUDFLARE AUDIT

Date: 13/08/2026 — audit performed BEFORE any Cloudflare-specific configuration change.

## 1. Architecture (current, verified in code)

```
Users → Netlify/Vercel (current static hosts) OR Docker/Nginx (new, committed)
        → React 18 + Vite 5 SPA (code-split) + React Query 5 (browser-local cache)
        → Supabase (anon key only)
              ├── Auth (supabase-js, admin accounts)
              ├── PostgREST (RLS-filtered reads)
              └── Storage (public bucket cosmetics-images — WebP 400/800/1600)
```

- Supabase client: `src/integrations/supabase/client.ts` — anon key only, `persistSession`, `autoRefreshToken`. No service_role anywhere (verified in earlier rounds and in this audit).
- Auth: `AuthProvider` → `supabase.auth.onAuthStateChange` + `getSession`; admin flag from RLS `public.is_admin()` — NOT a client-side claim.
- Routes: public `/`, `/produits`, `/produit/:slug`; auth `/admin/login`, `/auth`; admin `/admin*` all behind `RequireAdmin`.
- Docker/Nginx (committed 13/08/2026): SPA fallback, `immutable` hashed assets, `no-store` index, CSP + security headers on every response, no proxy, no caching of any Supabase traffic.

## 2. Existing cache state (all PROVEN this audit)

| Asset class | Where served | Headers (measured) | Verdict |
|---|---|---|---|
| Hashed `/assets/*-HASH.js/css` | Nginx (Docker) | `public, max-age=31536000, immutable` | ✅ correct |
| `index.html` + SPA routes | Nginx (Docker) | `no-cache, no-store, must-revalidate` | ✅ correct |
| `favicon`, `robots`, `og-image` | Nginx (Docker) | `public, max-age=3600` | ✅ correct |
| Product images (Storage) | `*.supabase.co/storage/v1/...` | **Measured today:** `cache=public, max-age=3600`, ETag present, **`cf-cache-status: HIT`** | ✅ already on Cloudflare's edge (Supabase-side), UUID-keyed URLs |
| PostgREST `/rest/v1/*` | `*.supabase.co/rest/v1/*` | No Cache-Control from Supabase | ⚠️ NOT cacheable via HTTP headers today |

### Measured storage images (real requests today)

| URL path | Type | Bytes | Headers |
|---|---|---|---|
| `/storage/.../site/b90c83e4-….webp` (site banner) | image/webp | 19 552 | max-age=3600, cf HIT, ETag |
| `/storage/.../products/6385f7fa-….webp` | image/webp | 89 478 | max-age=3600, cf HIT, ETag |
| `/storage/.../products/ad46e320-….webp` | image/webp | 89 478 | max-age=3600, cf HIT, ETag |
| **Total / avg (3)** | | **198 508 / 66 169** | |

### Measured production bundle (real `dist/`, today)

| Class | Total raw bytes | Notes |
|---|---|---|
| JS (33 chunks) | 1 167 158 (1 139.8 KB) | code-split; main index ~161 KB (45 KB gz), largest=sentry chunk 274 KB |
| CSS | 83 941 (82.0 KB) | 14.2 KB gzip |
| **Total `dist/assets/`** | **1 251 099 (1 221.8 KB)** | |

### Measured representative page flow (Playwright, 12/08, in `browser-after.json`)

- Cold home→catalog→detail: **13 REST / 7 899 B** + **6 images / 327 090 B**
- Warm session: **6 REST / 3 529 B**, 0 new images (browser-cached)

## 3. Classified findings

### PROVEN
1. Supabase Storage images are already served through Cloudflare's CDN and are cache HITs (`cf-cache-status: HIT` measured today). No action needed for origin offload of product images at the Cloudflare level — they never touch our origin.
2. UUID-keyed Storage URLs are immutable (re-upload creates a new UUID) → safe for long `immutable` caching. Current `max-age=3600` is conservative but safe.
3. Nginx already emits immutable/no-store/cache headers correctly (verified in Docker phase).
4. React Query cache is browser-local (`query-client.ts` stale 5m / gc 10m) — NOT shared between users.
5. PostgREST `/rest/v1/*` responses carry no `Cache-Control` — verified by design (Supabase Free plan) — so no HTTP-level caching is possible today without a proxy/edge layer.
6. **`docs/deployment.md` contains an UNSAFE recommendation**: "Cache Rule: URI path starts with /rest/v1/products, 5 minutes edge TTL". This MUST NOT be applied:
   - `/rest/v1/products` returns **different data depending on the JWT** (anon sees public rows; an admin's browser sees admin-filtered rows via RLS with the same URL). Cloudflare caches by URL; caching this route can **serve admin-filtered/private data to anon users** and leak backend state.
   - Even for pure anon traffic, products are money-critical (prices/promos/availability) with **no purge channel**; a 5-minute stale window is unacceptable without invalidation.
   → This exact rule is to be **removed/corrected** in the Cloudflare deployment docs.
7. Auth (supabase-js → `supabase.co/auth/v1`) is entirely client-to-Supabase. Nginx/Docker does not proxy it, so private responses never traverse our cache layer. Only Cloudflare itself sits in front of the user's browser → auth requests are TLS passthrough, never cached (Cloudflare does not cache HTML/JSON POST and we will explicitly bypass-cache `/auth/*`).

### LIKELY
8. The custom domain is **not yet connected to Cloudflare** for the Docker/Nginx origin (no evidence of an A/AAAA/CNAME to the origin; the `cf-cache-status: HIT` observed is on the supabase.co domain, which is Cloudflare-managed by Supabase, not by us). Assumption: production deployment behind Cloudflare is the upcoming step.
9. Cloudflare Image Transformations would further reduce bytes (estimate 40–60% on top of WebP, prior-round estimate) — to be **measured** when the domain is behind Cloudflare; NOT applied now.

### UNKNOWN
10. CDN HIT/MISS ratio for our origin — not measurable until the domain is behind Cloudflare. Explicitly NOT claimed.
11. Real per-country edge latency — depends on the chosen Cloudflare plan/pop coverage; NOT measured.
12. Cloudflare account/zone credentials — not available in this environment → **configuration will be PREPARED as exact manual steps, not applied**.

## 4. What this phase will deliver (safe subset)

1. `CLOUDFLARE_AUDIT.md` (this file).
2. `IMAGE_CDN_REPORT.md` — measured image bandwidth + WebP-vs-original math + CDN strategy.
3. `CLOUDFLARE_CACHE_RULES.md` — exact Cloudflare cache rules (manual setup): cache JS/CSS/static images; NEVER cache `/rest/v1/*`, `/auth/*`, admin routes, or any `Authorization`-carrying request.
4. `CLOUDFLARE_DEPLOYMENT.md` — DNS/SSL/origin setup + security verification.
5. Correction of the unsafe `/rest/v1/products` cache recommendation in `docs/deployment.md`.
6. `CLOUDFLARE_PERFORMANCE_BASELINE.md` — real measurements (this audit's table above).
7. k6 CDN-comparison test (READ-ONLY, anon, same workload, parameterized origin) for future WITHOUT-CDN vs WITH-CDN runs.
8. Local Docker/Nginx re-verification (Phase 14).
9. `CLOUDFLARE_FINAL_REPORT.md`.

NO application-logic change is required: the frontend already uses responsive srcSet/lazy images, Nginx already emits the correct headers, and images are already Cloudflare-cached at the Storage layer.
