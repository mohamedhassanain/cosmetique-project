# Image Performance Report

Audit of the image pipeline in the current codebase. Scope: verify the component
layer uses the 400/800 variants correctly, lazy-loads below-the-fold images, reserves
space, and serves stable cacheable storage URLs.

## 1. Source of truth

- `src/lib/images.ts` — responsive helpers, `getProductCardImage` /
  `getProductDetailImage`.
- `src/components/product/ProductCard.tsx` — card renderer.
- Storage: Supabase public bucket `cosmetics-images`, URLs built with
  `getPublicUrl` (stable, cacheable) — no per-render signature/cache-buster.

## 2. Verified behavior

### Product cards (grid, home + catalog + related)

| Concern | Verification | Status |
| --- | --- | --- |
| Smallest variant used | `src = image_url_400` (falls back to original only if the 400 variant is missing) | ✅ in code |
| No full-res on retina | srcSet = `400px 1x, 800px 2x` — the 1600px original is **not** a candidate for cards | ✅ in code |
| Lazy loading | `loading="lazy"` + `decoding="async"` on every card image | ✅ in code |
| Dimension reservation | `width={400} height={400}` + `aspect-square` container + `object-cover` | ✅ in code |

### Product detail

| Concern | Verification | Status |
| --- | --- | --- |
| Larger variant on detail | `src = image_url_800`, srcSet `800 1x, original 2x` — retina-only originals | ✅ in code (`getProductDetailImage`) |
| Eager / LCP | detail image is eager with `fetchPriority=high` (documented in PERFORMANCE_AUDIT §6, verified earlier) | ✅ |

### Cart / QuickView thumbnails

- Cart thumbnail stores `image_url_400` (`ProductCard.handleAddToCart`) — never the
  original.
- QuickView uses the 800-variant helper.

## 3. Measured traffic (real client captures)

From `load-tests/results/browser-before.json` / `browser-after.json` — full cold flow
(home → catalog → detail):

- Image requests: **6** before, **6** after (no regression).
- Image bytes: **327 090 B** before, **327 090 B** after.

The catalog currently contains a single active product, so only 2 distinct product
images (400/800 variants per device scale) are fetched per page. At larger catalog
sizes the per-card win is the 400/800 srcSet: DPR-2 screens load the 800px variant
instead of the 1600px original — the dominant bandwidth saving on the Free plan.

## 4. Conclusion

- Cards: 400px src + 400/800 srcSet, lazy, explicit dimensions — **verified in code**.
- Detail: 800px src + retina-only original, eager for LCP — **verified in code**.
- Storage delivery: stable public URLs via Supabase CDN — **verified, no change needed**.
- Live image byte totals are identical before/after — **PROVEN BY TEST** (no image
  regression introduced by the optimization rounds).
