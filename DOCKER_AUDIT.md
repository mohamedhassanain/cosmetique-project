# DOCKER AUDIT

Date: 13/08/2026 — audit performed BEFORE any Docker/Nginx change.

## 1. Stack versions (verified)

| Component | Version | Source |
|---|---|---|
| Node (local) | v24.18.0 | `node --version` |
| npm | 11.16.0 | `npm --version` |
| React | ^18.3.1 | `package.json` |
| Vite | ^5.4.19 (built with 5.4.21) | `package.json` |
| TypeScript | ^5.8.3 | `package.json` |
| React Router | ^7.18.2 (BrowserRouter) | `src/App.tsx` |
| TanStack React Query | ^5.83.0 | `package.json` |
| Supabase JS | ^2.89.0 | `package.json` |
| Docker | 29.5.3 | `docker --version` |
| Docker Compose | v5.1.4 | `docker compose version` |

Build chain: `@vitejs/plugin-react-swc` (SWC, fast transform), manualChunks code-splitting, output `dist/`.

## 2. Build command & output directory

- Script: `npm run build` → `vite build`
- Output: `dist/` (verified: `dist/index.html`, `dist/assets/*-HASH.js|css`, plus `dist/prerendered/` when `npm run prerender` runs)
- No `npm run dev` used in any production path.

## 3. Routing strategy (verified in `src/App.tsx`)

`BrowserRouter` + `<Routes>`:

- `/` — Home (Index)
- `/produits` — catalog (Produits)
- `/produit/:slug` — product detail
- `/admin/login`, `/auth` — admin login
- `/admin`, `/admin/produits`, `/admin/produits/nouveau`, `/admin/produits/:id`, `/admin/categories`, `/admin/commandes`, `/admin/parametres`, `/admin/publicites` — admin (all wrapped in `RequireAdmin`)
- `/acces-refuse`, `*` (NotFound)

⇒ SPA fallback `try_files $uri $uri/ /index.html;` is REQUIRED for direct refresh on `/produits`, `/produit/:slug`, `/admin`, etc. Prerendered SEO pages live at `dist/prerendered/produit/[slug]/index.html` and are served naturally by `try_files $uri` before the fallback (exact files exist on disk).

## 4. Required environment variables (verified keys ONLY — values never printed)

From root `.env` (browser-safe public configuration, all VITE_*):

| Key | Required at build | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | YES | PostgREST/Auth/Storage base URL, baked into bundle |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | YES | anon/publishable key (public by design), baked into bundle |
| `VITE_SUPABASE_PROJECT_ID` | NO | optional (supabase project ref) |
| `VITE_SENTRY_DSN` | NO | optional; `initSentry()` no-ops without it |
| `VITE_SENTRY_ENVIRONMENT` | NO | optional; defaults to `import.meta.env.MODE` |

These are the same values the current Netlify/Vercel builds use. None are secrets.

## 5. Existing Docker / Nginx state

- No `Dockerfile`, no `docker-compose.yml`, no `nginx/` directory, no `.dockerignore`. All will be created.
- Current deployment: Netlify/Vercel static hosting (SPA + prerendered product SEO pages). This phase adds the Docker+Nginx deployment path in parallel as the production-ready option.

## 6. Auth / Admin / RLS invariants (must not change)

- Auth: Supabase Auth only (admin accounts created manually in dashboard). No `/signup` in the app. Verified `src/providers/auth-provider.tsx` path.
- Admin guard: `RequireAdmin` → `useAuth()` (`isAdmin = user logged in`), backed by RLS `public.is_admin()` in `supabase/database.sql`.
- Nginx will **never** proxy or cache `/auth/v1/*`, authenticated requests, orders, admin data, or Storage writes. Browser continues talking to Supabase directly exactly as today.

## 7. Image pipeline audit (summary — full detail in IMAGE_AUDIT.md)

- Upload-time conversion ALREADY in place: `src/hooks/useImageUpload.tsx` uses `browser-image-compression` → WebP (fallback JPEG), and `uploadImageWithVariants` generates 1600/800/400 variants (stores `image_url`, `image_url_800`, `image_url_400`).
- Consumption paths already optimal: cards 400px + 400/800 srcSet (never 1600), detail 800px + retina original, lazy + explicit dims (see `IMAGE_PERFORMANCE_REPORT.md`).
- AVIF: NOT produced client-side (browser-image-compression does not encode AVIF). Documented as a measured recommendation for the CDN layer, NOT forced.

## 8. Decisions for this phase

1. Multi-stage Dockerfile: `node:22-alpine` (LTS, Vite 5-compatible) build → `nginx:1.27-alpine` runtime.
2. Build args for the required `VITE_*` values (compose auto-reads `.env`; plain `docker build` needs `--build-arg` — documented).
3. Nginx: SPA fallback, gzip for text, `immutable` caching only for `/assets/*` (hashed), `no-cache` for `index.html`, security headers incl. a functional CSP (hosts enumerated; will be browser-verified).
4. No backend, no proxy of Supabase Auth, no caching of private/authenticated data.
