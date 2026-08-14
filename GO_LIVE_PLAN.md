# GO LIVE PLAN — KISSARIYA COSMÉTIQUES

Date: 13/08/2026. Sequential, non-destructive steps to go live with the prepared architecture. **Not executed this round** (no domain, per instruction). Every step references the artifact that contains the exact commands.

## Phase 0 — Preconditions (all done)

- [x] Build/tests green (97/97 Vitest, tsc, eslint, vite build) — décision 14/08
- [x] Docker image `kissariya-web` built + verified (75 MB, no secrets, SPA fallback)
- [x] Local origin verified at 1000 VU static (p95 5.5 ms)
- [x] Cloudflare config documented (CLOUDFLARE_CACHE_RULES.md, CLOUDFLARE_DEPLOYMENT.md)
- [x] Load-test tooling: `k6-cdn-compare.js` (WITH/WITHOUT-CDN), `monitor-k6.ps1`
- [x] Benchmark contrôlé 14/08 (500/700/1000 VU, workload H) — 0 erreur (PERFORMANCE_DIAGNOSIS.md)
- [x] Anti-abus serveur (Edge Functions + rate limiting persistant + anti-spam 5 s) committé
- [ ] Domain owned (user) — blocks everything below

## Phase 0bis — Supabase Edge Functions (REQUIS avant trafic public)

Les écritures publiques (orders, contact_messages) passent par des Edge Functions.
Les déployer une fois avec les secrets (jamais dans le frontend) :

```bash
# CLI Supabase authentifiée sur le projet ygkeuhatokvkdwwoccty
supabase functions deploy create-order
supabase functions deploy create-contact
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service_role du dashboard> \
  RATE_LIMIT_HASH_SECRET=<secret aléatoire> \
  ALLOWED_ORIGINS=https://<votre-domaine>
```

- Rejouer `supabase/database.sql` (idempotent) dans le SQL Editor (RLS/index/RPC rate limiting).
- **Admin allowlist** : depuis la migration du 14/08, `is_admin() = auth.uid() ∈ admin_users`. Au premier rejeu de `database.sql`, tous les comptes Auth existants sont auto-ajoutés (seed non-bloquant). Pour tout NOUVEAU compte admin ensuite :
  1. Dashboard → Authentication → Users → Create user (compte manuel, aucun signup public).
  2. Copier l'UUID du compte créé.
  3. SQL Editor (service_role) : `INSERT INTO public.admin_users (user_id) VALUES ('<uuid>') ON CONFLICT DO NOTHING;`
  4. L'admin peut alors se connecter sur `/admin` (le guard frontend vérifie le RPC `is_admin`).

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
