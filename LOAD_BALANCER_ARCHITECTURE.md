# LOAD BALANCER ARCHITECTURE — Kissariya Cosmétiques

Date : 2026-08-14
Décision issue de l'audit : HORIZONTAL_SCALING_AUDIT.md — le frontend est **100 % stateless**, donc le Load Balancer est **possible**, mais la multi-instance n'est **pas encore justifiée** par les mesures.

## 1. Les données de capacité (mesurées, existantes)

| Couche | Charge testée | p95 | Erreurs | Source |
|---|---|---|---|---|
| Nginx seul (1 conteneur, si `npm run dev` était un serveur — ici statique) | 1000 VU | **5.5 ms** | 0 | DOCKER_FINAL_REPORT.md Test A |
| Supabase REST (chemin réel, read-only) | 1000 VU home | 1298 ms (re-run) | 0 | ISOLATED_LOAD_TEST_REPORT.md |
| Supabase REST (global mixte) | 700 VU | 427 ms (re-run) | 0 | ISOLATED_LOAD_TEST_REPORT.md |

- Un seul conteneur Nginx sert ~574 RPS (1000 VU) à p95 5.5 ms, 0 erreur.
- Le goulot end-to-end est le chemin REST Supabase : ajouter des réplicas frontend **n'augmente pas la capacité vers Supabase** (chaque réplica sert le même SPA, et les requêtes REST partent du navigateur directement vers Supabase).
- Conclusion : le Load Balancer N'EST PAS requis aujourd'hui pour servir le trafic. Il devient utile **uniquement** lorsque :
  1. le trafic statique dépasse la capacité d'une machine (ordre de grandeur : > 1000 VU / > ~500 RPS statiques sur une VM),
  2. OU la HA (zéro downtime pendant un déploiement) devient un objectif,
  3. ET des **machines séparées** hébergent les réplicas.

## 2. Options comparées (réalistes)

| Option | Dev/nécessite | Health check | Failover | SSL/TLS | DNS | Coût | Complexité | Bénéfice réel ici |
|---|---|---|---|---|---|---|---|---|
| **Cloudflare Load Balancing** | Domaine + zone CF | URL HTTP/HTTPS automatique | Interne (pool + failover) | Oui (CF gère le TLS) | CNAME/A maille | Plan Pro (3-20$/mois) + domaines | Faible (UI) | **POURQUOI PAS** : le trafic statique ne le justifie pas ; CF ne résout pas le goulot Supabase |
| **LB du VPS (ex: OVH/Scaleway/Hetzner)** | VPS + IP failover + 2+ VM derrière | HTTP/TCP vers /health | Oui (pool) | Terminaison TLS au LB ou Cloudflare devant | A/AAAA | coût VM additionnelles + LB | Moyenne (config réseau) | Justifié uniquement si multi-VM réelles |
| **NGINX en reverse proxy manuel (démo)** | 1 VM + Docker Compose | Oui (/health) | Manuel (upstream + max_fails) | Terminaison TLS à configurer ou CF devant | A/AAAA | VM seule | Moyenne | **Recommandé pour DÉMO/TEST LOCAL uniquement** (conteneur `lb` + 3 web) |
| **HAProxy / Traefik** | 1 VM + conteneur | Oui | Oui | Oui si configuré | A/AAAA | VM | Moyenne/élevée | Redondant ici (équivaut à manager un LB en plus du travail) |

## 3. Recommandation

**Aujourd'hui : NE PAS METTRE EN PRODUCTION de load balancer.**

- L'architecture est **préparée** (image immutable + `/health` + `docker-compose.scale.yml` + tests) mais pas activée.
- Dès que le trafic le justifie (ou HA requise), l'**option recommandée** est :
  - **Cloudflare Load Balancing** si un domaine propre est derrière CF (le plus simple, TLS + failover gérés).
  - **NGINX reverse proxy** sur la même VM si on veut éviter un coût CF et que les réplicas restent sur un seul hôte (démo/test).

**Pourquoi pas un LB contrôlé par un VPS (Hetzner/OVH) en premier ?**
- Coût de 2-3 VM + LB côté infra pour un trafic que Nginx seul absorbe déjà (p95 5.5ms) → sur-dimensionné.
- La capacité réelle du système est bornée par Supabase ; investir dans le frontend avant d'avoir mesuré l'effet d'un cache/public-data layer serait un mauvais usage des ressources.

## 4. Détail de l'architecture recommandée (quand elle devient nécessaire)

```
USERS
  │
  ▼
CLOUDFLARE (zoné, TLS + WAF + cache assets statiques)
  │
  ▼
LOAD BALANCER (pool : web1, web2, web3)
  │
  ├── web1 → Nginx (/health) → /usr/share/nginx/html
  ├── web2 → Nginx (/health) → /usr/share/nginx/html
  └── web3 → Nginx (/health) → /usr/share/nginx/html
                    │
                    ▼
                Supabase (Auth/PostgreSQL/Storage/Edge Functions)
```

Chaque Nginx est identique (même image), stateless (aucun volume), sert le même SPA. `index.html` en `no-store`, `/assets/*` en `immutable` — les caches CDN/browser fonctionnent indépendemment d'un réplica.

## 5. Exigences de l'option recommandée (checklist d'implémentation future)

- [ ] Domaine propre + zone Cloudflare configurée (proxy ON) — étape de production (pas faite ici)
- [ ] Pool LB : web1/web2/web3 comme ci-dessous (compose scale) ou `--scale web=3` sur un seul `web`
- [ ] Health check LB → `GET /health` (200 = healthy, pas de dépendance Supabase)
- [ ] Sécurité : headers de sécurité déjà émis par chaque réplica (CSP incluse) ; `Real-IP`/`X-Forwarded-For` gérés par CF si proxy
- [ ] TLS : terminaison au LB ou à CF (Full strict) — jamais de TLS au niveau du conteneur (port 80 interne)
- [ ] Mise à jour : build image → push → `docker compose up -d` (les réplicas reprennent la nouvelle image sans downtime si LB en rotation)

## 6. Health check (implémenté dans cette phase)

- Ajouté dans `nginx/default.conf` : `location = /health { return 200 "ok\n"; }` — statique, sans dépendance Supabase, `Cache-Control: no-store`.

## 7. Test fourni

- `k6/scale-static-test.js` (Test A statique + Test B full path) : mesure frontend seule vs frontend+Supabase sur 1/2/3 réplicas. Voir horizon du rapport final.

## 8. Limitations du Load Balancer

- Ne résout pas le goulot Supabase (end-to-end).
- Ne résout pas le cache des données publiques (pas de purge ; unsafe sans purge).
- Coût/mo : dépend du provider (CF Pro ~20$/mo, VPS = au moins 1-2 VM additionnelles).
- Sticky session inutile : confirmé stateless (audit).

## 9. Verdict

```
READY FOR SINGLE-INSTANCE PRODUCTION (avec container statique + infrastructure PREPAREE pour
scale futur si/quant le trafic le justifie)
```

Le multi-instance n'est PAS activé aujourd'hui — pas de bénéfice mesurable pour un trafic que Nginx seul absorbe, et la limite réelle est Supabase.
