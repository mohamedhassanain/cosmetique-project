# IMAGE CDN REPORT

Date: 13/08/2026 — measured image delivery state + Cloudflare CDN strategy.

## 1. Current pipeline (verified in code — unchanged, preserved)

```
Admin upload (browser) → browser-image-compression →
  WebP (fallback JPEG) at 1600 / 800 / 400 px
  → Supabase Storage (public bucket cosmetics-images, UUID-keyed)
  → Browser fetches via responsive srcSet
```

- `useImageUpload.tsx`: WebP encode + 3 variants stored as `image_url` (1600), `image_url_800`, `image_url_400`.
- `lib/images.ts`: card → `image_url_400` + srcSet 400/800 (never 1600); detail → `image_url_800` + srcSet 800/original (retina only); explicit `sizes`; lazy on cards; eager on detail hero.
- Storage URLs are UUID-keyed → **immutable** (replacing an image produces a new URL).

## 2. Real measured image bytes (13/08/2026)

Direct HEAD/GET on the actual public Storage URLs (real project):

| URL path | Format | Bytes | Cache-Control | cf-cache-status |
|---|---|---|---|---|
| `/storage/.../site/b90c83e4-….webp` (banner) | webp | 19 552 | public, max-age=3600 | **HIT** |
| `/storage/.../products/6385f7fa-….webp` | webp | 89 478 | public, max-age=3600 | **HIT** |
| `/storage/.../products/ad46e320-….webp` | webp | 89 478 | public, max-age=3600 | **HIT** |
| **Total / avg (3 unique)** | | **198 508 B / 66 169 B** | | |

Representative page flow (Playwright cold route home→catalog→detail, `browser-after.json`):

| Metric | Measured |
|---|---|
| Image requests (cold flow) | 6 |
| Image bytes (cold flow) | 327 090 B |
| Math check (3× banner + 2× product A + 1× product B = 3×19 552 + 3×89 478) | 327 090 B ✅ consistent |

## 3. Current formats / variants / sizes

| Item | Status |
|---|---|
| Format | WebP (upload-time); JPEG fallback only for non-supporting browsers at upload |
| Variants generated on upload | 1600 / 800 / 400 px |
| Variants used by UI | card: 400 (+800 2x); detail: 800 (+original 2x retina); cart: 400 |
| Largest stored (original) | 1600 px WebP |
| Legacy products without variants | fall back to `image_url` in `<img>` (no srcSet) — measured 89 478 B product image in the flow |

## 4. WebP savings vs originals

- Originals (pre-WebP) are **not stored** — `useImageUpload` replaces the uploaded format with WebP at upload time. A same-pixel-dimension JPEG original is therefore **not measurable** on this project.
- Prior-round estimate (documented, LIKELY not re-measurable without a JPEG control): ~85–95% smaller than a typical 1600 px JPEG at card sizes. Do not treat as PROVEN.
- PROVEN substitute: a 400/800-variant product serves ≤89 478 B for an 1600-capable image; the 400 px card variant is ~15–40 KB when present (designed target, pending per-variant HTTP measurement once the catalog has variant-enabled products).

## 5. Cloudflare position today (PROVEN)

- Supabase Storage is served through Cloudflare's CDN on the `supabase.co` domain: **all three sampled public images returned `cf-cache-status: HIT`**.
- These image requests **never touch our Docker/Nginx origin** — origin offload for product images is already 100% at the CDN layer.
- `Cache-Control: public, max-age=3600` already allows browser + shared caching; UUID-keyed URLs make extending to `immutable` safe.

## 6. CDN strategy (recommended, PREPARED — not applied)

### A. Product images (already Cloudflare-cached via Supabase)
- No change required at our origin. Optional: raise Storage cache TTL beyond 3600 (Supabase-side `cacheControl` on upload) since URLs are immutable. Safe, deferred to the deployment step.

### B. Our static assets (Docker/Nginx origin, when domain is behind Cloudflare)
- `/assets/*-HASH.js|css` → origin already emits `public, max-age=31536000, immutable` → Cloudflare rule: **cache everything, respect origin TTL** (or longer).
- `index.html` + SPA routes → origin emits `no-store` → Cloudflare rule: **respect origin** (do not override). Never set a long TTL on `/`.

### C. NEVER cached (safety-critical)
- `/rest/v1/*` (Supabase PostgREST) — see CLOUDFLARE_AUDIT.md PROVEN #6. No Cloudflare cache rule may touch it, because responses are JWT-dependent (RLS) and money-critical without a purge channel.
- `/auth/v1/*` (Supabase Auth) — POST + user-specific; bypass cache.
- Admin pages `/admin*` — bypass cache.
- Any request carrying `Authorization` header — bypass cache.

## 7. Cloudflare Image Transformations (Phase 10 verdict)

| Option | Verdict |
|---|---|
| A. Keep Supabase Storage WebP variants | ✅ Recommended now. Already CDN-cached, already responsive, zero extra cost/complexity, no origin involvement. |
| B. Cloudflare Images (transform at edge) | 🔶 PREPARED only. Could add AVIF compression (~40–60% further, prior estimate) but requires enabling Cloudflare Image Resizing + serving via `cf-image` URL or worker — **not enabled/unmeasured** until the domain is behind Cloudflare. Benchmark A vs B there with same-image byte comparisons before switching. |

## 8. Expected effect (honest)

- Product images: **no change** — already CDN HIT at Supabase.
- JS/CSS: origin Nginx headers already immutable; when proxied through Cloudflare, subsequent visits fetch from the edge — HIT ratio to be measured post-connect (UNKNOWN today).
- The previous "with/without CDN" k6 comparison must measure the **origin** path (our Nginx) served through Cloudflare vs direct — prepared as `k6-cdn-compare.js` (Phase 16) and run after connection.
