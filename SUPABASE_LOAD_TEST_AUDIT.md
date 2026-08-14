# SUPABASE LOAD TEST AUDIT — Kissariya Cosmétiques

Date : 2026-08-14
Phase 1 — audit de la méthodologie et des scripts k6 existants AVANT toute modification. Classification : PROVEN / LIKELY / UNKNOWN.

## 1. Inventaire des scripts k6 (lus intégralement)

- `Dockerfile` : multi-stage `node:22-alpine` (build) → `nginx:1.27-alpine` (runtime). Ne copie que `dist/` + configs Nginx. **Aucun volume, aucune écriture disque au runtime.**
- `docker-compose.yml` : service unique `web`, port `8080:80`, `restart: unless-stopped`. **Aucun volume monté, aucun état.**
- `nginx/default.conf` : serveur statique pur — SPA fallback, cache `/assets/*` immutable, `index.html` no-store, security headers. **Aucun `proxy_pass`, aucun upstream, aucun WebSocket, aucune sticky session.**
- `package.json` : SPA pure. **Aucun script de serveur (`start`/`serve`/`express`), aucun backend.**

## 2. Questions d'audit (V / F vérifiés dans le code)

| # | Question | Réponse | Preuve (fichier :ligne) |
|---|---|---|---|
| A | Des réplicas identiques sont-ils sûrs ? | **OUI** | Image identique par construction (mêmes build args `VITE_*` publics), aucun volume → n'importe quel conteneur sert n'importe quelle requête |
| B | Le frontend est-il complètement stateless ? | **OUI** | Nginx n'a aucune session ; tout l'état applicatif est dans le navigateur |
| C | État filesystem local requis ? | **NON** | Aucun `volume` dans compose, aucun `writeFile`, aucune écriture Nginx (pas de `proxy_cache_path`, pas de `client_body_temp` persistant) |
| D | État de session en mémoire requis ? | **NON** | Nginx ne garde aucun état utilisateur (pas d'`upstream`/sticky) ; React/React Query sont côté navigateur |
| E | WebSocket / sticky-session requis ? | **NON** | Aucun `WebSocket`, `wss://`, `ws://` dans `src/` (findstr) |
| F | Uploads stockés localement ? | **NON** | Les images vont directement du navigateur vers Supabase Storage (`useImageUpload` → `/storage/v1`), jamais via Nginx |
| G | Sessions d'auth stockées localement ? | **NON** | `src/integrations/supabase/client.ts:13` → `storage: localStorage` (JWT Supabase côté navigateur, repliqué par `persistSession`) |
| H | Fonctionnalité dépendant d'un état serveur local ? | **NON** | Panier = `src/providers/cart-provider.tsx:8,27` → `localStorage` navigateur |

**Résultat : le frontend Docker/Nginx est 100 % stateless → réplicas identiques possibles sans sticky sessions, sans partage d'état, sans volume partagé.**

## 3. Implications pour le scaling horizontal

### 3.1 Session / Auth (Phase 8)
- Le JWT Supabase est stocké dans le `localStorage` du navigateur.
- N'importe quel réplica sert l'index.html ; le navigateur appelle Supabase **directement** (Auth/PostgREST/Storage) — le réplica n'intervient jamais dans le flux d'auth.
- Conséquence : login admin, logout, refresh, RLS et CRUD admin fonctionnent à l'identique avec 1 ou N réplicas. **Aucune sticky session requise.**

### 3.2 Rate limiting (Phase 7)
- Le rate limiting des écritures publiques (`orders`, `contact_messages`) est implémenté dans les **Edge Functions Supabase + table PostgreSQL `rate_limit_counters`** (projet précédent, RATE_LIMITING_FINAL_REPORT.md) — **persistant et partagé**, jamais en mémoire conteneur.
- Conséquence : **le load balancing des réplicas Nginx ne contourne pas et n'affaiblit pas le rate limiting** (les compteurs sont dans Supabase, communs à tous les clients).

### 3.3 Cache HTTP
- Réplicas identiques → les headers de cache (`immutable` sur `/assets/*`, `no-store` sur `index.html`) sont émis à l'identique par chaque réplica. Aucun cache partagé requis.

## 4. Capacité mesurée existante (pour référence, pas re-mesurée ici)

| Couche | VU | p95 | Erreurs | Source |
|---|---|---|---|---|
| Docker/Nginx seul | 1000 | 5.5 ms | 0 | DOCKER_FINAL_REPORT.md / Test A |
| Supabase REST global mixte | 700 | 427 ms (re-run) | 0 | ISOLATED_LOAD_TEST_REPORT.md |
| Supabase REST home | 1000 | 1298 ms (re-run) | 0 | ISOLATED_LOAD_TEST_REPORT.md |

Le goulot end-to-end reste le chemin REST Supabase (intermittent, cause interne NON prouvée). Ajouter des réplicas frontend n'augmente **pas** la capacité end-to-end vers Supabase.

## 5. Conclusion

- Le frontend peut être répliqué sans modification **d'application** : seule une amélioration mineure infra est justifiée (health check statique + fichier compose de scale).
- **Le load balancer n'est PAS justifié aujourd'hui** : un seul conteneur Nginx sert ~574 RPS @ p95 5.5 ms ; la capacité limitante est Supabase. La multi-instance n'apporte un bénéfice mesurable que lorsque des **machines séparées** hébergent les réplicas ET que le trafic statique dépasse la capacité d'une machine (à re-mesurer après connexion Cloudflare).
- L'architecture doit donc être **préparée** (image immutable + `/health` + compose scale + documentation LB) mais **pas activée** en production.

## 6. Changements prévus (minimum, justifiés)

1. `nginx/default.conf` : ajout d'un endpoint statique `/health` (200 rapide, sans dépendance Supabase) pour health-checks futurs.
2. `docker-compose.scale.yml` : définition reproductible multi-réplicas (même image, `healthcheck` sur `/health`, pas de volume).
3. Tests : `k6/scale-static-test.js` (Test A statique) + utilisation de `load-tests/k6-cdn-compare.js` (Test B statique+REST, déjà paramétré par `BASE_URL`).
4. Documentation : LOAD_BALANCER_ARCHITECTURE.md, SUPABASE_LIVE_BOTTLENECK_REPORT.md, FINAL_SCALABLE_ARCHITECTURE.md, FINAL_HORIZONTAL_SCALING_REPORT.md.

Rien d'autre ne change : pas de backend, pas de Redis/K8s, pas de modification Dockerfile, pas de changement applicatif.
