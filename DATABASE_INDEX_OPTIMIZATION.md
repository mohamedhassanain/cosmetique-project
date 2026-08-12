# Kissariya — DATABASE INDEX OPTIMIZATION (Round 2)

Date : 12/08/2026.
Méthode : analyse des requêtes publiques réelles + état des index dans `supabase/database.sql`.
**Aucun index créé/supprimé** : les propositions ci-dessous restent documentées, cohérent avec le principe « un seul script SQL » et l'audit (le catalogue actuel ne justifie pas d'index supplémentaires).

---

## 1. Index existants (déjà dans `supabase/database.sql`)

| Index | Table | Type | Sert les requêtes |
|---|---|---|---|
| `categories.slug` UNIQUE | categories | B-tree | slug → id (résolution filtre) |
| `products.slug` UNIQUE | products | B-tree | détail par slug |
| `idx_products_search_vector` | products | GIN | `search_vector.phfts` |
| `idx_products_name_trgm`, `brand_trgm` | products | GIN trigram | `name.ilike.%…%`, `brand.ilike.%…%` |
| `idx_products_created_at` | products | B-tree DESC | tri `created_at DESC` (home/catalog) |
| `idx_products_category` | products | B-tree | filtre `category_id` |
| `idx_products_subcategory` | products | B-tree | filtre `subcategory_id` |
| `idx_products_active` | products | B-tree | `is_active = true` |
| `idx_products_promotion` | products | partiel | `is_promotion = true` |
| `idx_products_featured` | products | partiel | `is_featured = true` |
| `idx_product_images_product_sort` | product_images | B-tree | gallery admin |
| `idx_subcategories_category_slug` | subcategories | UNIQUE | sous-catégories par catégorie |
| `idx_orders_created_at`, `idx_orders_status_created` | orders | B-tree | pagination/dashboard admin |
| `idx_contact_messages_created_at` | contact_messages | B-tree | tri admin |

## 2. Requêtes analysées

### 2.1 Catalog (liste produits actifs)
```
WHERE is_active = true [AND category_id = X] [AND subcategory_id = Y]
[AND is_promotion = true] [AND is_featured = true]
ORDER BY created_at DESC (ou price)
OFFSET n LIMIT 16
```
- Couvert : `idx_products_active` + `idx_products_category` + `idx_products_subcategory` + partiels promo/featured + `idx_products_created_at`. PostgreSQL peut combiner (BitmapAnd) les filtres, puis trier avec l'index created_at.
- **Taille actuelle du catalogue : ~1–10 produits actifs.** Un scan séquentiel d'une table quasi vide est plus rapide que tout index. Index composites = coût d'écriture sans bénéfice mesurable.

### 2.2 Détail produit
```
WHERE is_active = true AND slug = $1  LIMIT 1
```
- Couvert par `products.slug` UNIQUE. Rien à faire.

### 2.3 Recherche
```
WHERE is_active = true AND (
  search_vector.phfts.term OR name.ilike.%term% OR brand.ilike.%term%
)
ORDER BY … OFFSET n LIMIT 16
```
- Couvert par GIN search_vector + GIN trigram name/brand. Rien à faire.

### 2.4 Résolution slug→id (à supprimer côté front — Phase 5)
```
categories WHERE slug = $1
subcategories WHERE category_id = $1 AND slug = $2
```
- Couverts respectivement par `categories.slug` UNIQUE et `idx_subcategories_category_slug` UNIQUE.
- Impact : **ces 2 requêtes disparaissent** avec la résolution côté cache (Phase 5).

## 3. Index manquants (proposés, NON exécutés)

| Index proposé | Requête optimisée | Raison | Appliqué ? |
|---|---|---|---|
| `(category_id, created_at DESC) WHERE is_active = true` | 2.1 filtre catégorie + tri | Évite BitmapAnd+sort sur très gros catalogue | **Non** — pas de bénéfice à la taille actuelle ; coût écritures |
| `(subcategory_id, created_at DESC) WHERE is_active = true` | 2.1 filtre sous-catégorie + tri | idem | **Non** — idem |
| `(created_at DESC) WHERE is_active AND is_promotion` | 2.1 promo + tri | idem | **Non** — idem |

**Justification détaillée de la non-exécution**
1. Le catalogue réel compte ~1 produit actif (mesuré via browser flow round 1) → tout index est inutile tant que le volume reste faible.
2. Chaque index additionnel ralentit les INSERT/UPDATE/DELETE (admin) et consomme du stockage plan Free.
3. Aucun `EXPLAIN ANALYZE` sur gros volume n'est possible sans données à l'échelle. Règle : ne pas créer d'index sans preuve.

## 4. Conclusion
- **Index existants suffisants** pour toutes les requêtes publiques + admin.
- Avec la Phase 5 (résolution slug→id côté cache), les 2 requêtes de lookup disparaissent — c'est le vrai levier, pas les index.
- Le fichier `supabase/database.sql` reste l'unique script SQL et ne sera pas modifié pour des index non justifiés.
