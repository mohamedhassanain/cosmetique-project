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

| Métrique | Valeur | Seuil cible | Statut |
|---|---|---|---|
| `http_req_duration` p(95) | **2.62 ms** | < 800 ms | ✅ Validé |
| `http_req_failed` | **0.00 %** (0/927) | < 1 % | ✅ Validé |
| Requêtes totales | 927 (7.60 req/s) | — | — |
| Checks réussis | 1854/1854 (100 %) | — | — |
| Durée moyenne | 1.77 ms (médiane 1.69 ms, max 12.6 ms) | — | — |
| Données reçues | 3.5 MB (29 kB/s) | — | — |
| VU max | 20 | — | — |

**Sortie k6 (extraits) :**

```
█ THRESHOLDS
  http_req_duration
  ✓ 'p(95)<800' p(95)=2.62ms
  http_req_failed
  ✓ 'rate<0.01' rate=0.00%

█ TOTAL RESULTS
  checks_total.......: 1854    15.19/s
  checks_succeeded...: 100.00% 1854 out of 1854
  ✓ status est 200
  ✓ réponse non vide
  http_req_duration..: avg=1.77ms med=1.69ms max=12.6ms
  http_reqs..........: 927     7.60/s
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
