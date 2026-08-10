# Rapport de test de charge — Kissariya Cosmétiques

> Statut : ✅ **Exécuté avec succès** — k6 v2.1.0 (Windows), cible locale `http://localhost:4173`
> (serveur `vite preview` servi sur le build de production). Exécuté le 02/08/2026.

## Exécution

```bash
# Cible locale (après `npm run build && npm run preview -- --port 4173`)
k6 run scripts/k6-load-test.js

# Cible production
k6 run -e TARGET_URL=https://<domaine-production> scripts/k6-load-test.js
```

## Résultats réels (02/08/2026)

### Run 1 — 20 VU (scénario standard)

| Métrique | Valeur | Seuil cible | Statut |
|---|---|---|---|
| `http_req_duration` p(95) | **2.62 ms** | < 800 ms | ✅ Validé |
| `http_req_failed` | **0.00 %** (0/927) | < 1 % | ✅ Validé |
| Requêtes totales | 927 (7.60 req/s) | — | — |
| Checks réussis | 1854/1854 (100 %) | — | — |

### Run 2 — 500 VU (stress) `k6 run -e MAX_VUS=500 -e DURATION=1m`

| Métrique | Valeur | Seuil cible | Statut |
|---|---|---|---|
| `http_req_duration` p(95) | **2.09 ms** | < 800 ms | ✅ Validé |
| `http_req_failed` | **0.00 %** (0/22 784) | < 1 % | ✅ Validé |
| Requêtes totales | 22 784 (185.83 req/s) | — | — |
| Checks réussis | 45 568/45 568 (100 %) | — | — |
| Durée moyenne | 1.08 ms (max 21.15 ms) | — | — |
| Données reçues | 86 MB (700 kB/s) | — | — |
| VU max | 500 | — | — |

**Sortie k6 run 2 (extraits) :**

```
█ THRESHOLDS
  http_req_duration
  ✓ 'p(95)<800' p(95)=2.09ms
  http_req_failed
  ✓ 'rate<0.01' rate=0.00%

█ TOTAL RESULTS
  checks_total.......: 45568   371.67/s
  checks_succeeded...: 100.00% 45568 out of 45568
  ✓ status est 200
  ✓ réponse non vide
  http_req_duration..: avg=1.08ms med=1.04ms max=21.15ms
  http_reqs..........: 22784   185.83/s
  vus_max............: 500
```

## Scénario

| Paramètre | Valeur |
|---|---|
| Charge | 20 utilisateurs virtuels constants |
| Durée | 2 min (rampe 30 s, palier 60 s, descente 30 s) |
| Requêtes | Pages : `/`, `/produits`, `/auth`, fallback 404 |
| Rythme | 1 lecture / 1–3 s (comportement réaliste de visite) |

## Seuils (thresholds)

| Métrique | Seuil | Justification |
|---|---|---|
| `http_req_duration` p(95) | < 800 ms | Temps de réponse perçu < 1 s |
| `http_req_failed` | < 1 % | Objectif de disponibilité 99 %+ |

## Garanties de performance déjà en place (code)

- **Prerendering statique** (`scripts/prerender-products.mjs`) : HTML généré pour
  l'accueil et les fiches produits — TTFB minimal, indexation SEO.
- **Code splitting** (React `lazy`) : chaque page admin et secondaire chargée à la
  demande uniquement.
- **Cache React Query** : `staleTime`/`gcTime` configurés par ressource, aucune
  re-fetch au clic (accueil = 1 seul aller-retour DB).
- **Images** : `loading="lazy"` sur les sections hors viewport, objets Supabase
  servis via CDN.
- **Cache HTTP** : contrôle via `netlify.toml` / `vercel.json`.

## Remarque d'exécution

Le test a été exécuté **en local** contre le serveur de preview (`vite preview`),
qui sert le build de production. Les performances mesurées (p95 = 2.62 ms, 0 %
d'erreur) sont donc représentatives du rendu HTTP du bundle optimisé, sans le
réseau ni le CDN. En production avec Vercel/Netlify + Cloudflare, la latence
réseau et la gestion des fonctions serverless s'ajouteront ; relancer le même
script avec `-e TARGET_URL=https://<domaine-production>` avant une campagne
publicitaire afin de confirmer les seuils sur l'infrastructure réelle.

*Rapport mis à jour le 02/08/2026 avec les métriques réelles du run local.*


---

## Test de charge RÉEL Supabase (k6) — remplace le test local

Le script scripts/k6-load-test.js pèse directement l'API Supabase (PostgREST + GoTrue + PostgreSQL), pas le rendu Vite local. Scénarios couverts : listing produits, recherche/filtre, fiche produit, login GoTrue (compte non-admin de test), INSERT commande de test. Aucun secret utilisé : SUPABASE_URL + SUPABASE_ANON_KEY (clé publique) + compte de test non-admin — voir .env.example. Jamais de service_role.

### Exécution (projet Supabase DÉDIÉ AUX TESTS, jamais la production)

```text
k6 run -e SUPABASE_URL=https://<projet-test>.supabase.co -e SUPABASE_ANON_KEY=<cle-anon-test> -e SUPABASE_TEST_EMAIL=loadtest@example.com -e SUPABASE_TEST_PASSWORD=<mdp> -e MAX_VUS=40 -e DURATION=2m scripts/k6-load-test.js
```

> Free Plan : charge prudente (≤ 40 VU). Au-delà, Supabase applique des limites de débit (anti-DoS) — c'est une limite de plateforme, pas du code.

### Résultats (à reporter après exécution, aucun chiffre inventé)

```text
Environment: Supabase test project
Virtual Users: 40
Duration: ~3 min (rampe 30s + palier 2m + descente 30s)
Requests/sec: <à mesurer>
p50: <ms> | p95: <ms> | p99: <ms>
Errors: <percent>
Timeouts: <percent>
```

L'ancien test local (02/08/2026, 185 req/s / 500 VU sur vite preview) ne touchait PAS Supabase et est conservé plus haut à titre historique.

*Rapport mis à jour le 09/08/2026.*
