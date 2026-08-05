# Tester Kissariya avec Postman

## Comment fonctionne l'app

**Il n'y a pas de backend.** L'application React (Vite) parle directement à **Supabase** (PostgREST + GoTrue + Storage) via `@supabase/supabase-js`. Les services dans `src/services/*.ts` ne font que construire des requêtes vers l'API REST de Supabase.

Donc avec Postman, vous n'appelez **pas l'application** mais **l'API Supabase directement** — exactement les mêmes endpoints que l'app utilise.

## Fichiers fournis

| Fichier | Contenu |
|---|---|
| `postman/environments/Kissariya - Supabase.postman_environment.json` | Variables d'environnement (URL + clé anon pré-remplies, IDs capturés auto) |
| `postman/collections/Kissariya - Supabase API.postman_collection.json` | 35+ requêtes avec tests automatiques |
| `docs/postman-testing.md` | Ce guide |

> 💡 **Méthode d'import** : les fichiers sont au format **JSON** (format d'export standard Postman). Au moment de l'import, Postman affichera **"Upgrade to v3"** (conversion automatique de JSON vers son format YAML natif) — cliquez dessus, c'est fait par Postman lui-même.

## Prérequis

1. Un projet Supabase avec le schéma exécuté : `supabase/database.sql` → Dashboard Supabase → **SQL Editor** → coller + Run.
2. **Postman** (app desktop ou web).
3. Vos clés Supabase :
   - Dashboard → **Settings → API** → *Project URL*, *anon public key*, *service_role key*.
   - ⚠️ La `service_role key` contourne RLS : **jamais** dans le frontend, réservée aux tests internes.

## Étape 1 — Importer

1. Postman → **Import** → sélectionnez :
   - `postman/environments/Kissariya - Supabase.postman_environment.json`
   - `postman/collections/Kissariya - Supabase API.postman_collection.json`
2. Quand Postman affiche **"Upgrade to v3"** (conversion vers son format interne), cliquez dessus.
3. En haut à droite, sélectionnez l'environnement **"Kissariya - Supabase"** (dropdown Environments).

## Étape 2 — Renseigner l'environnement

L'URL Supabase et la clé anon sont **déjà pré-remplies** (lues depuis le `.env` du projet). Il ne reste que 2 valeurs à saisir :

| Variable | Valeur |
|---|---|
| `admin_email` | Email de ton compte admin |
| `admin_password` | Mot de passe de ce compte |

Cliquez sur l'icône **"eye"** (ou *Environments* → *Kissariya - Supabase*) pour modifier ces valeurs.

Les autres variables (`product_id`, `order_id`, `access_token`…) seront **remplies automatiquement** par les scripts de test.

## Étape 3 — Créer le compte admin (une seule fois)

> Si vous utilisez un compte existant, passez à l'étape 4.

1. Postman → dossier **🔐 Auth** → **Sign Up** → Send.
2. Un compte est créé avec le rôle `staff` par défaut.
3. Pour donner le rôle `admin` :
   - SQL Editor Supabase :
   ```sql
   -- Remplacez EMAIL par l'email du compte
   INSERT INTO public.profiles (user_id, full_name, role)
   SELECT id, email, 'admin' FROM auth.users WHERE email = 'EMAIL'
   ON CONFLICT (user_id) DO UPDATE SET role = 'admin';
   ```

## Étape 4 — Ordre de test recommandé

### 1. Auth
- **🔐 Auth → Login (mot de passe)** → Send.
- Le script capture automatiquement `access_token`, `refresh_token`, `user_id`.

### 2. Public (aucune auth requise)
| Requête | Teste |
|---|---|
| Produits actifs (accueil) | `fetchActiveProducts()` — capture `product_id` + `slug` |
| Produits filtrés + pagination | Page 1, tri, limite |
| Recherche plein-texte + ilike | `search_vector.phfts` + `name.ilike` (changez `search` dans l'environnement) |
| Produit par slug | Fiche produit complète (utilise le `slug` capturé) |
| Catégories | Capture `category_id` |
| Sous-catégories d'une catégorie | Capture `subcategory_id` |
| Promos actives (hero) | Carrousel |
| Site settings (public) | Capture `settings_id` |
| Créer une commande (visiteur) | INSERT public → capture `order_id` |
| Envoyer un message de contact | INSERT public |

### 3. Admin (exige le Login + rôle admin)
| Requête | Teste |
|---|---|
| PRODUITS → Liste / Créer / Modifier / Image / Supprimer | CRUD complet. "Créer" capture l'id, enchaînez Modifier → Image → Supprimer. |
| CATÉGORIES & SOUS-CATÉGORIES | CRUD catégories. "Créer une catégorie" remplace `category_id`. |
| COMMANDES → Liste / Changer statut / Supprimer | Gestion commandes (statut : pending, confirmed, shipped, delivered, cancelled). |
| CONTACT MESSAGES → Liste / Marquer lu | Boîte de réception. |
| PROMOS → Liste / Créer / Modifier / Supprimer | Carrousel admin. |
| SITE SETTINGS → Modifier | Paramètres (utilise `settings_id`). |

### 4. Storage (upload d'image)
1. **☁️ Storage → Uploader une image**.
2. Onglet **Body → binary → Select file** → choisissez une image `.jpg`/`.png`.
3. La variable `file_name` = nom du fichier dans le bucket.
4. **Image publique (lecture)** → vérifie l'accès public.
5. **Supprimer une image** → nettoyage.

## Erreurs fréquentes et solutions

| Symptôme | Cause | Solution |
|---|---|---|
| `401 Invalid API key` | `anon_key` vide ou erronée | Vérifiez Settings → API |
| `403` sur route admin | Compte pas `admin` (rôle `staff`) | Exécutez le SQL de l'étape 3 |
| Tableau vide sur route admin | RLS : `is_admin()` false | Idem ci-dessus |
| `404 relation "X" does not exist` | Schéma pas appliqué | Exécutez `supabase/database.sql` |
| `PGRST116` sur `.single()` | 0 ou plusieurs lignes → l'app utilise `.single()` uniquement sur slug unique | Utilisez un slug existant (voir `Produits actifs`) |
| Login OK mais GET user vide | Token expiré | Refaire **Login** |
| `23505 duplicate key` au POST produit | Slug déjà pris | Changez le `slug` dans le body |

## Pourquoi `service_role_key` est dangereuse

La clé `service_role` **contourne toutes les policies RLS**. Si elle fuit (repo public, frontend, snippet partagé), n'importe qui peut lire/écrire/supprimer toute la base.

- Ne l'utilisez que dans des tests internes.
- Ne la mettez **jamais** dans un fichier commité (elle est en `type: secret` dans l'environnement, mais restez prudent).
- En production, préférez tester les routes admin avec un vrai compte admin.

## Astuce : lancer toute la collection en une fois

1. Postman → onglet **Collections** → clic droit sur *Kissariya Cosmétiques - Supabase API* → **Run collection**.
2. Un dossier de test peut être lancé seul (ex: **🌍 Public**).
3. L'ordre des requêtes suit l'ordre des dossiers (lancer **Auth** d'abord).

## Correspondance code ↔ requêtes Postman

| Fonction dans `src/services/` | Requête Postman équivalente |
|---|---|
| `fetchActiveProducts()` | Public → Produits actifs |
| `fetchPublicProducts()` | Public → Recherche / Pagination |
| `fetchProductBySlug()` | Public → Produit par slug |
| `fetchCategories()` | Public → Catégories |
| `fetchSubcategories(id)` | Public → Sous-catégories |
| `fetchActivePromos()` | Public → Promos actives |
| `fetchSiteSettings()` / `fetchWhatsAppNumber()` | Public → Site settings |
| `createOrder()` | Public → Créer une commande |
| `fetchAllProducts()` | Admin → PRODUITS → Liste |
| `createProduct()` | Admin → PRODUITS → Créer |
| `updateProduct()` | Admin → PRODUITS → Modifier |
| `deleteProduct()` | Admin → PRODUITS → Supprimer |
| `createCategory()` / `updateCategory()` / `deleteCategory()` | Admin → CATÉGORIES |
| `createSubcategory()` / `updateSubcategory()` | Admin → CATÉGORIES |
| `fetchOrders()` / `updateOrderStatus()` / `deleteOrder()` | Admin → COMMANDES |
| `createPromo()` / `updatePromo()` / `deletePromo()` | Admin → PROMOS |
| `updateSiteSettings()` | Admin → SITE SETTINGS |
| upload image (`useImageUpload`) | Storage → Uploader une image |
