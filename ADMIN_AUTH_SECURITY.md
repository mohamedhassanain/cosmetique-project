# Admin Authentication Security

Date : 2026-08-10
Projet : Kissariya Cosmétiques (React + Vite + Supabase)

---

## Architecture

```
Supabase Dashboard (Authentication → Users → Create user)
        │  l'administrateur de confiance crée manuellement le compte (email + mot de passe)
        ▼
Supabase Auth (projet réservé aux comptes admin)
        │  supabase.auth.signInWithPassword(email, password)   [Route /admin/login]
        ▼
/public/admin_users (allowlist) — UUID du compte ajouté via SQL Editor / seed initial
        │
        ▼
/admin (dashboard admin, protégé par RequireAdmin)
        │
        ▼
RLS PostgreSQL — public.is_admin() = auth.uid() ∈ public.admin_users
```

- Auth fournisseur : **Supabase Auth (email + mot de passe)**.
- Client : `@supabase/supabase-js` avec la clé **anon publique** uniquement
  (`src/integrations/supabase/client.ts`), protégée par RLS côté base.
- Login : `supabase.auth.signInWithPassword()` — aucune autre méthode.
- Garde frontend : `RequireAdmin` (`src/components/shared/RequireAdmin.tsx`) —
  « pas de session » → redirection `/admin/login` ; « session active » → `/admin`.

## Authorization Model

```
Authenticated account  ∈ public.admin_users  =  ADMIN
Authenticated account  ∉ public.admin_users  =  NOT ADMIN
Unauthenticated visitor                      =  NOT ADMIN
```

Pas de colonne `role`, pas d'`app_metadata`/`user_metadata` de rôle, pas
de RPC de gestion d'admins. Le contrôle repose sur la table d'allowlist
`public.admin_users` (UUID → compte Auth), créée par `supabase/database.sql` :

- RLS **activée** sur `admin_users`, **aucune policy** → `anon` et
  `authenticated` ne peuvent ni lire ni écrire la table (privilèges
  explicitement révoqués).
- Seuls `service_role` (SQL Editor) et les Edge Functions gèrent l'allowlist.
- Seed non destructif au premier déploiement : tous les comptes Auth déjà
  présents sont insérés (aucun verrouillage accidentel des comptes en place).
- L'inscription publique est désactivée et l'application n'expose aucun
  mécanisme de création de compte (pas de page `signup`, pas d'appel
  `signUp()`).

Implémentation :

- `public.is_admin()` = `EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())`
  (`supabase/database.sql`) — SECURITY DEFINER, STABLE, lisible par les
  policies RLS et le garde frontend.
- `AuthProvider`: `isAdmin` = résultat du RPC `is_admin()` (retry ~300 ms
  contre la course du JWT post-login) — `src/providers/auth-provider.tsx`.
- RLS : toutes les tables sensibles utilisent `public.is_admin()` pour les
  lectures admin et les écritures.

## Existing Accounts

Aucun compte Supabase Auth n'a été supprimé, modifié, migré ou recréé.

Les comptes existants (ex. `admin1@example.com`, `admin2@example.com`,
`admin3@example.com`) restent valides avec leurs identifiants actuels.
Au premier déploiement du schéma, leur UUID est automatiquement inséré dans
`admin_users` (seed si table vide) → le modèle `is_admin()` les reconnaît
sans action supplémentaire. Tout compte créé manuellement plus tard depuis le
Dashboard (Authentication → Users → Create user) doit avoir son UUID ajouté à
`admin_users` pour accéder à `/admin` :
`INSERT INTO public.admin_users (user_id) VALUES ('<uuid>');` (SQL Editor).

## Signup

**Aucune inscription publique n'existe** :

- aucune page `/signup` ni équivalent ;
- aucun appel `supabase.auth.signUp()` dans le code applicatif ;
- l'option « Allow new users to sign up » doit rester **DÉSACTIVÉE** dans
  Supabase Dashboard → Authentication → Providers → Email ;
- aucun mécanisme de création de compte dans le frontend (pas de
  `createAdmin()`, pas de clé service_role pour créer des utilisateurs).

Création de compte = uniquement manuelle, par l'administrateur de confiance,
via Supabase Dashboard → Authentication → Users → Create user.

## RLS

RLS activée sur toutes les tables (`supabase/database.sql`). Protections clés :

| Table | Lecture publique | Lecture admin | Écriture |
|---|---|---|---|
| `products` | `is_active = true` | `is_admin()` | `is_admin()` |
| `product_images` | produits actifs uniquement | `is_admin()` | `is_admin()` |
| `categories` / `subcategories` | `true` | `is_admin()` | `is_admin()` |
| `orders` | aucune | `is_admin()` | INSERT / UPDATE / DELETE `is_admin()` — aucun INSERT public (via Edge Function `create-order` uniquement) |
| `contact_messages` | aucune | `is_admin()` | SELECT `is_admin()` — aucun INSERT public (via Edge Function `create-contact` uniquement) |
| `site_settings` | `true` (données publiques du site) | `is_admin()` | `is_admin()` |
| `promos` | `is_active = true` | `is_admin()` | `is_admin()` |
| Storage `cosmetics-images` | SELECT public | — | `is_admin()` |

Conséquences pour un visiteur anonyme :

- **INSERT** protégé : bloqué partout. `orders` et `contact_messages` n'ont
  AUCUNE policy d'INSERT publique : la création passe uniquement par les Edge
  Functions `create-order` / `create-contact` (service_role, validation, rate
  limiting). Un `POST /rest/v1/orders` ou `/rest/v1/contact_messages` direct
  échoue par RLS.
- **UPDATE** protégé : bloqué.
- **DELETE** protégé : bloqué.
- **Accès aux données privées** (lecture des commandes, messages, produits masqués) : bloqué.

## Service Role

Aucune clé `service_role` n'est exposée :

- le frontend n'utilise que `VITE_SUPABASE_PUBLISHABLE_KEY` (clé **anon** publique) ;
- aucune occurrence de `service_role` / `SERVICE_ROLE_KEY` dans le code
  applicatif (React, env Vite, fichiers publics) ;
- seule une référence documentaire inertes subsiste dans l'outillage hors
  application : un placeholder `cle-service-role-jamais-en-frontend`
  dans `postman/environments/Kissariya - Supabase.environment.yaml`
  (outil de test local, jamais bundle ni déployé) ;
- `.gitignore` exclut `.env*` (seul `.env.example` est versionné, sans secrets réels).

## Tests

| Vérification | Résultat |
|---|---|
| TypeScript (`tsc --noEmit`) | ✅ PASS |
| ESLint (`eslint src --max-warnings 0`) | ✅ PASS |
| Tests unitaires (`vitest run`) | ✅ PASS — 11 fichiers, 70/70 |
| E2E Playwright (`npx playwright test`) | ✅ PASS — 6/6 |
| Build production (`vite build`) | ✅ PASS |

Cas de test couverts :

- `sans session, /admin redirige vers /admin/login` (E2E) ✅
- Connexion admin (email/mot de passe, succès + erreur + validation + backoff) ✅
- `redirige vers /admin après un login réussi` (test unitaire Auth) ✅

Cas nécessitant le projet Supabase réel (non exécutés ici — ⚠️ manuels) :

- Login réel d'un compte existant depuis `/admin/login` → `/admin`.
- CRUD produits / commandes avec une session admin réelle.
- Tentative anonyme d'opération admin via l'API REST (doit être bloquée par RLS).

## Remaining Risks

Vérifications manuelles requises dans le Dashboard Supabase :

1. **Inscription publique** : confirmer que Authentication → Providers → Email →
   « Allow new users to sign up » est **désactivé**. Même s'il était activé, un
   compte auto-créé ne serait PAS admin : l'allowlist `admin_users` le bloquerait
   (is_admin() = false, aucune policy RLS) — protection en profondeur maintenue.
2. **Exécution du schéma** : rejouer `supabase/database.sql` dans le SQL Editor
   (idempotent) pour garantir la présence de `public.admin_users`, de
   `public.is_admin()`, du seed initial et de toutes les policies RLS décrites ici.
3. **Login réel** : tester `/admin/login` avec un compte existant dont l'UUID est
   dans `admin_users` (ex. `admin1@example.com`) puis naviguer dans `/admin/*`.
4. **Anonyme vs RLS** : depuis un navigateur déconnecté (ou `curl` avec la clé
   anon), vérifier que `GET /rest/v1/orders`, `PATCH /rest/v1/products`,
   `DELETE /rest/v1/products`, et `POST /rest/v1/orders` /
   `POST /rest/v1/contact_messages` renvoient bien une erreur/table vide
   (INSERT anon bloqué par RLS).
5. **Edge Functions** : déployer `create-order` / `create-contact` avec les
   secrets `SUPABASE_SERVICE_ROLE_KEY`, `RATE_LIMIT_HASH_SECRET`, `ALLOWED_ORIGINS`,
   puis tester 400 (payload invalide) / 429 (rate limit) / 201 (succès). Le rate
   limiting serveur est implémenté dans le code; il ne devient effectif qu'après
   ce déploiement (voir RATE_LIMITING_IMPLEMENTATION.md).
