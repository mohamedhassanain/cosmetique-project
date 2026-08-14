# FINAL SCALABLE ARCHITECTURE — Kissariya Cosmétiques

Date : 2026-08-14
Conclusions fondées sur : HORIZONTAL_SCALING_AUDIT.md, LOAD_BALANCER_ARCHITECTURE.md, SUPABASE_LIVE_BOTTLENECK_REPORT.md, ISOLATED_LOAD_TEST_REPORT.md, DOCKER_FINAL_REPORT.md.

## A. ARCHITECTURE RECOMMANDÉE ACTUELLEMENT (PRODUCTION)

```
USERS
  │
  ▼
CLOUDFLARE (préparé ; à connecter dès qu'un domaine est dispo)
  │  ├─ TLS (Full strict) + WAF
  │  ├─ cache /assets/* (immutable, long) — jamais /rest/*, /auth/*, /admin*
  │  └─ pas de cache des réponses Supabase (aucune purge possible)
  │
  ▼
DOCKER / NGINX — 1 conteneur statique (image immutable kissariya-web)
  │  ├─ SPA fallback, /health (200 statique), security headers + CSP
  │  └─ aucune dépendance Supabase au runtime
  │
  ▼
SUPABASE (unique backend)
  ├─ Auth (JWT dans localStorage navigateur, RLS is_admin())
  ├─ PostgreSQL (données + rate_limit_counters)
  ├─ Storage (images WebP, CDN supabase)
  └─ Edge Functions create-order / create-contact (rate limiting centralisé)
```

**Pourquoi 1 conteneur suffit aujourd'hui (mesuré) :**
- Nginx seul : p95 5.5 ms @1000 VU, 0 erreur, ~574 RPS (DOCKER_FINAL_REPORT.md).
- Le goulot end-to-end est Supabase REST (PROVEN) — plus de frontend ne change pas cette capacité.
- Aucun bénéfice mesurable à répliquer avant un trafic > 1000 VU statiques OU un besoin de HA.

## B. ARCHITECTURE FUTURE (SCALE) — quand ce sera justifié

```
USERS
  │
  ▼
CLOUDFLARE (zoné, TLS + WAF + cache statique)
  │
  ▼
LOAD BALANCER (pool web1 → web3, health check = GET /health)
  │
  ├── web1 → Nginx (image identique) → SPA
  ├── web2 → Nginx (image identique) → SPA
  └── web3 → Nginx (image identique) → SPA
                    │
                    ▼
                SUPABASE (Auth/PostgreSQL/Storage/Edge Functions)
```

**Déclencheurs de passage à B (conditions, pas un calendrier) :**
1. Trafic statique mesuré > ~1000 VU / > ~500 RPS, ou exigence de zéro-downtime (déploiement en rolling).
2. Machines **séparées** (sinon un seul hôte suffit : `--scale web=3` n'ajoute pas de capacité).
3. Après résolution du goulot Supabase (mesure dashboard, ou plan Supabase supérieur / cache de données publiques avec purge).

**Ce qui est déjà prêt pour B (livré dans cette phase) :**
- Image immutable, stateless (audit PROVEN : aucun volume, état 100 % navigateur).
- `nginx/default.conf` : endpoint `/health` statique (200, no-store, sans Supabase).
- `docker-compose.scale.yml` : 3 réplicas web1/web2/web3 + healthchecks + réseau webnet.
- `k6/scale-static-test.js` : Test A (statique) et Test B (full path REST) pour comparer 1 vs 2 vs 3 réplicas.
- `LOAD_BALANCER_ARCHITECTURE.md` : options comparées + recommandation (Cloudflare LB ou Nginx reverse proxy).

## C. Ce qui ne changera PAS (invariants)

- Pas de backend ajouté : Supabase reste l'unique backend.
- Pas de Redis, pas de Kubernetes, pas de microservices.
- RLS, auth admin, CRUD admin, order/contact rate limiting centralisé (PostgreSQL) : inchangés.
- Le rate limiting est **persistant et partagé** (table `rate_limit_counters`) : répliquer le frontend ne le contourne pas, aucune sticky session requise.

## D. Sticky sessions

Non requises (PROVEN) : JWT Supabase dans localStorage, panier en localStorage, aucun WebSocket, aucun état serveur. Chaque réplica est interchangeable.
