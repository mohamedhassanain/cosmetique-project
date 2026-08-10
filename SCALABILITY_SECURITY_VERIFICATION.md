# Scalability & Security Verification

Date : 2026-08-09
Projet : Kissariya Cosmétiques (React + TypeScript + Vite + Supabase)

---

## 1. Load Testing

```
Environment : à définir — voir « Required action » ci-dessous
Test type   : k6, API réelle Supabase (scripts/k6-load-test.js)
Virtual users : 500 (configurable via environnement)
Duration    : à définir lors de l'exécution
Requests/sec : NON MESURÉ (test non exécuté)
p50 : NON MESURÉ
p95 : NON MESURÉ
p99 : NON MESURÉ
Erreurs : NON MESURÉ
Timeouts : NON MESURÉ
```

**Ce test atteint-il réellement Supabase ?**

Le script `scripts/k6-load-test.js` a été conçu pour cibler les endpoints réels
de l'API Supabase (products, recherche, détail produit) via `SUPABASE_URL` et une
`SUPABASE_ANON_KEY` de TEST fournies par variables d'environnement. Aucune requête
frontend-only (localhost/Vite) n'est utilisée.

Le test n'a **pas pu être exécuté** dans cette session : il requiert des
identifiants Supabase d'un **projet de test dédié**, que je ne possède pas.

```
NOT RUN
Reason: les identifiants d'un projet Supabase de test sont requis
        (SUPABASE_URL + SUPABASE_ANON_KEY) et n'ont pas été fournis.
Required action:
  1. Créer un projet Supabase de test (plan gratuit) et y exécuter supabase/database.sql
  2. cp .env.example .env.k6  (remplir SUPABASE_URL et SUPABASE_ANON_KEY du projet de test)
  3. k6 run scripts/k6-load-test.js
  4. Reporter les résultats dans docs/load-test-results.md
```

Scénarios couverts par le script : product listing, search/filter, product details.
Les scénarios auth/cart/order sont volontairement non écrits en production :
ils nécessitent un compte de test dédié et un projet d'isolation.

---

## 2. Admin Security

### Modèle d'autorisation (actuel)

Ce projet Supabase Auth est réservé EXCLUSIVEMENT aux comptes administrateurs.
Il n'existe AUCUN système de rôles :

- **Utilisateur authentifié (`auth.uid() IS NOT NULL`) → ADMIN**
- **Visiteur non connecté → PAS ADMIN**

Les comptes sont créés manuellement par l'administrateur de confiance :
Supabase Dashboard → Authentication → Users → Create user (email + mot de passe).
L'application ne propose ni inscription publique, ni page /signup, ni appel
`signUp()`.

### `is_admin()`

```sql
SELECT auth.uid() IS NOT NULL;
```

C'est SÛR sous cette architecture : aucun visiteur ne peut créer de compte
lui-même, donc « authentifié » implique « compte admin créé manuellement ».
Aucune donnée utilisateur-éditable (`raw_user_meta_data`, profil) n'est utilisée
pour l'autorisation. **Ne pas** réintroduire de table `admin_users` ni de
colonne `role`.

### Vérifications de comportement

```
Visiteur anonyme             → is_admin() = false → /admin redirige /admin/login
Compte admin (Auth) connecté → is_admin() = true  → accès /admin complet
```

### RLS

Toutes les tables sensibles (products, orders, contact_messages, categories,
subcategories, site_settings, promos, product_images, storage.objects) utilisent
`public.is_admin()` dans leurs policies d'écriture. Les SELECT publics restent
limités aux lectures légitimes (`products.is_active`, `promos.is_active`, etc.).
Les INSERT publics intentionnels restent ouverts uniquement pour `orders`
(commandes WhatsApp) et `contact_messages` (formulaire de contact).

### Configuration requise dans le dashboard Supabase

1. **Authentication → Providers → Email** : laisser l'option « Allow new users
   to sign up » DÉSACTIVÉE — il n'y a aucune inscription publique.
2. **Créer les comptes admin** : Authentication → Users → Create user
   (email + mot de passe). Chaque compte créé est un compte admin.
   Ex. : admin1@example.com, admin2@example.com, admin3@example.com — tous
   valides sans aucune configuration supplémentaire.
3. **SQL Editor** : exécuter UNIQUEMENT `supabase/database.sql` (idempotent).
   Aucun autre script n'est requis ; ce fichier ne crée plus ni `admin_users`
   ni RPC de gestion d'admins.

---

## 3. Image Optimization

### Composants modifiés / audités

- `src/components/product/ProductCard.tsx` — produit mis à jour : `srcSet` + `sizes`,
  `loading="lazy"`, `width`/`height`, vignette `image_url_400`.
- `src/pages/shop/ProduitDetail.tsx` — image principale : `srcSet`/`sizes`,
  `width`/`height`, image moyenne `image_url_800` ; galerie via `ProductCarousel`.
- `src/components/shop/HeroPromoCarousel.tsx` — image héro optimisée,
  chargement `eager` si premier slide (au-dessus de la ligne de flottaison),
  sinon `lazy` pour les slides suivants.
- Helpers : `src/lib/images.ts` (srcSet/image optimisée) et
  `src/lib/image-variants.ts` (variants 400/800).

### srcSet / sizes

- ProductCard : `srcSet` 400w + original, `sizes="(min-width:768px) 25vw, 50vw"`.
- ProduitDetail : `srcSet` 800w + original, `sizes="(min-width:768px) 50vw, 100vw"`.
- Héro : `srcSet` large + original, `sizes="100vw"`.

### Lazy / eager

- `loading="lazy"` sur les vignettes hors écran (ProductCard).
- `eager` + `fetchpriority="high"` sur l'image héro du premier slide (LCP).
- Lazy sur les slides suivants du carrousel.

### Formats

WebP/AVIF : évalués ; l'application passe par les URLs Supabase Storage existantes
(le stockage sert les fichiers originaux avec négociation de format par le CDN).
Aucune conversion forcée côté client pour ne pas casser les URLs existantes.

### Stratégie Storage

- Les images sont **dans le bucket** `cosmetics-images` (Supabase Storage),
  **jamais dans PostgreSQL** — la base ne stocke que des URLs
  (`image_url`, `image_url_400`, `image_url_800`, `product_images.url`).
- Bucket public (lecture publique), écriture réservée aux admins (policy
  `images_admin_manage` avec `public.is_admin()`).
- Les uploads `useImageUpload` compressent/redimensionnent côté client avant
  envoi (limite de taille évitée).

---

## 4. Tests

| Vérification | Résultat |
|---|---|
| TypeScript (`tsc --noEmit`) | ✅ PASS — exit 0 |
| ESLint (fichiers modifiés) | ✅ PASS — exit 0 |
| Build production (`vite build`) | ✅ PASS — exit 0 |
| Tests unitaires (`vitest run`) | ✅ PASS — 11 fichiers, 70/70 tests |
| E2E (Playwright) | NOT RUN — raison : nécessite un serveur + Supabase de test |

```
E2E — NOT RUN
Reason: Playwright requiert un environnement lancé (supabase local + front)
        avec des identifiants de test.
Required action: supabase start && npm run dev && npx playwright test
```

```
Load test — NOT RUN
Reason: identifiants d'un projet Supabase de test non fournis.
Required action: voir section 1.
```

---

## 5. Remaining Risks

1. **Load test non exécuté** — les chiffres annoncés précédemment (~185 req/s,
   500 VU) concernaient un test local/Vite et NE SONT PAS reproductibles sur
   Supabase. Aucune donnée de performance réelle n'est encore disponible.
2. **E2E Playwright non exécuté** — la suite couvre le smoke (navigation),
   mais pas encore un parcours admin complet.
3. **Création des comptes** : la création de compte reste manuelle et se fait
   uniquement dans le Dashboard Supabase (Authentication → Users → Create user).
   L'application n'expose aucun mécanisme de création de compte.
4. **Backoff / rate-limiting** : la sécurité applicative repose sur GoTrue ;
   un vrai projet en production doit activer les protections anti-brute-force
   natives (email confirmations, captcha optionnel).
5. **CDN/edge caching** : `netlify.toml` / `vercel.json` doivent être vérifiés
   pour les headers de cache (images, JS/CSS) — non audités dans cette session.
6. **Sentry** : la config envoie des événements en dev ; vérifier la DSN de
   production avant mise en ligne.

---

### Résumé

- ✅ Sécurité admin : tout compte Supabase Auth créé manuellement = admin
  (aucun système de rôles, aucune table admin_users), RLS active.
- ✅ Aucune inscription publique, aucun mécanisme de création de compte
  dans l'application.
- ✅ Images produit/héro optimisées (srcSet, sizes, lazy/eager).
- ✅ TypeScript, ESLint, build et 70 tests unitaires passent.
- ⚠️ Load test réel Supabase et E2E : non exécutés (identifiants/environnement
  manquants) — commandes documentées.
