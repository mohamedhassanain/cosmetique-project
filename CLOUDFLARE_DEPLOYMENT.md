# CLOUDFLARE DEPLOYMENT — KISSARIYA COSMÉTIQUES

Date: 13/08/2026 — exact, safe manual setup for connecting the production custom
domain to Cloudflare in front of the Docker/Nginx origin.

**Status: PREPARED ONLY. No DNS/zone change was made (no Cloudflare credentials
in this environment). Production behavior behind Cloudflare is NOT VERIFIED
until the steps below are executed and the verification commands pass.**

## 0. Reference architecture

```
Users
  ↓  (TLS, CDN)
Cloudflare zone (custom domain)
  ├── DNS proxy "orange": yourdomain.com → origin (Docker/Nginx :80/:443)
  ├── Cache Rules (CLOUDFLARE_CACHE_RULES.md):
  │     • /assets/* → cache 1 month (immutable)
  │     • everything else → respect origin (index/admin no-store)
  └── NEVER cached: /rest/v1/*, /auth/v1/*, /admin*, Authorization requests
Origin (Docker/Nginx, committed image) → serves SPA + hashed assets
Browser → Supabase directly (Auth/PostgREST/Storage — untouched)
```

## 1. Prerequisites on the origin

- Docker image pushed to a registry (or loadable on the server): `kissariya-web`.
- Server running: `docker run -d --name kissariya-web -p 8080:80 kissariya-web`
  (or compose). Firewall open on 8080 (or 443 with a TLS terminator).
- Domain purchased and DNS managed where you can change the A record later.

## 2. Cloudflare account + zone

1. Create Cloudflare account → **Add a site** → enter `yourdomain.com`.
2. Choose plan (Free is sufficient to start; paid adds Image Resizing later).
3. Cloudflare will scan existing DNS — do not press "Continue" yet.

## 3. DNS records (proxy "orange")

| Type | Name | Content | Proxy |
|---|---|---|---|
| A | `@` | `<origin server public IPv4>` | ☑ Proxied |
| A | `www` | `<origin server public IPv4>` | ☑ Proxied |
| (optional) AAAA | `@` / `www` | `<origin IPv6>` if the server has one | ☑ Proxied |

- Keep **only** proxied records for the site. Do NOT add records for
  `supabase.co` — the app calls Supabase directly from the browser; Cloudflare
  never proxies those domains, and it must not (that would put our zone in the
  path of auth/private data with no benefit).
- **Security:** if a page rule/worker ever needs Supabase, use a separate
  subdomain with "DNS only" (grey) — never proxy supabase traffic through our
  zone cache.

## 4. SSL/TLS mode

Recommended: **Full (strict)**.

1. SSL/TLS → Overview → **Full (strict)**.
2. Origin certificate:
   - SSL/TLS → Origin Server → Create Certificate (15-year, Cloudflare-issued,
     installed on the origin Nginx container behind the edge) — **or**
   - Use an existing valid cert on the origin.
3. Origin must trust Cloudflare: when Full (strict) is on, the origin presents
   its cert and Cloudflare verifies it. The container itself listens on plain
   HTTP :80 behind the edge, so terminate TLS in front of it (see DOCKER_DEPLOYMENT.md §5) or publish 443 with a cert.

Apply the Cloudflare-issued Origin CA to the Nginx TLS server block (same
pattern as DOCKER_DEPLOYMENT.md §5, with the Cloudflare Origin CA cert/key).

## 5. Cache rules

Follow `CLOUDFLARE_CACHE_RULES.md` exactly (Rules → Cache Rules):

1. `kissariya immutable assets` — URI `/assets/*` → cache, TTL 1 month.
2. `kissariya origin-respect` — Hostname = yourdomain.com → use cache-control
   header if present, bypass if absent.

Do **not** create any rule matching `/rest/`, `/auth/`, or `Authorization`.

## 6. Security settings (non-aggressive, must not break Auth)

| Setting | Value | Why |
|---|---|---|
| SSL/TLS | Full (strict) | end-to-end TLS |
| Always Use HTTPS | ON | redirect http→https |
| Min TLS | 1.2 | compatibility |
| Bot Fight Mode | OFF (or Super Bot Fight Mode: "definitely allow" known good bots) | aggressive bot mode can block Supabase JS SDK calls from headless/preview environments |
| WAF managed rules | Legacy-free default; **do not** raise to "High" | could interfere with Supabase Auth POSTs |
| Browser Integrity Check | ON (safe) | low risk |
| Cache Rules | as §5 | never cache private/themed responses |

> Do NOT enable "cache everything" zone-wide. Do NOT enable any rule that caches
> responses with `Set-Cookie` (auth tokens) — Cloudflare default already
> excludes these; keep it that way.

## 7. Post-connection verification (MUST run before going live)

```bash
# 1) Static asset — 2nd request must be cf-cache-status: HIT
H=$(curl -s https://yourdomain.com/ | grep -o '/assets/index-[^"]*\.js' | head -1)
curl -sI "https://yourdomain.com$H" | grep -i 'cf-cache-status\|cache-control'
curl -sI "https://yourdomain.com$H" | grep -i 'cf-cache-status'

# 2) index.html — must NOT be immutable (no-store, no cf-cache-status: HIT)
curl -sI https://yourdomain.com/ | grep -i 'cache-control\|cf-cache-status'

# 3) Admin — must not be cached
curl -sI https://yourdomain.com/admin | grep -i 'cache-control\|cf-cache-status'

# 4) Supabase Auth still works (browser): admin login + admin CRUD — manual test
# 5) Supabase Storage images still HIT on supabase.co (from browser network tab)
```

## 8. NOT VERIFIED (must be measured after connection)

- cf-cache-status HIT ratio for our origin assets — UNKNOWN until §7 runs.
- Global edge latency — depends on plan/pop coverage.
- Cloudflare Images (AVIF) benchmark vs current WebP variants — deferred; run
  the A/B byte comparison against the same image before enabling.
- Capacity rerun with the origin behind Cloudflare (k6-cdn-compare.js) — the
  CDN is expected to offload repeated static-asset requests; the Supabase
  public-data workload is unchanged because we do NOT cache `/rest/v1/*`.
