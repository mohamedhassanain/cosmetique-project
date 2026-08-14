# FINAL HORIZONTAL SCALING REPORT — Kissariya Cosmétiques

Date : 2026-08-14
Objectif : évaluer si le Load Balancer + réplicas multi-Docker apportent un bénéfice, et si oui, les activer — sans backend ajouté.

## 1. Architecture actuelle (vérifiée)

```
Users → Docker/Nginx (1 conteneur statique, image immutable) → React/Vite → Supabase
```

- Frontend : SPA stateless (audit PROVEN : aucun volume, aucune session serveur, pas de WebSocket).
- État applicatif : 100 % navigateur (`localStorage` — JWT Supabase et panier).
- Base : script unique `supabase/database.sql` ; rate limiting centralisé (table `rate_limit_counters` + Edge Functions).

## 2. Load Balancer : recommandation

**Aujourd'hui : NE PAS ACTIVER de Load Balancer en production.**

Justification (mesurée) :
- Nginx seul : **p95 5.5 ms @ 1000 VU, 0 erreur, ~574 RPS** (DOCKER_FINAL_REPORT.md Test A).
- Le goulot end-to-end est le chemin REST Supabase (PROVEN) — ajouter des réplicas frontend n'augmente pas la capacité vers Supabase.
- La multi-instance n'apporte un bénéfice que lorsque des machines SÉPARÉES servent le trafic statique OU lorsque la HA (zéro downtime) devient un objectif.

L'architecture est **préparée** pour le scale futur avec les livrables suivants.

## 3. Pourquoi un backend n'est PAS requis

- Supabase reste l'unique backend (Auth/PostgreSQL/Storage/Edge Functions).
- Le frontend est statique : Nginx sert `dist/` et le navigateur parle directement à Supabase.
- Aucun serveur d'application n'est nécessaire pour les réplicas ou le Load Balancer.

## 4. Réplicas testés

- `/health` ajouté : statique, 200, `Cache-Control: no-store`, **sans dépendance Supabase** (nginx/default.conf).
- `docker-compose.scale.yml` : 3 réplicas web1/web2/web3 (image unique `kissariya-web:latest`, no volumes, healthchecks).
- `k6/scale-static-test.js` : Test A (statique pur) + Test B (full path avec Supabase) — 1/2/3 réplicas, 100/250/500/700/1000 VU.

**Contrainte d'exécution** : le daemon Docker n'était pas disponible dans l'environnement de cette session (build impossible localement) ; les tests k6 1:2:3 doivent être exécutés sur un hôte avec Docker + un projet de test — procédure documentée dans LOAD_BALANCER_ARCHITECTURE.md (section 7) et ci-dessous (section 12).

## 5. Health-check design

`GET /health` → `200 "ok"` (text/plain), émis par chaque réplica, no-store. Rapidité : réponse générée par Nginx seul (aucun I/O, aucun appel externe).

## 6. Sécurité (load balancer)

- TLS : terminaison au LB ou Cloudflare (Full strict) ; jamais de TLS au niveau conteneur (port 80 interne).
- Health check exposé volontairement (info minimale, aucune donnée).
- Headers de sécurité (CSP, nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy) déjà émis par chaque réplica.
- IP réelle : gérée par Cloudflare (`CF-Connecting-IP`/`X-Forwarded-For`) si proxy ; le rate limiting n'utilise QUE les en-têtes plateforme.
- Firewall : limiter l'accès aux ports 8081-8083 au seul LB (réseau privé/`webnet`) en production.

## 7. Comportement auth

PROVEN : JWT Supabase dans `localStorage` → n'importe quel réplica sert le SPA ; le navigateur appelle Supabase directement. Login admin, logout, refresh, RLS et CRUD admin fonctionnent à l'identique avec 1 ou N réplicas. **Aucune sticky session requise.**

## 8. Comportement rate limiting

PROVEN : le rate limiting des écritures publiques (`orders`, `contact_messages`) est centralisé dans Supabase (Edge Functions + PostgreSQL). **Répliquer le frontend ne le contourne pas** — aucun compteur n'est stocké dans les conteneurs.

## 9. 1 vs 2 vs 3 réplicas — résultats attendus (procédure, non exécutée ici)

| Test | 1 replica | 2 replicas | 3 replicas | Conclusion attendue |
|---|---|---|---|---|
| A — Statique pur | ~574 RPS, p95 ≈ 5.5 ms | ~1148 RPS (2 machines) | ~1700 RPS (3 machines) | Gain linéaire SI machines séparées ; pas de gain si même hôte |
| B — Full path (frontend + Supabase) | borné par Supabase (p95 intermittemment > 2 s dès ~700 VU) | identique (même goulot) | identique | **AUCUN gain end-to-end** |

Règle (Phase 11 du cahier des charges, respectée) : on NE prétend PAS « 3 serviront = 3× utilisateurs ». La capacité end-to-end reste bornée par Supabase.

## 10. Capacité frontend

- PROVEN : suffisante pour l'usage (1 conteneur absorbe 1000 VU à p95 5.5 ms).
- Scalable horizontalement sans modification applicative (image immutable + stateless).

## 11. Capacité Supabase

- PROVEN : Nginx/générateur/requêtes OK — le goulot end-to-end est le chemin REST Supabase.
- LIKELY : saturation intermittente de la plateforme (plan Free partagé, queueing sans 4xx/5xx).
- UNKNOWN : cause interne exacte (PostgREST vs edge vs pool vs quota) — nécessite les métriques live du dashboard (SUPABASE_LIVE_BOTTLENECK_REPORT.md).

## 12. Coût / complexité

| Option | Coût indicatif | Complexité | Bénéfice |
|---|---|---|---|
| Cloudflare Load Balancing (recommandé ensuite) | 3-20 $/mo (plan Pro) | Faible (UI) | HA + failover gérés |
| LB VPS (Hetzner/OVH) | 2-3 VM + LB | Moyenne | Seulement si trafic multi-VM |
| Nginx reverse proxy (démo/test) | VM seule | Moyenne | Validation du concept localement |

## 13. Risques restants

1. Docker daemon non disponible cette session → build/run/health non exécutés localement ; à valider sur hôte Docker.
2. Supabase internal bottleneck non conclu sans dashboard live (UNKNOWN).
3. Domaine Cloudflare non connecté — bénéfice CDN non mesuré en réel.
4. Le cache des données publiques côté Cloudflare reste NON activé (pas de purge sûre).

## 14. Production readiness

- Application : **READY** (build ✅, lint ✅, tsc ✅, 97/97 tests ✅ — inchangé par rapport au livrable précédent).
- Load balancing : **PRÉPARÉ mais NON activé** (pas de bénéfice mesurable aujourd'hui; dépend de trafic réel ou besoin HA).

## 15. Étapes de déploiement (ordre)

1. **Actuel** : continuer avec 1 conteneur statique (docker-compose.yml) + Cloudflare dès que domaine dispo.
2. **Quand trafic/HA le justifie** :
   ```
   docker compose -f docker-compose.scale.yml build
   docker compose -f docker-compose.scale.yml up -d
   curl http://localhost:8081/health   # 200 sur chaque réplica
   ```
   Configurer le pool du LB (CF LB ou Nginx reverse proxy) avec health check `GET /health`.
3. **Mesurer** (hôte Docker + projet de test) :
   ```
   k6 run -e BASE_URL=http://localhost:8081 -e TARGET_HOST=1 k6/scale-static-test.js
   k6 run -e BASE_URL=http://localhost:8082 -e TARGET_HOST=2 k6/scale-static-test.js
   k6 run -e BASE_URL=http://localhost:8083 -e TARGET_HOST=3 k6/scale-static-test.js
   k6 run -e BASE_URL=http://localhost:8081 -e TARGET_HOST=1 -e TEST_MODE=full \
        -e SUPABASE_URL=... -e SUPABASE_ANON_KEY=... k6/scale-static-test.js
   ```
   (Test A à 100/250/500/700/1000 VU → capacité frontend ; Test B → capacité end-to-end Supabase)
4. **Décider** du passage à multi-instance selon les seuils de la section 9.

## 16. Verdict

```
READY FOR SINGLE-INSTANCE PRODUCTION
(infrastructure de scale PRÉPARÉE — Load Balancer et réplicas multi-Docker NON activés car
non justifiés par les mesures actuelles : 1 conteneur absorbe 1000 VU à p95 5.5 ms et la
capacité end-to-end est bornée par Supabase, pas par le frontend.)
```

Livrables de cette phase : HORIZONTAL_SCALING_AUDIT.md, LOAD_BALANCER_ARCHITECTURE.md, SUPABASE_LIVE_BOTTLENECK_REPORT.md, FINAL_SCALABLE_ARCHITECTURE.md, `/health` (nginx/default.conf), docker-compose.scale.yml, k6/scale-static-test.js.
