# IMAGE AUDIT

Date: 13/08/2026 — full image pipeline audit for the Docker/CDN phase.

## 1. Storage & URL scheme

- Supabase public bucket: `cosmetics-images`.
- URLs built with `getPublicUrl` → **stable, content-addressed** (`<UUID>.<ext>`), no per-render cache-buster → safe for long-lived caching.
- No Nginx-local images: product images are hosted on Supabase Storage CDN; Nginx serves only the SPA + `public/` assets.

## 2. Upload-time pipeline (admin)

`src/hooks/useImageUpload.tsx`:

| Concern | Status |
|---|---|
| Re-encode | ✅ `browser-image-compression` → **WebP** (`image/webp`) with JPEG fallback (`isWebPSupported`) |
| Variants | ✅ `uploadImageWithVariants` → **1600 / 800 / 400** px; stored as `image_url`, `image_url_800`, `image_url_400` |
| Size cap | ✅ ~300 KB target + 5 MB hard cap (`storage.service.ts`) |
| Web Worker | ✅ compression off the main thread |
| Non-image | ✅ videos bypass compression (admin video path) |
| Orig asset | ⚠️ original high-quality asset is **not** stored separately — the 1600px WebP is the largest stored. Acceptable for this store; documented. |

## 3. Consumption paths (verified in code)

| Surface | src | srcSet | loading | dims |
|---|---|---|---|---|
| Product card | `image_url_400` | `400 1x, 800 2x` (never 1600) | `lazy` + `decoding=async` | 400×400, aspect-square |
| Product detail (LCP) | `image_url_800` | `800 1x, original 2x` | `eager` | 800×800 |
| QuickView | 800 helper | — | lazy | — |
| Cart thumbnail | `image_url_400` | — | — | — |
| Detail thumbs | original list | — | lazy | 64×64 |
| Admin gallery | original | — | — | 96×96 |

CLS: explicit `width`/`height` + `aspect-ratio` everywhere. ✅

## 4. Current formats / dimensions / sizes

- Modern uploads: **WebP** (≈ 1600→400 px, ~300 KB target). Legacy products may hold original uploader format (JPEG/PNG) in `image_url`.
- **Measured real traffic** (Playwright full cold flow home→catalog→detail): **6 image requests / 327 090 B** — unchanged across optimization rounds (`IMAGE_PERFORMANCE_REPORT.md`).
- Catalog is ~0–24 active products → per-flow bytes small today; the win is per-card bytes at scale.

## 5. Local asset audit (`public/`)

| File | Present? | Notes |
|---|---|---|
| `favicon-app.svg` | ✅ | ~small SVG; served with 1h cache + `immutable`-safe (versioned `/favicon-app.svg?v=1`) |
| `robots.txt` | ✅ | |
| `og-image.png` | ✅ **FIXED** | Previously missing (og:image 404 in social previews). Generated 1200×630 brand banner into `public/og-image.png` (13/08/2026). Served with 1h cache; social crawlers now get a valid og:image. |

## 6. WebP / AVIF status

- **WebP: already implemented** (admin uploads) + served by Storage CDN.
- **AVIF: not produced** — `browser-image-compression` cannot encode AVIF. Recommended only as an edge/CDN transform in a later step, NOT forced client-side.

## 7. Cache headers (current vs Docker/Nginx)

| Asset | Before (Netlify/Vercel) | Docker/Nginx |
|---|---|---|
| Hashed `/assets/*-HASH.js/css` | host defaults | `public, max-age=31536000, immutable` (1y) ✅ |
| `index.html` | host defaults | `no-cache, no-store, must-revalidate` ✅ |
| favicon/robots | host defaults | `public, max-age=3600` ✅ |
| Storage product images | Supabase CDN headers | unchanged (CDN-managed) — stable URLs make long cache safe ✅ |

Product image URLs are UUID-keyed → **replacing an image produces a new URL**, so `immutable`-style long caching is safe for them (documented strategy, Step 14 of task).

## 8. Bandwidth estimate

- Cards ~190–240 CSS px: 400px WebP ≈ 15–40 KB vs a 1600px JPEG original ≈ 250–500 KB → **~85–95% reduction** already achieved by the existing srcSet strategy per card.
- Detail ~512–800 CSS px: 800px WebP ≈ 40–90 KB vs 1600 original ≈ 250–500 KB → **~70–85% reduction**.
- AVIF at the CDN would add **~40–60%** further on top (measured in a later step, not applied now).

## 9. Docker phase actions

1. **Fix `og-image.png`** (generate 1200×630 brand OG image into `public/`).
2. Nginx cache headers as in §7 (already in `nginx/default.conf`).
3. Keep Storage CDN for product images; do not proxy them through Nginx.
4. Optional later: AVIF auto-transforms on the CDN edge with WebP fallback (`srcset` already supports multiple candidates).

## 10. Verdict

Pipeline is near-optimal for the current architecture: WebP + 3 responsive variants + srcSet + lazy/eager + fixed dims + stable URLs. Remaining lever = og-image fix + AVIF edge transforms (documented, deferred).
