# Image Optimization Plan

Date: 13/08/2026 — status: **AUDIT ONLY, next-phase plan**. No deployment/Docker changes made in this task (Docker is the NEXT phase, per scope).

---

## 1. Current state (verified in code)

| Item | Value |
|---|---|
| Storage | Supabase public bucket `cosmetics-images`, `getPublicUrl` stable URLs (no signature/cache-buster) |
| Original variant | `image_url` — uploaded full-size (≤5 MB enforced client-side, `assertValidImage`) |
| Responsive variants | `image_url_400` (card), `image_url_800` (detail) — must be produced at upload/import time |
| Delivery today | Supabase Storage CDN (direct public URL), no image-processing pipeline, no AVIF/WebP conversion |

### Per-surface strategy (already implemented — verified in code)

| Surface | src | srcSet | loading | Dimensions |
|---|---|---|---|---|
| Product card (grid/carousel) | 400px variant | `400 1x, 800 2x` (never the 1600px original) | `lazy` + `decoding=async` | explicit 400×400, `aspect-square` + `object-cover` |
| Product detail (LCP) | 800px variant | `800 1x, original 2x` (retina-only original) | `eager` | explicit 800×800 |
| Cart thumbnail | 400px variant | — | (small, in-memory) | — |
| QuickView | 800px variant | — | lazy | — |
| Thumbnails row (detail) | original `image_url` list | — | lazy | 64×64 |

Measured image traffic (real Playwright capture, full cold flow home→catalog→detail):
**6 image requests / 327 090 B** — unchanged before/after the optimization rounds (see `IMAGE_PERFORMANCE_REPORT.md`). Catalog currently has ~0–24 active products, so the per-flow byte number is small.

## 2. Current formats / sizes / dimensions

- Formats in use today: **uploader format as-is** (JPEG/PNG/WebP whatever the admin uploads), fallback original URL when 400/800 variants are absent.
- Dimensions: originals are stored at full uploaded resolution (target 1600px documented); 400 and 800 variants are expected on every product (admin form stores `image_url_400`, `image_url_800`).
- No AVIF/WebP, no auto-resize/re-encode on Supabase today — the variants are pre-generated at upload time (browser-side compression + explicit variant URLs).

## 3. Gaps (for the Docker/Nginx/CDN phase)

1. **No format conversion.** AVIF/WebP would cut bytes ~50–75% vs JPEG/PNG at equal perceptual quality.
2. **No automatic responsive re-generation.** Variants depend on admin upload discipline; missing variants fall back to the 1600px original (wasted bytes on cards).
3. **No CDN cache headers on images.** Supabase Storage CDN serves them, but there is no explicit `Cache-Control: public, max-age=…, immutable` strategy in front; today's stability of URLs makes long-lived caching safe.
4. **No `fetchpriority` attribute** on the detail LCP image (audit gap, `ProduitDetail.tsx`) — browsers already prioritize large eager hero images, but we should set it explicitly in the next phase.
5. **No srcset/sizes tuning for oversized catalog growth.** The card `sizes` are tuned for 190–240px cards; correct for the current grid.

## 4. Realistic bandwidth savings estimate

Assumptions (typical cosmetics e-commerce images, JPEG baseline):
- Original 1600px JPEG ≈ 250–500 KB. Resized 800px ≈ 90–160 KB (≈ −65%). 400px ≈ 25–50 KB (≈ −85%).
- WebP: −25–35% vs JPEG; AVIF: −40–60% vs JPEG at same quality.

| Change | Impact on card bytes | Impact on detail bytes |
|---|---|---|
| 400/800 variants already used | −65…85% vs original | −35…65% vs original |
| + WebP/AVIF (Nginx `image_filter` or CDN transformation) | additional −25…60% | additional −25…60% |
| + long-lived `Cache-Control: immutable` | repeat-view bytes → 0 (local cache) | same |

Projected combined saving vs today's original-serving baseline: **roughly 60–90% bandwidth on images** once variant generation + AVIF/WebP + immutable caching are in place. Exact numbers require a payload benchmark in the next phase (measured, not assumed).

## 5. Recommended next-phase implementation (Docker/Nginx/CDN)

Order of work (next phase — NOT implemented in this task):

1. **Nginx container as the image/static edge** in front of the SPA + a reverse proxy for Supabase REST public reads (this is also where the shared-cache decision lands; see `FINAL_REMAINING_PERFORMANCE_AUDIT.md` §1.1).
2. **Responsive pipeline**:
   - Option A (zero-backend): generate WebP/AVIF + 400/800/1200 variants at **admin upload time** in the browser (extend the existing upload flow: compress → produce variants → upload 3 files). Keeps frontend-only architecture.
   - Option B (Nginx `image_filter` / imgproxy sidecar): on-the-fly resize+convert with CDN caching. Requires the Docker phase.
3. **CDN headers**:
   - `Cache-Control: public, max-age=31536000, immutable` for `/images/...` (stable URLs, content-addressed by UUID).
   - `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` for the app shell and prerendered product pages.
   - Keep `no-store` on anything private/admin; auth responses stay uncached.
4. **LCP**: set `fetchPriority="high"` on the detail primary image; preload the LCP image via `<link rel="preload" as="image">` on the prerendered product pages.
5. **Serving plan**:
   - Card grid → AVIF (320/640) with WebP fallback, `sizes` per breakpoint.
   - Detail hero → AVIF (800/1600) with WebP fallback, retina srcset.
   - Cart/QuickView → 400px AVIF/WebP.
   - `loading=lazy` stays for all non-LCP; explicit dimensions stay for CLS prevention.
6. **Measurement gate (enforced)**: before/after byte benchmark per surface (card/detail/cart) + k6 image-request mix; stop if a change regresses.

## 6. Risks / no-go

- Do **not** cache admin/storage writes; do **not** put auth/orders/cart behind the image CDN.
- Do **not** convert images on the edge without a fallback (accept header) — keep WebP fallback for older clients.
- Do **not** drop the 400/800 variant discipline in admin uploads: the fallback to the 1600px original is the largest remaining waste.
- Stale `Cache-Control: immutable` on a changed image URL would serve old bytes — mitigated by immutable filenames (UUID) so a new image = new URL.

## 7. Conclusion

Image delivery is already well-optimized at the component level (verified). The remaining lever is the **next-phase** Nginx+CDN transformation/caching layer, which is also where a safe shared cache becomes possible — see `IMAGE_OPTIMIZATION_PLAN` interplay with `FINAL_REMAINING_PERFORMANCE_AUDIT.md`. Estimated additional byte savings 60–90% on images, pending measured validation in the Docker phase.
