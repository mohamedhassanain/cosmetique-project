# DOCKER FINAL REPORT

Date: 13/08/2026 — result of implementing the Docker + Nginx production frontend phase.

## 1. What was delivered

| Deliverable | Path | Status |
|---|---|---|
| Docker audit | `DOCKER_AUDIT.md` | ✅ |
| Env/secret security audit | `ENV_SECURITY_REPORT.md` | ✅ |
| Multi-stage Dockerfile | `Dockerfile` | ✅ |
| .dockerignore (excludes `.env`, node_modules, tests, load-tests, postman) | `.dockerignore` | ✅ |
| Nginx config (SPA fallback, cache, gzip, security headers) | `nginx/default.conf` | ✅ |
| Shared security headers incl. CSP | `nginx/security-headers.inc` | ✅ |
| docker-compose (single web service, build args from `.env`) | `docker-compose.yml` | ✅ |
| Image pipeline audit | `IMAGE_AUDIT.md` | ✅ |
| OG image fixed (was 404) | `public/og-image.png` | ✅ |
| Deployment guide | `DOCKER_DEPLOYMENT.md` | ✅ |

## 2. Build

```
my-ecommerce-frontend:latest  size=75MB
nginx 1.27.5  ·  node:22-alpine build stage
dist served: 1.0M inside the image (gzip-split JS/CSS)
```

- Two-stage build: `node:22-alpine` (npm ci + vite build) → `nginx:1.27-alpine`.
- `npm ci` inside Linux required regenerating `package-lock.json` with npm
  10.x on `node:22-alpine` (the committed lock was generated with npm 11 on
  Windows and omitted the `esbuild@0.28.2` platform packages). Lock now
  contains all optional platform deps; `npm ci` passes in the build env.
- Required build args are only the public `VITE_*` values; the image
  **fails fast** if the two Supabase values are missing.
- Docker lint: 1 remaining warning — `ARG VITE_SUPABASE_PUBLISHABLE_KEY`
  flagged by SecretScanner. **False positive**: this is the public anon key,
  shipped in every web bundle by design (see ENV_SECURITY_REPORT.md §1).

## 3. Runtime verification (all measured)

Routes:
```
200 /                    (index.html)
200 /produits            (SPA fallback)
200 /produit/demo        (SPA fallback)
200 /admin               (SPA fallback)
200 /admin/login         (SPA fallback)
200 /favicon-app.svg
200 /robots.txt
404 /assets/definitely-missing-012345.js   (no SPA fallback for /assets/*)
403 /.env                (dotfiles denied)
```

Cache-Control (verified from the running container):
```
/assets/*-HASH.js|css   → public, max-age=31536000, immutable
/index.html + SPA pages → no-cache, no-store, must-revalidate
/favicon-app.svg, /robots.txt → public, max-age=3600
```

Security headers (present on EVERY response, verified):
```
Content-Security-Policy   ✅  (self + enumerated external origins)
X-Content-Type-Options    ✅  nosniff
X-Frame-Options           ✅  SAMEORIGIN
Referrer-Policy           ✅  strict-origin-when-cross-origin
Permissions-Policy        ✅  geolocation=(self), camera=(), microphone=()
```

## 4. Browser verification

- Homepage renders fully (hero, nav, promo card) — 0 CSP violations.
- Direct load of `/produits` (SPA fallback path) renders the catalog — 0 CSP violations.

## 5. Security

| Check | Result |
|---|---|
| `.env*` inside image | ✅ NONE (`find /` → empty) |
| `service_role` string in served bundle | ✅ NONE |
| Image size | ✅ 75 MB |
| Secrets in image layers | ✅ none (only public VITE_* baked like any static deploy) |
| RLS / auth | ✅ untouched — browser talks to Supabase directly; Nginx proxies nothing |

## 6. Regression on the app (unchanged code + new lockfile)

| Check | Result |
|---|---|
| `npm run build` | ✅ 2193 modules, 5.61s |
| `npx tsc --noEmit` | ✅ no errors |
| `npm run lint` | ✅ clean |
| `npx vitest run` | ✅ 12 files / 78 tests passed |

## 7. Bugs found & fixed during this phase

1. **Stale package-lock.json** broke `npm ci` in the Linux build (missing
   esbuild@0.28.2 platform packages). Fixed by regenerating the lock inside
   `node:22-alpine` (npm 10.x) — the same environment as the build.
2. **CSP/security headers absent in responses** — Nginx drops server-level
   `add_header` in any location that declares its own `add_header`. Fixed by
   extracting headers to `nginx/security-headers.inc` and including it in
   every location (also server-level).
3. **Duplicate MIME warning** (`text/html` already gzipped by default).
   Fixed by removing `text/html` from `gzip_types`.
4. **`og-image.png` 404** (social previews broken). Generated the 1200×630
   brand banner into `public/og-image.png`.
5. **Docker `ENV` layer lint warning** — replaced with per-command shell env
   for the build step (same result, no ENV layer).

## 8. Next step (NOT part of this task)

Expose the container behind TLS + a CDN (recommended: Cloudflare):

1. Deploy the image to a VPS/registry.
2. Put Cloudflare in front: TLS termination, cache `/assets/*` long,
   `/` and `/produits*` short, `/admin*` never cached.
3. Optionally enable automatic **AVIF/WebP transforms** for `image_url_*`
   (srcset already declares multiple candidates) — separate step, measured
   before enabling.
4. CI/CD: `docker build -t kissariya-web:$GIT_SHA` → push → deploy by tag.

Everything is documented in `DOCKER_DEPLOYMENT.md`.
