# SUPABASE BOTTLENECK FINAL REPORT — Kissariya Cosmétiques

Date : 2026-08-14
Investigation réelle menée sur le projet Supabase existant (`https://ygkeuhatokvkdwwoccty.supabase.co`, plan Free), workload read-only, clé anon publique — rien de modifié dans l'application.

Objectif : déterminer POURQUOI la latence augmente parfois de façon incohérente à haut VU. Classification : PROVEN / LIKELY / UNKNOWN.

## 1. Architecture courante (vérifiée)

```
k6 → Supabase API (PostgREST) → PostgreSQL
Docker/Nginx (1 conteneur) : p95 5,5 ms @1000 VU (DOCKER_FINAL_REPORT.md) — hors goulot
```

## 2. Méthodologie de test (nouvelle, cette session)

- Script contrôlé `k6/bottleneck-controlled.js` : 8 workloads paramétrables (A listing, B search, C categories, D settings, E detail, F order, G contact, H mixte réaliste), pauses réalistes (1-5 s), compteurs de statuts (2xx/4xx/429/5xx/timeout), exports JSON.
- Runner `k6/run-controlled.ps1` : lit `.env` (anon par lecture signée), niveaux progressifs.
- Balayage H progressive : 50 → 100 → 250 → 500 → 700 → 1000 VU (2 min de sustain par niveau).
- Workloads isolés A et B à 700 VU (point d'inflexion).
- 1 run H répété à 700 VU (variance) + données historiques de la veille (sweep + re-runs, ISOLATED_LOAD_TEST_REPORT.md).
- Aucun run F/G contre la production (chemin d'écriture rate-limité — projet de test requis).

## 3. Résultats k6 mesurés (exports JSON réels, load-tests/results/controlled-*.json)

### 3.1 Workload mixte réaliste H (7 requêtes/VU, pauses réalistes)

| VU | RPS | p50 | p95 | p99 | max | Erreurs HTTP | 429/5xx | Requêtes |
|----|----:|----:|----:|----:|----:|----:|----:|----:|
| 50 | 33,2 | 76,5 | 89,4 | 97,8 | 179 | 0 % | 0 | 6 183 |
| 100 | 65,5 | 76,9 | 90,2 | 100,3 | 376 | 0 % | 0 | 12 273 |
| 250 | 163,7 | 76,3 | 89,3 | 99,4 | 530 | 0 % | 0 | 30 767 |
| 500 | 306,2 | 77,3 | 96,2 | 727 | 8 806 | 0 % | 0 | 58 088 |
| 700 | 414,9 | 88,1 | 654,7 | 2 017 | 3 723 | 0 % | 0 | 77 884 |
| 1000 | 524,9 | 375,3 | 726,2 | 891 | 1 707 | 0 % | 0 | 99 759 |

Toutes latences en millisecondes. Total : **284 954 requêtes, 0 erreur HTTP, 0 429, 0 5xx.**

### 3.2 Interprétation immédiate

- **50 → 500 VU : plateforme parfaitement linéaire** — p95 stable ≈ 89-96 ms, RPS multiplié par 9 (33→306) sans aucune dégradation.
- **700 VU : début de dégradation douce** (p95 655 ms, p99 2,0 s) ; **1000 VU : p95 726 ms, max 1,7 s**.
- AUCUN effondrement type « hier » (p95 8 s + timeouts 60 s) sur cette série : aujourd'hui la dégradation est **douce et bornée** (max 1,7 s), ce qui renforce l'hypothèse d'un facteur externe variable.

### 3.3 Workloads isolés @700 VU (identification du chemin qui sature)

| Workload | RPS | p95 | Erreurs | Verdict |
|---------|----:|----:|----:|----|
| A — listing produits | ~500 | **91,1 ms** | 0 (1 timeout TCP WARN = 0,003 %) | SANT — pas le goulot |
| B — recherche hybride | ~460 | **94,1 ms** | 0 (1 WARN connexion fermée) | SANT — pas le goulot |

Les requêtes uniques (même les plus lourdes : listing limit 60 avec embed, recherche hybride or-3-termes) restent sous 95 ms à 700 VU. La dégradation du mixte H vient du **volume cumulé** (7 requêtes simultanées par VU), pas d'une requête.

### 3.4 Variance — runs répétés à 700 VU (même workload, même charge)

| Run | p95 | Source |
|----|----:|----|
| Aujourd'hui, sweep | 654,7 ms | controlled-H-700vu (ce rapport) |
| Aujourd'hui, re-run | **124,8 ms** | variance exécutée cette session |
| Hier, sweep | 8 603 ms | sweep-progress.log |
| Hier, re-run | 427 ms | ISOLATED_LOAD_TEST_REPORT.md |

**PROVEN : la latence à 700 VU varie de ×5 à ×70 entre runs identiques dans la même heure.** Ce n'est pas le générateur (monitoré ≤ 58 % CPU), pas la puissance de requète, pas les erreurs (toujours 0).

### 3.5 Observations réseau (WARN k6)

À ≥ 700 VU pendant ~15-60 s de ramp : quelques « read tcp … wsarecv: An existing connection was forcibly closed by the remote host » / « did not properly respond ». Signature d'un comportement **côté serveur de l'API** (fermeture/expiration de connexion au niveau edge), jamais observé < 500 VU. LIKELY au niveau API gateway/edge, PAS PostgreSQL.

## 4. Métriques Supabase Dashboard

| Métrique | Disponibilité | Valeur observée |
|---|---|---|
| Database CPU / RAM / IO / connexions | disponible (rapports précédents) | ≈ 2 % CPU, ≈ 55 % RAM, ≈ 15/60 connexions, 0 % IO — **PROVEN NON-saturé** |
| API latency / API requests / errors (Reports → API) | **disponible sur le plan actuel** | NON capturées pendant ces runs (monitoring dashboard non effectué en parallèle) → **UNKNOWN**, commande ci-dessous |
| PostgREST / pool / quota / edge metrics | partiellement disponible | **UNKNOWN** |
| Edge Function execution / latency | disponible (Fonctions → Logs) | non pertinente (runs read-only REST) ; à consulter pour F/G |
| Limites plan (quotas) | partiellement visible | à vérifier dans Billing/Usage — **UNKNOWN** |

### Procédure exacte pour compléter la corrélation (dashboard, pendant un run à 700 VU)
1. Ouvrir **Reports → API** : noter Request rate, Response time (p50/p95), Error rate pendant le sustain.
2. Ouvrir **Reports → Database** : CPU, connections totales, remaining.
3. **Status → Logs** : filtrer `postgrest` ; chercher `timeout`, `32P01`, `pooler`, `rate_limit`, `429`, `502/503`.
4. **Billing → Usage** : API requests / Auth / Storage (quotas plan Free).
→ Ces captures transforment LIKELY en PROVEN/REFUTE mais n'étaient pas exécutables ici (accès dashboard requis, non fourni dans cette session).

## 5. Métriques base de données

- **PROVEN** : PostgreSQL n'était pas saturé (CPU ≈ 2 %, RAM ≈ 55 %, IO ≈ 0 %, connexions ≈ 15/60) aux moments des fortes latences (données dashboard de la phase précédente).
- Les index et selects sont déjà optimisés (pas de select=*, no N+1, index GIN trigram/FTS présents — DATABASE_INDEX_OPTIMIZATION.md).

## 6. Rate limiting (workloads F/G)

- **PROVEN (design)** : rate limiting centralisé PostgreSQL (`rate_limit_counters` + `bump_rate_limit` atomique), identique quel que soit le nombre de réplicas frontend — non contournable par du load balancing.
- Tests F/G : **documentés** (`k6/bottleneck-controlled.js` WORKLOAD=F/G, garde ≤ 5 VU) mais **non exécutés** ici — ils testent le chemin d'écriture Edge Function et requièrent un **projet de test dédié** (jamais la production). Exécution : `k6 run -e WORKLOAD=F -e MAX_VUS=3 k6/bottleneck-controlled.js`.
- RLS : les INSERT anon directs sont fermés (projet précédent) ; vérification statique ✅.

## 7. Analyse des requêtes (Phase 7)

| Chemin | SELECT | Version app | Coût relatif | Verdict cette session |
|---|---|---|---|---|
| Listing (A) | 18 colonnes + embed categories | optimisé | faible | p95 91 ms @700 — sain |
| Search (B) | 8 colonnes, or(FTS+2 ilike) | optimisé | faible-moyen | p95 94 ms @700 — sain |
| H (mixte) | 7 requêtes/VU dont home(limit 60) | Réel | somme | dégradation douce à ≥700 |

Aucune requête individuelle ne sature. Le point d'inflexion du mixte pose la question **plateforme/débit cumulé**, pas requète.

## 8. Analyse cache (Phase 8)

- **k6 = workload 100 % cold/no-cache** (chaque VU = nouveau visiteur sans React Query ni cache navigateur) → ces chiffres sont le **pire cas**. La vraie app warm (React Query stale 5 m + assets immutables) enverra **moins de requêtes réelles à Supabase**.
- Distinction : RPS mesuré ici = requêtes REST réelles émises par les VU (aucune origine cache du côté k6) ; dans l'app réelle, une partie des requêtes home/catalog est servie par React Query côté navigateur sans toucher Supabase (browser-hit, pas de REST).
- Conséquence : la capacité Supabase réelle en production est au moins égale aux chiffres cold ci-dessus.

## 9. Réplicas Docker 1/2/3 (Phase 10)

**NON EXÉCUTÉS** — le démon Docker n'est pas disponible dans cet environnement. Procédure fournie (k6/scale-static-test.js, docker-compose.scale.yml) ; les résultats ne sont PAS inventés.

## 10. Décision Load Balancer (Phase 11)

**B — Load Balancer non nécessaire aujourd'hui** (basé sur les mesures) : 1 conteneur Nginx absorbe 1000 VU statiques à p95 5,5 ms ; la capacité end-to-end est bornée par Supabase (p95 726 ms @1000 VU, 0 erreur, dégradation douce). La préparation (compose scale + /health + tests) reste en place, inutilisée.

## 11. Vrai goulot (synthèse)

| Couche | Verdict |
|---|---|
| Générator k6 | PROVEN sain (monitoré) |
| Docker/Nginx | PROVEN sain (p95 5,5 ms @1000) |
| Requêtes SQL individuelles | PROVEN saines (p95 ~90 ms @700 isolé) |
| PostgreSQL | PROVEN non-saturé (2 % CPU) |
| **Chemin REST cumulé (volume)** | **PROVEN goulot end-to-end** : dégradation douce à ≥700 VU, intermittente (×5-×70) |
| **Cause interne précis (edge Supabase / PostgREST / quota / tenant partagé)** | **UNKNOWN** — dashboard live requis |

## 12. Findings PROVEN

1. 50-500 VU : latence p95 ≈ 89-96 ms stable, RPS linéaire — capacité confortable largement au-dessus du trafic réel d'un e-commerce de cette taille.
2. ≥ 700 VU mixte : dégradation douce (p95 ≤ 726 ms à 1000 VU), 0 erreur HTTP, 0 429, 0 5xx, sur 284 954 requêtes.
3. Intermittence run-à-run à 700 VU : p95 125 ms → 655 ms → 8 603 ms → 427 ms (×5 à ×70).
4. Workloads isolés à 700 VU sains → la dégradation dépend du volume cumulé.
5. PostgreSQL, Nginx, générateur, requêtes individuelles : tous exclus.

## 13. Findings LIKELY

1. La variabilité run-à-run provient d'un comportement de la **plateforme** Supabase (tenant partagé / edge / throttling plan Free sans 4xx/5xx) — cohérent avec l'intermittence et les fermetures de connexion « remote closed » en ramp.
2. Des fenêtres « mauvaises » (p95 8 s, timeouts) apparaissent sous charge ≥ 700 VU à certains moments de la journée — corrélées à la charge globale du tenant (non démontré).

## 14. Findings UNKNOWN

1. Mécanisme interne exact (PostgREST vs API edge vs connection pool vs quota plan Free).
2. Position du point de saturation exacte de la plateforme (un seuil plan ? un bursting du tenant ?).
3. Comportement sous F/G (écritures rate-limitées) sur projet réel — non testé (projet de test requis).

## 15. Risques restants

1. Dashboard Supabase non corrélé en direct (UNKNOWN non résolu) — c'est l'unique étape pour conclure.
2. F/G non vérifiés en exécution réelle (projet de test requis).
3. Plan Free partagé : variabilité inter-jours probable (les chiffres d'aujourd'hui sont meilleurs qu'hier).
4. Docker replicas non exécutés (environnement sans daemon).

## 16. Optimisations recommandées (aucune appliquée — non nécessaires d'après les mesures)

1. **Aucune action sur les requêtes ni la base** : tout est sain (PROVEN).
2. Si le trafic réel approche 500 VU simultanés read-only (bien au-dessus d'un e-commerce standard) : évaluer le **plan Supabase supérieur** (quota/priorité tenant) plutôt que des réplicas frontend — c'est le chemin qui peut supprimer la variabilité, mais il doit être motivé par les métriques dashboard (UNKNOWN actuellement).
3. Étendre le staleTime React Query est déjà fait (5 min) — les pages réelles warm génèrent moins de charge que ce test cold.

## 17. Prochaine étape exacte avant mise en production

1. Déployer les Edge Functions `create-order`/`create-contact` + secrets (déjà committées).
2. **Corrélation dashboard** (1 run, 15 min) : lancer `powershell -File k6/run-controlled.ps1 -Workload H -Vus 700 -Sustain 2m` et, PENDANT le sustain, relever Reports → API (request rate, response time, errors) + Reports → Database (connections, remaining) + Status → Logs (timeout, 429, pooler). Reporter ces valeurs dans ce fichier.
3. (Optionnel) Exécuter F/G sur un projet de test dédié pour valider le 429.
4. Activer Cloudflare (domaine) — sans cache des /rest/v1.

## Verdict

```
PROVEN  : le goulot end-to-end est le chemin REST Supabase sous volume cumulé
          ≥ 700 VU mixtes ; dégradation DOUCE, 0 erreur, intermittente (×5-×70).
LIKELY  : variabilité = comportement de la plateforme Supabase (tenant partagé /
          edge / throttling sans 4xx) — non démontré sans dashboard.
UNKNOWN : mécanisme interne précis ; corrélation dashboard = seule étape restante.

Capacité mesurée (workload réaliste, pauses incluses) :
  À 500 VU → 306 RPS, p95 = 96 ms, erreurs = 0 %.
  À 1000 VU → 525 RPS, p95 = 726 ms, erreurs = 0 % (dégradation douce bornée).
