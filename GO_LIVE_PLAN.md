# GO LIVE PLAN — KISSARIYA COSMÉTIQUES

Date: 13/08/2026. Sequential, non-destructive steps to go live with the prepared architecture. **Not executed this round** (no domain, per instruction). Every step references the artifact that contains the exact commands.

## Phase 0 — Preconditions (all done)

- [x] Build/tests green (78/78), tsc, lint
- [x] Docker image `kissariya-web` built + verified (75 MB, no secrets, SPA fallback)
- [x] Local origin verified at 1000 VU static (p95 5.5 ms)
- [x] Cloudflare config documented (CLOUDFLARE_CACHE_RULES.md, CLOUDFLARE_DEPLOYMENT.md)
- [x] Load-test tooling: `k6-cdn-compare.js` (WITH/WITHOUT-CDN), `monitor-k6.ps1`
- [ ] Domain owned (user) — blocks everything below

## Phase 1 — Domain + DNS

1. Purchase a domain (user action).
2. Cloudflare → Add site → enter domain → change nameservers.
3. Add proxied A record to the origin server IP (CLOUDFLARE_DEPLOYMENT.md §3).
4. **Do NOT** add DNS for `supabase.co` — app calls Supabase directly.

## Phase 2 — TLS

1. SSL/TLS → Full (strict).
2. Install Cloudflare Origin CA on the Nginx server block (CLOUDFLARE_DEPLOYMENT.md §4).
3. Always Use HTTPS ON, Min TLS 1.2.

## Phase 3 — Cache rules (safe set only)

1. Rule 1 `kissariya immutable assets`: `/assets/*` → cache, TTL 1 month.
2. Rule 2 `kissariya origin-respect`: hostname = domain → respect Cache-Control, bypass if absent.
3. NEVER create rules matching `/rest/`, `/auth/`, `Authorization` (CLOUDFLARE_CACHE_RULES.md).

## Phase 4 — Deploy the origin

1. Deploy the committed image to the production server (DOCKER_DEPLOYMENT.md §3–§5).
2. Verify: `curl -sI https://<domain>/` → `no-store`; `curl -sI https://<domain>/assets/<hash>.js` → `immutable` + `cf-cache-status`.
3. Manual smoke: HOME, CATALOG, SEARCH, PRODUCT DETAIL, refresh `/admin`, admin login + CRUD.

## Phase 5 — Post-connection validation (REQUIRED)

Run the verification commands in CLOUDFLARE_DEPLOYMENT.md §7, then:

```bash
# static asset HIT after 2nd request
curl -sI https://<domain>$(curl -s https://<domain>/ | grep -o '/assets/index-[^"]*\.js' | head -1) | grep -i 'cf-cache-status'
# fresh index, no cache
curl -sI https://<domain>/ | grep -i 'cache-control\|cf-cache-status'
```

## Phase 6 — Final CDN load test (evidence)

```bash
k6 run -e BASE_URL=https://<domain> -e SUPABASE_URL=<rest> -e SUPABASE_ANON_KEY=<anon> -e MAX_VUS=600 load-tests/k6-cdn-compare.js
```

WITH-CDN result goes into `CLOUDFLARE_PERFORMANCE_BASELINE.md` as the second column.

## Phase 7 — Supabase bottleneck evidence (UNKNOWN today)

Execute SUPABASE_LOAD_MONITORING.md §2–§4 during a 700–1000 VU run and log: DB CPU, connections, API latency/RPS, errors (429/5xx), bandwidth. Re-classify BOTTLENECK_ANALYSIS.md rows 6–8 with real numbers.

## Phase 8 — Optional polish

- Cloudflare Images/AVIF A/B byte benchmark vs current WebP variants (IMAGE_CDN_REPORT.md §7) before enabling.
- CI/CD (build → docker build → push → server pull) — out of scope today.

## Rollback

- DNS-only change → set proxy to DNS-only (grey) or remove record; origin image unchanged.
- Cache rule issue → delete Rule 1; origin still serves with correct headers.
- No destructive DB/migration/auth changes are part of this plan.
