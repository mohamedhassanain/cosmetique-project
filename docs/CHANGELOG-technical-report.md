# CHANGELOG & Rapport technique — Optimisation production-ready

> Projet : Kissariya Cosmétiques (React + TypeScript + Vite → Cloudflare/CDN → Supabase)
> Objectif : production-ready, efficace, sécurisé et scalable horizontalement, sans quitter le plan Free Supabase.
> Date : 09/08/2026

---

## 1. Changements implémentés (code + base de données)

### 1.1 Base de données — `supabase/database.sql` (idempotent, réexécutable)

**Sécurité / RBAC**
- **Table `profiles` supprimée** (à la demande du client) : le modèle d'accès est « compte inséré par l'admin dans Supabase Auth = admin ».
- `public.is_admin()` redéfini : `auth.role() = 'authenticated'`. Plus aucune table de profils ni RPC associé (`is_admin_user()` retiré).
- Durcissement de la policy publique `product_images` : le SELECT public est désormais limité aux produits **actifs** (jointure `products.is_active = true`), cohérent avec la policy de lecture produits.

**Performance (index)**
- `idx_orders_created_at` (created_at DESC) — tri admin des commandes.
- `idx_orders_status_created` (status, created_at DESC) — comptage/dashboard et filtre par statut.
- `idx_contact_messages_created_at` (created_at DESC) — tri admin des messages.

**Intégrité (contraintes)**
- `orders_quantity_positive` (quantity >= 1), `orders_total_price_non_negative` (total_price >= 0), `orders_product_name_not_empty` — bloquent les INSERT aberrants via les tables publiques (commandes WhatsApp / contact).

### 1.2 Frontend

| Fichier | Changement |
|---|---|
| `src/services/order.service.ts` | `fetchOrders` paginé (range + count exact, pageSize borné 50, filtre statut optionnel) ; ajout `countOrders` (HEAD COUNT sans charger les lignes) |
| `src/hooks/useOrders.tsx` | Hook paginé (React Query `keepPreviousData`, staleTime 30 s) + nouveau `useOrderStats` (compteurs légers pour le dashboard) |
| `src/pages/admin/AdminDashboard.tsx` | Stats via `countOrders` (HEAD, plus de chargement de toutes les commandes) ; liste « commandes récentes » = page 1 des commandes en attente (20 max) |
| `src/pages/admin/AdminOrders.tsx` | Pagination (20/page) + filtre par statut + bouton Annuler en édition ; suppression de l'accès direct `queryClient.invalidateQueries(['orders'])` au profit de l'invalidation centralisée |
| `src/components/cart/CartSheet.tsx` | **Bug corrigé** : le verrou anti-double-clic était remis à `false` uniquement en fin de flux — une erreur bloquait définitivement le bouton « Commander ». Passage en `try/finally`. L'INSERT passe par `createOrder()` (service central, mêmes valeurs) |
| `src/providers/auth-provider.tsx` + `auth-context.ts` | **Composants restaures a l'état d'origine** : la vérification `isAdmin` via RPC a été retirée. Modèle métier : c'est l'admin lui-même qui insère les comptes dans Supabase Auth → « compte authentifié = admin ». Tout utilisateur connecté accède au back-office. |
| `src/components/shared/RequireAuth.tsx` | **Restaure a l'état d'origine** : garde uniquement sur la présence d'une session (`user`). Plus de redirection possible vers `/`. |
| `src/components/shared/ErrorBoundary.tsx` | Les crashes sont remontés à Sentry via `captureException` (no-op sans DSN) |
| `src/pages/shop/Produits.tsx` | Recherche publique **debouncée (300 ms)** — un seul appel Supabase après pause de saisie, plus un appel par frappe |
| `index.html` | `lang="fr"`, `theme-color`, `og:locale="fr_MA"` |
| `src/services/__tests__/order.service.test.ts` | Tests mis à jour pour la pagination + nouveaux tests `countOrders` |
| `e2e/smoke.spec.ts` | Nouveau test de régression : `/admin` sans session → `/auth` (jamais `/`) |

### 1.3 Correctif de régression /admin (feedback utilisateur)

**Symptôme** : `/admin` redirigeait systématiquement vers `/` après le login.
**Cause** : la vérification de rôle `isAdmin` (RPC `is_admin_user()`) ajoutait une condition d'accès qui n'existait pas — tant que l'RPC n'est pas déployé (ou quand la table `profiles` n'est pas remplie), l'accès était refusé.
**Décision finale** : ce contrôle a été **entièrement retiré**. Le modèle métier du projet est « l'admin insère les comptes dans Supabase Auth », donc toute session authentifiée est légitime pour le back-office. Le garde `RequireAuth` ne vérifie plus que la présence d'une session — comportement identique au code d'origine.
**Sécurité** : conformément au modèle métier, toute session authentifiée est admin. Les policies RLS de `supabase/database.sql` utilisent `public.is_admin()` (`auth.role() = 'authenticated'`) pour protéger les tables back-office (`orders`, `products`, etc.) — les visiteurs anonymes ne peuvent jamais lire/écrire ces données ; seuls les INSERT publics dédiés (commandes WhatsApp, messages de contact) restent ouverts, avec contraintes d'intégrité (quantité/prix/nom) pour limiter les abus.

## 2. Recommandations de configuration externe (hors dépôt)

À appliquer manuellement — nécessitent l'infrastructure, pas de code :

### Cloudflare
- **Cache** : activer « Cache Everything » sur `/assets/*` (chunks hashés, immuables, cache public), et sur les images Supabase Storage (bucket public). Ne **jamais** cacher les réponses admin ni les pages connectées (privées).
- **Compression** : Brotli activé (défaut Cloudflare) — le build est déjà gzip/brotli-friendly.
- **Rate limiting** : règle sur `/auth` (ex : 10 req/min/IP) et sur les endpoints publics d'insertion (`/rest/v1/orders`, `/rest/v1/contact_messages`) — ex : 5 req/min/IP.
- **Turnstile (CAPTCHA)** recommandé sur le formulaire de contact et le tunnel de commande si abus constaté : le rate limiting frontend seul n'est pas sécurisé.
- **Caching headers pour `index.html`** : `no-cache` (revalidation) pour permettre les mises à jour, `Cache-Control: public, max-age=31536000, immutable` pour les assets hashés.

### Supabase (Dashboard)
- **Auth** : activer le rate limiting GoTrue par défaut (déjà actif) ; désactiver les inscriptions publiques si non nécessaires (l'app ne crée que des sessions admin).
- **Storage** : confirmer la policy `images_admin_manage` (déjà dans `database.sql`) et supprimer toute ancienne policy `images_authenticated_manage` si elle existait sur le projet distant.
- **Realtime** : désactivé pour toutes les tables publiques (aucune souscription dans l'app).

### Variables d'environnement
- `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY` uniquement côté frontend.
- **Jamais** `service_role` dans le frontend. Le fichier Postman `postman/environments/Kissariya - Supabase.environment.yaml` contient un placeholder `cle-service-role-jamais-en-frontend` — à rester strictement côté outillage.

## 3. Recommandations de scalabilité future (ne PAS implémenter aujourd'hui)

- **Seuil 1 — trafic modéré** : rien à changer. Plan Free Supabase (500 Mo DB, 1 Go storage, 2 Go egress) largement suffisant pour un catalogue + commandes WhatsApp.
- **Seuil 2 — croissance des images/egress** : passer au plan Supabase Pro (Image Transformations activées) puis brancher un `srcSet`/`sizes` sur les `<img>` produits (TODO déjà balisés dans `ProductCard`, `ProduitDetail`, `HeroPromoCarousel`).
- **Seuil 3 — échelle importante (10k+ visiteurs concurrents)** : introduction d'un backend service (ex : Node/Nest) **uniquement** si une logique serveur devient nécessaire (paiement en ligne, stock transactionnel, anti-fraude). L'architecture actuelle (frontend ← → Supabase) n'exige **aucune** réécriture frontend pour évoluer : les mutations centralisées dans `src/services/*` permettront de swap vers de nouvelles APIs sans toucher aux composants.
- **Microservices / Kafka / Redis / K8s** : non pertinents avant une charge multi-régions avec logique métier complexe. Rien dans ce projet ne les justifie aujourd'hui.

## 4. Résultats de vérification (09/08/2026)

| Vérification | Résultat |
|---|---|
| `npx tsc --noEmit -p tsconfig.app.json` | ✅ Aucune erreur (1 warning pré-existant non lié : `baseUrl` déprécié en TS 7) |
| `npx vitest run` | ✅ 11 fichiers, **70/70 tests** |
| `npm run build` | ✅ Build production réussi ; code splitting confirmé (AdminOrders 2,76 kB gzip, page /produits 2,44 kB gzip, sentry isolé 92 kB gzip) |
| `npx playwright test` | ✅ **6/6** smoke tests (404, panier, /produits, produit introuvable, accueil, /admin → /auth) |
| `docs/load-test-results.md` | Rapport k6 existant : p95 2,62 ms @20 VU — 185 req/s @500 VU en local (pré-CDN) |

> ⚠️ Les chiffres k6 sont issus d'un test **local** sur `vite preview` : ils mesurent le rendu HTTP du bundle, pas la capacité réelle de l'infrastructure. Relancer avec `-e TARGET_URL=https://<domaine-prod>` avant une campagne.
