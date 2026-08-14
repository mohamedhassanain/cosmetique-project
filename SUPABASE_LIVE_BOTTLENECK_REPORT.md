# SUPABASE LIVE BOTTLENECK REPORT — Kissariya Cosmétiques

Date : 2026-08-14
Classification rigoureuse : **PROVEN** (mesuré directement), **LIKELY** (inféré avec hypothèses documentées), **UNKNOWN** (non mesurable sans accès dashboard).

## 1. Contexte

- Projet réel Supabase : `https://ygkeuhatokvkdwwoccty.supabase.co` (plan Free, projet existant).
- Les tests réalisés (ISOLATED_LOAD_TEST_REPORT.md) utilisent la clé anon publique en lecture seule, workload identique à l'application.
- Docker/Nginx (1 conteneur) : p95 5.5 ms @1000 VU, 0 erreur, ~574 RPS (Test A, DOCKER_FINAL_REPORT.md).

## 2. Métriques capturées pendant la charge (k6)

### 2.1 Exécutions isolées par endpoint (k6, read-only, 20s ramp / 60s sustain / 20s down)

| Endpoint | VU | RPS | p50 | p95 | p99 | max | Erreurs | Fenêtre identifiée |
|---|---|---|---|---|---|---|---|---|
| HOME (5 req) | 500 | 484.6 | 78 | 261 | 794 | 1803 | 0% | aucune (sain) |
| HOME (5 req) | 1000 | 627.6 | 502 | **1298** | 2124 | 4014 | 0% | saturation intermittente |
| CATALOG (3 req) | 500 | 316.1 | 76 | 89 | 98 | 465 | 0% | aucune (sain) |
| CATALOG (3 req) | 800 | 414.3 | 82 | **1886** | 6877 | 9682 | 0% | saturation intermittente |
| SEARCH (1 req) | 900 | 175.6 | 78 | **3050** | 8729 | 9506 | 0% | saturation intermittente |
| DETAIL (1 req) | 700 | 139 | 82 | **3483** | 7482 | 9805 | 0% | saturation intermittente |
| GLOBAL mixte (8 req) | 700 | 460.1 | 83 | **427** (re-run) | 841 | 2278 | 0% | saturation intermittente |

Observations :
- Entre 100 et 600-700 VU : latences saines (p95 < 100-500 ms).
- À partir de 700-1000 VU : **p95 et p99 explosent** (3-10 s) mais **sans aucune erreur HTTP** et **sans saturation du générateur** (k6 CPU ≤ 87 %, machine ≤ 58 % — vérifié dans ISOLATED_LOAD_TEST_REPORT.md « Load Generator Monitor »).
- Même exécution re-lancée à la même VU peut repasser sous le seuil (ex. global-700 : sweep p95 8603 ms → re-run p95 427 ms) → **intermittence** confirmée.

### 2.2 Ce qui a été exclu (PROVEN NON-coupables)

| Couche | Verdict | Preuve |
|---|---|---|
| Générator k6 | OK | CPU machine ≤ 57.5 %, k6 ≤ 87.3 %, RAM ≤ 78.6 % (jamais saturé) |
| Docker/Nginx | OK | Test A isolé : p95 5.5 ms @1000 VU, 0 erreur |
| Requêtes SQL (design) | OK | selects explicites (pas de `select=*`), indexes présents, pas de N+1 (SUPABASE_LOAD_AUDIT.md) |
| PostgreSQL interne | NON-saturé | CPU ≈ 2 %, mémoire ≈ 55 %, connexions ≈ 15/60, disk IO ≈ 0 % (dashboard phase précédente) |

## 3. Classification

| # | Affirmation | Classe | Justification |
|---|---|---|---|
| 1 | Docker/Nginx n'est pas le goulot (p95 5.5 ms @1000 VU) | **PROVEN** | Test A isolé, chiffre reproductible |
| 2 | Le goulot end-to-end est sur le chemin REST Supabase | **PROVEN** | Test A (statique seul) sain + Test B (REST) dégradé au même moment/charge |
| 3 | La dégradation est intermittente (re-runs sains dans la même heure) | **PROVEN** | p95 8603 ms (sweep) → 427 ms (re-run) au même point de charge |
| 4 | Aucune erreur HTTP côté client pendant la saturation (timeouts compris) | **PROVEN** | 0 % partout (même les fenêtres p95 > 8 s) |
| 5 | La cause interne exacte est le API-edge Supabase / PostgREST / pool / rate-limit du plan Free | **LIKELY** | Intermittence + saturation à ~700 VU sans saturation DB → cohérent avec partage des ressources du tenant (non démontré) |
| 6 | Le plan Free (shared-tenant) limite réellement le débit sur ce projet | **LIKELY** | Intermittence + latence explosive sans 4xx/5xx ⇒ throttling/queueing au niveau plateforme (cohérent, non prouvé par nos métriques) |
| 7 | Détails internes précis du bottleneck (PostgREST vs pool vs quota) | **UNKNOWN** | Nécessite les métriques LIVE du dashboard Supabase (Reports → API / Status / Logs) pendant les runs — non disponibles ici |

## 4. Ce qui doit être mesuré au dashboard Supabase (pas disponible ici)

Pour transformer LIKELY → PROVEN/REFUTE, capturer pendant un run k6 à 700-1000 VU (read-only, projet de test de préférence) :

1. **Reports → API** : Request rate (RPS), Response time (p50/p95), Error rate.
2. **Reports → Database** : CPU, RAM, IOPS, connections totales, remaining.
3. **Status → Logs** : Recherche de `PostgREST`, `pooler`, `timeout`, `404`, `429`, `rate_limit`.
4. **Quotas** (plan Free) : API requests / Auth / Storage pour vérifier un éventuel plafond de débit.

Procédure de run (read-only, ne spamme pas la prod) :
```bash
k6 run -e SUPABASE_URL=... -e SUPABASE_ANON_KEY=... -e MAX_VUS=700 load-tests/supabase-read-load.js
```
(pendant 3-5 min, project de test dédié recommandé)

## 5. Conséquence pour le scaling horizontal

- La capacité frontend n'est PAS le goulot → **ajouter des réplicas Nginx n'augmente pas la capacité end-to-end** (celle-ci est bornée par Supabase).
- Le scaling utile aujourd'hui n'est PAS le multi-frontend mais : ① mesure dashboard Supabase pour conclure ; ② évaluation d'Edge Functions/cache côté Cloudflare UNIQUEMENT si les mesures le justifient.
- Le rate limiting du projet (table PostgreSQL `rate_limit_counters`, projet précédent) n'est pas affecté par le nombre de réplicas : il est centralisé dans Supabase.

## 6. Verdict

```
PROVEN  : le goulot end-to-end est le chemin REST Supabase ; Nginx + générateur + queries OK.
LIKELY  : saturation intermittente due à un rationnement/queueing de la plateforme Supabase
          (plan Free partagé) sans saturation Postgres.
UNKNOWN : la cause interne exacte (PostgREST / edge / pool / quota) — nécessite dashboard LIVE.
```

Références : ISOLATED_LOAD_TEST_REPORT.md, DOCKER_FINAL_REPORT.md, SUPABASE_LOAD_AUDIT.md, FINAL_ARCHITECTURE_AUDIT.md.
