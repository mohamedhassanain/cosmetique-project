# Kissariya Cosmétiques — PERFORMANCE AUDIT (Round 2)

Date : 12/08/2026 — Commit de référence : `863e0fd` (état optimisé round 1, poussé sur `main`).
Périmètre : audit uniquement — **aucune modification effectuée dans cette phase**.

---

## 1. Architecture actuelle

```
Utilisateurs
   ↓  Netlify/Vercel (SPA, code-split)
React 18 + Vite 5 + TanStack React Query 5
   ↓  anon key uniquement (src/integrations/supabase/client.ts)
Supabase (PostgREST + Storage CDN + Auth)
   ↓
PostgreSQL (plan Free, instance unique)
```

- Accès données centralisé : `src/services/*.service.ts` ; composants via hooks React Query (`src/hooks/`).
- Config cache : `src/providers/query-client.ts` — staleTime global 5 min, gcTime 10 min, `refetchOnWindowFocus: false`, `retry: 1`.
- Déploiement : SPA Statique + `scripts/prerender-products.mjs` (prerendu SEO produits actifs).

## 2. Goulots d'étranglement actuels (classés)

1. **`count=exact` sur catalog + recherche publics** (2 requêtes utilisateur majeures, les plus chargées du k6). PostgREST exécute un `COUNT(*)` exact sur l'ensemble filtré en plus du fetch de page. C'est un coût **multiplicatif** par requête à forte charge.
2. **2 requêtes de résolution slug→id par page catalog filtrée** : `fetchPublicProducts` interroge d'abord `categories` (slug→id) puis `subcategories` (slug→id) AVANT la requête produits. Or ces données sont déjà dans le cache React Query (`useCategories` + `useAllSubcategories` partagés footer/menu). Le k6 round 1 ne les mesurait d'ailleurs pas (il passait les ids directement) → le test sous-estime le trafic réel.
3. **Prefetch de la page suivante exécuté PENDANT le rendu** (`usePublicProducts`) : effet de bord en phase render → double déclenchement possible en StrictMode, préfetch non gardé par l'état du cache (refetch si une requête est déjà fraîche).
4. **Page catalog : pas de borne haute sûre si `page` venait d'une URL** — `page` est initialisé à 1 et réinitialisé, mais un `page=99999` passait tel quel à `.range()`. Impact faible (URL contrôlée par `setPage`), à sécuriser.
5. **Pagination offset** : acceptable à la taille actuelle (~1–10 produits actifs), mais `OFFSET` dégrade en O(pages) — voir Phase 4.
6. **Charge serveur = plafond dur** : les tests round 1 montrent que le plafond est le pool de connexions/PostgREST Supabase, pas la lourdeur des requêtes. 1000 VU p95 730 ms, 0 % erreurs ; 2000 VU s'effondraient avant optimisation.

## 3. Index actuels (schéma, `supabase/database.sql`)

| Index | Table | Type |
|---|---|---|
| `categories.slug` | categories | UNIQUE |
| `products.slug` | products | UNIQUE |
| `idx_products_search_vector` | products | GIN (search_vector généré) |
| `idx_products_created_at` | products | B-tree (created_at DESC) |
| `idx_products_category` | products | B-tree (category_id) |
| `idx_products_subcategory` | products | B-tree (subcategory_id) |
| `idx_products_active` | products | B-tree (is_active) |
| `idx_products_promotion` | products | partiel (is_promotion) WHERE true |
| `idx_products_featured` | products | partiel (is_featured) WHERE true |
| `idx_products_name_trgm` / `brand_trgm` | products | GIN trigram |
| `idx_product_images_product_sort` | product_images | (product_id, sort_order) |
| `idx_subcategories_category_slug` | subcategories | UNIQUE (category_id, slug) |
| `idx_orders_created_at`, `idx_orders_status_created` | orders | B-tree |
| `idx_contact_messages_created_at` | contact_messages | B-tree |

## 4. Patrons de requêtes

| Requête | Select | count | range/order |
|---|---|---|---|
| site_settings (public, 1 ligne) | `*` (1 ligne — OK) | non | limit 1 |
| categories (public) | `id,name,slug` | non | order sort_order |
| subcategories all (footer/menu) | `id,category_id,name,slug` | non | order sort_order |
| promos actives (hero) | champs rendus | non | order sort_order |
| produits actifs home (60) | liste étroite | non | order created_at DESC, limit 60 |
| catalog/search public | liste étroite + categories(name,slug) | **`exact`** | order created_at/price, range |
| détail public (slug) | select dédié (sans product_images) | non | slug eq, limit 1 |
| **résolution slug→id (filtres)** | `id` sur categories puis subcategories | non | slug/category_id eq (**x2 requêtes extra**) |
| admin products/orders/promos | admin select | `exact` (admin — conservé) | range |

## 5. Stratégie cache actuelle

- Global : staleTime 5 min, gcTime 10 min, focus-refetch off, retry 1.
- categories/subcategories : 10 min / 15 min. site_settings : 15 min / 30 min. promos : 5 min, `retry:false`.
- public products : 5 min / 10 min + `placeholderData: keepPreviousData` + prefetch page suivante.
- Clés : centralisées (`QUERY_KEYS`), différencient filtres/page ; requêtes identiques dédupliquées.
- Déjà correct sur l'essentiel. **Point faible : prefetch pendant le render (voir §2.3).**

## 6. Stratégie images

- Cartes : variante 400 px (src) + srcSet 400/800 — **jamais l'original 1600 px**.
- Fiche produit : 800 px (src) + srcSet 800/1600 ; `fetchPriority=high`, eager (LCP).
- QuickView : 800 px. Panier : 400 px. Dimensions explicites partout. Lazy loading sur les cartes/thumbnails.
- Storage : bucket public `cosmetics-images`, URLs stables `getPublicUrl` (cacheable). **Audit OK.**

## 7. Pagination actuelle

- Catalog + recherche : `page` (1-based), `pageSize: 16`, `.range(from, from+size-1)`, `count=exact` pour `totalPages`.
- Home : `limit(60)`.
- Admin : `pageSize 20`, `count=exact` (conservé).
- `keepPreviousData` + prefetch page suivante déjà en place.

## 8. Stratégie recherche

- Champ unique `Produits.tsx` : debounce 300 ms déjà en place, `setPage(1)` au debounce.
- Filtre : `.or(search_vector.phfts.<terme>, name.ilike.%..%, brand.ilike.%..%)` + `is_active`, borné `pageSize`, sanitizé (`sanitizeSearchTerm`, anti-injection PostgREST).
- Index : GIN search_vector + GIN trigram name/brand → couverts.
- Home : recherche locale sur les 60 produits actifs (aucune requête sup).
- **OK ; seul point = count=exact (§2.1).** Pas de cancel explicite des requêtes obsolètes (debounce + cache suffisent ; documenté).

## 9. Stratégie RLS

- `public.is_admin()` = existence de `auth.uid()` dans la table d'allowlist
  `public.admin_users` (SECURITY DEFINER, PK indexée) — coût constant, pas de
  jointure lourde.
- `products` public : `is_active = true` (indexé). `product_images` public : EXISTS sur products actifs (product_id indexé) — plus sollicité (détail public n'embarque plus product_images).
- INSERT public direct FERMÉ : aucune policy anon INSERT sur `orders` ni
  `contact_messages` — les écritures visiteurs passent uniquement par les
  Edge Functions `create-order` / `create-contact` (service_role, rate-limitées,
  validées). Tout le reste admin-only via `is_admin()`.
- **Aucun affaiblissement nécessaire. Aucune proposition RLS.**

## 10. Optimisations recommandées (round 2)

| # | Optimisation | Fichiers | Impact attendu | Risque |
|---|---|---|---|---|
| A | **Supprimer `count=exact` public** → `hasNextPage` (`limit = pageSize+1`), UI « Page X » + prev/next | `product.service.ts`, `useProducts.tsx`, `Produits.tsx` | Réduction du coût par requête catalog/search (le plus chargé) | Moyen : modification UI (plus de « X produit(s) » ni « / total »). Benchmark A vs B à mesurer. |
| B | **Résoudre slug→id depuis le cache client** (categories + allSubcategories déjà chargés) ; ids passés au service ; lookup serveur supprimé | `product.service.ts`, `Produits.tsx` | **−2 requêtes** par page catalog filtrée | Faible : fallback slug→id conservé si id absent |
| C | **Prefetch page suivante dans `useEffect`** + garde de fraîcheur du cache + page bornée | `useProducts.tsx`, `Produits.tsx` | Évite préfecths dupliqués/côté render ; robustesse | Faible |
| D | **Index composites** (category/subcategory/promo + created_at, partiels `WHERE is_active`) | documentés seulement | Nul à la taille actuelle ; utile à grande échelle | aucun (non exécutés) |
| E | **Aucun changement** sur admin, Auth, RLS, storage | — | — | — |

## 11. Impact attendu

- Catalog/search : chaque requête perd le `COUNT(*)` exact + jusqu'à 2 requêtes de lookup → charge DB et nombre de requêtes réduits, directement visible dans le k6 (catalog + search sont les endpoints les plus fréquents du flux).
- Latence p95/p99 aux hautes charges attendue en baisse **si** le goulot répond au CPU DB ; sinon le plafond serveur reste identique (on le mesurera).
- UI : légère perte d'info (total exact) documentée comme compromis.

## 12. Risques

- **UI pagination** : le total n'est plus affiché → vérification visuelle impérative (Phase 13).
- **Déterminisme entre pages** : order par `created_at`/`price` avec `limit+1` — mêmes propriétés que l'offset actuel.
- **Régressions admin** : aucun fichier admin modifié ; `fetchAllProducts` (admin) conserve `count=exact`.
- **Mesures invalides** : chaque affirmation chiffrée sera issue des protocoles §14–16 (browser flow, k6 identique avant/après), sinon marquée LIKELY / NOT VERIFIED.

---

**Décision** : implémenter A + B + C, documenter D (aucun index exécuté — cohérent avec la demande « un seul script SQL »), puis mesurer strictement avant/après.
