# RATE LIMITING IMPLEMENTATION — Kissariya Cosmétiques

Date : 2026-08-14

## 1. Architecture

```
Browser (React/Vite)
   ↓ POST (fetch)
Supabase Edge Function  ── create-order / create-contact ──
   ↓ validation serveur (payload, honeypot)
   ↓ rate limiting PERSISTANT (PostgreSQL)
   ↓ INSERT avec service_role (serveur uniquement)
Supabase → orders / contact_messages
```

- Les écritures publiques ne passent **plus** par PostgREST anon direct.
- Les GET publics, le cache Cloudflare, l'auth admin et le CRUD admin restent inchangés.
- `service_role` n'existe que dans les variables d'environnement des Edge Functions (Dashboard → Edge Functions → Secrets), jamais dans le navigateur.

## 2. Pourquoi le debounce/honeypot du frontend était insuffisant

Un attaquant peut appeler `POST /rest/v1/orders` ou `POST /rest/v1/contact_messages` directement avec la clé anon (publique), en contournant complètement le JavaScript. Les verrous anti-double-clic du frontend ne sont qu'une amélioration d'UX. La protection serveur est désormais effective :

- les policies anon `INSERT WITH CHECK (true)` ont été supprimées ;
- l'INSERT public n'est possible que via les Edge Functions (validation + rate limiting).

## 3. Endpoints Edge Functions

| Fonction | URL | Rôle | Réponses |
|---|---|---|---|
| `create-order` | `POST /functions/v1/create-order` | Créer une commande publique | 201, 400, 429, 405, 503 |
| `create-contact` | `POST /functions/v1/create-contact` | Créer un message de contact | 201, 400, 429, 405, 503 |

Les deux fonctions exposent **uniquement** ces opérations : aucune requête générique, aucun proxy SQL.

Corps de réponse d'erreur (message stable, aucun détail interne) :
```json
{ "error": "Too many requests. Please try again later." }
```

PRÉFLIGHT CORS géré (`OPTIONS` → 204). `ALLOWED_ORIGINS` optionnel (liste séparée par des virgules) pour restreindre les origines.

## 4. Rate limits (valeurs par défaut, configurables)

| Ressource | Fenêtre | Limite | Variable d'env |
|---|---|---|---|
| `orders` | 10 min | 3 | `ORDERS_LIMIT_10M` |
| `orders` | 1 h | 10 | `ORDERS_LIMIT_1H` |
| `contact_messages` | 10 min | 3 | `CONTACT_LIMIT_10M` |
| `contact_messages` | 1 h | 10 | `CONTACT_LIMIT_1H` |

- Dépassement d'UNE fenêtre → **429** + header `Retry-After` (minutes).
- Deux compteurs par bucket (10 min + 1 h), incrémentés **atomiquement** en base à chaque soumission.
- **Aucune Map en mémoire** : les compteurs sont dans `public.rate_limit_counters`, partagés entre toutes les instances Edge Function (éphémères et scalées horizontalement).
- Anti-spam : champ honeypot validé côté serveur (une valeur remplie → rejet silencieux 400).

## 5. Gestion de l'IP

- L'IP est lue **uniquement** dans les en-têtes de la plateforme, jamais dans le corps de requête :
  1. `cf-connecting-ip` (Cloudflare — déploiement actuel)
  2. `x-forwarded-for` (première entrée)
  3. `x-real-ip`
- L'IP est **hachée** (HMAC-SHA256, 128 bits) avant stockage : aucune IP en clair dans `rate_limit_counters`. Clé HMAC : `RATE_LIMIT_HASH_SECRET` (recommandé en production).
- Sans clé : SHA-256 simple (pas réversible, mais vulnérable à une attaque par dictionnaire IP).

## 6. Validation des payloads (400)

**Orders** (`validateOrderPayload`) :
- `product_name` requis, ≤ 200
- `customer_name` requis, ≤ 120
- `customer_phone` optionnel (flux panier sans téléphone) ; si présent, format `+?[0-9]{6,20}`
- `customer_city` ≤ 80, `notes` ≤ 2 000, optionnels
- `quantity` entier [1, 99]
- `total_price` nombre fini [0, 1 000 000]
- `status` ≠ `pending` → rejet (anti-fraude : jamais de `completed`/`cancelled` public)
- honeypot `website` rempli → rejet silencieux
- **Prix dérivé côté serveur** quand `product_id` est fourni : `total = prix_catalogue × quantité` (le prix client est ignoré). Sans `product_id` (panier libre), le total reste borné par la validation (limite documentée).

**Contact messages** (`validateContactPayload`) :
- `name` requis ≤ 120, `email` requis + regex simple
- `phone` optionnel (format si présent), `subject` optionnel ≤ 200
- `message` requis ≥ 10, ≤ 3 000
- honeypot `website` rempli → rejet silencieux

## 7. Changements base de données

Tout est dans **`supabase/database.sql`** (script unique — aucun dossier migrations séparé).

Nouvelles tables/fonctions :
- `rate_limit_counters(bucket_key, window_start, count, updated_at)` — PK `(bucket_key, window_start)`, index `idx_rate_limit_counters_updated_at`
- `bump_rate_limit(bucket_key, window_start, max_count)` — upsert atomique, exécutable **uniquement** par `service_role`
- `cleanup_rate_limit_counters(cutoff)` — nettoyage global (appel probabiliste), `service_role` uniquement

RLS :
- `rate_limit_counters` : RLS activée, **aucune policy** (seul `service_role` y accède via les fonctions)
- `orders` : policy anon INSERT **supprimée** ; ajout de `orders_admin_insert` (`is_admin()`) pour que le formulaire admin « Ajouter une commande » continue de fonctionner
- `contact_messages` : policy anon INSERT **supprimée** ; aucune policy d'INSERT (l'unique chemin est l'Edge Function)

Croissance bornée :
- `bump_rate_limit` supprime les lignes expirées du même bucket (> 2 h)
- l'Edge Function déclenche un nettoyage global probabiliste (2 % des appels, index `updated_at`)

## 8. RLS préservée

Aucune policy existante n'a été affaiblie. Toutes les tables restent protégées. Les seuls changements sont :
- suppression des INSERT anon sur `orders` et `contact_messages` (fermeture de brèche),
- ajout de `orders_admin_insert` (même modèle `is_admin()` que les policies existantes).

## 9. Comportement admin (inchangé)

- Login : `supabase.auth.signInWithPassword` (page `/admin/login` + backoff client existant).
- CRUD commandes : liste paginée, stats, changement de statut, édition client, suppression, **ajout manuel** — tout passe par PostgREST avec le JWT authentifié (policy `orders_admin_insert` et `orders_admin_*`).
- Produits / catégories / paramètres / promos : inchangés.
- **Aucun CRUD admin ne passe par les Edge Functions publiques.**

## 10. Variables d'environnement

Côté frontend (inchangé, public par conception) :
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` (clé anon)

Côté Edge Functions (Secrets Dashboard → Edge Functions) :
- `SUPABASE_URL` (obligatoire)
- `SUPABASE_SERVICE_ROLE_KEY` **ou** `SUPABASE_SERVICE_ROLE` (obligatoire — ne jamais exposer)
- `ORDERS_LIMIT_10M` (défaut 3), `ORDERS_LIMIT_1H` (défaut 10)
- `CONTACT_LIMIT_10M` (défaut 3), `CONTACT_LIMIT_1H` (défaut 10)
- `RATE_LIMIT_HASH_SECRET` (recommandé)
- `ALLOWED_ORIGINS` (optionnel)

## 11. Déploiement

1. Appliquer `supabase/database.sql` (SQL Editor — idempotent).
2. Déployer les fonctions :
   ```
   supabase functions deploy create-order
   supabase functions deploy create-contact
   ```
3. Configurer les secrets des deux fonctions : `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (+ limites et hash si surcharge).
4. Reconstruire/déployer le frontend (inchangé pour Netlify/Vercel/Docker : mêmes `VITE_*`).

## 12. Tests

- `npx vitest run` — 97 tests verts, dont `supabase/functions/_shared/validation.test.ts` (19 tests de validation des Edge Functions).
- `npx tsc --noEmit -p tsconfig.app.json` — aucun erreur.
- `npm run build` — OK.
- k6 : `k6 run k6/rate-limit-test.js` (projet de test dédié)

  Vérifie trafic normal → 201 et burst → 429 pour les deux endpoints, avec des payloads marqués `[k6 test]`. Ne pas exécuter contre la production.

## 13. Limites connues

- Le `cf-connecting-ip` n'est disponible que si la requête passe bien par Cloudflare ; en l'absence d'IP fiable, les soumissions tombent dans un bucket `unknown` partagé (défensif : ce bucket se sature vite).
- Les commandes panier sans `product_id` ne peuvent pas avoir leur total vérifié indépendamment (pas de line-items) : le total client est borné numériquement, et le rate limiting limite l'impact d'une manipulation.
- Fenêtres fixes (10 min / 1 h) : un utilisateur au voisinage de la frontière d'une fenêtre peut légèrement dépasser la limite nominale (compromis simplicité/cout accepté).
- Le honeypot est une protection secondaire ; le taux limite IP est le mécanisme principal.
