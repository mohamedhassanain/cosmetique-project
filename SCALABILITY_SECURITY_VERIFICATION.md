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

### Vulnérabilité précédente

L'ancien `is_admin()` retournait `auth.uid() IS NOT NULL`, c'est-à-dire
« tout utilisateur authentifié = admin ». Avec l'inscription publique activée,
n'importe quel visiteur pouvait créer un compte, puis accéder au CRUD admin
(produits, commandes, paramètres) et aux données sensibles.

### Nouveau mécanisme d'autorisation

1. Table `public.admin_users (user_id → auth.users.id, email, created_at, created_by)`
   : liste EXPLICITE des administrateurs.
2. `is_admin()` = `EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())`.
3. Aucune donnée utilisateur-éditable (`raw_user_meta_data`, profil) n'est utilisée
   pour l'autorisation.
4. RLS sur `admin_users` : SELECT = sa propre ligne uniquement ; **aucune** policy
   d'écriture pour `anon`/`authenticated` ; `REVOKE INSERT, UPDATE, DELETE` ajouté.
   Seul `service_role` (SQL Editor) peut écrire.
5. **Nouveau (cette session)** : écran « Administrateurs » dans le dashboard
   (`/admin/administrateurs`) + RPC `list_admins` / `add_admin` / `remove_admin`.
   Toutes les RPC sont `SECURITY DEFINER` et vérifient `public.is_admin()` :
   un non-admin ne peut ni lister, ni ajouter, ni retirer un admin.
   L'ajout/retrait se fait par EMAIL uniquement — l'UUID cible est résolu côté base,
   jamais manipulé par le client.

### Comment les admins sont identifiés

Un utilisateur est admin si et seulement si son `auth.uid()` possède une ligne
dans `public.admin_users`. Le carrousel `auth.role() = 'authenticated'` n'accorde
plus jamais le rôle admin.

### Comment un utilisateur normal est empêché de devenir admin

- Nouvel inscrit : aucune ligne dans `admin_users` → `is_admin()` = false.
- Il ne peut pas insérer dans `admin_users` (aucune policy d'écriture + REVOKE).
- Les RPC d'ajout vérifient `is_admin()` côté serveur → un non-admin reçoit
  « Accès refusé ».
- Son `raw_user_meta_data` est ignoré par toute la chaîne d'autorisation.

### Vérifications de comportement

```
Utilisateur anonyme          → is_admin() = false → /admin redirige /acces-refuse
Utilisateur authentifié simple → is_admin() = false → /admin redirige /acces-refuse
Admin explicite (admin_users) → is_admin() = true  → accès /admin complet
```

### RLS

Toutes les tables sensibles (products, orders, contact_messages, categories,
subcategories, site_settings, promos, product_images, storage.objects) utilisent
`public.is_admin()` dans leurs policies d'écriture. Les SELECT publics restent
limités aux lectures légitimes (`products.is_active`, `promos.is_active`, etc.).

### Configuration requise dans le dashboard Supabase

1. **Authentication → Providers** : laisser Email activé. L'inscription publique
   peut rester activée : elle ne crée JAMAIS d'admin.
2. **SQL Editor** : exécuter UNIQUEMENT `supabase/database.sql` (idempotent).
   C'est LE fichier unique du schéma : création de toutes les tables,
   `admin_users` (avec email), RLS, `is_admin()` et les RPC
   `list_admins` / `add_admin` / `remove_admin` (bloc « ADMIN MANAGEMENT »
   en fin de fichier). Aucun autre script n'est requis.
3. **Premier admin** (table vide) — SQL Editor :
   ```sql
   INSERT INTO public.admin_users (user_id, email)
   SELECT id, email FROM auth.users WHERE email = 'votre-email@exemple.com';
   ```
   Ou : `auth.uid()` d'un compte admin existant.
4. **Table Editor → admin_users** : vérifier la colonne `email` (rétro-remplie
   automatiquement par database.sql).
5. Ensuite, les admins suivants s'ajoutent depuis `/admin/administrateurs`
   (dashboard) par email — sans toucher au SQL.

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
| Build production (`vite build`) | ✅ PASS — exit 0 (chunk AdminUsers généré) |
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
3. **Premier admin** : tant que `admin_users` est vide, l'écran « Administrateurs »
   ne peut pas s'ajouter lui-même — la création du tout premier admin reste
   manuelle (SQL Editor).
4. **Backoff / rate-limiting** : la sécurité applicative repose sur GoTrue ;
   un vrai projet en production doit activer les protections anti-brute-force
   natives (email confirmations, captcha optionnel).
5. **CDN/edge caching** : `netlify.toml` / `vercel.json` doivent être vérifiés
   pour les headers de cache (images, JS/CSS) — non audités dans cette session.
6. **Sentry** : la config envoie des événements en dev ; vérifier la DSN de
   production avant mise en ligne.

---

### Résumé

- ✅ Sécurité admin corrigée et durcie (modèle explicite, RPC protégées, RLS).
- ✅ Écran de gestion des admins par email ajouté (aucun auto-admin possible).
- ✅ Images produit/héro optimisées (srcSet, sizes, lazy/eager).
- ✅ TypeScript, ESLint, build et 70 tests unitaires passent.
- ⚠️ Load test réel Supabase et E2E : non exécutés (identifiants/environnement
  manquants) — commandes documentées.
