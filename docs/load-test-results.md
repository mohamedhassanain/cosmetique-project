# Rapport de test de charge — Kissariya Cosmétiques

> Statut : **Prêt à exécuter** — k6 n'est pas installé sur la machine de dev locale
> (Windows, aucun binaire `k6` disponible). Le script standard est fourni et doit
> être lancé en CI (GitHub Actions) ou sur toute machine disposant de k6.

## Exécution

```bash
# Cible locale (après `npm run build && npm run preview -- --port 4173`)
k6 run scripts/k6-load-test.js

# Cible production
k6 run -e TARGET_URL=https://<domaine-production> scripts/k6-load-test.js
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

Vercel/Netlify appliquent des limites aux fonctions serverless : un test à 20 VU
contre la production était volontairement conservateur. Pour une vitrine locale,
ce profil couvre largement le trafic réel. Un test à 100 VU est recommandé avant
une campagne publicitaire.

*Rapport généré le 02/08/2026 — à compléter avec les métriques CI une fois k6 exécuté.*
