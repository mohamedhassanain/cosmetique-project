# CLOUDFLARE CACHE RULES — KISSARIYA COSMÉTIQUES

Date: 13/08/2026 — exact rules to configure manually in the Cloudflare dashboard
once the custom domain is connected. NOT applied in this environment (no zone
access); each rule shows the exact dashboard paths.

> **Safety invariant (never violated):**
> **Nothing under `/rest/v1/*`, `/auth/v1/*`, `/admin*`, and no request that
> carries an `Authorization` header is ever cached.** Supabase PostgREST
> responses are JWT-dependent (RLS) — an admin's browser session receives
> rows an anon user must never see, with an identical URL. Caching those
> responses by URL is a **private-data leak**. (See CLOUDFLARE_AUDIT.md
> PROVEN #6 — this also corrects the unsafe `/rest/v1/products` rule
> previously documented in docs/deployment.md.)

---

## Rule 1 — Immutable hashed static assets (JS/CSS/fonts/svg)

**Dashboard:** Rules → Cache Rules → Create rule

```
Rule name: kissariya immutable assets
When incoming requests match:
  Hostname equals  yourdomain.com
  AND URI Path starts with  /assets/

Cache eligibility: Eligible for cache
Cache status: Use cache
Cache TTL: 1 month
```

Why: origin Nginx already emits `public, max-age=31536000, immutable` for
`/assets/*-HASH.js|css` and these URLs are content-addressed. A 1-month edge
TTL is a ceiling; the browser-side `immutable` header still does the heavy
lifting. Never applies to `/index.html`.

## Rule 2 — Everything else on the SPA origin: respect origin

**Dashboard:** Rules → Cache Rules → Create rule

```
Rule name: kissariya origin-respect (SPA + admin)
When incoming requests match:
  Hostname equals  yourdomain.com

Cache eligibility: Eligible for cache
Cache status: Use cache-control header if present, bypass cache if absent
```

Rationale: Nginx emits `no-cache, no-store, must-revalidate` on `index.html`
and SPA pages, and also emits it (via the include) on every route. This rule
**bypasses entirely** when the origin says so — so `/admin*` (which falls back
to `index.html` with `no-store`) is never cached, while still allowing the
edge to honor any future `Cache-Control` we deliberately add at the origin.

## Rule 3 — Public product images (already Cloudflare-cached at Supabase)

| Route | Where cached | Rule required? |
|---|---|---|
| `*.supabase.co/storage/v1/object/public/cosmetics-images/*` | Supabase's own Cloudflare (already HIT) | **None — do not touch** |
| `/assets/*` on our origin | Rule 1 | — |

No rule needed: these requests never reach our origin and are already CDN
HITs (measured). Do NOT create a proxied route for them.

---

## Explicit bypasses (do NOT create rules, and confirm existing "cache everything" defaults do not catch these):

| Path pattern | Why it must never be cached |
|---|---|
| `yourdomain.com/rest/*` — **does not exist on our origin; never proxied** | PostgREST lives only on `*.supabase.co`; Cloudflare on our domain never sees it. Keep it that way. |
| `*.supabase.co/auth/v1/*` | Supabase Auth tokens/sessions — user-specific; never cache |
| `*.supabase.co/rest/v1/*` | JWT-dependent (RLS), money-critical, no purge channel |
| `yourdomain.com/admin*` | Admin UI + data; must always be fresh |
| Any request with `Authorization` header | Session-bearing by definition |

> If Cloudflare's zone-wide "cache everything" is ever enabled, add a
> **Configuration Rule / WAF exception**: `Skip cache` when `http.request.headers["authorization"] exists`, and `Bypass cache` for URI paths `/admin*`. The rules above already implement bypass via origin `no-store`.

## Purging

- New deploy → new `/assets/*` hashes → Rule 1 old entries expire harmlessly
  (content-addressed) while `index.html` revalidates (`no-store`). No manual
  purge needed for normal deploys.
- If you ever change a product image in place (bad practice; UUID-keyed re-upload is the norm), purge that Storage URL:
  **Caching → Purge → Custom purge → URL**.

## Verification after connection

```bash
# Static asset (expect cf-cache-status: HIT on 2nd request)
curl -sI "https://yourdomain.com/assets/index-<hash>.js" -H "User-Agent: Mozilla/5.0" | grep -i 'cf-cache-status\|cache-control'

# index.html (must NOT be immutable; respect-origin → no-store)
curl -sI "https://yourdomain.com/" | grep -i 'cache-control'

# Admin (must not be cached)
curl -sI "https://yourdomain.com/admin" | grep -i 'cache-control'

# A request with Authorization (must never be cached) — anon key example
curl -sI "https://yourdomain.com/" -H "Authorization: Bearer <anon>" | grep -i 'cf-cache-status'
