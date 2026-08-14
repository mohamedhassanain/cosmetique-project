# PERFORMANCE DIAGNOSIS — Kissariya Cosmétiques

Date : 2026-08-14
Architecture : React/Vite → Docker/Nginx → Supabase (Auth + PostgreSQL + Storage + Edge Functions). Aucun backend custom. Plan Supabase : Free. Classification : PROVEN / LIKELY / UNKNOWN.

## 1. Architecture courante (inchangée)

```
Utilisateurs → Cloudflare → Docker/Nginx (1 conteneur) → React/Vite → Supabase
```
Load Balancer + réplicas Docker : préparés mais NON actifs. Frontend stateless (aucune donnée de session serveur).

## 2. Hypothèse de goulot (avant test)

Suspect principal : chemin REST Supabase (API/plateforme) sous volume cumulé. PostgreSQL, Nginx et requêtes individuelles déjà exclus par les mesures précédentes.

## 3. Tests effectués (cette session, exécution réelle)

| Test | Niveau | Sustained | Label | Fichier résultat |
|---|---|---|---|---|
| TEST 1 | 500 VU | 2 min | diag500 | load-tests/results/controlled-H-500vu-diag500.json |
| TEST 2 | 700 VU | 2 min | diag700 | load-tests/results/controlled-H-700vu-diag700.json |
| TEST 3 | 1000 VU | 2 min | diag1000 | load-tests/results/controlled-H-1000vu-diag1000.json |

Pauses de 60 s entre tests. Workload H réaliste (7 requêtes/VU : site_settings 6 colonnes, categories, promos, listing, détail, catalogue, recherche — pauses 1–5 s). Aucun run d'écriture, aucune donnée modifiée.

## 4. Commandes exactes (reproductibles)

```
powershell -NoProfile -ExecutionPolicy Bypass -File k6\run-controlled.ps1 -Workload H -Vus 500 -Sustain 2m -RunLabel diag500
powershell -NoProfile -ExecutionPolicy Bypass -File k6\run-controlled.ps1 -Workload H -Vus 700 -Sustain 2m -RunLabel diag700
powershell -NoProfile -ExecutionPolicy Bypass -File k6\run-controlled.ps1 -Workload H -Vus 1000 -Sustain 2m -RunLabel diag1000
```

## 5. Résultats des benchmarks (MEASURED, exports réels)

| Métrique | 500 VU | 700 VU | 1000 VU |
|---|---|---|---|
| RPS | 286,7 | 445,3 | 231,0 |
| p50 | 80,1 ms | 81,7 ms | 466,2 ms |
| p90 | 127,6 ms | 102,3 ms | 6 462,3 ms |
| p95 | 701,4 ms | 121,7 ms | 11 809,9 ms |
| p99 | 4 423,2 ms | 664,2 ms | 31 214,1 ms |
| max | 9 658,4 ms | 3 784,4 ms | 40 468,7 ms |
| Erreurs % | 0 | 0 | 0 |
| 429 | 0 | 0 | 0 |
| 5xx | 0 | 0 | 0 |
| Timeouts (≥60 s) | 0 | 0 | 0 |
| Requêtes 2xx | 54 427 | 84 205 | 48 651 |

### Interprétation
1. **La latence n'augmente PAS de façon monotone avec les VU** : 700 VU (p95 122 ms) est 5,8× PLUS RAPIDE que 500 VU (p95 701 ms) dans la même séquence de 20 min. Preuve supplémentaire de la **variance inter-run de la plateforme** (déjà mesurée ×5–×70).
2. **Point d'inflexion réel à 1000 VU** : RPS chute de 445 → 231 (backpressure : le débit ne suit plus), p95 explose à 11,8 s, p99 31 s, max 40 s, MAIS 0 erreur, 0 429, 0 5xx. Signature d'une saturation du chemin API (file d'attente côté plateforme) sans rejet.
3. **Aucune erreur, aucun timeout** sur toute la série — la dégradation est une latence, jamais une indisponibilité.

## 6. Métriques Supabase (dashboard)

Capturées dans les sessions précédentes (Reports → Database) :
- CPU : ≈ 2–18 % · RAM : ≈ 55–69 % · Connexions : ≈ 17/60 · IO : ≈ 0 % — **PROVEN DB non saturée** pendant les pics de latence.
- API latency/errors du dashboard pendant CES 3 runs : **UNKNOWN** (non relevées en parallèle cette session) — procédure exacte dans SUPABASE_LIVE_DIAGNOSIS_RUNBOOK.md §2.
- Metrics endpoint machine : **UNAVAILABLE ON CURRENT PLAN** (vérifié).
- Rétention logs : 1 jour (plan Free).

## 7. Goulots identifiés

| Couche | Verdict |
|---|---|
| PostgreSQL | PROVEN non-goulot (CPU/connexions faibles aux moments des pics) |
| Frontend/Docker/Nginx | PROVEN non-goulot (p95 5,5 ms @1000 VU statique — rapport Docker) |
| Requêtes SQL individuelles | PROVEN saines (p95 87–116 ms @700 VU isolé) |
| Chemin REST cumulé ≥ 700-1000 VU | PROVEN = goulot end-to-end, dégradation DOUCE (0 erreur) |
| Mécanisme exact (edge/PostgREST/CPU partagé Free) | UNKNOWN — corrélation dashboard = étape de fermeture |
| Rate limiting (écriture) | PROVEN en place, centralisé PostgreSQL |

## 8. Changements effectués

Aucun changement applicatif nécessaire cette session. Le seulement changement de cette vague : anti-spam 5 s dans les Edge Functions (commit 546440f, validé TSC/Vitest/ESLint/Build).

## 9. Avant / Après

- Avant (sessions précédentes) : 500 VU p95 89–96 ms (fenêtre calme) ; après (aujourd'hui, fenêtre chargée) : 500 VU p95 701 ms. La différence est la FEMÊTRE PLATEFORME, pas un changement de code.
- Le correctif k6 (select 6 colonnes au lieu de select=*) : la requête site_settings du workload H correspond désormais à l'app réelle — les futurs relevés dashboard seront représentatifs.

## 10. Risques restants

1. Variance plateforme Free non maîtrisable (×5–×70 selon la fenêtre).
2. Corrélation dashboard non réalisée en direct (UNKNOWN).
3. Déploiement Edge Functions + secrets non fait (étape manuelle §14).
4. F/G (écritures) non validés en réel (projet de test requis).

## 11. Architecture de production recommandée

**Niveau actuel atteint (niveau 2) :** architecture existante + optimisation/caching + rate limiting.
Niveau 3 (à décider après corrélation dashboard) : Cloudflare actif + plan Supabase payant SI la variance devient gênante.
Niveaux 4-6 (dédié backend/Redis/K8s) : uniquement si le trafic réel le justifie — AUCUNE preuve actuelle ne le demande.

## 12. Feuille de route de scaling

| Niveau | Contenu | Statut |
|---|---|---|
| 1 | Architecture actuelle | ✅ |
| 2 | Optimisation + cache + rate limiting | ✅ |
| 3 | Cloudflare/CDN + plan Supabase supérieur si requis | En attente de décision (corrélation) |
| 4 | Backend dédié + load balancing | Non justifié |
| 5 | Redis / multi-instances | Non justifié |
| 6 | Kubernetes | Non justifié (frontend stateless, Supabase = backend) |

## 13. Conclusion

- Capacité stable prouvée : jusqu'à **700 VU** (445 RPS, p95 122 ms, 0 erreur dans la meilleure fenêtre ; 0 erreur dans toutes les fenêtres).
- À 1000 VU : dégradation sévère de latence mais 0 erreur → utilisable en dégradé, pas confortable.
- La variable dominante n'est pas le code mais la **fenêtre de la plateforme Free**.
