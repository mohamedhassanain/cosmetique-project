# FINAL PRODUCTION ARCHITECTURE — KISSARIYA COSMÉTIQUES

Date: 13/08/2026. The agreed target architecture, layer by layer. Cloudflare is **PREPARED — NOT CONNECTED** (no domain owned; DNS not modified).

## 1. Target topology

```
                    USERS
                      │
                      ▼
                  CLOUDFLARE          ← CDN · edge caching · TLS · WAF
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
     STATIC ASSETS            FRONTEND
     JS/CSS/Fonts              DOCKER
          │                       │
          └───────────┬───────────┘
                      ▼
                  SUPABASE
             ┌────────┼────────┐
             ▼        ▼        ▼
            AUTH     DB      STORAGE
```

## 2. Layer responsibilities

### Cloudflare (PREPARED — NOT CONNECTED)
- **CDN / edge caching**: Rule 1 caches `/assets/*-HASH` for 1 month (immutable); Rule 2 respects origin cache headers for everything else (index/admin stay `no-store`). NEVER caches `/rest/v1/*`, `/auth/v1/*`, `/admin*`, or `Authorization` requests (CLOUDFLARE_CACHE_RULES.md).
- **TLS**: Full (strict) with Cloudflare Origin CA, documented in CLOUDFLARE_DEPLOYMENT.md §4.
- **WAF/security**: non-aggressive settings (Bot Fight OFF, Browser Integrity ON) so the Supabase JS SDK's calls are never blocked (CLOUDFLARE_DEPLOYMENT.md §6).
- Status: produced config + verification steps; **no domain, no DNS change yet**.

### Docker + Nginx (frontend origin — PROVEN)
- **Docker**: production image (nginx:alpine, ~75 MB), built with public `VITE_*` build args only, no `.env`/secrets inside (verified).
- **Nginx**: serves hashed static assets with `immutable` cache headers, SPA fallback (`/admin`, `/catalog`, `/product/*`, `/search` → `index.html`), `no-store` on index/HTML, security headers, gzip.
- **Capacity**: TEST A 1000 VU → 59 085 requests, p95 5.5 ms, p99 24 ms, 0 errors — PROVEN not a bottleneck.

### React + Vite (frontend — PROVEN)
- SPA with code splitting (33 chunks, 1.14 MB JS + 82 KB CSS), React Router 7, React Query 5 browser-local cache.
- Client-side logic only; all data from Supabase via the JS client with the public anon key.

### Supabase (backend — PROVEN in use, internal load cause UNKNOWN)
- **Auth**: admin-only accounts, `onAuthStateChange` + `getSession`, admin gating via `is_admin()`.
- **PostgreSQL**: RLS policies are the security boundary; explicit-select queries, no `count=exact`, no N+1; index coverage for every public query documented (DATABASE_INDEX_OPTIMIZATION.md).
- **Storage**: public bucket, WebP 400/800/1600 variants, UUID-keyed URLs; already Cloudflare-HIT at Supabase's edge (measured).
- **Observation**: 1000 VU global mixed saturates on the REST path (p95 8.36s, timeouts). Internal cause (edge/PostgREST/pool/DB CPU/rate-limit) is **UNKNOWN — REQUIRES LIVE DASHBOARD METRICS** (SUPABASE_LOAD_MONITORING.md).

## 3. Data-flow rules (security invariant)

1. Browser → Docker/Nginx: static assets + SPA shell. Cacheable (/assets) or no-store (HTML).
2. Browser → Supabase directly: Auth, REST, Storage. **Never proxied through Cloudflare, never cached by our rules.**
3. Admin/private flows (orders, cart, profiles, admin CRUD): browser → Supabase with session; not cached anywhere.
4. RLS remains the sole data-access boundary; no shared cache of RLS-filtered responses exists.

## 4. Cloudflare status

| Item | Status |
|---|---|
| Cloudflare | **PREPARED — NOT CONNECTED** |
| Domain | **PENDING** (no domain owned) |
| DNS | **NOT MODIFIED** |
| SSL/TLS | steps documented (Full strict + Origin CA) |
| Cache rules | documented (Rule 1 / Rule 2 / NEVER-cache) |
| Origin (Docker/Nginx) | ready and verified behind the edge once connected |

Remaining chain: **DOMAIN → CLOUDFLARE → DNS → SSL/TLS → ORIGIN → FINAL CDN TEST** (GO_LIVE_PLAN.md).

## 5. Consistency with current codebase

No code change is required to adopt this architecture: the app already talks directly to Supabase (Auth/REST/Storage), the Docker/Nginx origin already serves the SPA with the right cache headers, and the Cloudflare rules only touch static assets. This is the documented end state.
